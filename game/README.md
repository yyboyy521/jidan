# 冀🥚协会青春版（网页文字选择养成游戏，原《岔路口》）

一款**纯前端**的文字选择养成游戏：选一个角色开局，在复旦新生群「冀旦协会」的
一学期群聊日常里做选择，四项数值（人际关系 / 心情 / 声望 / 精力）实时涨跌，
剧情 flag 与**有持续时间的短时状态**暗中影响后续事件与结局。

> 适合挂机摸鱼、也适合后续接入真实"聊天群记录"生成事件（接口已预留，见下文）。

---

## v6 更新摘要

- **四项数值不再保证每段全变**：人际关系与声望改为**概率生效**
  （`CONFIG.socialChangeChance = 0.6`），命中概率才结算；命中后幅度
  **×1.4**（`socialDeltaAmp`）。四维里常常只有一两项真的动了。
- **精力与心情每段隐藏随机 ±1**：每段事件结束在后台各随机 +1 或 -1
  （`CONFIG.driftStats`），**不写入结果卡、不写入选择历史**，只能从侧栏数值
  与最终结局看出来。旧版「每段固定 -1 精力」已取消（固定消耗会让低精力角色必崩）。
- **事件库扩到 76 个**：v6 新增 9 段取材真实群聊的议题——约饭邀约、考试难度吐槽、
  群主劝小登放下感情、AI 模型优劣之争、退群风波及其后续（链式解锁）、
  群里有人提起心理门诊、乱叫妈妈、微电子保研班分析。
- 平衡复核（960 局四策略）：随机 20% 崩坏 / 理性 0% / 沉默 95% / 固定首项 100%，
  理性对局仍可稳定走满 25 段。

## v5 更新摘要

- **事件库扩到 76 个**（v5 为 67：v6 新增 9 段——约饭、考试吐槽、群主劝放下、AI 模型之争、退群风波及其后续、敏感话题、乱叫妈妈、微电子保研班），
  回合上限 25 不变；五章顺序为九月·破冰 → 十月·日常 → 十一月·水群 →
  十二月·期中与演出 → 一月·散场，`order` 1-76 连续；
  全部事件**单次触发**（v4 的 5 个 `repeatable` 全部清零，引擎保留该字段兼容）。
- **状态从「永久计数」改为「有时长的短时状态」**（核心变更，见下文机制表）：
  进入时 `remaining = STATES_META[name].duration`（2-3 回合），每回合结束 -1，
  归零自动移除；同名再次触发 `count + 1` 且 `remaining` 重置（**不叠加时长**）。
  7 个状态：上头 / 瓜瘾 / 卷王附体 / 薄肌之魂（正面）、破防 / 社死 / emo（负面）。
- **状态概率化**：选项 `effects.stateChance` 是基准概率（数据侧 0.5-0.7），
  引擎实际抽取概率 = `stateChance × CONFIG.stateChanceFactor`（默认 **0.4**）。
  未命中时**静默不发状态**，结果卡不出现该行（不剧透"这次本可以挂上什么"）。
- **侧栏状态可读**：每个徽章显示「图标 + 名称 + 剩余回合」，点击/悬停弹出说明卡，
  读 `STATES_META[name].desc`（这意味着什么 + 还剩几回合）；负面状态用警示色区分。
- **结局判定只保留「终值 + 剧情印记 flag」**：状态有时长后终局残留是随机的，
  不能当刻意经营的证据，`match.states` 子句引擎仍兼容、v5 数据未使用。
- **开局微调改成「5 点自由分配」**：每项可加 0-5 点，四项合计 ≤ 5 点，
  UI 有「剩余点数」与加减置灰，`adjustCap` 仍是每项硬上限。
- **图鉴展示条件文案**：已解锁的结局 / 成就追加一行小字 `condition`
  （"怎么走到这里的"），未解锁仍只显示 `？？？`；结局页也会展示本局结局条件。
- **音效（Web Audio 实时合成，零音频文件）**：选项点击 / 按钮 / 结果卡 / 结局页
  四个短音（≤120ms、低音量），标题页右上角 🔊/🔇 开关，状态存 localStorage；
  首次用户交互时才惰性初始化 AudioContext（应对浏览器自动播放策略）。
- **手绘风 UI 与 8 个动画**：内联 SVG（data URI mask）手绘下划线 / 纸胶带 / 便签折角 /
  铅笔箭头 / 涂鸦小星 / 铅笔圈画（选中人设名）/ 手绘对勾 / 拍立得框角 + 横格纸纹理；页面进入上浮、选项逐条上浮与
  铅笔划动、结果卡贴纸落下、时间线节点呼吸、数值脉冲、状态徽章抖动、
  结局标题手写揭开、下划线绘制。全部纯 CSS/SVG，`prefers-reduced-motion` 完整降级。
- **尾声优先**：剩余回合 ≤2 时不再随机，直接取可用池里 `order` 最大的一条，
  保证学期收束感（`ev_finals` / `ev_year_end` 这类尾章事件终于能稳定出现）。
- **事件窗口 K = 12 且随进度滑动**（`CONFIG.eventWindow`）：76 段 × 25 回合下，
  窗口按 `turn / (turnLimit-1)` 的学期进度向后滑，保证十一月 / 十二月章节
  不会被永远只取池首卡死；单局仍只走 25 段，重玩才有新内容。
- **存档结构升级为 `version: 4`**：`states` 改为 `{ count, remaining }`；
  v3/v2/v1 旧档读取时视为无存档（存档键不变，图鉴收集进度不受影响）。

### v4 保留机制

- `random` 加权结果池（7 个随机选项 / 18 个变体）；`lowStat` 低谷事件权重 ×3；
  `usedIds` 计数表；足迹时间线抽屉（按 `scene` 月份分章、节点可回顾）。
- 数值有涨有跌；任一数值跌到 0 → 提前进入 4 个崩坏结局（v6 起不再有每段固定精力消耗，
  改由隐藏随机漂移与选项后果共同决定）。
- 平衡旋钮 `gainFactor`（0.9）/ `lossFactor`（1.05），角色 trait 只放大正向变化。
- 12 结局 + 12 成就图鉴收集（`CONFIG.collectionKey`，清档不影响收集）。
- 起名流程（`PlayerNaming`：去空白 / 限长 12 / 默认「匿名小登」）。

---

## 机制一览（v5）

| 机制 | 规则 | 工程落点 |
| --- | --- | --- |
| 短时状态 | 进入 `{count:1, remaining:duration}`；每回合结束 `remaining-1`，≤0 移除；同名再触发 `count+1`、`remaining` 重置 | `engine.js` `_tickStates` / `_choose` |
| 状态概率 | 实际概率 = `effects.stateChance × CONFIG.stateChanceFactor(0.4)`；未命中静默 | `engine.js` `stateChanceOf` |
| 状态对外的口径 | 事件 `requires.states`、结局 `match.states`、成就 `run.states` 一律只读「仍生效状态的 count」 | `engine.js` `_activeStateCounts` |
| 开局分配 | 四项各加 0-5 点、合计 ≤5 点、只加不减；UI 与引擎双重校验 | `ui.js` `renderCharSelect` + `stats.js` `clampInitialValues` |
| 结局判定 | 终值 + flag；崩坏结局（任一数值归零）排在最前 | `endings.js` |
| 事件选取 | 事件链 `next` 最高优先 → 剩余 ≤2 回合取 `order` 最大可用事件 → 否则窗口（K=12）加权随机 | `events.js` `pickNext` |
| 音效 | 4 个合成短音 + 全局静音开关（localStorage），首次交互解锁 AudioContext | `js/audio.js`（`window.Sfx`） |
| 手绘 / 动画 | 内联 SVG mask + CSS keyframes，只动 `transform`/`opacity`，`backwards` 填充 | `css/style.css` 第 27 节起 |

---

## 如何运行

**双击 `index.html` 即可**（file:// 协议直接可玩，无需服务器、无需安装任何东西）。

- 技术栈：纯 HTML + CSS + 原生 JS（ES2017+），零依赖、零构建、无 npm 包、无音频/图片素材（手绘元素是内联 SVG，音效是 Web Audio 现场合成）。
- 存档为可选功能：自动写入浏览器 localStorage（隐身模式下自动降级，不影响游玩）。
- 音效需要浏览器支持 Web Audio（现代浏览器均支持）；不支持时静默无声，不影响游玩。
- 推荐 Chrome / Edge / Firefox 最新版。
- 逻辑层冒烟测试（Node，可选）：`node tests/smoke-test.js`。

---

## 目录结构

```
game/
├── index.html            入口页（按依赖顺序用普通 <script> 加载各模块）
├── README.md             本文件
├── css/
│   └── style.css         全部视觉层（v4 基线 + v5 手绘/动画增量层）
├── js/
│   ├── data.js           静态设计数据：全局配置、数值元信息、状态元信息、4 个角色预设
│   ├── data/
│   │   └── events.js     事件数据（v6：76 个事件，纯数据，挂 window.GAME_EVENTS）
│   ├── stats.js          StatsManager：数值存取 / 增减 / 0-100 封顶保底 / 开局 5 点分配兜底
│   ├── name.js           玩家起名规则（纯函数：去空白 / 限长 12 / 默认名，无 DOM 依赖）
│   ├── events.js         EventEngine：事件选取（尾声优先 + 窗口加权随机）/ 条件判定 / 事件链
│   ├── endings.js        12 个结局数据 + EndingResolver（终值 + flag，兼容 match.states）
│   ├── achievements.js   成就系统与结局收集（localStorage 持久化）
│   ├── chat-import.js    聊天记录导入模块（预留接口 + 数据契约 + 校验器）
│   ├── audio.js          Sfx：Web Audio 合成音效 + 静音开关（无音频文件）
│   ├── ui.js             UIController：纯渲染层，不持有游戏状态
│   └── engine.js         Game 主控：状态机、流程推进、状态生命周期、存档 v4
└── tests/smoke-test.js   逻辑层冒烟测试（Node）
```

**模块边界一句话版**：`engine.js` 是唯一持有游戏状态的地方；`ui.js` 只渲染、
`stats.js` 只算数、`events.js` 只选事件、`audio.js` 只发声、`name.js` 只管起名规则、
`data*` 只放数据。改游戏内容动 `js/data/`，改玩法规则动引擎三件套，改外观动 `css/`。

---

## 事件 JSON Schema（v5）

```jsonc
{
  "id": "ev_water",            // 唯一 ID（事件链 next 引用它）
  "order": 31,                 // 窗口随机的排序依据（尾声优先也看它）
  "scene": "十一月 · 水群",     // 场景标签（时间线按「·」前月份分章）
  "title": "「平平无奇的水群」",
  "text": "事件正文……",
  "once": true,                // 默认 true；false = 不限次数
  "repeatable": 2,             // 【可选】可重复次数（v5 数据已全部单次，引擎兼容）
  "weight": 2,                 // 【可选】窗口内相对权重（默认 1）
  "lowStat": { "stat": "energy", "below": 30 }, // 【可选】该数值 < below 时权重 ×3
  "requires": {                // 【可选】事件解锁条件，全满足才进池
    "stats":    { "energy": [0, 25] }, // 数值区间 [min,max]；单数值 n = [n,100]
    "flags":    ["帮过同事"],           // 需全部拥有
    "notFlags": ["潜水惯了"],           // 需全部不存在
    "states":   { "卷王附体": 2 }        // 【v5】「仍生效状态」的层数 ≥ 该值
  },
  "options": [                 // 2-4 个选项，后果对玩家隐藏
    {
      "text": "选项文案",
      "silent": true,                  // 【可选】沉默类选项标记（成就统计用）
      "requires": { "stats": { "energy": 40 } },   // 【可选】选项级门槛（禁用并显示原因）
      "effects": {
        "stats":  { "relation": 8, "mood": -4 }, // 数值增量（有涨有跌）
        "flags":  { "帮过同事": true },            // flag 写入（false = 移除）
        "states": { "上头": 1 },                   // 【v5】短时状态：层数 +1、时长重置
        "stateChance": 0.6,                        // 【v5】状态基准概率（×0.4 后为实际概率）
        "narrate": "结果卡中展示的后果叙述"          // 可省略
        // 【v4】或用随机结果池替代上述直接效果（互斥）：
        // "random": [
        //   { "weight": 2, "stats": {…}, "flags": {…}, "states": {…},
        //     "narrate": "…", "next": "ev_xxx" }
        // ]
      },
      "next": "ev_thanks"      // 【可选】强制下一跳；null/省略 = 按默认流程
    }
  ]
}
```

stat 合法键（与 `js/data.js` 的 `GAME.STATS_META` 对应）：
`relation`（人际关系）、`mood`（心情）、`fame`（声望）、`energy`（精力）。
状态名必须在 `GAME.STATES_META` 中有定义（v5 实装 7 个），未定义的状态名会以
`duration=2 / kind=good / 无说明文案` 的兜底形态生效（不会崩，但侧栏没有解释）。
**凡带 `states` 的选项都应显式写 `stateChance`**（数据侧已全量校验，缺省按 1 计）。

### 数值联动 / 分支验证点（v5 代表性）

| 分支 | 触发条件 | 效果 |
| --- | --- | --- |
| 筷子失踪案 `ev_takeout` | flag `旦苑受害者`（在「旦苑修罗场」选骂旦苑） | flag 驱动解锁 |
| 你群太低质 `ev_chat200` | 声望 ≤ 40，`lowStat fame<30` 权重 ×3 | 数值低谷窗口事件 |
| 体测封神 `ev_fitness3` | flag `mol过` 且 精力 ≥ 50（v5 不再用状态计数当门槛） | flag + 数值组合 |
| 深夜同伙 `ev_nightowl` | 精力 ≤ 45，`lowStat energy<30` ×3 | 低谷 + 低谷加权 |
| 群聊顶流 `ev_hightlight` | 声望 ≥ 72 | 数值高点事件 |
| 第一次上台 `ev_show` | flag `进过琴房` 且 声望 ≥ 45 | flag + 数值组合 |
| 外号线 `ev_nickname` | 人际 ≥ 25（v5 放宽，不再绑「报过到」） | 让潜水线也能拿到 `有外号` |

结局判定示例（v5：终值 + flag）：
`end_pet` = 人际 ≥ 85 且 flag `有外号`；
`end_top` = 声望 ≥ 85 且 flag `卷过`；
`end_gym` = 精力 ≥ 50 且 flag `mol过`；
`end_melon` = 人际 ≥ 60 且 flag `网恋军师`。

---

## 聊天记录导入（chat-import.js 数据契约）

后续接入真实聊天群记录时，**不需要改引擎**，只实现 `js/chat-import.js` 里的
3 个 TODO 函数即可。契约全文同时写在 `js/chat-import.js` 文件头部注释。

**输入**：一个文件夹，内含聊天记录文件（每个文件 = 一个群的导出）：

- `.txt` 纯文本（微信/QQ 导出、复制粘贴均可）：

  ```
  2024-03-01 09:12 张三
  今天谁去自习？
  2024-03-01 09:15 李四
  我我我
  ```
  解析规则：逐行扫描识别"日期 时间 发送者"行，其后连续非空行为该条消息正文。

- `.json` 结构化导出：

  ```json
  { "groupName": "自习室", "messages": [
      { "time": "2024-03-01 09:12", "sender": "张三", "content": "今天谁去自习？" }
  ] }
  ```

**中间结构（RawMessage）**：`{ time, sender, content }`

**输出**：标准事件 JSON 数组（即上文 Schema），要求每个事件通过
`ChatImporter.validateEvent()` 校验；建议 id 加来源前缀防冲突（如 `chat_<群名>_001`）。

**转换建议**（`buildEventsFromMessages` 的 options 预留）：

- `splitRule`：话题切分规则（按空行间隔 / 固定条数 / 关键词）
- `optionCount`：每事件产出选项数（2-4）
- `senderMapping`：发言人 → 选项来源的映射
- 连续讨论 → 事件 `text`；不同人的代表性发言 → 各选项 `text`；
  数值效果可人工补写，或接入 LLM 辅助生成后走校验器把关。

**接入方式**：

```js
ChatImporter.importFromFolder(dirHandleOrPath).then(function (events) {
  // 追加：
  window.GAME_EVENTS = window.GAME_EVENTS.concat(events);
  // 或整体替换：
  window.GAME_EVENTS = events;
});
```

也可以不动全局，直接用主控预留的入口（第 4 个参数可选：玩家名，走同一套
起名 sanitize 规则）：

```js
game.startWithEvents(importedEvents, 'memedealer', { relation: 63, mood: 54, fame: 44, energy: 27 }, '游承峰');
```

`ChatImporter.validateEvent / validateAll` 已完整实现，转换器开发时即可复用做质量把关
（扩展字段 repeatable / weight / lowStat / states / stateChance / random 不影响校验通过）。

---

## 为什么事件数据是 JS 变量而不是 data/events/*.json？

`file://` 协议下浏览器会以 CORS 策略拦截 `fetch()` 读本地 JSON（也会拦 ES module
import），导致双击 index.html 白屏。因此本框架：

- 事件数据放在 `js/data/events.js`，挂全局变量 `window.GAME_EVENTS`，结构与 JSON 完全同构；
- 脚本加载用普通 `<script>` 按序加载（依赖顺序 = 加载顺序），不用 import。

**部署到 http(s) 后想切回 JSON 加载**（结构零改动）：

1. 把 `js/data/events.js` 的数组原样存成 `data/events/events.json`；
2. 在 `index.html` 里删掉该 `<script>`；
3. 在 `engine.js` 的 `Game` 构造里把同步取数改为：

   ```js
   fetch('data/events/events.json').then(function (r) { return r.json(); })
     .then(function (events) { window.GAME_EVENTS = events; /* 再 new Game() */ });
   ```
4. chat-import 的输出同样天然兼容两种数据源。

---

## 后续扩展点

- **新角色**：往 `GAME.CHARACTERS`（`js/data.js`）加对象即可，至少 1 个就能开局。
- **新数值**：在 `GAME.STATS_META` 增加键 + 分档文案，事件 `effects.stats` 直接可用
  （stat 键名是全局契约，重命名需同步事件数据与本 README）。
- **新状态**：`GAME.STATES_META` 加一条（`duration` / `kind` / `icon` / `desc`），
  事件 `effects.states` 写同名键 + `stateChance` 即生效；侧栏徽章与说明卡自动适配。
- **新事件 / 事件链**：往 `GAME_EVENTS` 加对象即可；`next` 织链，`weight / lowStat`
  控制节奏；注意 `order` 决定它在窗口与「尾声优先」里的位置。
- **新结局**：往 `GAME.ENDINGS` 头部插入对象（数组顺序 = 判定优先级，
  最后一条保持空 `match` 作兜底）；`condition` 会显示在已解锁的图鉴卡上。
- **调平衡**：`CONFIG.gainFactor / lossFactor`（数值幅度）、
  `CONFIG.eventWindow`（事件随机窗口，调 1 = 退化为严格 order 顺序）、
  `CONFIG.stateChanceFactor`（状态密度，调 1 = 回到数据侧的基准概率）。
- **调音效**：`js/audio.js` 的 `SOUNDS` 表里每个音是一个函数（频率/时长/波形），
  改参数即可换手感；静音键名是 `liferoad-sfx-muted`（localStorage）。

## 已知取舍（file:// 限制）

- 事件数据用 JS 变量承载（理由见上一节），JSON 目录 `data/events/` 留空为正式部署预留；
- 无构建 / 无压缩 / 无 npm——这是"双击即玩"的直接代价，换来零环境依赖；
- 音效不使用音频文件，音色由振荡器合成（风格极简，换来零资源与零加载）；
- localStorage 存档在同浏览器同路径下共享，清浏览器数据会丢档（属预期，存档非运行前提）；
- 存档结构为 `version: 4`，v1-v3 旧档读取时直接视为无存档（图鉴收集进度独立保存，不受影响）；
- 手绘装饰在极窄屏（≤380px）与 `@media (update: slow)` 的低端设备上会隐藏，
  只保留"识别核心"（事件标题下划线、选中对勾、当前节点呼吸）。
