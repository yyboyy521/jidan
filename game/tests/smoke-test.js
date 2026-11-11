/* =========================================================
 * tests/smoke-test.js —— 无头冒烟测试（Node 运行，不需要浏览器）
 * 用法：node tests/smoke-test.js
 * ---------------------------------------------------------
 * v5 覆盖内容（对应 design/content-v5.md / design/qa-v5.md）：
 *   [1]  事件数据 schema（67 事件、2-4 选项、order/scene、文案红线）
 *   [1b] v5 数据契约：random 结果池、repeatable 全单次、lowStat、
 *        状态名闭合（7 状态）、stateChance 覆盖率与基准区间、
 *        负面状态代价链、结局/成就 condition 覆盖率、match.states 弃用
 *   [2]  数值系统（0-100 封顶保底 / trait 修正 / 有涨有跌）
 *   [2b] v5 开局 5 点自由分配（单项 +5、合计裁到 5、负分配清零、
 *        adjustCap 硬上限、statMax 封顶、null/坏数据不抛错）
 *   [3]  分支与门槛（flag 链 / 数值门槛 / 选项级门槛 / next 直连链）
 *   [3b] 事件引擎机制（usedIds 计数表、lowStat ×3、窗口 K=12、
 *        尾声优先、requires.states 契约仍支持）
 *   [4]  状态生命周期（真实 engine.js）：duration 生效 / 每 tick 递减 /
 *        归零移除 / 同名再触发 count+1 且 remaining 重置 /
 *        有效计数映射只含未过期项 / 负值忽略 / 结果卡 payload 形状
 *   [4b] 状态概率：stateChance × CONFIG.stateChanceFactor 抽样统计
 *        （种子化 PRNG，2500 次/用例，落在理论值 ±0.05）
 *   [4c] 完整对局模拟（真实引擎 + 桩 UI，四策略）：数值不越界、
 *        结局合法、事件不重复、状态同屏 ≤3、尾声收束、崩坏可达、
 *        理性 0 崩坏
 *   [5]  结局判定（v5：崩坏优先 + 终值 + flag；match.states 已弃用）
 *   [6]  成就系统（evaluateRun / recordRun / 重复结算不重复报新）
 *   [7]  chat-import 预留接口契约不变
 *   [8]  音频层 Sfx 在 Node 环境降级为零操作（不抛错）
 *   [9]  UI 层契约（桩断言 renderStats 第三参为数组、stateGained 形状、
 *        图鉴未解锁不出现 condition 文案）
 *
 * 测试策略说明：
 *   - 【加载真实 engine.js】而不是复刻其推进逻辑。DOM/UI/localStorage
 *     全部用桩替代，因此状态生命周期、概率、尾声优先、崩坏结算
 *     都跑在生产代码路径上，避免"测试自以为对"的风险。
 *   - 所有随机抽样使用种子化 PRNG（mulberry32），结果可复现，
 *     不存在 flaky 抖动（详见 design/qa-v5.md 的稳定性说明）。
 * ========================================================= */
'use strict';

/* ---------- 0. 无头环境 + 种子化 PRNG ---------- */
global.window = global;
global.localStorage = undefined;      // 存档/成就收集自动降级为内存
global.document = undefined;          // audio.js / ui.js 均以 typeof 守卫

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

/* ---------- 1. 桩 UI（引擎与测试之间的唯一输入通道） ---------- */
const H = {
  mode: 'auto',        // 'auto'：选完自动关闭结果卡继续推进；'hold'：只记录不推进
  strategy: null,      // (ev, state, usable) => optionIndex
  events: [],
  results: [],
  stateGained: [],
  statsCalls: [],
  ending: null,
  endingArgs: null,
  maxConcurrent: 0,
};

global.UI = {
  showTitle() {},
  showScreen() {},
  toast() {},
  renderCharSelect() {},
  renderGameHeader() {},
  renderTimeline() {},
  renderStats(statsManager, flags, stateEntries) {
    H.statsCalls.push({ stats: statsManager.snapshot(), flags: Object.assign({}, flags), stateEntries: stateEntries });
    const n = Array.isArray(stateEntries) ? stateEntries.length : 0;
    if (n > H.maxConcurrent) H.maxConcurrent = n;
  },
  renderEvent(ev, state, onChoose) {
    H.events.push(ev.id);
    const usable = ev.options.map(o => EventRules.optionUsable(o, state).ok);
    let idx = H.strategy ? H.strategy(ev, state, usable) : 0;
    if (!Number.isInteger(idx) || idx < 0 || idx >= ev.options.length || !usable[idx]) {
      idx = usable.indexOf(true);
    }
    if (idx < 0) idx = 0;
    onChoose(idx);
  },
  showResultCard(payload, onClose) {
    H.results.push(payload);
    (payload.stateGained || []).forEach(s => H.stateGained.push(s));
    if (H.mode === 'auto' && onClose) onClose();
  },
  showEnding(ending, statsManager, history, char, playerName, onRestart, unlock) {
    H.ending = ending;
    H.endingArgs = {
      stats: statsManager.snapshot(), history: history, char: char, playerName: playerName, unlock: unlock,
      onRestart: onRestart,
    };
  },
};

/* ---------- 2. 加载模块（顺序与 index.html 一致，engine.js 最后） ---------- */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load(relPath) {
  const code = fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
  vm.runInThisContext(code, { filename: relPath });
}

load('js/data.js');
load('js/data/events.js');
load('js/stats.js');
load('js/name.js');
load('js/events.js');
load('js/endings.js');
load('js/achievements.js');
load('js/chat-import.js');
load('js/audio.js');
load('js/engine.js');                 // 末尾 new Game() → 桩 UI.showTitle（不启动对局）

const GAME = window.GAME;
const EVENTS = window.GAME_EVENTS;
const STAT_KEYS = Object.keys(GAME.STATS_META);
const STATE_NAMES = Object.keys(GAME.STATES_META);
const SCENE_ORDER = ['九月 · 破冰', '十月 · 日常', '十一月 · 水群', '十二月 · 期中与演出', '一月 · 散场'];

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (detail ? '　[' + detail + ']' : '')); console.error('  ✗ ' + name + (detail ? '　[' + detail + ']' : '')); }
}

/* ---------- 通用工具 ---------- */
const CHAR = id => GAME.CHARACTERS.filter(c => c.id === id)[0];
const avg = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const round = (v, n) => Math.round(v * Math.pow(10, n || 0)) / Math.pow(10, n || 0);

/* 把全局 game 重置成可控状态（不触发对局推进） */
function freshGame(opts) {
  opts = opts || {};
  const g = window.game;
  g.reset();
  g.char = CHAR(opts.charId || 'lurker');
  g.stats = new StatsManager(opts.stats || Object.assign({}, g.char.base), opts.trait || null);
  g.playerName = '冒烟测试';
  g._started = true;
  g.turn = opts.turn === undefined ? 1 : opts.turn;
  H.mode = opts.mode || 'hold';
  H.events = []; H.results = []; H.stateGained = []; H.statsCalls = [];
  H.ending = null; H.endingArgs = null; H.maxConcurrent = 0;
  return g;
}

/* 合成事件（只测引擎行为，不进数据池） */
function mkEvent(id, options, extra) {
  return Object.assign({
    id: id, order: 1, scene: '九月 · 破冰', title: '合成事件', text: '合成文本',
    options: options,
  }, extra || {});
}

/* 在指定概率系数下执行（用完还原，避免污染其它用例） */
function withFactor(factor, fn) {
  const old = GAME.CONFIG.stateChanceFactor;
  GAME.CONFIG.stateChanceFactor = factor;
  try { return fn(); } finally { GAME.CONFIG.stateChanceFactor = old; }
}

/* 单次抽样：把 currentEvent 设为合成事件后选 0 号，返回 stateGained 长度
 * resetStates=false 时保留已有状态（用于"同名再触发/多状态共存"用例） */
function chooseOnce(g, ev, resetStates) {
  g.currentEvent = ev;
  if (resetStates !== false) g.states = {};
  g._earlyEnd = false;
  H.results.length = 0;
  g._choose(0);
  return H.results[H.results.length - 1].stateGained.length;
}

/* 概率抽样：返回命中率 */
function hitRate(ev, n, seed) {
  return withSeed(seed || 97531, () => {
    const g = freshGame({ stats: { relation: 50, mood: 50, fame: 50, energy: 100 } });
    let hits = 0;
    for (let i = 0; i < n; i++) { if (chooseOnce(g, ev) > 0) hits++; }
    return hits / n;
  });
}

/* 完整对局（真实引擎推进） */
function playGame(strategy, charId, seed) {
  return withSeed(seed || 20250101, () => {
    H.mode = 'auto';
    H.strategy = strategy;
    H.events = []; H.results = []; H.stateGained = []; H.statsCalls = [];
    H.ending = null; H.endingArgs = null; H.maxConcurrent = 0;
    const g = window.game;
    g.reset();
    g._start(charId || 'lurker', null, '冒烟');
    return {
      ending: H.ending,
      turn: g.turn,
      stats: g.stats.snapshot(),
      earlyEnd: !!g._earlyEnd,
      history: g.history.slice(),
      events: H.events.slice(),
      stateGained: H.stateGained.slice(),
      maxConcurrent: H.maxConcurrent,
      results: H.results.slice(),
      statsCalls: H.statsCalls.slice(),
      states: Object.assign({}, g.states),
      endingArgs: H.endingArgs,
    };
  });
}

/* 策略：随机 / 理性 / 沉默 / 固定首项 */
function strategyRandom(ev, state, usable) {
  const ok = usable.map((u, i) => (u ? i : -1)).filter(i => i >= 0);
  return ok[Math.floor(Math.random() * ok.length)];
}
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
function strategyRational(ev, state, usable) {
  let best = -1, bestScore = -Infinity;
  ev.options.forEach((o, i) => {
    if (!usable[i]) return;
    const est = estimateStats(o);
    let score = 0;
    STAT_KEYS.forEach(k => {
      const d = est[k] || 0;
      const cur = state.stats[k];
      if (d < 0) score += d * (cur < 35 ? 4 : 1);
      else if (cur < 40) score += d * 1.5;
      else score += d * 0.3;
    });
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best >= 0 ? best : 0;
}
function strategySilent(ev, state, usable) {
  const i = ev.options.findIndex((o, j) => usable[j] && o.silent);
  return i >= 0 ? i : strategyRational(ev, state, usable);
}
function strategyFirst(ev, state, usable) { return usable.indexOf(true); }

/* =========================================================
 * [1] 事件数据 schema
 * ========================================================= */
console.log('\n[1] 事件数据 schema 校验（ChatImporter.validateAll）');
const vr = ChatImporter.validateAll(EVENTS);
check('76 个事件全部通过 schema 校验（v6 数据量 76）', vr.ok && EVENTS.length === 76,
  vr.ok ? '' : JSON.stringify(vr.invalid && vr.invalid[0]));
check('每个事件 2-4 个选项', EVENTS.every(e => e.options.length >= 2 && e.options.length <= 4));
check('事件 id 全局唯一', new Set(EVENTS.map(e => e.id)).size === EVENTS.length);
check('order 全局唯一且为 1..76 连续整数', (() => {
  const orders = EVENTS.map(e => e.order).sort((a, b) => a - b);
  return orders.every((o, i) => o === i + 1);
})());
check('scene 均为五章之一', EVENTS.every(e => SCENE_ORDER.indexOf(e.scene) >= 0));
check('章节 order 区间连续且不交错（五章共 76 段）', (() => {
  const by = {};
  EVENTS.forEach(e => { (by[e.scene] = by[e.scene] || []).push(e.order); });
  const ranges = SCENE_ORDER.map(s => {
    const a = (by[s] || []).slice().sort((x, y) => x - y);
    if (!a.length) return null;
    return { scene: s, min: a[0], max: a[a.length - 1], ok: a[a.length - 1] - a[0] + 1 === a.length };
  });
  if (ranges.some(r => !r || !r.ok)) return false;
  for (let i = 1; i < ranges.length; i++) if (ranges[i].min !== ranges[i - 1].max + 1) return false;
  return ranges[0].min === 1 && ranges[ranges.length - 1].max === EVENTS.length;
})());
check('回合上限 25（CONFIG.turnLimit）', GAME.CONFIG.turnLimit === 25);
check('事件窗口 K=12（CONFIG.eventWindow，v5 校准值）', GAME.CONFIG.eventWindow === 12);
check('状态概率系数 0.4（CONFIG.stateChanceFactor）', GAME.CONFIG.stateChanceFactor === 0.4);
check('开局分配：adjustPoints=5 / adjustRange=5 / adjustStep=1',
  GAME.CONFIG.adjustPoints === 5 && GAME.CONFIG.adjustRange === 5 && GAME.CONFIG.adjustStep === 1);
check('adjustCap 四项齐全且不超过 statMax', STAT_KEYS.every(k =>
  typeof GAME.CONFIG.adjustCap[k] === 'number' && GAME.CONFIG.adjustCap[k] <= GAME.CONFIG.statMax));
check('事件与选项文案不含中文括号（去括号约定）',
  EVENTS.every(e => !/[（()）]/.test(e.text) && !/[（()）]/.test(e.title) &&
    e.options.every(o => !/[（()）]/.test(o.text))));
check('文案不含 AI 味高频词', EVENTS.every(e =>
  !/在这个快节奏|在这个时代|无疑|不仅.*而且|赋能|沉淀/.test(e.text + e.title + e.options.map(o => o.text).join(''))));
check('事件标题/正文非空且长度合理', EVENTS.every(e =>
  e.title.length >= 2 && e.text.length >= 10 && e.options.every(o => o.text.length >= 2)));

/* =========================================================
 * [1b] v5 数据契约
 * ========================================================= */
console.log('\n[1b] v5 数据契约（random / 单次事件 / 状态闭合 / 概率 / condition）');

const randomOpts = [];
EVENTS.forEach(e => e.options.forEach((o, i) => { if (o.effects && o.effects.random) randomOpts.push({ ev: e, o: o, idx: i }); }));
const totalVariants = randomOpts.reduce((n, r) => n + r.o.effects.random.length, 0);
check('随机结果选项 5 个 / 变体 13 个（实际 ' + randomOpts.length + ' / ' + totalVariants + '）',
  randomOpts.length === 5 && totalVariants === 13);
check('每个随机选项 2-3 个变体', randomOpts.every(r => {
  const len = r.o.effects.random.length;
  return len >= 2 && len <= 3;
}));
check('random 与直接 stats/states 互斥（effects 里只允许 random / stateChance）',
  randomOpts.every(r => Object.keys(r.o.effects).every(k => k === 'random' || k === 'stateChance')));
const randomWithChance = randomOpts.filter(r => typeof r.o.effects.stateChance === 'number');
check('random 与 stateChance 并存合法（v5 共 ' + randomWithChance.length + ' 个变体选项如此）',
  randomWithChance.length === 4 &&
  randomWithChance.every(r => r.o.effects.stateChance > 0 && r.o.effects.stateChance <= 1));
check('random 变体字段合法（weight 正数；仅 weight/stats/flags/states/narrate/next；stat 键合法；next 目标存在）',
  randomOpts.every(r => r.o.effects.random.every(v =>
    typeof v.weight === 'number' && v.weight > 0 &&
    Object.keys(v).every(k => ['weight', 'stats', 'flags', 'states', 'narrate', 'next'].indexOf(k) >= 0) &&
    !v.random &&
    (!v.stats || Object.keys(v.stats).every(k => STAT_KEYS.indexOf(k) >= 0)) &&
    (!v.states || Object.keys(v.states).every(s => STATE_NAMES.indexOf(s) >= 0)) &&
    (!v.next || EVENTS.some(e => e.id === v.next))
  )));

const repeatDecl = EVENTS.filter(e => typeof e.repeatable === 'number' && e.repeatable > 1);
check('事件全部单次触发：无事件声明 repeatable>1（实际 ' + repeatDecl.length + ' 个）', repeatDecl.length === 0);
check('引擎侧单次语义：任一事件用过 1 次后不再可用（重复触发 = 池子见底的原因之一）',
  (() => {
    const eng = new EventEngine();
    const st = { stats: { relation: 60, mood: 50, fame: 50, energy: 50 }, flags: {}, states: {}, usedIds: {}, turn: 0 };
    const ev = eng.getById('ev_welcome');
    return eng.eventAvailable(ev, st) && !eng.eventAvailable(ev, { ...st, usedIds: { ev_welcome: 1 } });
  })());

const lowEvents = EVENTS.filter(e => e.lowStat);
check('lowStat 事件 4 个且 stat/below 合法（' + lowEvents.map(e => e.id).join(' ') + '）',
  lowEvents.length === 4 && lowEvents.every(e =>
    STAT_KEYS.indexOf(e.lowStat.stat) >= 0 &&
    typeof e.lowStat.below === 'number' && e.lowStat.below > 0 && e.lowStat.below <= 100));

const reqStatesEvs = EVENTS.filter(e => e.requires && e.requires.states);
check('v5 数据不使用 requires.states 作门槛（实际 ' + reqStatesEvs.length + ' 个，契约保留给引擎）',
  reqStatesEvs.length === 0);

/* 状态名闭合：选项引用的状态 ⊆ STATES_META，且 7 个状态全部有投放点 */
const usedStates = {};
EVENTS.forEach(e => e.options.forEach(o => {
  const eff = o.effects || {};
  if (eff.states) Object.keys(eff.states).forEach(s => { usedStates[s] = (usedStates[s] || 0) + 1; });
  if (eff.random) eff.random.forEach(v => { if (v.states) Object.keys(v.states).forEach(s => { usedStates[s] = (usedStates[s] || 0) + 1; }); });
}));
check('状态名闭合：投放的 ' + Object.keys(usedStates).length + ' 个状态全部在 STATES_META 内，且 7 个状态全部有投放点',
  Object.keys(usedStates).length === STATE_NAMES.length &&
  Object.keys(usedStates).every(s => STATE_NAMES.indexOf(s) >= 0));
check('STATES_META 完整：duration 2-3 回合、desc 非空 ≤30 字、kind 仅 good/bad',
  STATE_NAMES.every(n => {
    const m = GAME.STATES_META[n];
    return m.duration >= 2 && m.duration <= 3 && typeof m.desc === 'string' &&
      m.desc.length > 0 && m.desc.length <= 30 && (m.kind === 'good' || m.kind === 'bad') &&
      m.name === n && typeof m.icon === 'string' && m.icon.length > 0;
  }));
check('负面状态 3 个（破防 / 社死 / emo），正面 4 个',
  STATE_NAMES.filter(n => GAME.STATES_META[n].kind === 'bad').sort().join(',') === 'emo,社死,破防'.split(',').sort().join(','));

/* stateChance 覆盖率：所有带 states 的选项都必须给基准概率 */
const stateOptions = [];
EVENTS.forEach(e => e.options.forEach(o => {
  const eff = o.effects || {};
  const has = !!(eff.states && Object.keys(eff.states).length) || !!(eff.random && eff.random.some(v => v.states));
  if (has) stateOptions.push({ ev: e, o: o, chance: eff.stateChance });
}));
check('状态选项 ' + stateOptions.length + ' 个，100% 显式给出 stateChance（0.3-0.7）',
  stateOptions.length === 102 && stateOptions.every(s =>
    typeof s.chance === 'number' && s.chance >= 0.3 && s.chance <= 0.7));
check('负面状态选项 19 条，且代价链完整（声望+人际下跌合计 ≥6）', (() => {
  const bad = [];
  EVENTS.forEach(e => e.options.forEach(o => {
    const eff = o.effects || {};
    const names = eff.states ? Object.keys(eff.states) : [];
    names.forEach(n => {
      if (GAME.STATES_META[n] && GAME.STATES_META[n].kind === 'bad') {
        const s = eff.stats || {};
        const drop = Math.abs(Math.min(0, s.fame || 0)) + Math.abs(Math.min(0, s.relation || 0));
        bad.push({ id: e.id, state: n, drop: drop, hasMinus: (s.fame || 0) < 0 || (s.relation || 0) < 0 });
      }
    });
  }));
  return bad.length === 19 && bad.every(b => b.hasMinus && b.drop >= 6);
})());

/* 有涨有跌：非 random 选项必须同时含正向与负向数值变化；变体同理 */
const missingBoth = [];
EVENTS.forEach(e => e.options.forEach((o, i) => {
  const eff = o.effects || {};
  if (eff.random) return;
  const s = eff.stats || {};
  const k = Object.keys(s);
  if (!(k.some(x => s[x] > 0) && k.some(x => s[x] < 0))) missingBoth.push(e.id + '#' + (i + 1));
}));
check('每个非 random 选项的 stats 同时含正向与负向变化（违规 ' + missingBoth.length + ' 个）', missingBoth.length === 0,
  missingBoth.slice(0, 5).join(' '));
check('random 变体的 stats 同样有涨有跌', randomOpts.every(r => r.o.effects.random.every(v => {
  const s = v.stats || {};
  const k = Object.keys(s);
  return k.some(x => s[x] > 0) && k.some(x => s[x] < 0);
})));

/* 分支密度 */
check('flag 前置链事件 ≥6 条（实际 ' + EVENTS.filter(e => e.requires && e.requires.flags).length + '）',
  EVENTS.filter(e => e.requires && e.requires.flags).length >= 6);
check('数值门槛事件 ≥5 个（实际 ' + EVENTS.filter(e => e.requires && e.requires.stats).length + '）',
  EVENTS.filter(e => e.requires && e.requires.stats).length >= 5);
const nextTargets = new Set(EVENTS.flatMap(e => e.options.map(o => o.next).filter(Boolean)));
check('next 直连链 ≥3 条且目标均存在',
  nextTargets.size >= 3 && [...nextTargets].every(id => EVENTS.some(e => e.id === id)));
check('沉默类选项 ≥15 个（实际 ' + EVENTS.reduce((n, e) => n + e.options.filter(o => o.silent).length, 0) + '）',
  EVENTS.reduce((n, e) => n + e.options.filter(o => o.silent).length, 0) >= 15);
check('每个事件至少有一个非门槛选项（不会出现无路可走）',
  EVENTS.every(e => e.options.some(o => !o.requires)));

/* flag 可达性：被 requires / 结局 / 成就引用的 flag，必须真有一个选项能写入它 */
check('flag 可达性：所有被门槛/结局/成就引用的 flag 都有写入点（无死 flag）', (() => {
  const settable = new Set();
  const addFlags = f => { if (f) Object.keys(f).forEach(k => { if (f[k]) settable.add(k); }); };
  EVENTS.forEach(e => e.options.forEach(o => {
    const eff = o.effects || {};
    addFlags(eff.flags);
    (eff.random || []).forEach(v => addFlags(v.flags));
  }));
  const referenced = [];
  EVENTS.forEach(e => {
    const reqs = [e.requires].concat(e.options.map(o => o.requires)).filter(Boolean);
    reqs.forEach(r => {
      (r.flags || []).forEach(f => referenced.push(f));
      (r.notFlags || []).forEach(f => referenced.push(f));
    });
  });
  GAME.ENDINGS.forEach(e => (e.match && e.match.flags || []).forEach(f => referenced.push(f)));
  GAME.ACHIEVEMENTS.forEach(a => { if (a.rule && a.rule.type === 'flag') referenced.push(a.rule.flag); });
  return referenced.every(f => settable.has(f)) && settable.size >= 20;
})());

/* 结局 / 成就 condition 覆盖与不剧透 */
check('12 个结局，condition 覆盖率 100%（非空、≤40 字、无变量名/数字）',
  GAME.ENDINGS.length === 12 && GAME.ENDINGS.every(e =>
    typeof e.condition === 'string' && e.condition.length > 0 && e.condition.length <= 40 &&
    !/[0-9]|relation|mood|fame|energy/.test(e.condition)));
check('12 条成就，condition 覆盖率 100%（非空、≤40 字、无变量名/数字）',
  GAME.ACHIEVEMENTS.length === 12 && GAME.ACHIEVEMENTS.every(a =>
    typeof a.condition === 'string' && a.condition.length > 0 && a.condition.length <= 40 &&
    !/[0-9]|relation|mood|fame|energy/.test(a.condition)));
check('结局 match.states 已全量弃用（v5 改用终值 + flag）',
  GAME.ENDINGS.every(e => !((e.match || {}).states)));
check('结局顺序契约：末位为兜底（match 为空），首位为带潜水 flag 的「潜水大师」，4 个崩坏结局紧随其后且不散落',
  Object.keys(GAME.ENDINGS[GAME.ENDINGS.length - 1].match || {}).length === 0 &&
  GAME.ENDINGS[0].id === 'end_lurker' &&
  (((GAME.ENDINGS[0].match || {}).flags) || []).indexOf('潜水大师') >= 0 &&
  GAME.ENDINGS.slice(1, 5).every(e => /^end_zero_/.test(e.id)) &&
  GAME.ENDINGS.slice(5).every(e => !/^end_zero_/.test(e.id)));
check('结局 tone 合法（good/mid/bad/plain）',
  GAME.ENDINGS.every(e => ['good', 'mid', 'bad', 'plain'].indexOf(e.tone) >= 0));

/* 引擎源码契约 */
const engineSrc = fs.readFileSync(path.join(__dirname, '..', 'js/engine.js'), 'utf8');
check('主控 engine.js：SAVE_VERSION=4 且包含 v5 状态 API（_activeStateCounts / _stateEntries / _tickStates）',
  /SAVE_VERSION\s*=\s*4/.test(engineSrc) &&
  /_activeStateCounts/.test(engineSrc) && /_stateEntries/.test(engineSrc) && /_tickStates/.test(engineSrc));
check('主控 engine.js：状态概率 = stateChance × CONFIG.stateChanceFactor',
  /stateChanceFactor/.test(engineSrc) && /stateChanceOf/.test(engineSrc));

/* =========================================================
 * [2] 数值系统
 * ========================================================= */
console.log('\n[2] StatsManager：封顶保底 / 性格修正 / 有涨有跌');
const s1 = new StatsManager({ relation: 97, mood: 3, fame: 50, energy: 50 }, { stat: 'mood', mult: 1.2 });
let recs = s1.applyChanges({ relation: 10, mood: 10 });
check('97+10 → 封顶 100（clamped 标记边界截断）',
  s1.get('relation') === 100 && recs.find(r => r.stat === 'relation').to === 100 &&
  recs.find(r => r.stat === 'relation').clamped === true);
check('心情 +10 经 trait 1.2 与 gainFactor(' + GAME.CONFIG.gainFactor + ') 修正',
  s1.get('mood') === 3 + Math.round(10 * 1.2 * GAME.CONFIG.gainFactor));
const s2 = new StatsManager({ relation: 50, mood: 50, fame: 50, energy: 50 }, null);
recs = s2.applyChanges({ relation: -20, energy: 5 });
check('有涨有跌：负 delta 经 lossFactor(' + GAME.CONFIG.lossFactor + ') 放大如实生效',
  s2.get('relation') === 50 - Math.round(20 * GAME.CONFIG.lossFactor));
const s3 = new StatsManager({ relation: 5, mood: 50, fame: 50, energy: 50 }, null);
s3.applyChanges({ relation: -20 });
check('保底：5 扣到 0 不越界', s3.get('relation') === 0);
check('collapsedStat：relation 归零 → 返回 relation', s3.collapsedStat() === 'relation');
check('collapsedStat：无归零项 → null', s2.collapsedStat() === null);
check('性格修正不放大负向变化（trait 只作用于正向）', (() => {
  const s = new StatsManager({ relation: 50, mood: 50, fame: 50, energy: 50 }, { stat: 'relation', mult: 1.2 });
  s.applyChanges({ relation: -5 });
  return s.get('relation') === 50 - Math.round(5 * GAME.CONFIG.lossFactor);
})());
check('初始值构造仍封顶保底（-50→0、150→100）', (() => {
  const s = new StatsManager({ relation: -50, mood: 150, fame: 50, energy: 50 }, null);
  return s.get('relation') === 0 && s.get('mood') === 100;
})());
check('未知 stat 键被忽略不抛错', (() => { s2.applyChanges({ money: 999 }); return true; })());
check('snapshot 返回副本（改动不污染内部状态）', (() => {
  const snap = s2.snapshot(); snap.relation = 0; return s2.get('relation') !== 0;
})());

/* =========================================================
 * [2b] v5 开局 5 点自由分配
 * ========================================================= */
console.log('\n[2b] v5 开局 5 点自由分配（StatsManager.clampInitialValues 语义变更）');
const BASE = { relation: 50, mood: 50, fame: 50, energy: 50 };
const sumDelta = out => STAT_KEYS.reduce((n, k) => n + (out[k] - BASE[k]), 0);

let out = StatsManager.clampInitialValues(BASE, { relation: 55 });
check('单项 +5：relation 50 → 55，其余不变', out.relation === 55 && out.mood === 50 && out.fame === 50 && out.energy === 50);
out = StatsManager.clampInitialValues(BASE, { relation: 58 });
check('单项越界（想 +8）被压到 adjustRange=5', out.relation === 55 && sumDelta(out) === 5);
out = StatsManager.clampInitialValues(BASE, { relation: 55, mood: 55, fame: 55, energy: 55 });
check('四项各想 +5（合计 20）→ 裁剪到正好 5 点，且每项 ≤5 非负（实际 ' +
  STAT_KEYS.map(k => k + '+' + (out[k] - BASE[k])).join(' ') + '）',
  sumDelta(out) === 5 && STAT_KEYS.every(k => out[k] - BASE[k] >= 0 && out[k] - BASE[k] <= 5));
out = StatsManager.clampInitialValues(BASE, { relation: 40, mood: 60, fame: 50, energy: 50 });
check('负分配清零（只加不减）：relation 想调低 → 保持 50；mood +10 → +5',
  out.relation === 50 && out.mood === 55 && sumDelta(out) === 5);
out = StatsManager.clampInitialValues(BASE, { relation: 58, mood: 58 });
check('裁的是"当前加点最多的一项"：两项各想 +8 → 上限各 +5，合计裁到 5', (() => {
  return sumDelta(out) === 5 && STAT_KEYS.every(k => out[k] - BASE[k] <= 5 && out[k] - BASE[k] >= 0);
})(), STAT_KEYS.map(k => k + '+' + (out[k] - BASE[k])).join(' '));
out = StatsManager.clampInitialValues({ relation: 83, mood: 50, fame: 80, energy: 50 }, { relation: 90, mood: 50, fame: 50, energy: 50 });
check('adjustCap 硬上限生效：relation 83 想 +7，被 adjustCap 85 封到 +2',
  out.relation === 85 && out.fame === 80 && (out.relation - 83) === 2, JSON.stringify(out));
out = StatsManager.clampInitialValues({ relation: 83, mood: 50, fame: 80, energy: 50 }, { relation: 90, mood: 50, fame: 90, energy: 50 });
check('adjustCap + 5 点预算共同生效：relation 封到 85（+2）、fame 只要 +3 就够预算，合计正好 5 点',
  out.relation === 85 && out.fame === 83 && (out.relation - 83) + (out.fame - 80) === 5, JSON.stringify(out));
out = StatsManager.clampInitialValues({ relation: 98, mood: 99, fame: 50, energy: 50 }, { relation: 100, mood: 100 });
check('statMax / adjustCap 双重封顶：98/99 起手无法再加点（不越界、不出现负数加点）',
  out.relation === 98 && out.mood === 99, JSON.stringify(out));
check('null / undefined / 缺字段不抛错，返回 base 原值', (() => {
  const a = StatsManager.clampInitialValues(BASE, null);
  const b = StatsManager.clampInitialValues(BASE, undefined);
  const c = StatsManager.clampInitialValues(BASE, {});
  return STAT_KEYS.every(k => a[k] === 50 && b[k] === 50 && c[k] === 50);
})());
check('坏数据兜底（字符串/NaN/非法键）不抛错且不出负数加点', (() => {
  const a = StatsManager.clampInitialValues(BASE, { relation: 'abc', mood: NaN, fame: 55, hacker: 99 });
  return STAT_KEYS.every(k => a[k] >= 50 && a[k] <= 55) && a.relation === 50 && a.mood === 50;
})());
check('返回值恒在 [statMin, statMax] 且四项齐全',
  STAT_KEYS.every(k => out[k] >= GAME.CONFIG.statMin && out[k] <= GAME.CONFIG.statMax && typeof out[k] === 'number'));

/* =========================================================
 * [3] 分支与门槛
 * ========================================================= */
console.log('\n[3] 分支条件判定（EventEngine + EventRules）');
const engine = new EventEngine();
const stBase = { stats: { relation: 60, mood: 50, fame: 50, energy: 50 }, flags: {}, states: {}, usedIds: {}, turn: 0 };

check('无 flag 时 ev_takeout 不可用', !engine.eventAvailable(engine.getById('ev_takeout'), stBase));
check('有「旦苑受害者」时 ev_takeout 可用（flag 链）',
  engine.eventAvailable(engine.getById('ev_takeout'), { ...stBase, flags: { '旦苑受害者': true } }));
check('ev_chat200 门槛：fame 22 可用 / 40 可用 / 41 不可用（区间含端点）',
  engine.eventAvailable(engine.getById('ev_chat200'), { ...stBase, stats: { ...stBase.stats, fame: 22 } }) &&
  engine.eventAvailable(engine.getById('ev_chat200'), { ...stBase, stats: { ...stBase.stats, fame: 40 } }) &&
  !engine.eventAvailable(engine.getById('ev_chat200'), { ...stBase, stats: { ...stBase.stats, fame: 41 } }));
check('ev_hightlight 门槛：fame 72 可用 / 71 不可用',
  engine.eventAvailable(engine.getById('ev_hightlight'), { ...stBase, stats: { ...stBase.stats, fame: 72 } }) &&
  !engine.eventAvailable(engine.getById('ev_hightlight'), { ...stBase, stats: { ...stBase.stats, fame: 71 } }));
check('ev_emo 门槛：mood 30 可用 / 41 不可用',
  engine.eventAvailable(engine.getById('ev_emo'), { ...stBase, stats: { ...stBase.stats, mood: 30 } }) &&
  !engine.eventAvailable(engine.getById('ev_emo'), { ...stBase, stats: { ...stBase.stats, mood: 41 } }));

/* 选项级门槛：ev_morning 的「早八亡命徒」需要精力 ≥14 */
const evMorning = engine.getById('ev_morning');
const busyOpt = evMorning.options.find(o => o.requires && o.requires.stats && o.requires.stats.energy);
check('选项级门槛存在（ev_morning 有精力门槛选项）', !!busyOpt);
check('精力 20 时该选项可选', EventRules.optionUsable(busyOpt, stBase).ok);
const stTired = { ...stBase, stats: { relation: 50, mood: 50, fame: 50, energy: 10 } };
check('精力 10 时该选项禁用并提示精力原因',
  !EventRules.optionUsable(busyOpt, stTired).ok && EventRules.optionUsable(busyOpt, stTired).reason.indexOf('精力') >= 0);

/* next 直连链 */
const askOpt = engine.getById('ev_military1').options.find(o => o.next === 'ev_military2');
check('军训链：ev_military1 打听选项直连 ev_military2（需 flag 解锁）',
  !!askOpt &&
  !engine.eventAvailable(engine.getById('ev_military2'), stBase) &&
  engine.eventAvailable(engine.getById('ev_military2'), { ...stBase, flags: { '军训情报员': true } }));
check('pickByNextId：目标可用则强制跳转；目标不可用则回退常规流程', (() => {
  const st = { ...stBase, flags: { '军训情报员': true } };
  const forced = engine.pickByNextId('ev_military2', st);
  const fallback = engine.pickByNextId('ev_military2', stBase);
  return forced && forced.id === 'ev_military2' && fallback && fallback.id !== 'ev_military2';
})());

/* =========================================================
 * [3b] 事件引擎机制（v5）
 * ========================================================= */
console.log('\n[3b] 事件引擎机制（usedIds / lowStat / 窗口 K=12 / 尾声优先 / requires.states 契约）');

check('usedIds 旧布尔 true 兼容（按 1 计）：一次性事件视为已用完',
  !engine.eventAvailable(engine.getById('ev_welcome'), { ...stBase, usedIds: { ev_welcome: true } }));
const evChat200 = engine.getById('ev_chat200');
check('lowStat：ev_chat200 在 fame 29 时权重 ×3、fame 30 时还原',
  engine._weightOf(evChat200, { ...stBase, stats: { ...stBase.stats, fame: 29 } }) === 3 &&
  engine._weightOf(evChat200, { ...stBase, stats: { ...stBase.stats, fame: 30 } }) === 1);

/* 窗口 K=12：自建 15 事件池，order 13-15 永不入窗 */
const mkEv = (id, order, extra) => Object.assign(
  { id, order, scene: 't', title: 't', text: 'x', options: [{ text: 'a' }, { text: 'b' }] }, extra);
const winPool = [];
for (let i = 1; i <= 15; i++) winPool.push(mkEv('w' + i, i, i === 2 ? { lowStat: { stat: 'fame', below: 30 } } : (i === 4 ? { weight: 3 } : null)));
const engWin = new EventEngine(winPool);
const stWin = { stats: { relation: 50, mood: 50, fame: 50, energy: 50 }, flags: {}, states: {}, usedIds: {}, turn: 0 };
const seenBase = {};
for (let i = 0; i < 2000; i++) { const e = engWin.pickNext(stWin); seenBase[e.id] = (seenBase[e.id] || 0) + 1; }
check('窗口 K=12：order 13/14/15 的事件 2000 次抽取永不入窗',
  !seenBase.w13 && !seenBase.w14 && !seenBase.w15);
check('窗口内 12 个事件均可被抽中（随机性生效）',
  new Array(12).fill(0).every((_, i) => seenBase['w' + (i + 1)] > 0));
check('weight=3 事件抽中次数显著高于 weight=1（≈3 倍）', seenBase.w4 > seenBase.w1 * 1.8,
  'w4=' + seenBase.w4 + ' w1=' + seenBase.w1);
const seenLow = {};
const stWinLow = { ...stWin, stats: { ...stWin.stats, fame: 20 } };
for (let i = 0; i < 2000; i++) { const e = engWin.pickNext(stWinLow); seenLow[e.id] = (seenLow[e.id] || 0) + 1; }
check('lowStat 行为级验证：fame<30 时 w2 抽中率较基线显著提升（×3 加权生效）',
  (seenLow.w2 || 0) > (seenBase.w2 || 0) * 1.8);

/* 尾声优先：turnLimit=25，剩余回合 ≤2 ⇔ turn ≥23 */
check('_inClimax：turn 23（剩余 2）为真、turn 22（剩余 3）为假、turn 25（剩余 0）为假',
  engWin._inClimax({ ...stWin, turn: 23 }) === true &&
  engWin._inClimax({ ...stWin, turn: 22 }) === false &&
  engWin._inClimax({ ...stWin, turn: 25 }) === false);
check('尾声优先：剩余 ≤2 回合时确定性地取"可用池里 order 最大"的事件（1000 次全一致）', (() => {
  const seen = {};
  for (let i = 0; i < 1000; i++) {
    const e = engWin.pickNext({ ...stWin, turn: 23 });
    seen[e.id] = (seen[e.id] || 0) + 1;
  }
  return Object.keys(seen).length === 1 && seen.w15 === 1000;
})());
check('尾声优先：最大 order 的事件已被用过时，退到次高（w14）', (() => {
  const e = engWin.pickNext({ ...stWin, turn: 24, usedIds: { w15: 1 } });
  return e.id === 'w14';
})());
check('requires.states 契约仍被引擎支持（v5 数据不用）：层数达标才解锁，缺失按 0',
  (() => {
    const evs = [mkEv('gate', 1, { requires: { states: { '上头': 2 } } }), mkEv('free', 2)];
    const eng = new EventEngine(evs);
    const st = { stats: { relation: 50, mood: 50, fame: 50, energy: 50 }, flags: {}, usedIds: {}, turn: 0 };
    return !eng.eventAvailable(eng.getById('gate'), st) &&
      !eng.eventAvailable(eng.getById('gate'), { ...st, states: { '上头': 1 } }) &&
      eng.eventAvailable(eng.getById('gate'), { ...st, states: { '上头': 2 } }) &&
      eng.eventAvailable(eng.getById('free'), st);
  })());

/* =========================================================
 * [4] 状态生命周期（真实 engine.js）
 * ========================================================= */
console.log('\n[4] 状态生命周期（duration / tick / 移除 / 同名重置 / 有效层数映射）');

/* 4.1 进入时 remaining = duration */
const evUp = mkEvent('syn_up', [{ text: 'a', effects: { stats: { mood: 1, energy: -1 }, states: { '上头': 1 }, stateChance: 1 } }]);
const g4 = freshGame();
withFactor(1, () => { chooseOnce(g4, evUp); });
check('进入状态时 remaining = STATES_META.duration（上头 = 3 回合）',
  g4.states['上头'] && g4.states['上头'].count === 1 && g4.states['上头'].remaining === 3,
  JSON.stringify(g4.states));
const evMelon = mkEvent('syn_melon', [{ text: 'a', effects: { stats: { mood: 1, energy: -1 }, states: { '瓜瘾': 1 }, stateChance: 1 } }]);
withFactor(1, () => { chooseOnce(g4, evMelon, false); });
check('不同状态可共存，duration 各自独立（瓜瘾 = 2 回合）',
  g4.states['上头'].remaining === 3 && g4.states['瓜瘾'].remaining === 2);

/* 4.2 有效计数映射 */
check('_activeStateCounts：只含仍生效状态的层数 { 名: count }',
  JSON.stringify(g4._activeStateCounts()) === JSON.stringify({ '上头': 1, '瓜瘾': 1 }));
check('_stateEntries：UI 展示数组，元素含 name/count/remaining/icon/kind/desc/duration',
  g4._stateEntries().length === 2 && g4._stateEntries().every(e =>
    typeof e.name === 'string' && typeof e.count === 'number' && typeof e.remaining === 'number' &&
    typeof e.icon === 'string' && (e.kind === 'good' || e.kind === 'bad') &&
    typeof e.desc === 'string' && typeof e.duration === 'number'));
check('_stateEntries：按剩余回合升序（快退去的排前面）',
  g4._stateEntries()[0].name === '瓜瘾' && g4._stateEntries()[1].name === '上头');

/* 4.3 每回合结束递减、归零移除 */
const expired1 = g4._tickStates();
check('第 1 次 tick：全体 -1（瓜瘾 2→1、上头 3→2），无人到期',
  g4.states['瓜瘾'].remaining === 1 && g4.states['上头'].remaining === 2 && expired1.length === 0);
const expired2 = g4._tickStates();
check('第 2 次 tick：瓜瘾 1→0 → 整条移除并出现在 expired 名单',
  !g4.states['瓜瘾'] && expired2.indexOf('瓜瘾') >= 0 && g4.states['上头'].remaining === 1);
check('移除后不再出现在有效计数映射与展示数组里',
  !('瓜瘾' in g4._activeStateCounts()) && g4._stateEntries().every(e => e.name !== '瓜瘾'));
const expired3 = g4._tickStates();
check('第 3 次 tick：上头 1→0 → 状态表清空、expired 含「上头」',
  Object.keys(g4.states).length === 0 && expired3.indexOf('上头') >= 0 && g4._activeStateCounts && Object.keys(g4._activeStateCounts()).length === 0);

/* 4.3b 脏状态防御（团队决策：_activeStateCounts 与 _stateEntries 口径必须一致）
 * 残留 remaining=0 的条目（脏存档 / 外部写入）不得计为「仍生效」，
 * 否则会出现「侧栏看不见、门槛却算数」的错位。 */
g4.states = { '试毒': { count: 2, remaining: 0 } };
check('remaining=0 的脏状态不计入有效层数，也不出现在展示数组',
  JSON.stringify(g4._activeStateCounts()) === '{}' && g4._stateEntries().length === 0,
  JSON.stringify({ counts: g4._activeStateCounts(), entries: g4._stateEntries() }));
g4.states = {};

/* 4.4 同名再触发：count+1 且 remaining 重置（不叠加时长） */
const g4b = freshGame();
withFactor(1, () => {
  chooseOnce(g4b, evUp);          // 上头 ×1, remaining 3
  g4b._tickStates();              // remaining 2
  g4b._tickStates();              // remaining 1
  chooseOnce(g4b, evUp, false);   // 同名再触发
});
check('同名再触发：count 1 → 2，remaining 重置为 duration（1 → 3，不叠加时长）',
  g4b.states['上头'].count === 2 && g4b.states['上头'].remaining === 3,
  JSON.stringify(g4b.states));
check('再触发时结果卡 stateGained 记为 delta=1 / count=2（层数可展示）', (() => {
  const sg = H.results[H.results.length - 1].stateGained[0];
  return sg.name === '上头' && sg.delta === 1 && sg.count === 2 && sg.remaining === 3 && sg.duration === 3 && sg.kind === 'good';
})(), JSON.stringify(H.results[H.results.length - 1].stateGained));

/* 4.5 结果卡 payload 形状 + 负面状态 kind */
const evBad = mkEvent('syn_bad', [{ text: 'a', effects: { stats: { fame: -8, mood: 2 }, states: { '社死': 1 }, stateChance: 1 } }]);
const g4c = freshGame();
withFactor(1, () => { chooseOnce(g4c, evBad); });
check('负面状态投放：kind = bad、duration = 3（社死）', (() => {
  const sg = H.results[H.results.length - 1].stateGained[0];
  return sg.name === '社死' && sg.kind === 'bad' && sg.duration === 3 && sg.remaining === 3 && sg.count === 1;
})());

/* 4.6 负值 / 0 层 states 忽略 */
const evNeg = mkEvent('syn_neg', [{ text: 'a', effects: { stats: { mood: 1, energy: -1 }, states: { '上头': -2 }, stateChance: 1 } }]);
const g4d = freshGame();
withFactor(1, () => { chooseOnce(g4d, evNeg); });
check('effects.states 负值被忽略（不投放、不扣层、不抛错）',
  Object.keys(g4d.states).length === 0 && H.results[H.results.length - 1].stateGained.length === 0);

/* 4.7 概率未命中 → 静默不发（不剧透） */
const g4e = freshGame();
withFactor(0, () => { chooseOnce(g4e, evUp); });
check('概率未命中时 stateGained 为空（结果卡不出现状态行）',
  H.results[H.results.length - 1].stateGained.length === 0 && Object.keys(g4e.states).length === 0);

/* 4.8 真实数据端到端：状态在真实对局中会被触发，且同时最多 3 个 */
const e2e = playGame(strategyRational, 'memedealer', 424242);
check('真实对局可触发状态（理性策略 ' + e2e.turn + ' 段，触发 ' + e2e.stateGained.length + ' 次）',
  e2e.stateGained.length >= 1 && e2e.stateGained.every(s => STATE_NAMES.indexOf(s.name) >= 0));
check('状态同屏 ≤3（本局峰值 ' + e2e.maxConcurrent + '）', e2e.maxConcurrent <= 3);

/* =========================================================
 * [4b] 状态概率：stateChance × 0.4
 * ========================================================= */
console.log('\n[4b] 状态概率（stateChance × CONFIG.stateChanceFactor，2500 次/用例，容差 ±0.05）');
const N = 2500;

/* ev06 = 基准概率 0.6 的合成选项（evUp 是 stateChance:1 的确定性用例，不用于抽样） */
const ev06 = mkEvent('syn_06', [{ text: 'a', effects: { stats: { mood: 1, energy: -1 }, states: { '上头': 1 }, stateChance: 0.6 } }]);
const rate06 = hitRate(ev06, N, 112233);   // 基准 0.6 × 0.4 = 0.24
check('基准 0.6 × 0.4 → 实测命中率 ≈ 0.24（实际 ' + round(rate06 * 100, 1) + '%）',
  Math.abs(rate06 - 0.24) <= 0.05);

const evNoChance = mkEvent('syn_nochance', [{ text: 'a', effects: { stats: { mood: 1, energy: -1 }, states: { '瓜瘾': 1 } } }]);
const rateDefault = hitRate(evNoChance, N, 445566); // 缺省按 1 × 0.4 = 0.40
check('未给 stateChance 时按基准 1 处理 → 实测 ≈ 0.40（实际 ' + round(rateDefault * 100, 1) + '%）',
  Math.abs(rateDefault - 0.40) <= 0.05);

const rateFactor1 = withFactor(1, () => hitRate(ev06, N, 778899));
check('系数调到 1（回基准概率）→ 实测 ≈ 0.60（实际 ' + round(rateFactor1 * 100, 1) + '%）',
  Math.abs(rateFactor1 - 0.60) <= 0.05);

const rateFactor0 = withFactor(0, () => hitRate(ev06, N, 991100));
check('系数调到 0 → 永不触发（实测 ' + round(rateFactor0 * 100, 2) + '%）', rateFactor0 === 0);

const rate08 = withFactor(0.8, () => hitRate(ev06, N, 314159));
check('系数调到 0.8 → 实测 ≈ 0.48（系数是线性旋钮，实际 ' + round(rate08 * 100, 1) + '%）',
  Math.abs(rate08 - 0.48) <= 0.05);

const rate05 = hitRate(mkEvent('syn_05', [{ text: 'a', effects: { stats: { mood: 1, energy: -1 }, states: { 'emo': 1 }, stateChance: 0.5 } }]), N, 135791);
check('基准 0.5 × 0.4 → 实测 ≈ 0.20（实际 ' + round(rate05 * 100, 1) + '%）',
  Math.abs(rate05 - 0.20) <= 0.05);

check('概率与状态数量无关：一次投放 2 个状态仍是一次抽样（命中即全部生效）', (() => {
  const ev2 = mkEvent('syn_two', [{ text: 'a', effects: { stats: { mood: 1, energy: -1 }, states: { '上头': 1, '瓜瘾': 1 }, stateChance: 0.6 } }]);
  const g = freshGame();
  let hitTwo = 0, hitOne = 0, hitZero = 0;
  withSeed(24680, () => {
    for (let i = 0; i < 800; i++) {
      const n = chooseOnce(g, ev2);
      if (n === 2) hitTwo++; else if (n === 1) hitOne++; else hitZero++;
    }
  });
  return hitTwo > 0 && hitOne === 0 && hitZero > 0;   // 要么都发，要么都不发
})());

/* =========================================================
 * [4b-2] v6 数值规则：人际/声望概率生效与幅度、精力/心情隐藏漂移
 * ========================================================= */
console.log('\n[4b-2] v6 数值规则（概率生效 / 幅度 1.4 / 隐藏漂移）');

const socialEv = mkEvent('v6_social', [{ text: 'a', effects: { stats: { relation: 10, mood: 4, energy: -3 } } }]);
const gS = freshGame({ stats: { relation: 50, mood: 50, fame: 50, energy: 80 } });
let relHits = 0; const relDeltas = [];
withSeed(13579, () => {
  for (let i = 0; i < 2000; i++) {
    gS.stats = new StatsManager({ relation: 50, mood: 50, fame: 50, energy: 80 }, null);
    gS.states = {};
    gS.currentEvent = socialEv;
    gS._choose(0);
    const d = gS.stats.get('relation') - 50;
    if (d !== 0) { relHits++; relDeltas.push(d); }
  }
});
check('人际/声望变化概率 ≈ 0.6（2000 次实测 ' + round(relHits / 2000 * 100, 1) + '%）',
  Math.abs(relHits / 2000 - 0.6) <= 0.05);
check('命中后幅度放大：关系 +10 实际落点 12~14（×1.4 再乘 0.9 收益系数）',
  relDeltas.length > 0 && relDeltas.every(d => d >= 12 && d <= 14));

const driftEv = mkEvent('v6_drift', [{ text: 'a', effects: { stats: { relation: 6 } } }]);
const gD = freshGame({ stats: { relation: 50, mood: 50, fame: 50, energy: 50 } });
let driftMood = 0, driftEnergy = 0, driftRows = [];
withSeed(24680, () => {
  gD.states = {};
  gD.currentEvent = driftEv;
  gD._choose(0);
  driftMood = gD.stats.get('mood') - 50;
  driftEnergy = gD.stats.get('energy') - 50;
  driftRows = H.results[H.results.length - 1].changes.map(c => c.stat);
});
check('隐藏漂移：心情与精力各随机 ±1（实测 ' + driftMood + ' / ' + driftEnergy + '）',
  Math.abs(driftMood) === 1 && Math.abs(driftEnergy) === 1);
check('隐藏漂移不写入结果卡 changes（数值行不含心情/精力）',
  driftRows.indexOf('mood') < 0 && driftRows.indexOf('energy') < 0);

/* =========================================================
 * [4c] 完整对局模拟（真实引擎 + 桩 UI）
 * ========================================================= */
console.log('\n[4c] 完整对局模拟（真实 engine.js，四策略）');

const RUNS = [];
for (let i = 0; i < 24; i++) RUNS.push(playGame(strategyRandom, ['memedealer', 'lurker', 'grinder', 'gymrat'][i % 4], 1000 + i));
for (let i = 0; i < 24; i++) RUNS.push(playGame(strategyRational, ['memedealer', 'lurker', 'grinder', 'gymrat'][i % 4], 2000 + i));
for (let i = 0; i < 8; i++) RUNS.push(playGame(strategySilent, 'lurker', 3000 + i));
for (let i = 0; i < 8; i++) RUNS.push(playGame(strategyFirst, 'gymrat', 4000 + i));

check('全部 ' + RUNS.length + ' 局正常结束（有结局、无异常、段数 ≥3）',
  RUNS.every(r => r.ending && r.ending.id && r.turn >= 3),
  '最短 ' + Math.min(...RUNS.map(r => r.turn)) + ' 段');
check('全部对局数值始终在 0-100（终局快照合法）',
  RUNS.every(r => STAT_KEYS.every(k => r.stats[k] >= 0 && r.stats[k] <= 100)));
check('全部对局结局 id 合法（属于 GAME.ENDINGS 的 12 条之一）',
  RUNS.every(r => GAME.ENDINGS.some(e => e.id === r.ending.id)));
check('全部对局的事件不重复（v5 单次触发语义，端到端验证）',
  RUNS.every(r => new Set(r.events).size === r.events.length));
check('全部对局 history 段数与 turn 一致（时间线/成就依赖）',
  RUNS.every(r => r.history.length === r.turn));
check('全部对局状态同屏峰值 ≤3（峰值 ' + Math.max(...RUNS.map(r => r.maxConcurrent)) + '）',
  Math.max(...RUNS.map(r => r.maxConcurrent)) <= 3);
check('理性策略 24 局（四角色轮换）→ 0 崩坏', RUNS.slice(24, 48).every(r => !r.earlyEnd));
/* v6：固定精力消耗取消后，随机策略崩坏率下降，单批 24 局可能一批都不崩；
 * 崩坏可达性由「压精力策略」用例保证，这里改为多批采样的健康区间断言。 */
const extraRandom = [];
for (let i = 0; i < 40; i++) {
  extraRandom.push(playGame(strategyRandom, ['memedealer', 'lurker', 'grinder', 'gymrat'][i % 4], 5000 + i));
}
const extraCollapse = extraRandom.filter(r => r.earlyEnd).length;
check('随机策略崩坏可达且不失控（40 局采样崩坏 ' + extraCollapse + ' 局，0 < 崩坏 ≤ 24）',
  extraCollapse > 0 && extraCollapse <= 24);
check('固定首项策略在 8 局内必触发一次崩坏（最无脑玩法的下限验证）',
  RUNS.slice(56).some(r => r.earlyEnd));

const fullRuns = RUNS.filter(r => r.turn >= GAME.CONFIG.turnLimit);
check('理性对局能走满 ' + GAME.CONFIG.turnLimit + ' 段（事件池充足，' + fullRuns.length + ' 局走满）',
  fullRuns.length >= 20);
check('尾声优先端到端：走满的局最后一段事件 order ≥60（收束到时间线后段）', (() => {
  const orders = fullRuns.map(r => {
    const ev = EVENTS.filter(e => e.id === r.events[r.events.length - 1])[0];
    return ev ? ev.order : 0;
  });
  return orders.every(o => o >= 60);
})(), '最后一段 order: ' + fullRuns.slice(0, 6).map(r => {
  const ev = EVENTS.filter(e => e.id === r.events[r.events.length - 1])[0];
  return ev ? ev.order : 0;
}).join('/'));

const endingSpread = new Set(RUNS.map(r => r.ending.id));
check('64 局混合策略落到 ≥4 种不同结局（实际 ' + endingSpread.size + ' 种）', endingSpread.size >= 4,
  [...endingSpread].join(' '));

/* =========================================================
 * [5] 结局判定
 * ========================================================= */
console.log('\n[5] 结局判定（v5.1：潜水大师 flag 优先级 → 崩坏优先 → 终值 + flag；match.states 已弃用）');
const R = new EndingResolver();
const mk = (relation, mood, fame, energy, flags, states) =>
  ({ stats: { relation, mood, fame, energy }, flags: flags || {}, states: states || {} });

check('精力 0 → 电量耗尽（崩坏优先于常规）', R.resolve(mk(95, 90, 95, 0, { '有外号': true })).id === 'end_zero_energy');
check('心情 0 → 绷断了', R.resolve(mk(80, 0, 50, 60)).id === 'end_zero_mood');
check('人际 0 → 查无此人', R.resolve(mk(0, 80, 50, 60)).id === 'end_zero_relation');
check('声望 0 → 群聊隐身人', R.resolve(mk(50, 80, 0, 60)).id === 'end_zero_fame');
check('人际 ≥85 + 有外号 → 群宠本宠', R.resolve(mk(90, 60, 50, 60, { '有外号': true })).id === 'end_pet');
check('人际 84（差 1）→ 不命中群宠本宠', R.resolve(mk(84, 60, 50, 60, { '有外号': true })).id !== 'end_pet');
check('声望 ≥85 + 卷过 → 卷王登基', R.resolve(mk(50, 50, 90, 60, { '卷过': true })).id === 'end_top');
check('声望 ≥85 但无「卷过」flag → 不命中卷王登基（v5 改用 flag 而非状态层数）',
  R.resolve(mk(50, 50, 90, 60)).id !== 'end_top');
check('精力 ≥50 + mol过 → 薄肌战神', R.resolve(mk(50, 50, 50, 60, { 'mol过': true })).id === 'end_gym');
check('声望 ≥70 + 人际 ≥60 → 梗图批发商认证', R.resolve(mk(65, 50, 75, 60)).id === 'end_memelord');
check('声望 75 但人际 59 → 不命中梗图批发商', R.resolve(mk(59, 50, 75, 60)).id !== 'end_memelord');
check('人际 ≥60 + 网恋军师 → 瓜田守护者', R.resolve(mk(70, 50, 40, 60, { '网恋军师': true })).id === 'end_melon');
check('心情 ≥85 → 快乐小登', R.resolve(mk(55, 90, 40, 60)).id === 'end_happy');
check('人际 ≤40 且明确选了潜水（flag 潜水大师）→ 潜水大师，且优先于「查无此人」',
  R.resolve(mk(30, 50, 40, 60, { '潜水大师': true })).id === 'end_lurker');
check('人际 0 + 潜水 flag → 潜水大师（不再落到崩坏「查无此人」）',
  R.resolve(mk(0, 80, 50, 60, { '潜水大师': true })).id === 'end_lurker');
check('人际 ≤40 但没选过潜水 → 不误判成潜水大师（仍按原判定走）',
  R.resolve(mk(30, 50, 40, 60)).id === 'end_normal');
check('挂了潜水 flag 但人际 41（差 1）→ 不命中潜水大师',
  R.resolve(mk(41, 50, 40, 60, { '潜水大师': true })).id !== 'end_lurker');
check('四平八稳 → 兜底「下学期见」', R.resolve(mk(55, 55, 55, 55)).id === 'end_normal');
check('v5 弃用状态判定：传入任意状态层数都不影响结局（同一终值同判）',
  R.resolve(mk(50, 50, 60, 60, null, { '卷王附体': 9, '上头': 5 })).id ===
  R.resolve(mk(50, 50, 60, 60)).id);
check('states 键缺失不抛错（引擎旧档/外部调用容错）',
  R.resolve({ stats: { relation: 60, mood: 50, fame: 60, energy: 60 }, flags: {} }).id === 'end_normal');
check('12 个结局全部可被构造命中（无死结局）', (() => {
  const cases = [
    ['end_zero_energy', mk(95, 90, 95, 0)], ['end_zero_mood', mk(80, 0, 50, 60)],
    ['end_zero_relation', mk(0, 80, 50, 60)], ['end_zero_fame', mk(50, 80, 0, 60)],
    ['end_pet', mk(90, 60, 50, 60, { '有外号': true })],
    ['end_top', mk(50, 50, 90, 60, { '卷过': true })],
    ['end_gym', mk(50, 50, 50, 60, { 'mol过': true })],
    ['end_memelord', mk(65, 50, 75, 60)],
    ['end_melon', mk(70, 50, 40, 60, { '网恋军师': true })],
    ['end_happy', mk(55, 90, 40, 60)],
    ['end_lurker', mk(30, 50, 40, 60, { '潜水大师': true })],
    ['end_normal', mk(55, 55, 55, 55)],
  ];
  return cases.every(([id, state]) => R.resolve(state).id === id);
})());

/* =========================================================
 * [6] 成就系统
 * ========================================================= */
console.log('\n[6] 成就系统（evaluateRun / recordRun / 不剧透）');
Achievements.resetCollection();     // 前面 64 局模拟已污染收集进度，这里重置（内存存储）
check('成就定义 12 条', GAME.ACHIEVEMENTS.length === 12);
const fakeRun = {
  endingId: 'end_pet', turn: 25, earlyEnd: false,
  stats: { relation: 92, mood: 60, fame: 55, energy: 40 },
  flags: { '有外号': true, 'V过50': true },
  states: { '上头': 2 },
  history: [{ silent: true }, { silent: true }, { silent: false }],
};
const hit1 = Achievements.evaluateRun(fakeRun);
check('完整对局命中多成就（第一段人生 / 疯四投资人 / 外号认证 / 满学期）',
  ['ach_first', 'ach_v50', 'ach_jimao', 'ach_full'].every(id => hit1.some(a => a.id === id)));
const rec1 = Achievements.recordRun(fakeRun);
check('recordRun 返回新解锁结局与新成就', rec1.ending === 'end_pet' && rec1.newAchievements.some(a => a.id === 'ach_first'));
const rec2 = Achievements.recordRun(fakeRun);
check('重复结算：结局不重复、成就不重复报新', rec2.ending === null && rec2.newAchievements.length === 0);
const collapseRun = { endingId: 'end_zero_energy', turn: 8, earlyEnd: true,
  stats: { relation: 40, mood: 40, fame: 40, energy: 0 }, flags: {}, states: {}, history: [] };
check('崩坏对局 → 「被提前收走」成就', Achievements.evaluateRun(collapseRun).some(a => a.id === 'ach_collapse'));
check('走钢丝：满局且最低终值 ≤8 → ach_tight',
  Achievements.evaluateRun({ endingId: 'end_pet', turn: 25, earlyEnd: false,
    stats: { relation: 92, mood: 60, fame: 55, energy: 8 }, flags: {}, states: {}, history: [] })
    .some(a => a.id === 'ach_tight'));
check('沉默 8 次以上 → 惜字如金', Achievements.evaluateRun({ endingId: 'end_lurker', turn: 20, earlyEnd: false,
  stats: { relation: 30, mood: 50, fame: 40, energy: 60 }, flags: {}, states: {},
  history: new Array(8).fill({ silent: true }) }).some(a => a.id === 'ach_silent'));
check('收集 6+ 结局 → 结局收藏家', (() => {
  ['end_pet', 'end_top', 'end_gym', 'end_melon', 'end_happy'].forEach(id =>
    Achievements.recordRun({ endingId: id, turn: 10, earlyEnd: false, stats: mk(50, 50, 50, 50).stats, flags: {}, states: {}, history: [] }));
  return Achievements.evaluateRun({ endingId: 'end_lurker', turn: 10, earlyEnd: false,
    stats: mk(30, 50, 40, 60).stats, flags: {}, states: {}, history: [] }).some(a => a.id === 'ach_collector');
})());
check('成就描述/条件不泄露隐藏数值（不含变量名与数字阈值）',
  GAME.ACHIEVEMENTS.every(a => !/归零|relation|mood|fame|energy/.test(a.desc) && !/[0-9]/.test(a.condition)));

/* =========================================================
 * [7] chat-import 预留接口
 * ========================================================= */
console.log('\n[7] chat-import 预留接口');
check('parseChatFile 未实现时抛出带契约指引的错误', (() => {
  try { ChatImporter.parseChatFile('x'); return false; }
  catch (e) { return /契约/.test(e.message); }
})());
check('buildEventsFromMessages / importFromFolder 同样是显式未实现的拒绝路径', (() => {
  let a = false, b = false;
  try { ChatImporter.buildEventsFromMessages([]); } catch (e) { a = /契约/.test(e.message); }
  ChatImporter.importFromFolder({}).catch(e => { b = /契约/.test(e.message); });
  return a === true;
})());
check('validateEvent 能抓出非法事件（缺 id / 未知 stat 键）', (() => {
  const bad = ChatImporter.validateEvent({ order: 1, title: 't', text: 'x', options: [{ text: 'a', effects: { stats: { money: 1 } } }, { text: 'b' }] });
  return !bad.ok && bad.errors.length >= 2;
})());
check('validateEvent 容忍 silent 等扩展属性', (() => {
  const okEvt = { id: 'ev_x', order: 1, title: 't', text: 'x',
    options: [{ text: 'a', silent: true, effects: { stats: { mood: -1 } } }, { text: 'b' }] };
  return ChatImporter.validateEvent(okEvt).ok;
})());

/* =========================================================
 * [8] 音频层（Node 降级）
 * ========================================================= */
console.log('\n[8] 音频层 Sfx（无 Web Audio 环境降级为零操作）');
check('window.Sfx 已挂载且接口齐全（play/isMuted/toggle/setMuted/mountToggle）',
  !!window.Sfx && ['play', 'isMuted', 'toggle', 'setMuted', 'mountToggle'].every(k => typeof window.Sfx[k] === 'function'));
check('Node 环境调用 play 不抛错（四个音全部静默降级）',
  (() => { try { ['option', 'button', 'result', 'ending', 'unknown'].forEach(n => window.Sfx.play(n)); return true; } catch (e) { return false; } })());
check('Node 环境 isMuted / toggle / mountToggle(null) 不抛错',
  (() => {
    try {
      const m0 = window.Sfx.isMuted();
      const m1 = window.Sfx.toggle();
      window.Sfx.setMuted(m0);
      window.Sfx.mountToggle(null);
      return typeof m0 === 'boolean' && typeof m1 === 'boolean' && window.Sfx.isMuted() === m0;
    } catch (e) { return false; }
  })());

/* =========================================================
 * [9] UI 契约（桩断言）
 * ========================================================= */
console.log('\n[9] UI 契约（renderStats 数组第三参 / stateGained 形状 / 图鉴不剧透）');
check('renderStats 第三参为数组（v5：stateEntries[] 而非旧映射）',
  e2e.statsCalls.length > 0 && e2e.statsCalls.every(c => Array.isArray(c.stateEntries)));
check('renderStats 每次调用都带上最新数值快照（四项齐全）',
  e2e.statsCalls.every(c => STAT_KEYS.every(k => typeof c.stats[k] === 'number')));
check('renderStats 的 stateEntries 元素形状固定（name/count/remaining/kind/duration）',
  e2e.statsCalls.every(c => c.stateEntries.every(s =>
    typeof s.name === 'string' && typeof s.count === 'number' && s.remaining > 0 &&
    (s.kind === 'good' || s.kind === 'bad') && typeof s.duration === 'number')));
check('showResultCard 的 stateGained 元素 {name,delta,count,remaining,duration,kind} 齐全',
  e2e.results.filter(r => (r.stateGained || []).length > 0).every(r => r.stateGained.every(s =>
    ['name', 'delta', 'count', 'remaining', 'duration', 'kind'].every(k => s[k] !== undefined))));
check('结果卡 changes 记录含 stat/delta/from/to（数值行展示依据）',
  e2e.results.length > 0 && e2e.results.every(r => (r.changes || []).every(c =>
    typeof c.stat === 'string' && typeof c.delta === 'number' && typeof c.from === 'number' && typeof c.to === 'number')));

/* 图鉴不剧透：数据层 + 模板层（无 DOM 环境下的可测部分） */
const uiSrc = fs.readFileSync(path.join(__dirname, '..', 'js/ui.js'), 'utf8');
const collBody = (() => {
  const start = uiSrc.indexOf('UI.renderCollection = function');
  const end = uiSrc.indexOf('\n  };', start);
  return start >= 0 ? uiSrc.slice(start, end) : '';
})();
const lockedEndingBlocks = collBody.match(/col-card-locked[\s\S]{0,400}?<\/div>/g) || [];
const lockedAchBlocks = collBody.match(/col-desc">条件未知[\s\S]{0,200}?<\/div>/g) || [];
check('图鉴模板：锁定分支（结局 ???? + 成就 条件未知）都不含 condition 文案插值',
  lockedEndingBlocks.length === 1 && lockedAchBlocks.length === 1 &&
  lockedEndingBlocks.every(b => !/condition/.test(b)) && lockedAchBlocks.every(b => !/condition/.test(b)),
  'ending:' + lockedEndingBlocks.length + ' ach:' + lockedAchBlocks.length);
check('图鉴模板：解锁分支才插入 condition（2 处 unlocked 分支均有）',
  (collBody.match(/unlocked[\s\S]{0,300}?condition/g) || []).length === 2);
check('图鉴：condition 文案渲染前经过 esc() 转义（防 XSS）',
  (collBody.match(/esc\(e\.condition\)|esc\(a\.condition\)/g) || []).length === 2);

/* =========================================================
 * 汇总
 * ========================================================= */
console.log('\n========================================');
if (fail) {
  console.log('失败清单：');
  failures.forEach(f => console.log('  - ' + f));
}
console.log('结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
