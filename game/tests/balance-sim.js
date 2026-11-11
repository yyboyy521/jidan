/* =========================================================
 * tests/balance-sim.js —— v5 平衡验证模拟器（Node，无头）
 * 用法：node tests/balance-sim.js [每策略每角色局数]
 * 默认：300 局/策略/角色 × 4 策略 × 4 角色 = 4800 局（≥1200 要求）
 * ---------------------------------------------------------
 * 与 smoke-test.js 的区别：
 *   smoke-test 断言"契约对不对"；本脚本只跑数据、出分布，不做断言。
 *   它【加载真实 js/engine.js】，用桩 UI（stub）自动选择选项，
 *   因此走的是生产代码路径：_tickStates / stateChance×factor /
 *   尾声优先 / 崩坏提前结局 / 结局判定 / 成就结算。
 *
 * 四种策略（对应四类玩家）：
 *   random  随机：闭眼点，衡量"最差玩法"的崩坏率下限
 *   rational 理性：按期望收益打分、低数值止损，模拟认真玩家
 *   silent  沉默：优先选沉默类选项（潜水党的极端玩法）
 *   first   固定首项：永远点第一个可用选项（最无脑的稳定玩法）
 *
 * 指标：崩坏率 / 平均段数 / 结局分布 / 状态触发分布 / 状态同屏峰值。
 * 随机性：全部使用种子化 PRNG（mulberry32），同一命令结果可复现，
 *   避免"这次跑绿下次跑红"的抖动。
 * ========================================================= */
'use strict';

/* ---------- 0. 种子化 PRNG（可复现） ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ORIGINAL_RANDOM = Math.random;
function withSeed(seed, fn) {
  Math.random = mulberry32(seed);
  try { return fn(); } finally { Math.random = ORIGINAL_RANDOM; }
}

/* ---------- 1. 无头环境 + 模块加载 ---------- */
global.window = global;
global.localStorage = undefined;   // 成就/存档自动降级为内存
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load(relPath) {
  const code = fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
  vm.runInThisContext(code, { filename: relPath });
}

/* 桩 UI：把引擎的三处"等玩家输入"换成策略函数 */
const harness = {
  strategy: null,          // (ev, state) => optionIndex
  events: [],              // 本局见过的事件 id
  stateGained: [],         // 本局触发过的状态 [{name,delta,...}]
  maxConcurrent: 0,        // 状态同屏峰值
  ending: null,
  result: null,
  turnOut: 0,
};

function usableFlags(ev, state) {
  return ev.options.map(o => EventRules.optionUsable(o, state).ok);
}

global.UI = {
  showTitle() {},
  showScreen() {},
  toast() {},
  renderCharSelect() {},
  renderGameHeader() {},
  renderTimeline() {},
  /* 侧栏状态徽章：数组长度即"同屏状态数" */
  renderStats(statsManager, flags, stateEntries) {
    const n = Array.isArray(stateEntries) ? stateEntries.length : 0;
    if (n > harness.maxConcurrent) harness.maxConcurrent = n;
  },
  renderEvent(ev, state, onChoose) {
    harness.events.push(ev.id);
    const usable = usableFlags(ev, state);
    let idx = harness.strategy(ev, state, usable);
    if (!Number.isInteger(idx) || idx < 0 || idx >= ev.options.length || !usable[idx]) {
      idx = usable.indexOf(true);                       // 兜底：第一个可用项
    }
    if (idx < 0) idx = 0;
    onChoose(idx);
  },
  showResultCard(payload, onClose) {
    (payload.stateGained || []).forEach(s => harness.stateGained.push(s));
    if (onClose) onClose();
  },
  showEnding(ending, statsManager, history, ch, name, onRestart, unlock) {
    harness.ending = ending;
    harness.result = {
      endingId: ending.id,
      turn: harness.turnOut || history.length,
      stats: statsManager.snapshot(),
      earlyEnd: !!harness.earlyEnd,
      history: history,
      unlock: unlock,
    };
  },
};

load('js/data.js');
load('js/data/events.js');
load('js/stats.js');
load('js/name.js');
load('js/events.js');
load('js/endings.js');
load('js/achievements.js');
load('js/chat-import.js');
load('js/audio.js');
load('js/engine.js');

const GAME = window.GAME;
const STAT_KEYS = Object.keys(GAME.STATS_META);
const CHARS = GAME.CHARACTERS.map(c => c.id);

/* ---------- 2. 策略 ---------- */
function estimateStats(op) {
  const eff = op.effects || {};
  if (eff.random && eff.random.length) {
    const out = {};
    let total = 0;
    eff.random.forEach(v => { total += (typeof v.weight === 'number' && v.weight > 0) ? v.weight : 1; });
    eff.random.forEach(v => {
      const w = ((typeof v.weight === 'number' && v.weight > 0) ? v.weight : 1) / total;
      Object.keys(v.stats || {}).forEach(k => { out[k] = (out[k] || 0) + v.stats[k] * w; });
    });
    return out;
  }
  return eff.stats || {};
}

function randomStrategy(ev, state, usable) {
  const ok = usable.map((u, i) => (u ? i : -1)).filter(i => i >= 0);
  return ok[Math.floor(Math.random() * ok.length)];
}

function rationalStrategy(ev, state, usable) {
  let best = -1, bestScore = -Infinity;
  ev.options.forEach((o, i) => {
    if (!usable[i]) return;
    const est = estimateStats(o);
    let score = 0;
    STAT_KEYS.forEach(k => {
      const d = est[k] || 0;
      const cur = state.stats[k];
      if (d < 0) score += d * (cur < 35 ? 4 : 1);   // 低数值再扣 → 重罚
      else if (cur < 40) score += d * 1.5;          // 补低数值 → 加权
      else score += d * 0.3;
    });
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

function silentStrategy(ev, state, usable) {
  const i = ev.options.findIndex((o, j) => usable[j] && o.silent);
  return i >= 0 ? i : rationalStrategy(ev, state, usable);
}

function firstStrategy(ev, state, usable) {
  return usable.indexOf(true);
}

const STRATEGIES = [
  { id: 'random', label: '随机', fn: randomStrategy },
  { id: 'rational', label: '理性', fn: rationalStrategy },
  { id: 'silent', label: '沉默', fn: silentStrategy },
  { id: 'first', label: '固定首项', fn: firstStrategy },
];

/* ---------- 3. 单局 ---------- */
function playOne(strategyFn, charId, seed) {
  return withSeed(seed, () => {
    harness.strategy = strategyFn;
    harness.events = [];
    harness.stateGained = [];
    harness.maxConcurrent = 0;
    harness.ending = null;
    harness.result = null;
    harness.turnOut = 0;
    harness.earlyEnd = false;

    const g = window.game;
    g.reset();
    g._start(charId, null, 'sim');
    // _start 是同步阻塞的（结果卡回调立即推进），返回时本局已结束
    const r = harness.result || { endingId: 'UNKNOWN', turn: 0, stats: {}, earlyEnd: false, history: [] };
    r.turn = g.turn;
    r.earlyEnd = !!g._earlyEnd;
    r.states = Object.assign({}, g.states);
    r.charId = charId;
    r.events = harness.events.slice();
    r.stateGained = harness.stateGained.slice();
    r.maxConcurrent = harness.maxConcurrent;
    return r;
  });
}

/* ---------- 4. 跑矩阵 ---------- */
const perCell = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 300;
const runs = [];
let seedCounter = 12345;

STRATEGIES.forEach(st => {
  CHARS.forEach((ch, ci) => {
    for (let i = 0; i < perCell; i++) {
      const r = playOne(st.fn, ch, seedCounter++);
      r.strategy = st.id;
      runs.push(r);
    }
  });
});

/* ---------- 5. 统计 ---------- */
function pct(n, d) { return d ? Math.round((n / d) * 1000) / 10 : 0; }
function avg(arr) { return arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100 : 0; }

const summary = {};
STRATEGIES.forEach(st => {
  const rs = runs.filter(r => r.strategy === st.id);
  const byEnding = {};
  rs.forEach(r => { byEnding[r.endingId] = (byEnding[r.endingId] || 0) + 1; });
  const stateCounts = {};
  let stateHits = 0;
  rs.forEach(r => {
    stateHits += r.stateGained.length;
    r.stateGained.forEach(s => { stateCounts[s.name] = (stateCounts[s.name] || 0) + 1; });
  });
  const collapsed = rs.filter(r => r.earlyEnd);
  const earlyBurst = collapsed.filter(r => r.turn < 8).length;  const hist = { 0: 0, 1: 0, 2: 0, '3+': 0 };
  rs.forEach(r => {
    const n = r.stateGained.length;
    if (n >= 3) hist['3+']++; else hist[n]++;
  });
  const byChar = {};
  CHARS.forEach(ch => {
    const sub = rs.filter(r => r.charId === ch);
    byChar[ch] = pct(sub.filter(r => r.earlyEnd).length, sub.length);
  });
  summary[st.id] = {
    label: st.label,
    games: rs.length,
    collapseRate: pct(collapsed.length, rs.length),
    collapseAvgTurn: collapsed.length ? avg(collapsed.map(r => r.turn)) : null,
    earlyCollapseRate: pct(earlyBurst, rs.length),
    avgTurn: avg(rs.map(r => r.turn)),
    avgStates: Math.round((stateHits / rs.length) * 100) / 100,
    stateHistogram: hist,
    runsWithState: pct(rs.filter(r => r.stateGained.length > 0).length, rs.length),
    maxConcurrent: Math.max(0, ...rs.map(r => r.maxConcurrent)),
    collapseByChar: byChar,
    endings: byEnding,
    stateCounts,
  };
});

const endingDist = {};
runs.forEach(r => { endingDist[r.endingId] = (endingDist[r.endingId] || 0) + 1; });
const allState = {};
runs.forEach(r => r.stateGained.forEach(s => { allState[s.name] = (allState[s.name] || 0) + 1; }));
const collapseStat = {};
runs.filter(r => r.earlyEnd).forEach(r => {
  const k = STAT_KEYS.find(k => r.stats[k] <= 0) || 'unknown';
  collapseStat[k] = (collapseStat[k] || 0) + 1;
});

/* 尾声优先的行为验证：完整走完的局，最后两段事件的 order 应落在全库后段；
 * 同时统计最后一段落在哪条事件上（期望是 order 最大的尾声事件 ev_year_end 一类） */
const orderedEvents = window.GAME_EVENTS.slice().sort((a, b) => a.order - b.order);
const fullRuns = runs.filter(r => r.turn >= GAME.CONFIG.turnLimit - 5);
const lastOrders = [];
const lastEventCount = {};
fullRuns.forEach(r => {
  const lastId = r.events[r.events.length - 1];
  const ev = orderedEvents.find(e => e.id === lastId);
  if (ev) {
    lastOrders.push(ev.order);
    lastEventCount[lastId + '(order ' + ev.order + ')'] = (lastEventCount[lastId + '(order ' + ev.order + ')'] || 0) + 1;
  }
});

const endingMeta = {};
GAME.ENDINGS.forEach((e, i) => { endingMeta[e.id] = { rank: i, tone: e.tone, collapses: /zero/.test(e.id) }; });

console.log('================ v5 平衡模拟 ================');
console.log('局数：' + runs.length + '（' + STRATEGIES.length + ' 策略 × ' + CHARS.length + ' 角色 × ' + perCell + ' 局）');
console.log('\n--- 分策略 ---');
Object.keys(summary).forEach(k => {
  const s = summary[k];
  console.log('[' + s.label + '] ' + s.games + ' 局 | 崩坏率 ' + s.collapseRate + '% | 平均 ' + s.avgTurn +
    ' 段 | 平均触发状态 ' + s.avgStates + ' 次/局 | 有状态局占比 ' + s.runsWithState + '% | 同屏峰值 ' + s.maxConcurrent);
  console.log('   崩坏局平均 ' + (s.collapseAvgTurn === null ? '—' : s.collapseAvgTurn) + ' 段结束；<8 段早崩占比 ' + s.earlyCollapseRate + '%');
  console.log('   分角色崩坏率：' + CHARS.map(c => c + ' ' + s.collapseByChar[c] + '%').join(' | '));
  console.log('   状态次数分布（0/1/2/3+）：' + s.stateHistogram[0] + '/' + s.stateHistogram[1] + '/' +
    s.stateHistogram[2] + '/' + s.stateHistogram['3+']);
  console.log('   结局：' + Object.keys(s.endings).sort((a, b) => s.endings[b] - s.endings[a])
    .map(id => id + ' ' + s.endings[id]).join(' | '));
  console.log('   状态：' + (Object.keys(s.stateCounts).length
    ? Object.keys(s.stateCounts).sort((a, b) => s.stateCounts[b] - s.stateCounts[a])
      .map(n => n + ' ' + s.stateCounts[n]).join(' | ') : '（无）'));
});

console.log('\n--- 全局结局分布（' + runs.length + ' 局）---');
GAME.ENDINGS.forEach(e => {
  const n = endingDist[e.id] || 0;
  console.log('  ' + (n > 0 ? '●' : '○') + ' ' + e.id.padEnd(18) + String(n).padStart(5) +
    '  ' + String(pct(n, runs.length)).padStart(5) + '%  ' + e.title);
});
const reachable = GAME.ENDINGS.filter(e => (endingDist[e.id] || 0) > 0).length;
console.log('  可达结局：' + reachable + ' / ' + GAME.ENDINGS.length);

console.log('\n--- 全局状态触发分布 ---');
Object.keys(GAME.STATES_META).forEach(n => {
  console.log('  ' + n.padEnd(6) + '(' + GAME.STATES_META[n].kind + ') ' + String(allState[n] || 0).padStart(6) + ' 次');
});
console.log('  全场合计：' + Object.keys(allState).reduce((a, k) => a + allState[k], 0) + ' 次；平均 ' +
  Math.round((Object.keys(allState).reduce((a, k) => a + allState[k], 0) / runs.length) * 100) / 100 + ' 次/局');
console.log('\n--- 崩坏项分布 ---');
Object.keys(collapseStat).forEach(k => console.log('  ' + k + ': ' + collapseStat[k]));
const peakAll = Math.max(0, ...runs.map(r => r.maxConcurrent));
console.log('\n状态同屏峰值（全场合）：' + peakAll);

console.log('\n--- 尾声落点（走满 ≥' + (GAME.CONFIG.turnLimit - 5) + ' 段的 ' + fullRuns.length + ' 局）---');
console.log('  最后一段的平均 order：' + avg(lastOrders) + '（全库 1-' + orderedEvents.length + '）');
Object.keys(lastEventCount).sort((a, b) => lastEventCount[b] - lastEventCount[a]).slice(0, 6)
  .forEach(k => console.log('  ' + k + ' × ' + lastEventCount[k]));

/* 供 QA 报告引用的机器可读摘要 */
const out = {
  runs: runs.length,
  perCell: perCell,
  summary: summary,
  endingDist: endingDist,
  reachable: reachable,
  stateCounts: allState,
  peakConcurrent: peakAll,
  collapseStat: collapseStat,
  finale: { fullRuns: fullRuns.length, avgLastOrder: avg(lastOrders), lastEvents: lastEventCount },
};
fs.writeFileSync(path.join(__dirname, 'balance-result.json'), JSON.stringify(out, null, 2));
console.log('\n（机器可读结果已写入 tests/balance-result.json）');
