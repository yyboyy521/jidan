/* =========================================================
 * audio.js —— 音效层（Sfx，Web Audio API 实时合成，零音频文件）
 * ---------------------------------------------------------
 * 为什么单独一个文件：
 *   ui.js 的职责是「渲染与交互反馈」，音效是另一条独立的输出通道
 *   （不碰 DOM、不持有游戏状态、可被整体静音/替换）。拆开的好处是
 *   ①引擎/UI 都不需要知道音频实现；②没有 Web Audio 的环境（老浏览器、
 *   Node 测试）加载本文件不会报错，所有调用降级为空操作。
 *
 * 模块边界：
 *   只做「播一个短音」和「静音开关」。不读游戏状态，不做流程决策。
 *
 * 对外接口：
 *   Sfx.play(name)          name: 'option' | 'button' | 'result' | 'ending'
 *   Sfx.isMuted()           -> boolean（持久化在 localStorage）
 *   Sfx.toggle()            -> boolean（切换后状态）
 *   Sfx.setMuted(flag)      -> void
 *   Sfx.mountToggle(btnEl)  把静音开关绑到某个按钮（文案/无障碍属性同步）
 *
 * 设计约束（对应 design/visual-v5.md 的"零资源红线"）：
 *   - 不引入任何 .mp3/.wav/.ogg；全部用 OscillatorNode + GainNode 现场合成。
 *   - 每个音 ≤120ms、音量低（峰值增益 ≤0.06），用指数包络避免爆音。
 *   - 浏览器自动播放策略：AudioContext 在【首次用户交互】时才创建/恢复
 *     （pointerdown / keydown / touchstart，捕获阶段，一次性）。
 *   - 静音与 prefers-reduced-motion 相互独立：减弱动效不影响音效，
 *     音效只由玩家自己的静音开关控制。
 * ========================================================= */
(function () {
  'use strict';

  /* 静音开关的持久化键（与 CONFIG.saveKey / collectionKey 同级，
   * 但不放进 data.js——它不是游戏设计数据，是播放器偏好） */
  var MUTE_KEY = 'liferoad-sfx-muted';

  var Sfx = {};

  var state = {
    ctx: null,
    muted: false,
    unlocked: false,
    failed: false,
  };

  /* ---------- 静音开关读写（localStorage 不可用时走内存） ---------- */
  function loadMuted() {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; }
  }
  function storeMuted(flag) {
    try { localStorage.setItem(MUTE_KEY, flag ? '1' : '0'); } catch (e) { /* 隐私模式忽略 */ }
  }
  state.muted = loadMuted();

  Sfx.isMuted = function () { return state.muted; };

  Sfx.setMuted = function (flag) {
    state.muted = !!flag;
    storeMuted(state.muted);
    syncToggle();
  };

  Sfx.toggle = function () {
    Sfx.setMuted(!state.muted);
    return state.muted;
  };

  /* ---------- AudioContext 惰性初始化 ----------
   * 返回 null 表示本环境不支持（调用方静默忽略）。 */
  function audioCtx() {
    if (state.failed) return null;
    if (!state.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { state.failed = true; return null; }
      try { state.ctx = new AC(); } catch (e) { state.failed = true; return null; }
    }
    /* 自动播放策略：首次交互前的上下文可能是 suspended */
    if (state.ctx.state === 'suspended') {
      try { state.ctx.resume(); } catch (e) { /* 忽略 */ }
    }
    return state.ctx;
  }

  /* 首次用户交互时解锁（捕获阶段，三事件任一命中即可） */
  function unlock() {
    if (state.unlocked) return;
    var ac = audioCtx();
    if (!ac) return;
    state.unlocked = true;
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
      document.removeEventListener(ev, unlock, true);
    });
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
      document.addEventListener(ev, unlock, true);
    });
  }

  /* ---------- 单音合成 ----------
   * freq 起始频率；dur 秒；type 波形；peak 峰值增益（音量）；
   * slide 可选的结束频率（做一点上滑音，听感更像"敲了一下"）。 */
  function tone(ac, freq, delay, dur, type, peak, slide) {
    var t0 = ac.currentTime + delay;
    var osc = ac.createOscillator();
    var gain = ac.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    if (slide && osc.frequency.exponentialRampToValueAtTime) {
      osc.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    }
    /* 指数包络：起音 8ms 到峰值，随后指数衰减到不可闻，避免"咔"的爆音 */
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /* ---------- 四个音（每个总时长 ≤120ms） ---------- */
  var SOUNDS = {
    /* 选项点击：两个快速上行音，像"发出去了" */
    option: function (ac) {
      tone(ac, 620, 0, 0.06, 'triangle', 0.05, 700);
      tone(ac, 880, 0.045, 0.055, 'triangle', 0.035);
    },
    /* 普通按钮：单音，最短最轻 */
    button: function (ac) {
      tone(ac, 520, 0, 0.055, 'sine', 0.045);
    },
    /* 结果卡弹出：一个稍低的和音，有"落下"的重量感 */
    result: function (ac) {
      tone(ac, 392, 0, 0.1, 'sine', 0.05);
      tone(ac, 587.33, 0.012, 0.09, 'sine', 0.03);
    },
    /* 结局页入场：三连音的短琶音（523/659/784），总长 120ms */
    ending: function (ac) {
      tone(ac, 523.25, 0, 0.06, 'sine', 0.05);
      tone(ac, 659.25, 0.035, 0.06, 'sine', 0.045);
      tone(ac, 783.99, 0.07, 0.05, 'sine', 0.04);
    },
  };

  Sfx.play = function (name) {
    if (state.muted) return;
    var fn = SOUNDS[name] || SOUNDS.button;
    var ac = audioCtx();
    if (!ac) return;
    try { fn(ac); } catch (e) { /* 任何音频异常都不影响游玩 */ }
  };

  /* ---------- 静音开关按钮 ---------- */
  var toggleBtn = null;

  function syncToggle() {
    if (!toggleBtn) return;
    toggleBtn.textContent = state.muted ? '🔇' : '🔊';
    toggleBtn.setAttribute('aria-pressed', state.muted ? 'true' : 'false');
    toggleBtn.setAttribute('aria-label', state.muted ? '音效已关闭，点击开启' : '音效已开启，点击静音');
    toggleBtn.title = state.muted ? '音效已关闭' : '音效已开启';
    toggleBtn.classList.toggle('muted', state.muted);
  }

  Sfx.mountToggle = function (btn) {
    if (!btn) return;
    toggleBtn = btn;
    syncToggle();
    btn.onclick = function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      var wasMuted = state.muted;
      Sfx.toggle();
      /* 开声音的那一下给个确认音（静音时本身不会有声） */
      if (wasMuted) Sfx.play('button');
    };
  };

  /* ---------- 全局按钮音（事件委托，UI 各模块不必逐个绑） ---------- */
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      /* 选项按钮自己播 option 音；静音开关自己处理（避免静音瞬间还响一声） */
      if (t.closest('#btn-sfx')) return;
      if (t.closest('.option-btn')) return;
      if (t.closest('.state-chip')) return;   // 状态徽章点击播专门的轻音（见 ui.js）
      if (t.closest('.btn, .adj-btn, .col-card, .title-links .btn-text')) Sfx.play('button');
    }, true);
  }

  window.Sfx = Sfx;
})();
