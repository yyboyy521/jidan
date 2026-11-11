/* =========================================================
 * achievements.js —— 成就系统与结局收集（v3 新增）
 * ---------------------------------------------------------
 * 模块边界：
 *   独立模块。管理两类持久化收藏（localStorage，键见 CONFIG.collectionKey）：
 *   1. 结局收集：走过的结局 id 集合；
 *   2. 成就：达成条件后点亮的勋章集合。
 *   不依赖 DOM（Node 冒烟测试可直接加载）；localStorage 不可用时
 *   降级为内存对象（刷新即失，不影响游玩）。
 *
 * 设计原则：
 *   - 【不剧透】：结局的达成条件、成就的具体条件都不向玩家展示，
 *     未解锁项在图鉴里一律显示 ???；
 *   - 成就在每局结束时统一结算（engine._endGame 调用 recordRun），
 *     结算不改变对局本身；
 *   - 成就规则用数据描述（rule 字段），判定逻辑集中在一个函数里，
 *     新增成就只加数据不动代码。
 *
 * 对外接口：
 *   Achievements.getCollection()            -> { endings:{}, achievements:{} }
 *   Achievements.recordRun(run)             -> { ending, newAchievements: [ach...] }
 *     run: { endingId, stats, flags, history, turn, earlyEnd }
 *   Achievements.evaluateRun(run)           -> [ach...]（本局达成的成就，含已解锁的）
 *   Achievements.resetCollection()          -> void（图鉴页"重置进度"用）
 * ========================================================= */
(function () {
  'use strict';

  window.GAME = window.GAME || {};

  /* ---------- 成就定义 ----------
   * rule 类型说明（判定逻辑见 evaluateRun）：
   *   ending        : { id }          达成指定结局
   *   earlyEnd      : {}              触发过数值崩坏提前结局
   *   flag          : { flag }        本局持有指定剧情印记
   *   statFinal     : { stat, min }   终值某项 ≥ min
   *   tightrope     : { max }         完整走完一局且最低终值 ≤ max（走钢丝）
   *   silentCount   : { min }         一局里选了 ≥ min 次沉默类选项
   *   fullRun       : { min }         走满 min 段
   *   collected     : { min }         结局图鉴收集数 ≥ min（含本局新解锁的结局）
   *
   * v5 新增 condition 字段：
   *   面向玩家的一句通俗条件说明，仅在【已解锁后】在图鉴里展示，
   *   未解锁时仍显示 ??? （不剧透）。文案不出现变量名/数值键名，
   *   尽量用"做的事 + 结果"的口语描述。纯展示数据，
   *   不参与 ruleHit 判定，引擎与收集逻辑完全不受影响。
   */
  GAME.ACHIEVEMENTS = [
    { id: 'ach_first',   name: '第一段人生', desc: '走完你的第一局',
      condition: '完整走完一局，不管最后落在哪个结局',
      rule: {} },
    { id: 'ach_v50',     name: '疯四投资人', desc: '有些钱花出去才算数',
      condition: '群里喊疯四的时候，你真的跟着掏了五十块',
      rule: { type: 'flag', flag: 'V过50' } },
    { id: 'ach_jimao',   name: '外号认证',   desc: '名字是爸妈给的，外号是群友给的',
      condition: '被群友起了外号，而且你认了下来',
      rule: { type: 'flag', flag: '有外号' } },
    { id: 'ach_mol',     name: '薄肌之路',   desc: '卧推架前完成了第一次 mol',
      condition: '跟着群友进过一次健身房，真的站到了卧推架前',
      rule: { type: 'flag', flag: 'mol过' } },
    { id: 'ach_moon',    name: '深夜真心话', desc: '有段话你最终没有删掉',
      condition: '半夜在群里把那段打了又删的话，最后发出去了',
      rule: { type: 'flag', flag: '深夜真心话' } },
    { id: 'ach_collapse',name: '被提前收走', desc: '有一种结束不等你准备好',
      condition: '有一项撑不住了，学期没走完就提前结束',
      rule: { type: 'earlyEnd' } },
    { id: 'ach_tight',   name: '走钢丝的人', desc: '最低的一项只剩一点点，但你走完了',
      condition: '走满了整学期，但有一项差点见底',
      rule: { type: 'tightrope', max: 8 } },
    { id: 'ach_silent',  name: '惜字如金',   desc: '沉默也是参与的一种方式',
      condition: '一局里至少有八次，你选择了不说话',
      rule: { type: 'silentCount', min: 8 } },
    { id: 'ach_full',    name: '满学期',     desc: '从开学一路走到散场',
      condition: '一局从头走满，一段都没落下',
      rule: { type: 'fullRun', min: 25 } },
    { id: 'ach_top',     name: '顶流认证',   desc: '你的传说在群里流传',
      condition: '一学期结束时，群里没人不认识你',
      rule: { type: 'statFinal', stat: 'fame', min: 90 } },
    { id: 'ach_collector', name: '结局收藏家', desc: '见过足够多的散场',
      condition: '累计见过六种不同的结局',
      rule: { type: 'collected', min: 6 } },
    { id: 'ach_all',     name: '全知小登',   desc: '这个群的每一种活法你都活过一遍',
      condition: '十二种结局全部看过一遍',
      rule: { type: 'collected', min: 12 } },
  ];

  /* ---------- 持久化（localStorage 不可用时降级为内存） ---------- */
  var memory = { endings: {}, achievements: {} };

  function loadStore() {
    try {
      var raw = localStorage.getItem(GAME.CONFIG.collectionKey);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return { endings: parsed.endings || {}, achievements: parsed.achievements || {} };
        }
      }
    } catch (e) { /* Node / 隐私模式：走内存降级 */ }
    return memory;
  }

  function saveStore(store) {
    memory = store;
    try {
      localStorage.setItem(GAME.CONFIG.collectionKey, JSON.stringify(store));
    } catch (e) { /* 同上 */ }
  }

  var Achievements = {};

  Achievements.getCollection = function () {
    var store = loadStore();
    return { endings: Object.assign({}, store.endings), achievements: Object.assign({}, store.achievements) };
  };

  Achievements.resetCollection = function () {
    saveStore({ endings: {}, achievements: {} });
  };

  /* ---------- 成就判定 ---------- */
  function ruleHit(rule, run, collectedCount) {
    var t = (rule && rule.type) || 'always';
    switch (t) {
      case 'always':     return true;                                        // 首局即达成
      case 'earlyEnd':   return !!run.earlyEnd;
      case 'flag':       return !!(run.flags && run.flags[rule.flag]);
      case 'statFinal':  return !!(run.stats && run.stats[rule.stat] >= rule.min);
      case 'fullRun':    return run.turn >= rule.min;
      case 'silentCount':
        if (!run.history) return false;
        return run.history.filter(function (h) { return h.silent; }).length >= rule.min;
      case 'tightrope':
        if (run.earlyEnd || !run.stats) return false;
        var minv = Infinity;
        Object.keys(run.stats).forEach(function (k) { minv = Math.min(minv, run.stats[k]); });
        return minv <= rule.max;
      case 'collected':  return collectedCount >= rule.min;
      default:           return false;
    }
  }

  /* 本局达成的全部成就（含此前已解锁的；UI 只展示新增） */
  Achievements.evaluateRun = function (run) {
    var store = loadStore();
    var collectedCount = Object.keys(store.endings).length + (store.endings[run.endingId] ? 0 : 1);
    return GAME.ACHIEVEMENTS.filter(function (ach) {
      return ruleHit(ach.rule, run, collectedCount);
    });
  };

  /* 局末结算入口：登记结局 + 点亮新成就，返回给 UI 展示 */
  Achievements.recordRun = function (run) {
    var store = loadStore();
    var preSet = Object.assign({}, store.achievements); // 结算前的已解锁快照
    var endingKnown = !!store.endings[run.endingId];
    if (!endingKnown) store.endings[run.endingId] = true;

    var hit = Achievements.evaluateRun(run);
    hit.forEach(function (ach) { store.achievements[ach.id] = true; });
    saveStore(store);

    return {
      ending: endingKnown ? null : run.endingId,   // null = 这个结局此前已解锁过
      newAchievements: hit.filter(function (ach) { return !preSet[ach.id]; }),
    };
  };

  window.Achievements = Achievements;
})();
