#!/usr/bin/env node
/**
 * push-api.js —— 通过 GitHub API 推送（当 git push 被网络阻断时的回退通道）
 *
 * 原理：把本地提交的 blob / tree / commit 对象按原样上传，
 *       并用本地提交的 author/committer/日期 重建 commit，
 *       因此远端得到的 commit 哈希与本地完全一致 —— 不产生分叉。
 *
 * 用法：node tools/push-api.js [分支名]     默认 main
 * 凭据：从 git 凭据库读取（git credential fill），无需在脚本里写 Token
 */
const https = require('https');
const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BRANCH = process.argv[2] || 'main';

function git(args, input) {
  return execFileSync('git', args, { cwd: ROOT, input, maxBuffer: 64 * 1024 * 1024 }).toString();
}

function parseRemote() {
  const url = git(['remote', 'get-url', 'origin']).trim();
  const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+)(\.git)?$/);
  if (!m) throw new Error('无法解析 origin 地址: ' + url);
  return { owner: m[1], repo: m[2] };
}

function getToken() {
  const out = git(['credential', 'fill'], 'protocol=https\nhost=github.com\n\n');
  const line = out.split('\n').find(l => l.startsWith('password='));
  if (!line) throw new Error('未在 git 凭据库找到 github.com 的 Token');
  return line.slice('password='.length).trim();
}

function api(token, owner, repo, method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const d = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com', path: `/repos/${owner}/${repo}${endpoint}`, method,
      headers: Object.assign({
        'Authorization': 'token ' + token,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'push-api'
      }, d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {})
    }, res => {
      let s = '';
      res.on('data', c => s += c);
      res.on('end', () => {
        try { resolve({ st: res.statusCode, b: JSON.parse(s) }); }
        catch (e) { resolve({ st: res.statusCode, b: s }); }
      });
    });
    req.on('error', reject);
    if (d) req.write(d);
    req.end();
  });
}

function isoLocal(ts) {
  const d = new Date(Number(ts) * 1000);
  const tz = -d.getTimezoneOffset();
  const sign = tz >= 0 ? '+' : '-';
  const p = n => String(n).padStart(2, '0');
  const hh = p(Math.floor(Math.abs(tz) / 60));
  const mm = p(Math.abs(tz) % 60);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${hh}:${mm}`;
}

function commitMeta(sha) {
  const out = git(['log', '-1', '--format=%an~~%ae~~%at~~%cn~~%ce~~%ct~~%B', sha]);
  const [an, ae, at, cn, ce, ct, msg] = out.split('~~');
  return {
    message: msg.replace(/\n+$/, '') + '\n',
    author: { name: an, email: ae, date: isoLocal(at) },
    committer: { name: cn, email: ce, date: isoLocal(ct) }
  };
}

/**
 * 逐层构建 tree：必须按 git 的规范顺序提交（文件名按字节比较，目录名后补 "/"），
 * 否则 API 会保留提交顺序，导致 tree 哈希与本地不一致。
 */
function gitSortKey(e) {
  return Buffer.concat([Buffer.from(e.name, 'utf8'), Buffer.from(e.isDir ? '/' : '', 'utf8')]);
}

async function ensureTree(token, owner, repo, commit) {
  const raw = execFileSync('git', ['-c', 'core.quotepath=false', 'ls-tree', '-r', '-z', commit],
    { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString();
  const entries = [];
  for (const rec of raw.split('\0')) {
    if (!rec) continue;
    const tab = rec.indexOf('\t');
    const head = rec.slice(0, tab).split(' ');
    const p = rec.slice(tab + 1);
    entries.push({ mode: head[0], type: head[1], sha: head[2], path: p });
  }

  // 目录树：dir -> Map(name -> entry)
  const dirs = new Map();
  const getDir = d => {
    if (!dirs.has(d)) dirs.set(d, new Map());
    return dirs.get(d);
  };
  getDir('');

  for (const e of entries) {
    const content = execFileSync('git', ['cat-file', 'blob', e.sha], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
    const r = await api(token, owner, repo, 'POST', '/git/blobs', {
      content: content.toString('base64'), encoding: 'base64'
    });
    if (r.st !== 201) throw new Error('上传 blob 失败 ' + e.path + ': ' + (r.b.message || r.st));
    const slash = e.path.lastIndexOf('/');
    const dir = slash < 0 ? '' : e.path.slice(0, slash);
    const name = slash < 0 ? e.path : e.path.slice(slash + 1);
    getDir(dir).set(name, { name, mode: e.mode, sha: r.b.sha, isDir: false });
  }

  // 自底向上创建目录树
  const allDirs = [...dirs.keys()].filter(d => d !== '').sort((a, b) => b.split('/').length - a.split('/').length);
  for (const d of allDirs) {
    const slash = d.lastIndexOf('/');
    const parent = slash < 0 ? '' : d.slice(0, slash);
    const name = slash < 0 ? d : d.slice(slash + 1);
    getDir(parent).set(name, { name, mode: '040000', sha: null, isDir: true, dirPath: d });
  }

  const built = new Map();
  async function build(dir) {
    const m = getDir(dir);
    const items = [...m.values()].sort((a, b) => Buffer.compare(gitSortKey(a), gitSortKey(b)));
    const tree = [];
    for (const it of items) {
      let sha = it.sha;
      if (it.isDir) sha = await build(it.dirPath);
      tree.push({ path: it.name, mode: it.mode, type: it.isDir ? 'tree' : 'blob', sha });
    }
    const t = await api(token, owner, repo, 'POST', '/git/trees', { tree });
    if (t.st !== 201) throw new Error('创建 tree 失败 ' + (dir || '<root>') + ': ' + (t.b.message || t.st));
    built.set(dir, t.b.sha);
    return t.b.sha;
  }
  return build('');
}

(async () => {
  const { owner, repo } = parseRemote();
  const token = getToken();

  const ref = await api(token, owner, repo, 'GET', '/git/ref/heads/' + BRANCH);
  if (ref.st !== 200) throw new Error('读取远端分支失败: ' + (ref.b.message || ref.st));
  let remoteSha = ref.b.object.sha;

  const head = git(['rev-parse', 'HEAD']).trim();
  if (remoteSha === head) {
    console.log('远端已是最新（' + head.slice(0, 7) + '），无需推送');
    return;
  }

  let commits = [];
  try {
    commits = git(['rev-list', '--reverse', remoteSha + '..HEAD']).split('\n').filter(Boolean);
  } catch (e) {
    throw new Error('远端提交不在本地历史中（可能已分叉），请先 git fetch / reset 对齐后再试');
  }
  if (!commits.length) {
    console.log('本地没有领先远端的提交');
    return;
  }

  console.log('待推送提交 ' + commits.length + ' 个：');
  for (const c of commits) {
    const meta = commitMeta(c);
    const treeSha = await ensureTree(token, owner, repo, c);
    const localTree = git(['rev-parse', c + '^{tree}']).trim();
    if (treeSha !== localTree) throw new Error('tree 哈希不一致（本地 ' + localTree + ' / 远端 ' + treeSha + '）');
    const parents = git(['rev-list', '--parents', '-n', '1', c]).trim().split(' ').slice(1);
    const cc = await api(token, owner, repo, 'POST', '/git/commits', {
      message: meta.message, tree: treeSha, parents,
      author: meta.author, committer: meta.committer
    });
    if (cc.st !== 201) throw new Error('创建 commit 失败: ' + (cc.b.message || cc.st));
    if (cc.b.sha !== c) throw new Error('commit 哈希不一致（本地 ' + c + ' / 远端 ' + cc.b.sha + '）');
    console.log('  ✓ ' + c.slice(0, 7) + '  ' + meta.message.split('\n')[0]);
  }

  const upd = await api(token, owner, repo, 'PATCH', '/git/refs/heads/' + BRANCH, { sha: head, force: false });
  if (upd.st !== 200) throw new Error('更新分支失败: ' + (upd.b.message || upd.st));
  console.log('OK 已通过 API 推送，远端 ' + BRANCH + ' = ' + head.slice(0, 7) + '（与本地一致）');
})();
