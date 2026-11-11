/* =========================================================
 * stats.js —— 数值系统（StatsManager）
 * ---------------------------------------------------------
 * 模块边界：
 *   只管四项数值（relation/mood/fame/energy）的存取、增减、封顶保底、
 *   分档文案与角色性格修正。不认识"事件"，也不知道 UI 的存在。
 *
 * 对外接口：
 *   new StatsManager(initialValues, trait)
 *   .get(key)                  -> number
 *   .applyChanges(deltaObj)    -> ChangeRecord[]  [{stat, delta, from, to, clamped?}]
 *   .snapshot()                -> {relation, mood, fame, energy}
 *   .tierLabel(key)            -> string（分档文案）
 *   .collapsedStat()           -> string|null（v3：返回已跌到极限值 0 的数值键）
 *   StatsManager.clampInitialValues(base, adjusted) -> {}
 *                             （静态，开局 5 点自由分配兜底：
 *                               只加不减、单项 ≤ adjustRange、四项合计 ≤ adjustPoints）
 *
 * v5 语义：本模块与状态（states）无关——状态的生命周期在 engine.js，
 *   数值只负责 0-100 封顶保底与平衡系数。
 *
 * 规则：
 *   - 0-100 封顶保底（构造初始值与每次变化均生效）；
 *   - v3 设计哲学：数值【有涨有跌】——选择会带来真实的代价，
 *     好选项不再写在脸上；任一数值跌到极限值 0 时，游戏提前结束
 *     并进入该项数值对应的崩坏结局（由 engine 检测 collapsedStat）；
 *   - 角色性格修正（trait）：对应 stat 的【正向】变化乘以 mult，
 *     负向不受影响（避免雪上加霜，也保持数据可读）；
 *   - 修正后的变化四舍五入取整。
 * ========================================================= */
(function () {
  'use strict';

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function StatsManager(initial, trait) {
    var meta = window.GAME.STATS_META;
    var stats = {};
    Object.keys(meta).forEach(function (k) {
      stats[k] = clamp(Number(initial[k]) || 0, GAME.CONFIG.statMin, GAME.CONFIG.statMax);
    });
    this._stats = stats;
    this._trait = trait || null; // {stat, mult}
  }

  /* ---------- 开局微调兜底 clamp（静态，v5：5 点自由分配） ----------
   * 语义变更（v4 的「每项 ±3、各项独立」→ v5 的「合计 5 点、只加不减」）：
   *   adjusted 传入的是【绝对值】（= base + 分配点），本函数反推出每项加点：
   *     1. 负分配（想把属性调低）一律视为 0 —— v5 只加不减；
   *     2. 单项上限 = min(adjustRange, statMax - base, adjustCap - base)；
   *     3. 四项合计 ≤ adjustPoints（5）。超预算时的裁剪策略：
   *        "反复砍掉当前加点最多的一项，每次 1 点"，直到回到预算内。
   *        选这个策略而不是按比例缩放，是因为它【稳定且可解释】：
   *        整数结果、不用浮点、不会把 5 点摊成 1.6+1.1+1.2+1.1，
   *        且"从分得最多的那项扣"符合玩家直觉。
   * 选角 UI 层已按同一套规则阻止越界操作（按钮置灰 + 剩余点数显示），
   * 本函数是引擎开局入口的二次兜底：防 startWithEvents 等外部调用 / 坏数据绕过 UI。
   */
  StatsManager.clampInitialValues = function (base, adjusted) {
    var cfg = GAME.CONFIG;
    var keys = Object.keys(window.GAME.STATS_META);
    var budget = (typeof cfg.adjustPoints === 'number' && cfg.adjustPoints >= 0) ? cfg.adjustPoints : 0;
    var perMax = (typeof cfg.adjustRange === 'number' && cfg.adjustRange > 0) ? cfg.adjustRange : budget;
    var deltas = {};
    var total = 0;

    keys.forEach(function (k) {
      var b = Number(base && base[k]) || 0;
      var want = (adjusted && adjusted[k] !== undefined) ? (Number(adjusted[k]) || 0) - b : 0;
      var hi = Math.min(perMax, cfg.statMax - b);
      var cap = cfg.adjustCap && cfg.adjustCap[k];
      if (typeof cap === 'number') hi = Math.min(hi, cap - b); // 人物差距的硬上限
      hi = Math.max(0, hi);
      deltas[k] = Math.max(0, Math.min(hi, Math.round(want)));
      total += deltas[k];
    });

    /* 总量裁剪：每次扣当前加点最高的那一项 1 点（同分时按键序先到先扣） */
    while (total > budget) {
      var big = null;
      for (var i = 0; i < keys.length; i++) {
        if (deltas[keys[i]] > 0 && (big === null || deltas[keys[i]] > deltas[big])) big = keys[i];
      }
      if (big === null) break;
      deltas[big] -= 1;
      total -= 1;
    }

    var out = {};
    keys.forEach(function (k) {
      var b = Number(base && base[k]) || 0;
      out[k] = Math.max(cfg.statMin, Math.min(cfg.statMax, b + deltas[k]));
    });
    return out;
  };

  StatsManager.prototype.get = function (key) {
    return this._stats[key];
  };

  StatsManager.prototype.snapshot = function () {
    var out = {};
    var self = this;
    Object.keys(this._stats).forEach(function (k) { out[k] = self._stats[k]; });
    return out;
  };

  /* v3：崩坏检测——任一数值跌到极限值 0，返回该键；否则 null。
   * engine 在每次选择后调用；命中则提前进入崩坏结局。 */
  StatsManager.prototype.collapsedStat = function () {
    var keys = Object.keys(this._stats);
    for (var i = 0; i < keys.length; i++) {
      if (this._stats[keys[i]] <= GAME.CONFIG.statMin) return keys[i];
    }
    return null;
  };

  /* 应用一组变化 {stat: delta}，返回实际发生的变化记录。
   * v3：允许负值，负向变化如实生效（0-100 封顶保底仍在）。
   * v3 平衡系数：正向先乘角色性格修正（trait）、再乘 CONFIG.gainFactor；
   *   负向乘 CONFIG.lossFactor（不放大性格，避免雪上加霜）。
   *   四舍五入取整。 */
  StatsManager.prototype.applyChanges = function (deltaObj) {
    var records = [];
    var self = this;
    var cfg = window.GAME.CONFIG;
    if (!deltaObj) return records;
    Object.keys(deltaObj).forEach(function (key) {
      if (!(key in self._stats)) return;          // 未知键直接忽略（容错）
      var raw = Number(deltaObj[key]) || 0;
      if (raw === 0) return;
      if (raw > 0) {
        // 角色性格修正：仅正向变化生效
        if (self._trait && self._trait.stat === key && self._trait.mult) {
          raw = raw * self._trait.mult;
        }
        raw = raw * (typeof cfg.gainFactor === 'number' ? cfg.gainFactor : 1);
      } else {
        raw = raw * (typeof cfg.lossFactor === 'number' ? cfg.lossFactor : 1);
      }
      var delta = Math.round(raw);
      var from = self._stats[key];
      var to = clamp(from + delta, GAME.CONFIG.statMin, GAME.CONFIG.statMax);
      var realDelta = to - from;                  // 封顶/保底后的真实变化
      var hitLimit = (realDelta !== delta);       // 被 0/100 边界截断时标记
      self._stats[key] = to;
      if (realDelta !== 0) {
        records.push({ stat: key, delta: realDelta, from: from, to: to, clamped: hitLimit });
      }
    });
    return records;
  };

  /* 分档文案：例如 energy=18 -> "电量见底" */
  StatsManager.prototype.tierLabel = function (key) {
    var meta = window.GAME.STATS_META[key];
    var v = this._stats[key];
    if (!meta) return '';
    for (var i = 0; i < meta.tiers.length; i++) {
      if (v <= meta.tiers[i].max) return meta.tiers[i].label;
    }
    return meta.tiers[meta.tiers.length - 1].label;
  };

  window.StatsManager = StatsManager;
})();
