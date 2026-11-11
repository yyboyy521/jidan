/* =========================================================
 * engine.js —— 游戏主控（Game）
 * ---------------------------------------------------------
 * 模块边界：
 *   游戏流程的状态机与推进器：标题页 → 选角色（微调）→ 事件循环
 *   （选选项 → 数值变化 → 结果卡 → 下一事件）→ 结局判定。
 *   它组装各模块（StatsManager / EventEngine / EndingResolver / UI），
 *   是唯一持有完整游戏状态的地方；UI 只做展示，数据层只做规则。
 *
 * 存档说明（可选功能，非运行前提）：
 *   每次选择后把状态快照写入 localStorage；标题页检测到存档时
 *   提供「继续上次」。localStorage 不可用时静默降级（不影响游玩）。
 *   v5 起存档结构 version: 4（states 从「永久计数」改为
 *   { 状态名: { count, remaining } } 短时状态表）；version 3 及更早
 *   旧档结构不兼容，读取时直接视为无存档（存档键不变，老档自然失效，
 *   不清收集进度）。
 *
 * v5 机制落点（数据契约见 js/data/events.js 头注释、design/content-v5.md）：
 *   - 特殊状态【短时化】：进入时 remaining = STATES_META[name].duration，
 *     每回合结束（下一次推进前）remaining-1，归零整条移除；同名再次触发
 *     count+1 且 remaining 重置为 duration（不叠加时长）。
 *     对外（事件 requires / 结局 / 成就）只看「仍生效状态的 count」。
 *   - 状态【概率化】：选项 effects.stateChance 为基准概率，实际抽取概率
 *     = stateChance × CONFIG.stateChanceFactor（默认 0.4）；未命中时静默
 *     不发状态（结果卡不出现该行，不剧透）。
 *   - 随机结果池：选项 effects.random 按 weight 加权抽取一个变体，变体的
 *     stats/flags/states/narrate/next 等价于实际 effects 生效（random 选项的
 *     stateChance 写在选项级 effects.stateChance 上，同样参与概率判定）。
 *   - repeatable：usedIds 计数表，触发次数 < ev.repeatable 仍可入池
 *     （v5 数据已全部单次，引擎保留兼容）。
 *   - lowStat 加权、order 窗口随机、尾声优先在 js/events.js（EventEngine）。
 *
 * 预留接口：
 *   Game.prototype.startWithEvents(events, charId, values, playerName) ——
 *   后续聊天记录导入后，用 ChatImporter 转换出的事件数组
 *   替换默认事件池启动游戏（见 js/chat-import.js 契约）。
 * ========================================================= */
(function () {
  'use strict';

  var SAVE_VERSION = 4; // v5 存档结构：states 为 { count, remaining } 短时状态表

  /* v5：状态名 → 元信息（时长/正负/图标/说明）；未知状态名给一套兜底 */
  function stateMeta(name) {
    var meta = (window.GAME.STATES_META || {})[name];
    return meta || { name: name, icon: '•', kind: 'good', duration: 2, desc: '' };
  }

  function stateDuration(name) {
    var d = Number(stateMeta(name).duration);
    return (d > 0) ? Math.round(d) : 2;
  }

  /* v5：把任意来源的 states 归一化成 { 名: { count, remaining } }。
   * 兼容两种历史形态：
   *   - v5 结构：{ count, remaining }
   *   - v4 旧结构：数字（永久计数）→ count 取该数字，remaining 给满时长
   * 非法项（0 层、坏对象）直接丢弃。 */
  function normalizeStates(raw) {
    var out = {};
    Object.keys(raw || {}).forEach(function (name) {
      var v = raw[name];
      if (typeof v === 'number') {
        if (v > 0) out[name] = { count: v, remaining: stateDuration(name) };
        return;
      }
      if (v && typeof v === 'object') {
        var count = Math.round(Number(v.count) || 0);
        if (count <= 0) return;
        var remaining = Math.round(Number(v.remaining) || 0);
        if (remaining <= 0) remaining = stateDuration(name);
        out[name] = { count: count, remaining: Math.min(remaining, stateDuration(name)) };
      }
    });
    return out;
  }

  /* v5：实际抽取概率 = 选项基准概率 × CONFIG.stateChanceFactor。
   * 基准概率优先取选项级 effects.stateChance（random 选项也写在这里），
   * 其次取实际结算对象（变体）上的 stateChance，最后兜底 1（旧数据）。 */
  function stateChanceOf(optionEffects, eff) {
    var cfg = window.GAME.CONFIG || {};
    var factor = (typeof cfg.stateChanceFactor === 'number') ? cfg.stateChanceFactor : 1;
    var base = 1;
    if (optionEffects && typeof optionEffects.stateChance === 'number') base = optionEffects.stateChance;
    else if (eff && typeof eff.stateChance === 'number') base = eff.stateChance;
    return Math.max(0, Math.min(1, base * Math.max(0, factor)));
  }

  function Game() {
    this.engine = new EventEngine();
    this.resolver = new EndingResolver();
    this._restartBound = this._confirmRestart.bind(this);
    this.reset();
    this._boot();
  }

  Game.prototype.reset = function () {
    this.char = null;
    this.playerName = null;  // 玩家自拟名（v2 起名流程，见 js/name.js）
    this.stats = null;      // StatsManager 实例
    this.flags = {};        // 剧情 flag 表
    this.states = {};       // v5：短时状态表 { 状态名: { count, remaining } }
    this.usedIds = {};      // v4：已触发事件计数表 { eventId: 次数 }（配合 repeatable）
    this.turn = 0;          // 已经历的事件段数
    this.history = [];      // 选择历史（结局回顾时间线 & 成就结算依据）
    this.currentEvent = null;
    this.pendingNext = null; // 选项指定的强制跳转 nextEventId
    this._earlyEnd = false;  // v3：数值崩坏提前结局标记
    this._started = false;
  };

  /* ---------- 启动入口 ---------- */
  Game.prototype._boot = function () {
    var self = this;
    var hasSave = !!this._loadSave();
    UI.showTitle(
      hasSave,
      function () { self._beginSelect(); },
      function () { self._resume(); }
    );
  };

  Game.prototype._confirmRestart = function () {
    if (window.confirm('确定放弃当前进度、重新开始吗？')) {
      this._clearSave();
      this._beginSelect();
    }
  };

  /* ---------- 开局：选角色 + 微调 + 起名 ---------- */
  Game.prototype._beginSelect = function () {
    var self = this;
    this._clearSave();
    UI.renderCharSelect(function (charId, values, rawPlayerName) {
      self._start(charId, values, rawPlayerName);
    });
  };

  Game.prototype._start = function (charId, values, rawPlayerName) {
    this.reset();
    var ch = GAME.CHARACTERS.filter(function (c) { return c.id === charId; })[0];
    if (!ch) { UI.toast('角色数据异常'); return; }
    this.char = ch;
    // 开局分配二次兜底：UI 层已按 adjustPoints / adjustRange / adjustCap 阻止越界，
    // 这里再 clamp 一次（v5：只加不减、合计 ≤5 点），防 startWithEvents 等
    // 外部调用传入坏数据。
    this.stats = new StatsManager(StatsManager.clampInitialValues(ch.base, values), ch.trait);
    // 起名规则统一入口：去空白 / 限长 12 / 空则默认「匿名小登」
    this.playerName = PlayerNaming.sanitize(rawPlayerName);
    this._started = true;
    this._enterGameScreen();
    this._advance();
  };

  /* ---------- 续档 ---------- */
  Game.prototype._resume = function () {
    var save = this._loadSave();
    if (!save) { this._beginSelect(); return; }
    this.reset();
    var ch = GAME.CHARACTERS.filter(function (c) { return c.id === save.charId; })[0];
    if (!ch) { this._beginSelect(); return; }
    this.char = ch;
    this.stats = new StatsManager(save.stats, ch.trait);
    this.flags = save.flags || {};
    this.states = normalizeStates(save.states);   // v5：短时状态表（含旧结构兜底）
    this.usedIds = save.usedIds || {};
    this.turn = save.turn || 0;
    this.history = save.history || [];
    this.pendingNext = save.pendingNext || null;
    this.playerName = save.playerName || PlayerNaming.DEFAULT; // 兜底，正常必有
    this._started = true;
    this._enterGameScreen();
    this._advance();
  };

  Game.prototype._enterGameScreen = function () {
    this._refreshSidebar();
    UI.showScreen('game');
  };

  /* ---------- 只读状态视图（喂给 EventEngine 判条件） ---------- */
  Game.prototype._stateView = function () {
    return {
      stats: this.stats.snapshot(),
      flags: this.flags,
      states: this._activeStateCounts(),   // v5：只含仍生效状态的层数
      usedIds: this.usedIds,
      turn: this.turn,
    };
  };

  /* v5：有效状态层数映射 { 状态名: count }——事件门槛/结局/成就的统一口径。
   * 已过期（remaining ≤ 0）的状态不会出现在这里：
   *   count > 0  &&  remaining > 0  两个条件缺一不可，与 _stateEntries()（喂侧栏）
   *   的过滤口径保持一致——否则会出现「侧栏看不见、门槛却算数」的错位。
   * 今天 tick 归零即删、normalizeStates 会把 remaining ≤ 0 补满，因此这条
   * remaining 判定只在「脏存档 / 外部写入状态表 / 未来调整 tick 时机」时才真正生效，
   * 属于防御性一致，不改变当前玩法行为。 */
  Game.prototype._activeStateCounts = function () {
    var out = {};
    var states = this.states || {};
    Object.keys(states).forEach(function (name) {
      var s = states[name];
      var count = Math.round(Number(s && s.count) || 0);
      var remaining = Math.round(Number(s && s.remaining) || 0);
      if (count > 0 && remaining > 0) out[name] = count;
    });
    return out;
  };

  /* v5：喂给侧栏的展示数据 [{ name, count, remaining, icon, kind, desc, duration }]
   * 按剩余回合升序（快退去的排前面，玩家更该先看见）。 */
  Game.prototype._stateEntries = function () {
    var states = this.states || {};
    return Object.keys(states).map(function (name) {
      var s = states[name];
      var meta = stateMeta(name);
      return {
        name: name,
        count: Math.round(Number(s && s.count) || 0),
        remaining: Math.max(0, Math.round(Number(s && s.remaining) || 0)),
        icon: meta.icon,
        kind: meta.kind || 'good',
        desc: meta.desc || '',
        duration: stateDuration(name),
      };
    }).filter(function (e) { return e.count > 0 && e.remaining > 0; })
      .sort(function (a, b) { return a.remaining - b.remaining; });
  };

  /* v5：回合结束结算——所有状态 remaining-1，归零整条移除。
   * 调用时机：每次推进到下一事件之前（= 上一个回合真正结束）。
   * 因此「进入回合 T、时长 3」的状态在 T、T+1、T+2 三段有效，
   * 侧栏在 T+1 显示「2 回合」（含当前回合），T+3 时消失。 */
  Game.prototype._tickStates = function () {
    var states = this.states || {};
    var expired = [];
    Object.keys(states).forEach(function (name) {
      var s = states[name];
      if (!s || typeof s !== 'object') { delete states[name]; return; }
      s.remaining = (Number(s.remaining) || 0) - 1;
      if (s.remaining <= 0) { delete states[name]; expired.push(name); }
    });
    return expired;
  };

  Game.prototype._refreshSidebar = function () {
    var self = this;
    UI.renderGameHeader(this.char, this.playerName, Math.max(this.turn, 1), GAME.CONFIG.turnLimit, this._restartBound);
    UI.renderStats(this.stats, this.flags, this._stateEntries());
    /* v4：足迹时间线（已发生 + 当前事件）；sceneOf 供 UI 反查事件章节 */
    UI.renderTimeline(this.history, this.currentEvent, function (id) {
      return self.engine.getById(id);
    });
  };

  /* ---------- 主循环：推进到下一事件（或终局） ---------- */
  Game.prototype._advance = function () {
    /* v5：回合结束结算（状态 -1 回合）。turn=0 时是开局，不结算。 */
    if (this.turn > 0) this._tickStates();

    var state = this._stateView();

    // 终局条件 1：事件段数走完；终局条件 2：事件池耗尽
    if (this.turn >= GAME.CONFIG.turnLimit || !this.engine.hasAnyAvailable(state)) {
      this._endGame();
      return;
    }

    var ev = this.pendingNext
      ? this.engine.pickByNextId(this.pendingNext, state)   // 事件链强制跳转（最高优先级）
      : this.engine.pickNext(state);                        // v4：order 窗口内加权随机
    this.pendingNext = null;

    if (!ev) { this._endGame(); return; }

    this.currentEvent = ev;
    this.turn += 1;
    this._refreshSidebar();
    UI.renderEvent(ev, this._stateView(), this._choose.bind(this));
    this._save();
  };

  /* ---------- v4 随机结果池：按 weight 加权抽一个变体（Math.random） ---------- */
  function pickVariant(variants) {
    var total = 0;
    variants.forEach(function (v) {
      total += (typeof v.weight === 'number' && v.weight > 0) ? v.weight : 1;
    });
    var r = Math.random() * total;
    for (var i = 0; i < variants.length; i++) {
      var w = (typeof variants[i].weight === 'number' && variants[i].weight > 0) ? variants[i].weight : 1;
      r -= w;
      if (r < 0) return variants[i];
    }
    return variants[variants.length - 1];
  }

  /* ---------- 玩家做出选择 ---------- */
  Game.prototype._choose = function (optionIndex) {
    var ev = this.currentEvent;
    if (!ev) return;
    var option = ev.options[optionIndex];

    /* v4：随机结果池——抽中的变体等价于实际 effects（含 next 跳转）。
     * 与直接 effects 互斥（数据层已保证），引擎侧以 random 优先。 */
    var base = option.effects || {};
    var eff = (base.random && base.random.length) ? pickVariant(base.random) : base;

    // 1) 数值变化（v3：有涨有跌，0-100 封顶保底由 StatsManager 处理）
    //    v6 三条规则（见 data.js CONFIG 注释）：
    //    a. 人际/声望：先掷 CONFIG.socialChangeChance，命中才结算；
    //       命中后幅度 ×CONFIG.socialDeltaAmp（1.4）——四维不再保证每段全变。
    //    b. 精力/心情：每段结束在后台各随机 ±1，不写入结果卡与选择历史。
    //    c. 旧版"每段固定 -1 精力"已由 b 取代（固定消耗会让低精力角色必崩）。
    var cfgStats = window.GAME.CONFIG;
    var effStats = Object.assign({}, eff.stats || {});
    var socialChance = (typeof cfgStats.socialChangeChance === 'number') ? cfgStats.socialChangeChance : 1;
    var socialAmp = (typeof cfgStats.socialDeltaAmp === 'number') ? cfgStats.socialDeltaAmp : 1;
    ['relation', 'fame'].forEach(function (k) {
      var d = Number(effStats[k]) || 0;
      if (!d) return;
      if (Math.random() >= socialChance) { delete effStats[k]; return; }
      effStats[k] = Math.round(d * socialAmp);
    });
    var changes = this.stats.applyChanges(effStats);

    // b) 隐藏漂移：不计入 changes（结果卡不展示），但真实影响数值与崩坏判定
    var driftKeys = cfgStats.driftStats || ['energy', 'mood'];
    var drift = {};
    driftKeys.forEach(function (k) {
      drift[k] = Math.random() < 0.5 ? 1 : -1;
    });
    this.stats.applyChanges(drift);

    // 1b) v3 崩坏检测：任一数值跌到极限值 0 → 本局提前结束
    //     v6：漂移之后才判定，避免"结果卡显示没变、实际已归零"的错位
    var collapsed = this.stats.collapsedStat();
    if (collapsed) this._earlyEnd = true;

    // 2) 剧情 flag 写入（true=获得，false=移除）
    var flagGained = [];
    var newFlags = eff.flags || null;
    var self = this;
    if (newFlags) {
      Object.keys(newFlags).forEach(function (name) {
        if (newFlags[name]) {
          if (!self.flags[name]) flagGained.push(name);
          self.flags[name] = true;
        } else {
          delete self.flags[name];
        }
      });
    }

    // 2b) v5：短时状态（概率触发 + 时长）
    //   概率 = stateChance × CONFIG.stateChanceFactor；未命中则静默不发状态
    //   （结果卡不出现该行，也不额外叙述——不剧透"这次本可以挂上什么"）。
    //   同名再次触发：count + 1，remaining 重置为 duration（不叠加时长）。
    var stateGained = [];
    var newStates = eff.states || null;
    if (newStates && Object.keys(newStates).length) {
      var hit = Math.random() < stateChanceOf(base, eff);
      if (hit) {
        Object.keys(newStates).forEach(function (name) {
          var d = Number(newStates[name]) || 0;
          if (d <= 0) return;                       // v5 无"负投放"语义，负值忽略
          var duration = stateDuration(name);
          var add = Math.max(1, Math.round(d));
          var cur = self.states[name];
          if (cur && Math.round(Number(cur.count) || 0) > 0) {
            cur.count = Math.round(Number(cur.count) || 0) + add;
            cur.remaining = duration;               // 重置，不叠加
          } else {
            self.states[name] = { count: add, remaining: duration };
          }
          stateGained.push({
            name: name,
            delta: add,
            count: self.states[name].count,
            remaining: self.states[name].remaining,
            duration: duration,
            kind: stateMeta(name).kind || 'good',
          });
        });
      }
    }

    // 3) 选择历史（结局时间线 & 成就判定依据；silent 标记沉默类选项）
    this.history.push({
      turn: this.turn,
      eventId: ev.id,
      eventTitle: ev.title,
      optionText: option.text,
      silent: !!option.silent,
      changes: changes,
      narrate: eff.narrate || '',
    });

    // 4) 标记已用（v4：计数表，配合 repeatable）+ 事件链跳转
    var used = this.usedIds[ev.id];
    this.usedIds[ev.id] = (typeof used === 'number' ? used : (used ? 1 : 0)) + 1;
    this.pendingNext = eff.next || option.next || null;

    // 5) 存档并弹出结果卡；关闭结果卡后继续推进（崩坏则直接终局）
    this._save();
    var game = this;
    var narrate = eff.narrate || '';
    if (collapsed) {
      narrate = narrate + '　——有什么东西见底了。';
    }
    UI.showResultCard(
      {
        changes: changes,
        flagGained: flagGained,
        stateGained: stateGained,
        narrate: narrate,
      },
      function () {
        if (game._earlyEnd) { game._endGame(); return; }
        game._advance();
      }
    );
  };

  /* ---------- 结局判定与呈现 ---------- */
  Game.prototype._endGame = function () {
    /* v5：结局与成就只看「有效状态层数」；12 条结局已改用终值 + flag 判定，
     * match.states 子句仍由 EndingResolver 兼容处理（当前数据未使用）。 */
    var activeStates = this._activeStateCounts();
    var ending = this.resolver.resolve({
      stats: this.stats.snapshot(),
      flags: this.flags,
      states: activeStates,
    });

    // v3：成就与结局收集结算（不影响对局本身，只点亮图鉴）
    var unlock = Achievements.recordRun({
      endingId: ending.id,
      stats: this.stats.snapshot(),
      flags: this.flags,
      states: activeStates,       // v5：有效状态计数映射（成就规则当前不使用）
      history: this.history,
      turn: this.turn,
      earlyEnd: this._earlyEnd,
    });

    UI.showEnding(ending, this.stats, this.history, this.char, this.playerName,
      this._beginSelect.bind(this), unlock);
    this._clearSave();
    this._started = false;
  };

  /* ---------- 预留接口：外部事件池启动（聊天记录导入后使用） ---------- */
  Game.prototype.startWithEvents = function (events, charId, values, rawPlayerName) {
    this.engine = new EventEngine(events);
    this._start(charId, values, rawPlayerName);
  };

  /* ---------- localStorage 存档（可选功能，失败静默降级） ---------- */
  Game.prototype._save = function () {
    if (!this._started || !this.currentEvent) return;
    try {
      localStorage.setItem(GAME.CONFIG.saveKey, JSON.stringify({
        version: SAVE_VERSION,  // v5 结构：states 为 { count, remaining }；旧档读取时直接丢弃
        charId: this.char.id,
        playerName: this.playerName,
        stats: this.stats.snapshot(),
        flags: this.flags,
        states: this.states,
        usedIds: this.usedIds,
        turn: this.turn,
        history: this.history,
        pendingNext: this.pendingNext,
      }));
    } catch (e) { /* 隐私模式/禁用 localStorage：忽略，不影响游玩 */ }
  };

  Game.prototype._loadSave = function () {
    try {
      var raw = localStorage.getItem(GAME.CONFIG.saveKey);
      var save = raw ? JSON.parse(raw) : null;
      // version 非当前结构（v1/v2 无 states、v3 为永久计数、v4 为计数表）：视为无存档
      return (save && save.version === SAVE_VERSION) ? save : null;
    } catch (e) { return null; }
  };

  Game.prototype._clearSave = function () {
    try { localStorage.removeItem(GAME.CONFIG.saveKey); } catch (e) { /* 同上 */ }
  };

  /* ---------- 启动（脚本位于 body 末尾，DOM 已就绪） ---------- */
  window.game = new Game();
})();
