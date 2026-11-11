/* =========================================================
 * chat-import.js —— 聊天群记录导入模块（预留接口，本次不接真实数据）
 * ---------------------------------------------------------
 * 模块边界：
 *   独立模块。负责"外部聊天记录 → 标准事件 JSON"的转换。
 *   引擎（events.js / engine.js）完全不依赖本模块；
 *   后续接入真实聊天记录时，只需实现下面的 TODO 函数，
 *   把转换结果 push 进 window.GAME_EVENTS（或替换之），零侵入。
 *
 * ============ 数据契约（输入 → 输出） ============
 *
 * 【输入】指定文件夹内的聊天记录文件（每个文件 = 一个聊天群导出）：
 *   支持的推荐格式（二选一，或两者混合）：
 *   A. 纯文本 .txt（微信/QQ 手动导出、复制粘贴均可），形如：
 *        2024-03-01 09:12 张三
 *        今天谁去自习？
 *        2024-03-01 09:15 李四
 *        我我我
 *      —— 解析规则：按行扫描，识别"日期 时间 发送者"行，
 *         其后连续的非空行视为该消息正文。
 *   B. JSON .json（机器人/工具导出），形如：
 *        { "groupName": "…", "messages": [
 *            { "time": "2024-03-01 09:12", "sender": "张三", "content": "今天谁去自习？" }
 *        ] }
 *
 * 【中间结构】RawMessage：
 *   { time: '2024-03-01 09:12', sender: '张三', content: '今天谁去自习？' }
 *
 * 【输出】标准事件 JSON（与 js/data/events.js 的 GAME_EVENTS 完全同构，
 *   schema 见该文件头部注释，此处不重复定义）。要求：
 *   - 每个转换出的事件必须通过 validateEvent() 校验；
 *   - id 建议带来源前缀防冲突，如 'chat_<群名>_001'；
 *   - 事件之间的 nextEventId 由转换规则生成（见 buildOptions 约定）。
 *
 * 【总入口】ChatImporter.importFromFolder(folderDescription, options)
 *   folderDescription：后续版本的文件夹句柄/路径（如 File API 的
 *   directory picker、服务端的文件夹路径等，由接入方决定）。
 *   返回 Promise<EventJson[]>。
 *
 * ============ 使用示例（未来接入时） ============
 *   ChatImporter.importFromFolder(dirHandle).then(function (events) {
 *     window.GAME_EVENTS = window.GAME_EVENTS.concat(events);
 *     // 或替换：window.GAME_EVENTS = events;
 *   });
 * ========================================================= */
(function () {
  'use strict';

  var ChatImporter = {};

  /* ---------- 1. 文件解析（TODO：本次预留） ----------
   * parseChatFile(rawText, meta) -> RawMessage[]
   * rawText：文件内容字符串（.txt 或 .json 的原文）
   * meta：{ fileName, groupName? }
   */
  ChatImporter.parseChatFile = function (rawText, meta) {
    throw new Error(
      '[chat-import] parseChatFile 尚未实现：请按文件头部注释的契约，' +
      '将聊天记录文本解析为 RawMessage[]（{time, sender, content}）。' +
      '本次交付为预留接口，不接入真实数据。'
    );
  };

  /* ---------- 2. 事件转换（TODO：本次预留） ----------
   * buildEventsFromMessages(messages, options) -> EventJson[]
   * messages：RawMessage[]
   * options（建议支持，具体由实现者定义）：
   *   - splitRule：如何切分事件（按话题空行 / 按固定条数 / 按关键词）
   *   - optionCount：每个事件产出几个选项（2-4，默认 2）
   *   - senderMapping：发送者 → 角色/选项的映射表
   * 转换约定：聊天中的连续讨论 → 一个事件的 text；
   *           不同人的代表性发言 → 各选项的 text；
   *           数值效果可由人工后期在 JSON 上补充，或接入 LLM 辅助生成。
   */
  ChatImporter.buildEventsFromMessages = function (messages, options) {
    throw new Error(
      '[chat-import] buildEventsFromMessages 尚未实现：请按契约将 RawMessage[] ' +
      '组装为标准事件 JSON（必须通过 validateEvent 校验）。'
    );
  };

  /* ---------- 3. 总入口（TODO：本次预留） ----------
   * importFromFolder(folderDescription, options) -> Promise<EventJson[]>
   */
  ChatImporter.importFromFolder = function (folderDescription, options) {
    return Promise.reject(new Error(
      '[chat-import] importFromFolder 尚未实现：接入真实聊天记录时，' +
      '遍历文件夹 → parseChatFile → buildEventsFromMessages → 返回事件数组。' +
      'README.md「聊天记录导入」一节有完整契约说明。'
    ));
  };

  /* ---------- 4. 事件校验（已实现，转换器可直接复用） ----------
   * validateEvent(event) -> { ok: boolean, errors: string[] }
   * 按标准事件 schema 做结构校验，错误信息可直接展示给转换器开发者。
   */
  var STAT_KEYS = ['relation', 'mood', 'fame', 'energy'];

  ChatImporter.validateEvent = function (ev) {
    var errors = [];
    if (!ev || typeof ev !== 'object') { return { ok: false, errors: ['事件必须是对象'] }; }
    if (!ev.id || typeof ev.id !== 'string') errors.push('缺少字符串型 id');
    if (typeof ev.order !== 'number') errors.push('缺少数字型 order');
    if (!ev.title || typeof ev.title !== 'string') errors.push('缺少 title');
    if (!ev.text || typeof ev.text !== 'string') errors.push('缺少 text');
    if (!Array.isArray(ev.options) || ev.options.length < 2 || ev.options.length > 4) {
      errors.push('options 必须是 2-4 个选项的数组');
    } else {
      ev.options.forEach(function (op, i) {
        if (!op.text || typeof op.text !== 'string') errors.push('选项 ' + (i + 1) + ' 缺少 text');
        var eff = op.effects || {};
        var stats = eff.stats || {};
        Object.keys(stats).forEach(function (k) {
          if (STAT_KEYS.indexOf(k) < 0) {
            errors.push('选项 ' + (i + 1) + ' 的 effects.stats 含未知键 "' + k + '"（合法键：' + STAT_KEYS.join('/') + '）');
          }
        });
        if (op.next !== undefined && op.next !== null && typeof op.next !== 'string') {
          errors.push('选项 ' + (i + 1) + ' 的 next 必须是字符串或 null');
        }
      });
    }
    if (ev.requires && ev.requires.stats) {
      Object.keys(ev.requires.stats).forEach(function (k) {
        if (STAT_KEYS.indexOf(k) < 0) errors.push('requires.stats 含未知键 "' + k + '"');
      });
    }
    return { ok: errors.length === 0, errors: errors };
  };

  /* 便捷方法：批量校验 */
  ChatImporter.validateAll = function (events) {
    var bad = [];
    (events || []).forEach(function (ev) {
      var r = ChatImporter.validateEvent(ev);
      if (!r.ok) bad.push({ id: ev && ev.id, errors: r.errors });
    });
    return { ok: bad.length === 0, invalid: bad };
  };

  window.ChatImporter = ChatImporter;
})();
