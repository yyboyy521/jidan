/* =========================================================
 * ui.js —— 界面层（UIController）
 * ---------------------------------------------------------
 * 模块边界：
 *   只做渲染与交互反馈，不持有游戏状态、不做游戏规则判断。
 *   引擎（engine.js）调用本层的方法拿用户输入的回调。
 *   规则：UI 不主动推进流程，一切推进都从 engine 发起。
 *
 * 对外接口（engine.js 使用）：
 *   UI.showScreen(name)                  'title' | 'select' | 'game' | 'ending'
 *   UI.renderCharSelect(onStart)         onStart(charId, values, rawPlayerName)
 *                                        v5：values = base + 5 点自由分配结果
 *   UI.renderGameHeader(char, playerName, turn, turnLimit, onRestart)
 *   UI.renderStats(statsManager, flags, stateEntries)
 *                                        v5：stateEntries =
 *                                        [{ name, count, remaining, icon, kind, desc, duration }]
 *   UI.renderEvent(event, state, onChoose)
 *   UI.renderTimeline(history, currentEvent, sceneOf) // v4：足迹时间线
 *   UI.showResultCard(payload, onClose)  payload: { changes, flagGained, stateGained, narrate, review? }
 *                                        v5：stateGained = [{ name, delta, duration, kind, ... }]
 *   UI.showEnding(ending, statsManager, history, char, playerName, onRestart, unlock)
 *   UI.toast(msg)
 *
 * v5 机制落点：
 *   - 状态徽章：图标 + 名称 + 剩余回合，点击/悬停弹说明卡（STATES_META.desc），
 *     负面状态（kind:'bad'）用警示色区分；
 *   - 结果卡状态行：「+1（持续 N 回合）」；
 *   - 选角页：5 点自由分配（剩余点数 + 加减置灰），替换 v4 的 ±3 微调；
 *   - 图鉴：已解锁条目展示 condition 小字（未解锁仍 ？？？）；
 *   - 音效：选项/按钮/结果卡/结局页四个短音，由 js/audio.js（Sfx）统一合成；
 *   - 玩家名与全部 condition 文案渲染前统一 esc() 转义，防 XSS。
 *
 * v4 机制保留：足迹时间线（右侧抽屉，按 scene 月份分章，节点可点击回顾）。
 * ========================================================= */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* HTML 转义：玩家名等不可信内容进入 innerHTML 模板前必须经过 */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var SCREENS = {
    title: $('screen-title'),
    select: $('screen-select'),
    game: $('screen-game'),
    ending: $('screen-ending'),
    collection: $('screen-collection'),
    notice: $('screen-notice'),
  };

  var UI = {};

  /* ---------- 屏幕切换 ---------- */
  UI.showScreen = function (name) {
    Object.keys(SCREENS).forEach(function (k) {
      SCREENS[k].hidden = (k !== name);
    });
    if (name !== 'game') { closeTimeline(); hideStatePop(); } // 离开游戏页时收起足迹抽屉与状态说明卡
    window.scrollTo(0, 0);
  };

  /* ---------- 标题页 ---------- */
  UI.showTitle = function (hasSave, onNew, onContinue) {
    $('btn-continue').hidden = !hasSave;
    $('btn-new-game').onclick = onNew;
    $('btn-continue').onclick = onContinue;
    /* v5 音效开关（右上角 🔊/🔇，状态存 localStorage；与动效降级互不影响） */
    if (window.Sfx) Sfx.mountToggle($('btn-sfx'));
    /* v3：图鉴 / 须知入口（元界面，不经过引擎） */
    $('btn-collection').onclick = function () { UI.renderCollection(); UI.showScreen('collection'); };
    $('btn-notice').onclick = function () { UI.showScreen('notice'); };
    $('btn-notice-back').onclick = function () { UI.showScreen('title'); };
    $('btn-collection-back').onclick = function () { UI.showScreen('title'); };
    $('btn-collection-reset').onclick = function () {
      if (window.confirm('确定清空全部结局收集与成就进度吗？此操作不可恢复。')) {
        Achievements.resetCollection();
        UI.renderCollection();
        UI.toast('收集进度已重置');
      }
    };
    UI.showScreen('title');
  };

  /* ---------- 图鉴页：结局收集 + 成就 ----------
   * 隐藏原则：未解锁的结局只显示 ???，不透露任何达成条件；
   * 未解锁的成就同样只显示 ???。
   * v5：已解锁条目追加一行小字条件说明（读数据侧 condition 字段），
   *     让玩家知道自己"是怎么走到这里的"，也提示还差什么；
   *     条件是中文自然语言，构造进 innerHTML 前统一 esc() 转义。
   */
  UI.renderCollection = function () {
    var col = Achievements.getCollection();
    var wrap = $('collection-wrap');

    var unlockedEndings = GAME.ENDINGS.filter(function (e) { return col.endings[e.id]; });
    var endingCards = GAME.ENDINGS.map(function (e) {
      if (col.endings[e.id]) {
        return '<div class="col-card col-card-end unlocked tone-' + (e.tone || 'plain') + '">' +
          '<div class="col-name">' + esc(e.title) + '</div>' +
          '<div class="col-tag">已达成</div>' +
          (e.condition ? '<div class="col-cond">' + esc(e.condition) + '</div>' : '') +
        '</div>';
      }
      return '<div class="col-card col-card-locked">' +
        '<div class="col-name">？？？</div>' +
        '<div class="col-tag">尚未达成</div>' +
      '</div>';
    }).join('');

    var unlockedAch = GAME.ACHIEVEMENTS.filter(function (a) { return col.achievements[a.id]; });
    var achCards = GAME.ACHIEVEMENTS.map(function (a) {
      if (col.achievements[a.id]) {
        return '<div class="col-card col-card-ach unlocked">' +
          '<div class="col-name">' + esc(a.name) + '</div>' +
          '<div class="col-desc">' + esc(a.desc) + '</div>' +
          (a.condition ? '<div class="col-cond">' + esc(a.condition) + '</div>' : '') +
        '</div>';
      }
      return '<div class="col-card col-card-ach">' +
        '<div class="col-name">？？？</div>' +
        '<div class="col-desc">条件未知</div>' +
      '</div>';
    }).join('');

    wrap.innerHTML =
      '<div class="card collect-card">' +
        '<h3 class="panel-subtitle">结局收集（' + unlockedEndings.length + ' / ' + GAME.ENDINGS.length + '）</h3>' +
        '<p class="collect-hint">每个结局的走法，藏在你的每一次选择里。</p>' +
        '<div class="col-grid">' + endingCards + '</div>' +
      '</div>' +
      '<div class="card collect-card">' +
        '<h3 class="panel-subtitle">成就（' + unlockedAch.length + ' / ' + GAME.ACHIEVEMENTS.length + '）</h3>' +
        '<div class="col-grid col-grid-ach">' + achCards + '</div>' +
      '</div>';
  };

  /* ---------- 角色选择页（v5：5 点自由分配） ----------
   * 规则（与 StatsManager.clampInitialValues 同口径）：
   *   - 四项各可加 0 ~ min(adjustRange, statMax-base, adjustCap-base) 点；
   *   - 四项合计 ≤ CONFIG.adjustPoints（5）；
   *   - 只加不减（v5 没有"往下调"的语义）。
   * UI 负责：剩余点数实时显示、点数用尽时 + 置灰、减到 0 时 − 置灰；
   * 引擎在开局入口再 clamp 一次兜底（防外部调用绕过 UI）。
   */
  var selectState = { charId: null, alloc: null, values: null };

  UI.renderCharSelect = function (onStart) {
    selectState = { charId: null, alloc: null, values: null };
    var grid = $('char-grid');
    grid.innerHTML = '';
    var cfg = GAME.CONFIG;
    var budget = (typeof cfg.adjustPoints === 'number' && cfg.adjustPoints >= 0) ? cfg.adjustPoints : 0;
    var perMax = (typeof cfg.adjustRange === 'number' && cfg.adjustRange > 0) ? cfg.adjustRange : budget;
    var STAT_KEYS = Object.keys(GAME.STATS_META);

    GAME.CHARACTERS.forEach(function (ch) {
      var card = document.createElement('button');
      card.className = 'char-card card';
      card.type = 'button';
      card.innerHTML =
        '<div class="char-name">' + ch.name + '</div>' +
        '<div class="char-tag">' + ch.tag + '</div>' +
        '<div class="char-quote">' + ch.quote + '</div>' +
        '<div class="char-stats-mini">' + statMini(ch.base) + '</div>';
      card.onclick = function () { pick(ch); };
      grid.appendChild(card);
    });

    function statMini(base) {
      return STAT_KEYS.map(function (k) {
        var m = GAME.STATS_META[k];
        return '<span class="mini-stat"><i style="background:' + m.color + '"></i>' +
               m.name + ' ' + base[k] + '</span>';
      }).join('');
    }

    function zeroAlloc() {
      var a = {};
      STAT_KEYS.forEach(function (k) { a[k] = 0; });
      return a;
    }

    function usedPoints() {
      if (!selectState.alloc) return 0;
      return STAT_KEYS.reduce(function (n, k) { return n + selectState.alloc[k]; }, 0);
    }

    function baseOf(k) {
      var cur = GAME.CHARACTERS.filter(function (c) { return c.id === selectState.charId; })[0];
      return cur ? (Number(cur.base[k]) || 0) : 0;
    }

    /* 单属性可加点上限（与 stats.js 的 clamp 上限一致） */
    function maxAddOf(k) {
      var b = baseOf(k);
      var hi = Math.min(perMax, cfg.statMax - b);
      var cap = cfg.adjustCap && cfg.adjustCap[k];
      if (typeof cap === 'number') hi = Math.min(hi, cap - b);
      return Math.max(0, Math.floor(hi));
    }

    function pick(ch) {
      selectState.charId = ch.id;
      selectState.alloc = zeroAlloc();
      selectState.values = Object.assign({}, ch.base);
      Array.prototype.forEach.call(grid.children, function (el) { el.classList.remove('selected'); });
      var idx = indexOfChar(ch.id);
      if (idx >= 0) grid.children[idx].classList.add('selected');
      renderDetail(ch);
      $('btn-start-life').disabled = false;
    }

    function indexOfChar(id) {
      for (var i = 0; i < GAME.CHARACTERS.length; i++) {
        if (GAME.CHARACTERS[i].id === id) return i;
      }
      return -1;
    }

    function renderDetail(ch) {
      var box = $('char-detail');
      box.hidden = false;
      var rows = STAT_KEYS.map(function (k) {
        var m = GAME.STATS_META[k];
        return '' +
          '<div class="adjust-row" data-stat="' + k + '">' +
            '<div class="adjust-label">' + m.icon + ' ' + m.name +
              '<span class="adjust-tier">' + tierOf(k, ch.base[k]) + '</span></div>' +
            '<div class="adjust-ctrl">' +
              '<button class="adj-btn" data-dir="-1" type="button" title="退回 1 点">−</button>' +
              '<span class="adjust-value">' + ch.base[k] + '</span>' +
              '<span class="adjust-add" hidden></span>' +
              '<button class="adj-btn" data-dir="1" type="button" title="加 1 点">＋</button>' +
            '</div>' +
          '</div>';
      }).join('');

      box.innerHTML =
        '<div class="char-name big">' + ch.name + '</div>' +
        '<div class="char-tag">' + ch.tag + '</div>' +
        '<p class="char-intro">' + ch.intro + '</p>' +
        '<div class="char-trait"><b>' + ch.trait.name + '</b> · ' + ch.trait.desc + '</div>' +
        '<h3 class="panel-subtitle">初始属性（共 ' + budget + ' 点，可自由分配到任意属性）</h3>' +
        '<div class="adjust-budget">' +
          '<span class="budget-label">剩余点数</span>' +
          '<b class="budget-num">' + budget + '</b>' +
          '<span class="budget-hint"></span>' +
        '</div>' +
        '<div class="adjust-rows">' + rows + '</div>';

      refresh();

      box.querySelectorAll('.adj-btn').forEach(function (btn) {
        btn.onclick = function () {
          var row = btn.closest('.adjust-row');
          var k = row.getAttribute('data-stat');
          var dir = Number(btn.getAttribute('data-dir'));
          var next = selectState.alloc[k] + dir;
          if (dir > 0) {
            /* 加点：受单属性上限与总预算双重约束 */
            if (usedPoints() >= budget) return;
            if (next > maxAddOf(k)) return;
          } else if (next < 0) return;
          selectState.alloc[k] = next;
          refresh();
        };
      });

      function refresh() {
        var used = usedPoints();
        var left = budget - used;
        box.querySelectorAll('.adjust-row').forEach(function (row) {
          var k = row.getAttribute('data-stat');
          var base = baseOf(k);
          var add = selectState.alloc[k];
          var v = base + add;
          row.querySelector('.adjust-value').textContent = v;
          row.querySelector('.adjust-tier').textContent = tierOf(k, v);
          var chip = row.querySelector('.adjust-add');
          chip.hidden = add === 0;
          chip.textContent = '+' + add;
          var minus = row.querySelector('.adj-btn[data-dir="-1"]');
          var plus = row.querySelector('.adj-btn[data-dir="1"]');
          minus.disabled = (add <= 0);
          plus.disabled = (left <= 0 || add >= maxAddOf(k));
        });
        var numEl = box.querySelector('.budget-num');
        numEl.textContent = left;
        numEl.classList.toggle('empty', left === 0);
        var hint = box.querySelector('.budget-hint');
        hint.textContent = left === 0 ? '点数已分完' : '还剩 ' + left + ' 点，可分给任意属性';
        hint.classList.toggle('warn', left > 0);
        selectState.values = {};
        STAT_KEYS.forEach(function (k) { selectState.values[k] = baseOf(k) + selectState.alloc[k]; });
      }
    }

    function tierOf(k, v) {
      var tiers = GAME.STATS_META[k].tiers;
      for (var i = 0; i < tiers.length; i++) if (v <= tiers[i].max) return tiers[i].label;
      return tiers[tiers.length - 1].label;
    }

    /* ---------- 起名步骤：点「开始人生」后、进游戏前 ----------
     * 输入框限长 12（maxlength + 引擎侧再截断），去空白与默认名
     * 的规则统一在 js/name.js（PlayerNaming.sanitize），由引擎入口执行；
     * UI 只负责收集原始输入并放行。
     */
    function askName(onConfirm) {
      var overlay = $('name-modal');
      var input = $('name-input');
      input.value = '';
      overlay.hidden = false;
      setTimeout(function () { input.focus(); }, 0);

      function close() {
        overlay.hidden = true;
        input.onkeydown = null;
      }
      function done() {
        var raw = input.value;
        close();
        onConfirm(raw);
      }
      input.onkeydown = function (e) {
        if (e.key === 'Enter') { e.preventDefault(); done(); }
        else if (e.key === 'Escape') { close(); }
      };
      $('btn-name-cancel').onclick = close;
      $('btn-name-confirm').onclick = done;
    }

    $('btn-back-title').onclick = function () { UI.showScreen('title'); };
    $('btn-start-life').onclick = function () {
      if (!selectState.charId) return;
      askName(function (rawName) {
        onStart(selectState.charId, selectState.values, rawName);
      });
    };
    UI.showScreen('select');
  };

  /* ---------- 游戏页头部 ---------- */
  UI.renderGameHeader = function (char, playerName, turn, turnLimit, onRestart) {
    /* 玩家名是不可信输入：用 textContent 渲染（防 XSS） */
    $('char-chip').textContent = playerName + ' · ' + char.name;
    $('turn-chip').textContent = '第 ' + turn + ' / ' + turnLimit + ' 段';
    $('btn-restart').onclick = function () {
      if (window.confirm('确定放弃当前进度、重新开始吗？')) onRestart();
    };
    /* v4：足迹时间线入口（幂等绑定，每回合刷新无妨） */
    $('btn-timeline').onclick = function () { openTimeline(); };
    $('btn-timeline-close').onclick = function () { closeTimeline(); };
    $('timeline-scrim').onclick = function () { closeTimeline(); };
  };

  /* ---------- 左栏：数值仪表盘 + v5 短时状态区 ---------- */
  var lastStatValues = {}; // 供 .stat-num.pop 变化脉冲比对

  /* states（v5）：引擎传入的状态展示数据数组
   *   [{ name, count, remaining, icon, kind, desc, duration }]
   * 徽章 = 图标 + 名称 + 剩余回合；点击/悬停弹出说明卡（读 STATES_META.desc）。
   * 兼容：若传入的是旧的「名字→数字」映射，则按最小时长渲染，不致白屏。 */
  UI.renderStats = function (statsManager, flags, states) {
    var box = $('stats-bars');
    box.innerHTML = '';
    Object.keys(GAME.STATS_META).forEach(function (k) {
      var m = GAME.STATS_META[k];
      var v = statsManager.get(k);
      var pct = Math.round((v / (GAME.CONFIG.statMax - GAME.CONFIG.statMin)) * 100);
      var row = document.createElement('div');
      row.className = 'stat-row';
      /* 视觉规格 §8-①：内联只写 backgroundColor，CSS 的高光 background-image 才叠得上 */
      var changed = lastStatValues[k] !== undefined && lastStatValues[k] !== v;
      lastStatValues[k] = v;
      row.innerHTML =
        '<div class="stat-head">' +
          '<span class="stat-name">' + m.icon + ' ' + m.name + '</span>' +
          '<span class="stat-num' + (changed ? ' pop' : '') + '">' + v + '</span>' +
        '</div>' +
        '<div class="stat-track"><div class="stat-fill" style="width:' + pct + '%; background-color:' + m.color + '"></div></div>' +
        '<div class="stat-tier">' + statsManager.tierLabel(k) + '</div>';
      box.appendChild(row);
    });

    var entries = normalizeStateEntries(states);
    $('state-block').hidden = entries.length === 0;
    var sl = $('state-list');
    sl.innerHTML = '';
    entries.forEach(function (s) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'state-chip ' + (s.kind === 'bad' ? 'bad' : 'good');
      btn.setAttribute('data-state', s.name);
      btn.setAttribute('aria-label', s.name + '，还剩 ' + s.remaining + ' 回合，点击查看说明');
      btn.innerHTML =
        '<span class="state-icon" aria-hidden="true">' + esc(s.icon) + '</span>' +
        '<span class="state-name">' + esc(s.name) + '</span>' +
        (s.count > 1 ? '<span class="state-count">×' + s.count + '</span>' : '') +
        '<span class="state-left">' + s.remaining + '回合</span>';
      bindStateChip(btn, s);
      sl.appendChild(btn);
    });

    var flagNames = Object.keys(flags || {});
    $('flag-block').hidden = flagNames.length === 0;
    var fl = $('flag-list');
    fl.innerHTML = '';
    flagNames.forEach(function (name) {
      var el = document.createElement('span');
      el.className = 'flag-chip';
      el.textContent = name;
      fl.appendChild(el);
    });
  };

  /* 状态展示数据的归一化（引擎传数组；旧形态是 {名字: 数字}） */
  function normalizeStateEntries(states) {
    if (!states) return [];
    if (Array.isArray(states)) return states.filter(function (s) { return s && s.remaining > 0; });
    var meta = GAME.STATES_META || {};
    return Object.keys(states).map(function (name) {
      var v = states[name];
      var m = meta[name] || {};
      var count = typeof v === 'number' ? v : (v && v.count) || 0;
      var remaining = typeof v === 'number' ? (m.duration || 2) : (v && v.remaining) || 0;
      return {
        name: name, count: count, remaining: remaining,
        icon: m.icon || '•', kind: m.kind || 'good', desc: m.desc || '',
        duration: m.duration || 2,
      };
    }).filter(function (s) { return s.count > 0 && s.remaining > 0; });
  }

  /* ---------- 状态说明卡（点击/悬停状态徽章） ----------
   * 移动端：点击展开，点空白/再点一次关闭；桌面：悬停即预览，点击固定。
   * 内容 = STATES_META[name].desc + 剩余回合，说明"这意味着什么 + 还能撑多久"。
   */
  var statePop = { el: null, chip: null, pinned: false, timer: null };

  function popEl() {
    if (!statePop.el) statePop.el = $('state-pop');
    return statePop.el;
  }

  function showStatePop(chip, data) {
    var el = popEl();
    if (!el) return;
    var kindText = (data.kind === 'bad') ? '负面状态' : '正面状态';
    el.innerHTML =
      '<div class="state-pop-head">' +
        '<span class="state-icon" aria-hidden="true">' + esc(data.icon) + '</span>' +
        '<span class="state-pop-name">' + esc(data.name) + '</span>' +
        '<span class="state-pop-kind ' + (data.kind === 'bad' ? 'bad' : 'good') + '">' + kindText + '</span>' +
      '</div>' +
      (data.desc ? '<p class="state-pop-desc">' + esc(data.desc) + '</p>' : '') +
      '<p class="state-pop-meta">还剩 <b>' + data.remaining + '</b> 回合（含当前回合，共 ' +
        (data.duration || data.remaining) + ' 回合）' +
        (data.count > 1 ? ' · 已叠 ' + data.count + ' 层' : '') + '</p>';
    el.hidden = false;
    el.classList.add('show');
    statePop.chip = chip;

    /* 定位：贴着徽章下方展开（空间不够翻到上方），左右夹在视口内。
     * 选"下方"而不是"右侧"：右侧会压住事件卡里的选项文字（主内容），
     * 而下方的浮层只临时遮住侧栏里的其它徽章，移开鼠标/点空白即收起。 */
    var r = chip.getBoundingClientRect();
    var vr = el.getBoundingClientRect();
    var margin = 8;
    var left = Math.min(Math.max(margin, r.left), Math.max(margin, window.innerWidth - vr.width - margin));
    var top = r.bottom + 8;
    if (top + vr.height > window.innerHeight - margin) top = Math.max(margin, r.top - vr.height - 8);
    el.style.left = Math.round(left) + 'px';
    el.style.top = Math.round(top) + 'px';
  }

  function hideStatePop() {
    var el = popEl();
    if (!el) return;
    el.classList.remove('show');
    el.hidden = true;
    statePop.chip = null;
    statePop.pinned = false;
  }

  function bindStateChip(chip, data) {
    var hoverable = window.matchMedia && window.matchMedia('(hover: hover)').matches;

    chip.addEventListener('click', function (e) {
      e.stopPropagation();
      if (statePop.pinned && statePop.chip === chip) { hideStatePop(); return; }
      statePop.pinned = true;
      showStatePop(chip, data);
      if (window.Sfx) Sfx.play('button');
    });

    if (hoverable) {
      chip.addEventListener('mouseenter', function () {
        if (statePop.pinned) return;
        if (statePop.timer) clearTimeout(statePop.timer);
        showStatePop(chip, data);
      });
      chip.addEventListener('mouseleave', function () {
        if (statePop.pinned) return;
        statePop.timer = setTimeout(hideStatePop, 120);
      });
    }
  }

  /* 点空白关闭 / Esc 关闭（模块初始化时绑一次） */
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', function (e) {
      var el = popEl();
      if (!el || el.hidden) return;
      var t = e.target;
      if (t && t.closest && (t.closest('.state-chip') || t.closest('#state-pop'))) return;
      hideStatePop();
    }, false);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') hideStatePop();
    }, false);
    window.addEventListener('resize', function () { hideStatePop(); }, false);
    window.addEventListener('scroll', function () { hideStatePop(); }, true);
  }

  /* ---------- 右栏：事件卡 ---------- */
  UI.renderEvent = function (event, state, onChoose) {
    $('event-scene').textContent = event.scene || '';
    $('event-title').textContent = event.title;
    $('event-text').textContent = event.text;

    var box = $('event-options');
    box.innerHTML = '';
    event.options.forEach(function (op, idx) {
      var usable = window.EventRules.optionUsable(op, state);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option-btn' + (usable.ok ? '' : ' disabled');
      btn.innerHTML = '<span class="option-idx">' + 'ABCD'[idx] + '</span>' +
                      '<span class="option-text">' + op.text + '</span>' +
                      (usable.ok ? '' : '<span class="option-why">' + usable.reason + '</span>');
      if (usable.ok) {
        btn.onclick = function () {
          if (window.Sfx) Sfx.play('option');
          onChoose(idx);
        };
      } else {
        btn.disabled = true;
      }
      box.appendChild(btn);
    });
  };

  /* =========================================================
   * v4：足迹时间线（右侧抽屉）
   * 已发生（history）+ 当前事件高亮；按 scene 月份分章；
   * 同链事件（next 直连关系）同色标记；点击已发生节点回顾该次选择。
   * ========================================================= */
  var timelineData = { history: [], currentEvent: null, sceneOf: null };

  /* 链关系：从 GAME_EVENTS 的 next 字段反推（并查集），返回 { eventId: 链号 } */
  var chainsCache = null;
  function eventChains() {
    if (chainsCache) return chainsCache;
    var events = window.GAME_EVENTS || [];
    var parent = {};
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    function union(a, b) { var ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; }
    events.forEach(function (e) { parent[e.id] = e.id; });
    events.forEach(function (e) {
      (e.options || []).forEach(function (o) {
        if (o.next && parent[o.next]) union(e.id, o.next);
      });
    });
    var rootIdx = {}, count = {}, idx = 0;
    events.forEach(function (e) {
      var r = find(e.id);
      if (!(r in rootIdx)) rootIdx[r] = ++idx;
      var c = rootIdx[r];
      count[c] = (count[c] || 0) + 1;
    });
    chainsCache = {};
    events.forEach(function (e) {
      var c = rootIdx[find(e.id)];
      if (count[c] > 1) chainsCache[e.id] = c; // 单事件"链"不标记
    });
    return chainsCache;
  }

  function chapterOf(scene) {
    return String(scene || '').split('·')[0].trim() || '途中';
  }

  UI.renderTimeline = function (history, currentEvent, sceneOf) {
    timelineData = { history: history || [], currentEvent: currentEvent || null, sceneOf: sceneOf || null };
    var body = $('timeline-panel-body');
    if (!body) return;
    var chains = eventChains();
    var html = '';
    var lastChapter = '';

    function chapterHead(scene) {
      var ch = chapterOf(scene);
      if (ch === lastChapter) return '';
      lastChapter = ch;
      return '<div class="tl-chapter">' + ch + '</div>';
    }
    function chainMark(eventId) {
      var c = chains[eventId];
      return c ? '<span class="tl-chain-mark tl-c' + (c % 5) + '" title="同一条事件链"></span>' : '';
    }

    timelineData.history.forEach(function (h, i) {
      var ev = timelineData.sceneOf ? timelineData.sceneOf(h.eventId) : null;
      html += chapterHead(ev && ev.scene);
      html += '<li class="tl-item done" data-idx="' + i + '" role="button" tabindex="0">' +
        '<span class="tl-dot"></span>' +
        '<div class="tl-body">' +
          '<div class="tl-head"><span class="tl-turn">第 ' + h.turn + ' 段</span>' +
            chainMark(h.eventId) +
            '<span class="tl-title">' + h.eventTitle + '</span></div>' +
          '<div class="tl-choice">你选择了：「' + h.optionText + '」</div>' +
        '</div>' +
      '</li>';
    });

    if (timelineData.currentEvent) {
      var cur = timelineData.currentEvent;
      html += chapterHead(cur.scene);
      html += '<li class="tl-item current">' +
        '<span class="tl-dot"></span>' +
        '<div class="tl-body">' +
          '<div class="tl-head"><span class="tl-turn">进行中</span>' +
            chainMark(cur.id) +
            '<span class="tl-title">' + cur.title + '</span></div>' +
          '<div class="tl-choice">正在发生……</div>' +
        '</div>' +
      '</li>';
    }

    body.innerHTML = '<ul class="timeline tl-live">' +
      (html || '<li class="tl-empty">这局才刚开始，还没留下脚印。</li>') + '</ul>';

    /* 点击已发生节点 → 回顾该次选择（复用结果卡的回顾模式） */
    Array.prototype.forEach.call(body.querySelectorAll('.tl-item.done'), function (el) {
      var open = function () {
        var h = timelineData.history[Number(el.getAttribute('data-idx'))];
        if (!h) return;
        UI.showResultCard({
          changes: h.changes,
          flagGained: [],
          stateGained: [],
          narrate: h.narrate,
          review: { turn: h.turn, eventTitle: h.eventTitle, optionText: h.optionText },
        }, function () {});
      };
      el.onclick = open;
      el.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    });
  };

  function openTimeline() {
    var panel = $('timeline-panel');
    var scrim = $('timeline-scrim');
    if (!panel) return;
    scrim.hidden = false;
    panel.hidden = false;
    /* 先取消 hidden 再加 .open，保证 transform 过渡生效 */
    setTimeout(function () { panel.classList.add('open'); }, 16);
  }

  function closeTimeline() {
    var panel = $('timeline-panel');
    var scrim = $('timeline-scrim');
    if (!panel || panel.hidden) return;
    panel.classList.remove('open');
    scrim.hidden = true;
    setTimeout(function () {
      if (!panel.classList.contains('open')) panel.hidden = true;
    }, 320);
  }

  /* ---------- 结果卡模态 ---------- */
  /* payload: { changes: [{stat,delta,from,to,clamped?}], flagGained: [names],
   *          stateGained: [{name,delta,total}]（v4）, narrate,
   *          review?: { turn, eventTitle, optionText }（v4 时间线回顾模式） } */
  UI.showResultCard = function (payload, onClose) {
    var list = $('change-list');
    list.innerHTML = '';
    var changes = payload.changes || [];
    if (changes.length === 0) {
      list.innerHTML = '<li class="change-row none">数值没有变化</li>';
    }
    changes.forEach(function (c) {
      var m = GAME.STATS_META[c.stat];
      var cls = c.delta > 0 ? 'up' : (c.delta < 0 ? 'down' : 'flat');
      var sign = c.delta > 0 ? '+' : (c.delta < 0 ? '−' : '±');
      var arrow = c.delta > 0 ? '↑' : (c.delta < 0 ? '↓' : '');
      var li = document.createElement('li');
      li.className = 'change-row ' + cls;
      if (c.clamped) li.title = '该项被 0-100 的边界截断';
      li.innerHTML =
        '<span class="change-name">' + m.icon + ' ' + m.name + '</span>' +
        '<span class="change-delta">' + sign + Math.abs(c.delta) + '</span>' +
        '<span class="change-arrow">' + arrow + '</span>' +
        '<span class="change-to">' + c.to + '</span>';
      list.appendChild(li);
    });

    var fg = $('flag-gained');
    var gained = payload.flagGained || [];
    fg.hidden = gained.length === 0;
    fg.innerHTML = gained.length
      ? '<span class="flag-gained-label">获得印记：</span>' +
        gained.map(function (n) { return '<span class="flag-chip glow">' + n + '</span>'; }).join('')
      : '';

    /* v5：本次状态变化——「+1（持续 N 回合）」；负面状态用警示色区分 */
    var sg = $('state-gained');
    var sgained = payload.stateGained || [];
    sg.hidden = sgained.length === 0;
    sg.innerHTML = sgained.length
      ? '<span class="flag-gained-label">状态变化：</span>' +
        sgained.map(function (s) {
          var meta = GAME.STATES_META[s.name] || {};
          var kind = s.kind || meta.kind || 'good';
          var dur = s.duration || meta.duration || s.remaining || 2;
          return '<span class="state-chip glow ' + (kind === 'bad' ? 'bad' : 'good') + '">' +
            '<span class="state-icon" aria-hidden="true">' + esc(meta.icon || '•') + '</span>' +
            '<span class="state-name">' + esc(s.name) + '</span>' +
            '<b class="state-delta">+' + (s.delta || 1) + '</b>' +
            '<span class="state-dur">持续 ' + dur + ' 回合</span>' +
            '</span>';
        }).join('')
      : '';

    /* v4 回顾模式：头部与叙述改为"当时的选择 + 后果" */
    var head = document.querySelector('#result-modal .modal-head');
    if (payload.review) {
      head.textContent = '足迹回顾 · 第 ' + payload.review.turn + ' 段 ' + payload.review.eventTitle;
      $('modal-narrate').textContent =
        '你选择了：「' + payload.review.optionText + '」' + (payload.narrate ? '\n' + payload.narrate : '');
    } else {
      head.textContent = '选择的结果';
      $('modal-narrate').textContent = payload.narrate || '';
    }

    var overlay = $('result-modal');
    overlay.hidden = false;
    /* v5 音效：结果卡落下（回顾模式沿用轻一点的普通按钮音） */
    if (window.Sfx) Sfx.play(payload.review ? 'button' : 'result');
    var btn = $('btn-modal-continue');
    btn.onclick = function () {
      overlay.hidden = true;
      onClose();
    };
  };

  /* ---------- 结局页 ---------- */
  /* unlock（v3，可选）：Achievements.recordRun 的返回值
   *   { ending: 结局id或null(已解锁过), newAchievements: [ach...] } */
  UI.showEnding = function (ending, statsManager, history, char, playerName, onRestart, unlock) {
    var toneClass = 'ending-tone-' + (ending.tone || 'plain');
    var safeName = esc(playerName); // 玩家名是不可信输入，innerHTML 前必须转义
    unlock = unlock || { ending: null, newAchievements: [] };

    /* v3：图鉴结算区（不透露未解锁结局/成就的条件） */
    var col = Achievements.getCollection();
    var unlockHtml = '';
    if (unlock.ending) {
      unlockHtml += '<div class="unlock-banner">✦ 新结局已收录进图鉴</div>';
    }
    if (unlock.newAchievements && unlock.newAchievements.length) {
      unlockHtml += '<div class="unlock-ach">' +
        '<div class="unlock-ach-title">解锁成就</div>' +
        unlock.newAchievements.map(function (a) {
          return '<span class="ach-chip">' + a.name + '</span>';
        }).join('') +
      '</div>';
    }
    unlockHtml += '<div class="collect-line">图鉴进度：结局 ' +
      Object.keys(col.endings).length + ' / ' + GAME.ENDINGS.length +
      '　·　成就 ' + Object.keys(col.achievements).length + ' / ' + GAME.ACHIEVEMENTS.length + '</div>';

    var statSummary = Object.keys(GAME.STATS_META).map(function (k) {
      var m = GAME.STATS_META[k];
      var v = statsManager.get(k);
      var pct = Math.round((v / GAME.CONFIG.statMax) * 100);
      /* 视觉规格 §8-①：内联只写 background-color，高光叠层由 CSS 提供 */
      return '<div class="end-stat">' +
          '<div class="stat-head"><span class="stat-name">' + m.icon + ' ' + m.name + '</span>' +
          '<span class="stat-num">' + v + '</span></div>' +
          '<div class="stat-track"><div class="stat-fill" style="width:' + pct + '%;background-color:' + m.color + '"></div></div>' +
          '<div class="stat-tier">' + statsManager.tierLabel(k) + '</div>' +
        '</div>';
    }).join('');

    var timeline = history.map(function (h, i) {
      return '<li class="tl-item">' +
          '<span class="tl-dot"></span>' +
          '<div class="tl-body">' +
            '<div class="tl-head"><span class="tl-turn">第 ' + (i + 1) + ' 段</span>' +
            '<span class="tl-title">' + h.eventTitle + '</span></div>' +
            '<div class="tl-choice">你选择了：「' + h.optionText + '」</div>' +
          '</div>' +
        '</li>';
    }).join('');

    $('ending-wrap').innerHTML =
      '<div class="ending-banner ' + toneClass + '">' +
        '<div class="ending-kicker">— 结局 —</div>' +
        '<h1 class="ending-title">' + ending.title + '</h1>' +
        '<div class="ending-owner">' + safeName + ' · ' + char.name + ' 的一学期</div>' +
      '</div>' +
      '<div class="card ending-card">' +
        '<p class="ending-text">' + ending.text + '</p>' +
        /* v5：本局结局的达成条件（对应图鉴里的同一句文案，P2 增强） */
        (ending.condition ? '<div class="ending-cond">达成条件 · ' + esc(ending.condition) + '</div>' : '') +
      '</div>' +
      '<div class="card ending-card">' +
        '<h3 class="panel-subtitle">' + safeName + ' · ' + char.name + ' · 最终数值</h3>' +
        '<div class="end-stats">' + statSummary + '</div>' +
      '</div>' +
      '<div class="card ending-card ending-unlock-card">' + unlockHtml + '</div>' +
      '<div class="card ending-card">' +
        '<h3 class="panel-subtitle">你这学期的足迹（' + history.length + ' 次选择）</h3>' +
        '<ul class="timeline">' + (timeline || '<li class="tl-empty">这局走得太快，还没留下脚印。</li>') + '</ul>' +
      '</div>' +
      '<div class="ending-actions">' +
        '<button class="btn btn-primary btn-lg" id="btn-play-again">再来一次人生</button>' +
        '<button class="btn btn-ghost btn-lg" id="btn-ending-collection">看看图鉴</button>' +
      '</div>';

    $('btn-play-again').onclick = onRestart;
    $('btn-ending-collection').onclick = function () { UI.renderCollection(); UI.showScreen('collection'); };
    UI.showScreen('ending');
    /* v5 音效：结局页入场（三连短琶音） */
    if (window.Sfx) Sfx.play('ending');
  };

  /* ---------- 轻提示 ---------- */
  var toastTimer = null;
  UI.toast = function (msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove('show');
      t.hidden = true;
    }, 2200);
  };

  window.UI = UI;
})();
