# 《岔路口》（《冀🥚协会青春版》）v4 视觉与排印优化规格

> 产出：林绘澄（art-director） ｜ 面向：程基岩（工程实现）
> 现状基线：`game/css/style.css`（v3 全部样式）、`game/index.html`、`game/js/ui.js`
> 总原则：**增量改造**。不重构 DOM、不改 class 命名（只新增）、不引入任何外部资源（无网络字体/图片/icon 库）、不新增构建步骤。所有数值可直接抄进 CSS。

---

## 1. 设计方向

**一句话概念**：熄灯后的宿舍，一块被手指捂热的群聊屏幕——暖光、纸感、气泡。

**三个关键词**：`群聊气泡` · `深夜微光` · `轻喜剧纸感`

**参考气质**：
- 微信聊天页的气泡节奏（选项按钮 = 你即将发出的消息气泡）；
- 深夜手机屏幕的微光（标题页/结局横幅的柔和光晕，纯 CSS 渐变实现）；
- 校园手写通知栏的纸张感（卡片细边 + 暖米底色，保持现有基因）。

**不做主题颠覆**：整体仍是浅色暖底，四数值色保留（见 1.2），玩家熟悉的一切语义不动。

### 1.1 色板（新增/调整项全部给色值）

| 角色 | 变量 | 色值 | 说明 |
|---|---|---|---|
| 主文字 | `--ink` | `#262335`（原 `#2d2a3f` 加深） | 白底对比度 ≈14:1 |
| 次级文字 | `--ink-soft` | `#5d5975`（原 `#6b6880` 加深） | 白底 ≈6.6:1，正文辅助均达标 |
| 三级标签文字 | `--ink-mute`（新增） | `#76738c` | 白底 ≈4.6:1，给 12px 标签/scene/页脚用，替换散落的 `#a3a0b2`/`#b8b4c4`/`#a9a5b8` |
| 背景渐变起点 | `--bg-a` | `#f8f4ec` | 暖米（微调提亮） |
| 背景渐变终点 | `--bg-b` | `#eaeef7` | 冷灰蓝（微调提亮） |
| 卡片 | `--card` | `#ffffff` | 不变 |
| 描边 | `--line` | `#e6e3da` | 微调 |
| 主色 | `--primary` | `#4a5fd0` | **不动**（玩家已熟悉，白底文字对比 ≈5.4:1 达标） |
| 主色-按压 | `--primary-dark` | `#3a4bb0` | 不动 |
| 上升 | `--up` | `#2f9e77` | 不动（仅用于大号粗体数字，19px/800，符合大字号 ≥3:1） |
| 下降 | `--down` | `#d64550` | 不动（同上） |
| 气泡底（选项） | `--bubble`（新增） | `#fdfdfc` | 选项按钮默认底 |
| 气泡底-hover | `--bubble-hover`（新增） | `#f4f5ff` | |
| 轨道底 | `--track`（新增） | `#edebe5` | 进度条轨道 |
| 圆角 | `--radius` | `16px` | 不变 |
| 阴影 | `--shadow` | `0 10px 30px rgba(38,35,53,.08), 0 2px 6px rgba(38,35,53,.05)` | 随 --ink 同步 |

### 1.2 四数值专属色（**保持原值，只允许做"质感叠加"，不改色相**）

| 数值 | 色值 | 用途边界 |
|---|---|---|
| 👥 人际关系 | `#d9537c` | 仅作进度条填充/小圆点（非文字） |
| 🌤 心情 | `#d9912b` | 同上 |
| 🏆 声望 | `#7a5af8` | 同上 |
| ⚡ 精力 | `#2f9e77` | 同上 |

> 工程注意：这四色由 JS 内联 `style="background:COLOR"` 写入（ui.js L313、L434），详见 §8-① 的改法。

### 1.3 点缀色（群聊气质的少量跳色）

- 印记/成就暖金：文字 `#8a5a2c`、底 `#faf2e4`、边 `#ecd9b6`（沿用现状，已协调）。
- 解锁提示蓝：底 `#eef4ff`、文字 `#3a56c4`（沿用）。
- 人设紫（char-chip / option-idx / char-trait）：文字 `#5b4a9e`、底 `#f1eefb`（沿用，统一为三处同源）。

---

## 2. 字体排印

### 2.1 字体栈（替换 `--font`）

```css
--font: system-ui, -apple-system, "Segoe UI", "PingFang SC",
        "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
```

数字统一规则：所有显示数值的元素加

```css
font-variant-numeric: tabular-nums;
font-feature-settings: "tnum" 1;
```

应用点（现有类直接追加）：`.stat-num`、`.adjust-value`、`.turn-chip`、`.change-delta`、`.change-to`、`.tl-turn`、`.mini-stat`、`.collect-line`。**不设等宽西文字体**，靠 tabular-nums 即可。

### 2.2 字号阶（px / 行高 / 字重）

| 层级 | 用于 | 字号 | 行高 | 字重 | 字距 |
|---|---|---|---|---|---|
| Display | `.title-logo` | `clamp(52px, 10vw, 88px)` | 1.15 | 800 | .12em |
| H1 | `.page-head h1` | 26（移动 22） | 1.35 | 800 | .04em |
| 卡标题 | `.event-title` | 24（移动 20） | 1.4 | 800 | .02em |
| 结局标题 | `.ending-title` | `clamp(32px, 6vw, 48px)` | 1.25 | 800 | .06em |
| 面板题 | `.panel-title` | 15 | 1.5 | 700 | .10em |
| 正文 | `.event-text`、`.ending-text` | 16（移动 15.5） | **1.95**（原 2.05 偏飘） | 400 | 0 |
| 次正文 | `.notice-card p`、`.modal-narrate`、`.char-intro` | 14.5 → 统一 **14** | 1.9 | 400 | 0 |
| 辅助 | `.char-quote`、`.tl-choice`、按钮 | 15 / 14 | 1.6 | 400/600 | 0 |
| 标签 | `.event-scene`、`.panel-subtitle`、`.stat-tier` | 12 | 1.5 | 600–700 | .14em |
| 数字强调 | `.stat-num` | 16 | — | 800 | 0 |
| 结果数字 | `.change-delta` | 19（移动 17） | — | 800 | 0 |

### 2.3 字重规则
- 只允许 400 / 600 / 700 / 800 四档（不用 500，系统字重渲染不稳）。
- 正文 400；强调短语与 chip 600；面板/卡片标题 700；Display、H1、数值 800。

### 2.4 字距规则
- 中文正文：**0**（不要给中文正文加 letter-spacing）。
- 宽字距（≥.1em）只允许用于**单行短标签**（scene、副标题、kicker），且必须做"末字空白补偿"：元素上加 `text-indent: 与letter-spacing同值`，否则居中视觉偏左。涉及：`.title-sub`（.3em）、`.ending-kicker`（.5em→改 .4em + `text-indent:.4em`）、`.event-scene`（.22em→.14em + `text-indent:.14em`）。
- `text-transform: uppercase` 对中文无效，从 `.event-scene` 删除。

---

## 3. 组件级优化清单

### ① 标题页
- **问题**：`.title-sub` 字距 .3em 居中偏左；页面无视觉焦点层；按钮与底色衔接生硬。
- **改法**：
  1. `.title-sub` 加 `text-indent: .3em;`。
  2. `.title-wrap` 加 `position: relative;`，新增伪元素微光（纯 CSS，静态不动画）：
     ```css
     .title-wrap::before {
       content: ''; position: absolute; z-index: -1;
       left: 50%; top: 38%; width: min(560px, 92vw); height: 320px;
       transform: translate(-50%, -50%);
       background: radial-gradient(ellipse at center,
         rgba(122, 90, 248, .12) 0%, rgba(74, 95, 208, .07) 45%, transparent 70%);
       border-radius: 50%;
     }
     ```
  3. `.title-logo` 渐变保留；加 `padding: 0 .08em;` 防 `background-clip: text` 在部分浏览器裁掉边缘笔画。
  4. `.title-tag` 色值 `#a9a5b8` → `var(--ink-mute)`；`.title-foot` 同理。
  5. `.btn-lg.btn-primary` 投影改为 `0 6px 16px rgba(74,95,208,.28)`（hover 时 `0 10px 24px rgba(74,95,208,.36)`），比现状柔和。

### ② 角色卡（选角页）
- **问题**：选中态只有描边+外环，扫读时不够"已锁定"；hover 浮起在触屏无对应反馈。
- **改法**：
  1. `.char-card.selected` 追加角标感：`box-shadow: 0 0 0 3px rgba(74,95,208,.18), var(--shadow);` 保留，**新增**：
     ```css
     .char-card.selected { background: linear-gradient(180deg, #f7f7ff 0%, #fff 42%); }
     .char-card.selected .char-name::after {
       content: '✓'; margin-left: 8px; font-size: 14px; color: var(--primary);
     }
     ```
  2. `.char-quote` 禁止用 `font-style: italic`（中文伪斜体难看），用颜色区分即可：`color: var(--ink-soft)`（已是）。
  3. `.char-stats-mini .mini-stat i` 圆点 8px → **9px**，`border-radius: 3px` 保留（小方块比圆点更像图例）。
  4. `.adj-btn` hover 底色 `#f0eef9` → `#eef0fd`，边色 `#c9c5f0` → `#b9bcf0`（与主色同族）。

### ③ 数值仪表盘（进度条质感）
- **问题**：纯色填充条"贴片感"重；轨道与卡面对比弱；数值跳动无反馈。
- **改法**：
  1. 轨道加内凹：
     ```css
     .stat-track { background: var(--track); box-shadow: inset 0 1px 2px rgba(38,35,53,.10); }
     ```
  2. 填充条加高光叠层（需工程配合，见 §8-①：JS 内联从 `background:` 改为 `background-color:`，CSS 才能叠 `background-image`）：
     ```css
     .stat-fill {
       background-image: linear-gradient(180deg,
         rgba(255,255,255,.30) 0%, rgba(255,255,255,0) 60%);
       box-shadow: inset 0 -1px 0 rgba(0,0,0,.08);
     }
     ```
  3. `.stat-num` 加变化脉冲（JS 已有重渲染，纯 CSS 即可）：
     ```css
     @keyframes statPop { 0% { transform: scale(1); } 40% { transform: scale(1.18); } 100% { transform: scale(1); } }
     .stat-num { display: inline-block; }
     .stat-num.pop { animation: statPop .35s ease-out; }
     ```
     （工程侧可选：重渲染时给 `.stat-num` 加 `pop` 类；不加也不破坏。）
  4. `.panel-title`「此刻的你」加 `display:flex; align-items:center; gap:8px;`，前置装饰：`::before { content:''; width:4px; height:14px; border-radius:2px; background: var(--primary); }`。

### ④ 事件卡
- **问题**：scene 标签灰度太浅且字距过大；正文行长不受控（宽屏一行过长）；选项按钮是"列表项"而不是"你要说的话"。
- **改法**：
  1. `.event-scene`：`color: var(--ink-mute); letter-spacing: .14em; text-indent: .14em;` 删除 `text-transform: uppercase`；新增月份标记点：
     ```css
     .event-scene { display: flex; align-items: center; gap: 8px; }
     .event-scene::before { content:''; flex:none; width:6px; height:6px; border-radius:2px; background: var(--primary); }
     ```
  2. `.event-text`：`line-height: 1.95; color: #34314a; max-width: 36em;`（中文 36em ≈ 36 字/行，宽屏不再拉成超长行）。
  3. **选项按钮气泡化**（核心气质改动）：
     ```css
     .option-btn {
       border-radius: 14px 14px 14px 5px;   /* 左下小角 = 气泡尾巴 */
       background: var(--bubble);
       border: 1.5px solid var(--line);
       padding: 15px 18px;                   /* 不变 */
     }
     .option-btn:hover:not(.disabled) {
       border-color: var(--primary);
       background: var(--bubble-hover);
       transform: translateX(4px);           /* 桌面保留 */
       box-shadow: 0 6px 18px rgba(74,95,208,.14);
     }
     .option-btn:active:not(.disabled) { transform: translateX(4px) scale(.99); }
     .option-btn.disabled { opacity: .5; background: #f6f5f2; border-style: dashed; }
     ```
     - 置灰态：`.option-why` 色 `#b0453f` → `#a53f39`（对比更稳），`flex-basis:100%; margin-left:42px` 的换行规则从 560px 媒体查询**提升为全局**（桌面宽卡下 reason 也换行，不与选项文字挤一行）。
  4. `.option-idx` 圆角 9px → 8px，底色 `#efedf8` → `#eef0fb`；hover 反白规则保留。

### ⑤ 结果卡模态
- **问题**：变化行用 flex，三列（增减/箭头/新值）宽度随内容抖；模态无层次。
- **改法**：
  1. `.change-row` 改 grid 定宽列：
     ```css
     .change-row {
       display: grid; grid-template-columns: 1fr 64px 20px 48px;
       align-items: baseline; gap: 4px 10px; padding: 11px 4px;
     }
     .change-delta { text-align: right; }
     .change-arrow { text-align: center; }
     .change-to { text-align: right; }
     ```
  2. `.modal-head` 加前置装饰同 `.panel-title::before`（4×14px 主色条）。
  3. `.modal-card` 顶边加一条 3px 渐变带（暗示"结果"仪式感）：
     ```css
     .modal-card { position: relative; overflow: hidden; }
     .modal-card::before {
       content:''; position:absolute; top:0; left:0; right:0; height:3px;
       background: linear-gradient(90deg, var(--primary), #8a5fd0, #d9537c);
     }
     ```
  4. `.modal-overlay` 背景 `rgba(30,27,45,.45)` → `rgba(28,25,42,.52)`，blur 3px 保留（backdrop-filter 性能可接受，仅模态出现时使用）。

### ⑥ 事件时间线面板（v4 新增）⭐
- **定位**：游戏进行中可随时查看「本学期走到哪了」。数据侧每个事件已有 `scene: '九月 · 破冰'` 格式，**章节 = scene 中「·」前的月份**（九月/十月/十一月/十二月/一月），工程侧按此分组即可，无需新数据字段。
- **入口**：`.game-head-right` 中「重新开始」左侧新增按钮 `<button class="btn btn-ghost btn-sm" id="btn-timeline">📜 足迹</button>`。
- **布局方案（抽屉式，不动现有栅格）**：
  ```css
  .timeline-panel {
    position: fixed; top: 0; right: 0; bottom: 0; z-index: 40;  /* 低于 modal 的 50 */
    width: min(360px, 92vw);
    background: var(--card); border-left: 1px solid var(--line);
    box-shadow: -12px 0 32px rgba(38,35,53,.12);
    transform: translateX(102%);
    transition: transform .3s cubic-bezier(.22,1,.36,1);
    display: flex; flex-direction: column;
  }
  .timeline-panel.open { transform: translateX(0); }
  .timeline-panel-head {
    flex: none; display: flex; justify-content: space-between; align-items: center;
    padding: 16px 20px; border-bottom: 1px solid var(--line);
    font-size: 15px; font-weight: 700; letter-spacing: .1em;
  }
  .timeline-panel-body { flex: 1; overflow-y: auto; padding: 8px 20px 28px; }
  ```
  移动端同构（width 92vw 即接近全宽），不另做底部弹层，降低工程量。遮罩可选：`.timeline-panel` 打开时给 `body` 加半透明遮罩 div（`rgba(28,25,42,.3)`，点击关闭）。
- **章节分组**：
  ```css
  .tl-chapter {
    margin: 18px 0 6px; font-size: 12px; font-weight: 700;
    letter-spacing: .14em; text-indent: .14em; color: var(--ink-mute);
    display: flex; align-items: center; gap: 8px;
  }
  .tl-chapter::after { content:''; flex:1; height:1px; background: var(--line); }
  ```
- **节点三态**（复用结局页 `.tl-*` 命名，加修饰类，结局页样式不受影响）：
  ```css
  /* 已发生：与结局页一致，实心主色点 */
  .tl-item.done .tl-dot { background: var(--primary); box-shadow: 0 0 0 4px rgba(74,95,208,.15); }
  .tl-item.done .tl-title { color: var(--ink); }
  /* 当前节点：放大 + 呼吸环 + 标题主色 */
  .tl-item.current .tl-dot {
    width: 12px; height: 12px; margin-top: 6px;
    background: var(--primary);
    animation: tlPulse 1.6s ease-in-out infinite;
  }
  @keyframes tlPulse {
    0%, 100% { box-shadow: 0 0 0 3px rgba(74,95,208,.28); }
    50%      { box-shadow: 0 0 0 7px rgba(74,95,208,.10); }
  }
  .tl-item.current .tl-title { color: var(--primary); }
  .tl-item.current .tl-choice { color: var(--ink-soft); }
  /* 当前节点的选项行文案："正在发生"，已完成节点显示所选选项（history 已有） */
  ```
  只渲染「已发生 + 当前」，**不渲染未来事件**（不剧透）；章节标题只显示已经出现过的月份。
- **行结构**：`<span class="tl-turn">第 N 段</span><span class="tl-title">事件名</span>` + `<div class="tl-choice">选了「…」/ 正在发生</div>`，与结局页一致，工程可直接复用渲染函数抽公共。

### ⑦ 结局页
- **问题**：横幅光感平；kicker 字距 .5em 严重偏左。
- **改法**：
  1. `.ending-kicker`：`letter-spacing: .4em; text-indent: .4em;`。
  2. `.ending-banner` 叠加一层微光（四个 tone 渐变保留不动，只加伪元素）：
     ```css
     .ending-banner { position: relative; overflow: hidden; }
     .ending-banner::before {
       content:''; position:absolute; inset:0;
       background: radial-gradient(ellipse 70% 55% at 50% 0%,
         rgba(255,255,255,.22) 0%, transparent 70%);
       pointer-events: none;
     }
     ```
  3. `.ending-text`：`max-width: 34em; margin: 0 auto;`（文案居中阅读区）。
  4. `.end-stats` 的 `.stat-track` 8px → **10px**，与仪表盘一致（复用 §③-2 的高光质感）。

### ⑧ 成就图鉴页
- **问题**：锁定卡 `opacity:.55` 让「？？？」对比不足；成就解锁金边与结局色调边宽度相同，层级拉不开。
- **改法**：
  1. `.col-card-locked`：去掉整体 opacity，改为 `background:#f7f6f3; border-style:dashed; color: var(--ink-mute);`，其内 `.col-name` 色 `var(--ink-mute)`（12–15px 文字对比 ≥4.5）。
  2. `.col-card-ach.unlocked`：边宽 1.5px → **2px**，加 `box-shadow: 0 4px 12px rgba(217,161,60,.18);`。
  3. `.col-card` 加 `transition: transform .15s ease, box-shadow .15s ease;`，已解锁卡 hover `transform: translateY(-2px);`（锁定卡不加）。

### ⑨ 须知页
- **改法**：
  1. `.notice-title` 加左侧标记：`display:flex; align-items:center; gap:10px;` + `::before { content:''; width:4px; height:16px; border-radius:2px; background: var(--primary); }`。
  2. `.notice-card p`：`max-width: 38em;`。
  3. `.reward-qr` 加 `background:#fff; padding:8px;`（白边相框感，图片本身不改动）。

---

## 4. 移动端竖屏（v3 基础上的增量修复）

触控目标 ≥44px 已全部满足，v4 只修观感：

1. **安全区**：`.screen` 的 `padding-bottom` 与 `.toast` 的 `bottom` 加 `env(safe-area-inset-bottom)`：
   ```css
   .screen { padding-bottom: calc(48px + env(safe-area-inset-bottom)); }
   .toast { bottom: calc(36px + env(safe-area-inset-bottom)); }
   ```
2. **560px 下仪表盘两列过挤**：`#stats-bars` 的 `gap: 0 14px` → `gap: 0 12px`，并把 `.stat-name` 的 emoji 与文字间距固定：` .stat-name { display:inline-flex; gap:4px; align-items:center; }`（全局加，防止 emoji 与汉字粘连在不同机型上表现不一）。
3. **事件卡顶到屏幕边缘**：860px 下 `.event-card { padding: 22px 18px; }` → 560px 下改为 `padding: 20px 16px;`，`.event-text { font-size: 15.5px; line-height: 1.9; }`。
4. **时间线面板**：移动端 width 92vw，左上角关闭按钮（`.btn-text`，min-height 44px）。
5. **选项 reason 换行**：`.option-why { flex-basis:100%; margin-left:42px; }` 提升为全局规则（见 §3-④），560px 媒体查询里原有那行删除。
6. **结局横幅标题**：`clamp(32px, 6vw, 48px)` 在 360px 屏 = 32px，不再溢出；`.ending-banner` 560px padding `36px 20px 30px`。
7. **图鉴网格**：560px 下 `.col-grid`、`.col-grid-ach` 已 2 列，无需改；新增 `.col-desc { overflow-wrap: anywhere; }` 防长描述撑破。

---

## 5. 动效与质感（纯 CSS，性能安全）

- **统一时长曲线**：hover/按压 `.15s ease-out`；卡片进场 `.3–.4s cubic-bezier(.22,1,.36,1)`（cardIn 已有）；抽屉 `.3s cubic-bezier(.22,1,.36,1)`。**禁**用 blur/box-shadow 的逐帧动画（只 transition transform/opacity/background）。
- 现有动画保留：`cardIn`、`flagIn`；新增：`statPop`（§③-3）、`tlPulse`（§⑥）。
- **减弱动态偏好**（可访问性，必须加）：
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: .01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .01ms !important;
    }
  }
  ```
- **焦点可见**（键盘可访问性，全局加）：
  ```css
  :focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 6px; }
  .btn:focus-visible, .option-btn:focus-visible, .char-card:focus-visible { outline-offset: 3px; }
  ```
  （现有 `:focus` 无样式，输入框仅换边色，保留并叠加 outline。）
- **对比度自查表**：正文/功能文字全部 ≥4.5:1（见 §1.1 各值标注）；`--up`/`--down` 仅用于 19px/800 大数字（≥3:1 达标）；四数值色不作文字色。

---

## 6. 不做的事（保持玩家熟悉度）

1. **四数值色** `#d9537c / #d9912b / #7a5af8 / #2f9e77` 一毫不改。
2. **涨跌语义**：升=绿+「+ ↑」、降=红+「− ↓」，不改符号、不改色、不互换。
3. **浅色暖底主题**不变；v4 不做深色模式（如要做另立版本评估）。
4. **结局横幅四色调**（good/mid/bad/plain 四组渐变）原样保留，只叠微光。
5. **emoji 图标体系**（👥🌤🏆⚡📜 等）继续用，不引入 icon 库/字体/图片。
6. **DOM 结构与既有 class 命名**一律不改；本规格所有新样式通过**新增 class/伪元素/修饰类**实现（`.timeline-panel*`、`.tl-item.done/.current`、`.stat-num.pop`、`.modal-card::before` 等）。
7. 不引入任何动画库、不引入 `scroll-behavior: smooth` 以外的滚动行为改动。

---

## 7. 实施优先级建议

- **P0（观感收益最大）**：§2 字体栈与字号阶、§3-④ 选项气泡化、§3-③ 进度条质感、§5 焦点可见+reduced-motion。
- **P1**：§3-① 标题页、§3-⑤ 结果卡 grid、§3-⑥ 时间线面板（v4 新功能主视觉）。
- **P2**：§3-⑦/⑧/⑨ 结局/图鉴/须知微调、§4 移动端细节。

## 8. 给工程侧的硬性注意点

1. **进度条高光依赖一处 JS 改动**：`ui.js` L313 与 L434 内联写法 `background: COLOR` 会清掉 CSS 的 `background-image`，需改为 `backgroundColor = COLOR`（即 `style="...; background-color:COLOR"`），否则 §3-③-2 不生效。这是本规格唯一要求的 JS 改动（一行×2 处）。
2. 时间线章节分组逻辑：`scene.split('·')[0].trim()` 得月份；当前事件 = engine 当前回合事件，已发生 = history。渲染函数建议与结局页 timeline 抽公共模板。
3. `.stat-num.pop` 的加类时机：`renderStats` 重建 DOM 时对比旧值，变了才加；不实现也不影响其他规格。
4. 新增按钮 `#btn-timeline` 文案「📜 足迹」可在文策侧最终定稿，class 与位置以本规格为准。
5. 全部改动只在 `css/style.css` 追加/微调 + 上述 2 行 JS + index.html 新增 1 按钮 + 1 面板容器，零依赖、零构建，file:// 直接可跑。
