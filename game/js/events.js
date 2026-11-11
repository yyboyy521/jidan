/* =========================================================
 * events.js —— 事件引擎（EventEngine）
 * ---------------------------------------------------------
 * 模块边界：
 *   只负责"事件怎么选、条件怎么判、选项怎么跳"。读取事件数据
 *   （window.GAME_EVENTS），接收一份只读的游戏状态
 *   （stats 快照 + flags + states + usedIds 计数表 + turn），
 *   返回下一个事件。不改数值（那是 StatsManager 的事），
 *   不碰 DOM（那是 ui.js 的事）。
 *
 * 状态输入契约（由 engine.js 组装）：
 *   {
 *     stats:  { relation, mood, fame, energy },
 *     flags:  { '报过到': true, ... },
 *     states: { '上头': 2, ... },            // v5：只含【仍在生效】状态的层数
 *                                            //     （engine 传入的有效计数映射，
 *                                            //      remaining 归零的状态不会出现在这里）
 *     usedIds: { 'ev_water': 2, ... },       // v4：计数表（旧布尔 true 兼容按 1 计）
 *     turn:   3                              // 已经历的事件段数（v5 尾声优先据此判断）
 *   }
 *
 * 选取规则（优先级从高到低）：
 *   1. 上一选项指定了 next（且该事件可用）→ 走事件链（最高优先级）；
 *   2. v5 尾声优先：剩余回合 ≤2 时，直接取【可用池里 order 最大】的事件
 *      （保学期收束感：末尾两段一定落在时间线后段，而不是随机跳回九月）；
 *   3. 常规回合：可用事件按 order 升序取前 K 个（K = CONFIG.eventWindow，
 *      v5 数据侧定为 12）作为窗口，在窗口内按 weight（含 lowStat 加成 ×3）加权随机；
 *   4. 池子空了 → 返回 null（游戏进入结局判定）。
 *
 * v4/v5 数据契约支持：
 *   - 事件级 repeatable: N（默认 1）——触发次数 < N 仍可入池（v5 数据已清零，契约保留）；
 *   - 事件级 weight: 数字（默认 1）——窗口内相对权重；
 *   - 事件级 lowStat: { stat, below }——该数值 < below 时权重 ×3；
 *   - 事件 requires.states: { 状态名: 最小值 }——状态层数达标才解锁
 *     （v5 的 states 语义 = 「当前仍有效的层数」，v5 数据已不使用该子句，契约保留）；
 *   - 选项 effects.random / effects.states / effects.stateChance 的结算在 engine.js（主控）。
 * ========================================================= */
(function () {
  'use strict';

  /* ---- 条件判断（事件级与选项级共用同一套结构）----
   * requires: {
   *   stats:    { energy: 40 }  或  { energy: [0, 25] }
   *   flags:    ['A', 'B']                // 需全部存在
   *   notFlags: ['C']                     // 需全部不存在
   *   states:   { '夜猫子': 3 }           // v4：状态计数 ≥ 最小值
   * }
   */
  function statOk(rule, value) {
    if (typeof rule === 'number') return value >= rule;
    if (Array.isArray(rule)) return value >= rule[0] && value <= rule[1];
    return true;
  }

  function requiresOk(requires, state) {
    if (!requires) return true;
    if (requires.stats) {
      var keys = Object.keys(requires.stats);
      for (var i = 0; i < keys.length; i++) {
        if (!statOk(requires.stats[keys[i]], state.stats[keys[i]])) return false;
      }
    }
    if (requires.flags) {
      for (var j = 0; j < requires.flags.length; j++) {
        if (!state.flags[requires.flags[j]]) return false;
      }
    }
    if (requires.notFlags) {
      for (var k = 0; k < requires.notFlags.length; k++) {
        if (state.flags[requires.notFlags[k]]) return false;
      }
    }
    /* v5：状态门槛——state.states 是「仍生效状态的层数」，缺失按 0 处理 */
    if (requires.states) {
      var skeys = Object.keys(requires.states);
      for (var s = 0; s < skeys.length; s++) {
        var cur = (state.states && state.states[skeys[s]]) || 0;
        if (cur < requires.states[skeys[s]]) return false;
      }
    }
    return true;
  }

  /* 选项是否可选（含"为什么不可选"的提示信息） */
  function optionUsable(option, state) {
    var result = { ok: true, reason: '' };
    if (!requiresOk(option.requires, state)) {
      result.ok = false;
      if (option.requires && option.requires.stats) {
        var names = Object.keys(option.requires.stats).map(function (k) {
          var meta = window.GAME.STATS_META[k];
          var rule = option.requires.stats[k];
          var need = typeof rule === 'number' ? '需要 ≥ ' + rule : '需要 ' + rule[0] + '~' + rule[1];
          return meta ? need + ' ' + meta.name : need;
        });
        result.reason = names.join('，');
      } else if (option.requires && option.requires.states) {
        /* 状态门槛的兜底提示（v5 数据未使用，契约保留；语义 = 有效层数） */
        result.reason = Object.keys(option.requires.states).map(function (name) {
          return '需要「' + name + '」×' + option.requires.states[name];
        }).join('，');
      } else {
        result.reason = '条件未满足';
      }
    }
    return result;
  }

  /* v4：usedIds 计数读取——兼容旧布尔表（true 按 1 计） */
  function usedCount(usedIds, id) {
    var c = usedIds ? usedIds[id] : 0;
    if (c === true) return 1;
    return Number(c) || 0;
  }

  function EventEngine(events) {
    this._events = (events || window.GAME_EVENTS || []).slice();
    this._byId = {};
    var self = this;
    this._events.forEach(function (ev) {
      self._byId[ev.id] = ev;
      if (ev.once === undefined) ev.once = true;
    });
  }

  EventEngine.prototype.getById = function (id) {
    return this._byId[id] || null;
  };

  /* 事件本身是否可用（未超 repeatable 次数 + 解锁条件满足）
   * once === false 视为不限次数（v3 契约保留）；
   * 否则上限为 ev.repeatable（默认 1，即"只出现一次"）。 */
  EventEngine.prototype.eventAvailable = function (ev, state) {
    if (!ev) return false;
    if (ev.once !== false) {
      var max = (typeof ev.repeatable === 'number' && ev.repeatable > 0) ? ev.repeatable : 1;
      if (usedCount(state.usedIds, ev.id) >= max) return false;
    }
    return requiresOk(ev.requires, state);
  };

  /* 事件链强制跳转：目标事件可用则返回，否则回退默认流程 */
  EventEngine.prototype.pickByNextId = function (nextId, state) {
    if (!nextId) return null;
    var ev = this._byId[nextId];
    if (this.eventAvailable(ev, state)) return ev;
    return this.pickNext(state);
  };

  /* 可用池（按 order 升序）——pickNext 与 hasAnyAvailable 共用 */
  EventEngine.prototype._availablePool = function (state) {
    var self = this;
    return this._events
      .filter(function (ev) { return self.eventAvailable(ev, state); })
      .sort(function (a, b) { return a.order - b.order; });
  };

  /* v4：窗口内权重 = 事件 weight（默认 1）× lowStat 加成（×3） */
  EventEngine.prototype._weightOf = function (ev, state) {
    var w = (typeof ev.weight === 'number' && ev.weight > 0) ? ev.weight : 1;
    if (ev.lowStat && state.stats) {
      var v = state.stats[ev.lowStat.stat];
      if (typeof v === 'number' && v < ev.lowStat.below) w *= 3;
    }
    return w;
  };

  /* v5：尾声优先——剩余回合（含本回合）≤2 时进入"收束模式"。
   * state.turn = 已经历的段数（本回合尚未计入），因此在第 24 段
   * 选取时 remain = 25-23 = 2 → 已进入收束。 */
  EventEngine.prototype._inClimax = function (state) {
    var cfg = window.GAME && window.GAME.CONFIG;
    if (!cfg || typeof cfg.turnLimit !== 'number') return false;
    var remain = cfg.turnLimit - (Number(state && state.turn) || 0);
    return remain > 0 && remain <= 2;
  };

  /* v5 默认流程：
   *   尾声（剩余 ≤2 回合）→ 取可用池里 order 最大的一条（确定性收束，
   *     上一段用掉后下一段自然取到次高，长度不够也不会卡死）；
   *   其余回合 → order 升序取前 K 个作为窗口（K = CONFIG.eventWindow，v5 定 12），
   *     窗口内按 weight（含 lowStat 加成）加权随机（Math.random）。
   * 池空则 null（结局）。 */
  EventEngine.prototype.pickNext = function (state) {
    var pool = this._availablePool(state);
    if (!pool.length) return null;
    /* v5 尾声优先：pool 已按 order 升序，末位即 order 最大的可用事件 */
    if (this._inClimax(state)) return pool[pool.length - 1];
    var K = (window.GAME && window.GAME.CONFIG && window.GAME.CONFIG.eventWindow) || 12;
    /* v6 进度滑窗：窗口不再固定从池首取，而是跟着回合进度向后滑。
     * 原因：事件库 76 段、单局 25 段，若固定取池首 12 个，玩家实际只能
     * 走到 order≈37（二十五回合逐段消耗），48 段之后的十一月/十二月内容
     * 会变成永远遇不到的死内容。改为按 turn / (turnLimit-1) 估算"现在的
     * 学期进度"，把窗口起点推到对应 order，既保留少量随机，又让整条
     * 时间线在 25 段内被均匀走完。尾声优先仍在本函数开头先行拦截。 */
    var cfg = (window.GAME && window.GAME.CONFIG) || {};
    var limit = cfg.turnLimit || 25;
    var progress = Math.max(0, Math.min(1, (state.turn || 0) / Math.max(1, limit - 1)));
    var lastOrder = pool[pool.length - 1].order;
    var target = 1 + progress * (lastOrder - 1);
    var start = 0;
    while (start < pool.length && pool[start].order < target) start++;
    if (start > pool.length - 1) start = Math.max(0, pool.length - K);
    var win = pool.slice(start, start + Math.max(1, K));
    var total = 0;
    var self = this;
    win.forEach(function (ev) { total += self._weightOf(ev, state); });
    var r = Math.random() * total;
    for (var i = 0; i < win.length; i++) {
      r -= this._weightOf(win[i], state);
      if (r < 0) return win[i];
    }
    return win[win.length - 1];
  };

  /* 供引擎在开局时询问"还有没有事件可走"（不做随机消耗，纯可用性判断） */
  EventEngine.prototype.hasAnyAvailable = function (state) {
    return this._availablePool(state).length > 0;
  };

  window.EventEngine = EventEngine;
  window.EventRules = { requiresOk: requiresOk, optionUsable: optionUsable };
})();
