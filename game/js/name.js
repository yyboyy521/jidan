/* =========================================================
 * name.js —— 玩家起名规则（PlayerNaming，纯函数模块）
 * ---------------------------------------------------------
 * 模块边界：
 *   只管"输入框字符串 → 合法玩家名"的规则：去空白、去控制字符、
 *   限长、空则给默认名。零 DOM 依赖（ui.js 的起名框与 engine.js 的
 *   开局入口共用；冒烟测试在 Node 里直接加载本模块验证规则）。
 *
 * 对外接口：
 *   PlayerNaming.sanitize(raw) -> string   （永远返回合法名，非空）
 *   PlayerNaming.MAX_LEN                    （名字最大长度：12）
 *   PlayerNaming.DEFAULT                   （空输入的默认名：'匿名小登'）
 *
 * 注意：
 *   本模块只保证"字符串合法"，不负责防 XSS —— 渲染玩家名必须走
 *   textContent 或 HTML 转义（见 ui.js 的 esc()），两层职责不混。
 * ========================================================= */
(function () {
  'use strict';

  var MAX_LEN = 12;
  var DEFAULT_NAME = '匿名小登';

  function sanitize(raw) {
    var s = String(raw == null ? '' : raw);
    // 去空白（含全角空格等 \s 覆盖的字符）与控制字符
    s = s.replace(/\s+/g, '').replace(/[\u0000-\u001f\u007f]/g, '');
    // 限长：按码点截断，避免劈开代理对产生半个字符
    if (s.length > MAX_LEN) s = Array.from(s).slice(0, MAX_LEN).join('');
    return s || DEFAULT_NAME;
  }

  window.PlayerNaming = { MAX_LEN: MAX_LEN, DEFAULT: DEFAULT_NAME, sanitize: sanitize };
})();
