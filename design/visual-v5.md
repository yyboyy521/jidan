# 《冀🥚协会青春版》v5 手绘风美术与动画增强规格

> 产出：林绘澄（art-director） ｜ 面向：程基岩（工程实现）
> 基线：`design/visual-v4.md`（全部规则继续有效）+ `game/css/style.css`（v4 已落地）+ `game/index.html` + `game/js/ui.js`
> **增量原则**：v5 不推翻 v4 的任何决定，只在 v4 之上叠加「手绘元素 + 动画」两层。
> **零资源红线**：不新增任何图片文件、网络字体、icon 库、构建步骤。所有手绘图形 = **内联 SVG**（直接写进 HTML，或 `data:image/svg+xml` 写成 CSS mask）。所有动画 = **纯 CSS**。
> **必改 JS 数量：0**。§8-3 提到一处可选增强，本规格**不建议**做（理由在该条）。

---

## 0. 本规格怎么用

| 优先级 | 含义 | 工作量 | 建议 |
|---|---|---|---|
| **P0** | 气质收益最大、风险最低、几乎零布局影响 | 每项 5–20 行 CSS | 一次性全做 |
| **P1** | 明显提升"手绘感"，需 1–3 处伪元素/可选 1 行 HTML | 每项 15–30 行 | 第二批 |
| **P2** | 点缀与细节，可裁剪、隐藏成本低 | 每项 5–15 行 | 最后或不做 |

阅读顺序建议：**§1 令牌 → §2 手绘元素（取 P0 那几个）→ §3 质感规则 → §4 动画 → §5 性能约束 → §7 落地清单**。
附录 A 是"P0 一次性粘贴块"，可直接整段贴进 `style.css` 末尾。

---

## 1. 手绘方向声明

### 1.1 视觉锚点：三样东西

v4 的气质是「熄灯后的宿舍 + 被手指捂热的群聊屏幕 + 暖纸底 + 气泡」。
v5 的手绘层**不能变成插画游戏**，它只能是**同一个屏幕上的另一种笔**：

| 锚点 | 具体指代 | 落到哪里 |
|---|---|---|
| **便签本** | 社团招新时贴满墙的手写便签、便利贴 | 卡片折角、纸胶带、横格纸底 |
| **2B 铅笔** | 在打印材料上圈重点、画箭头、加批注的那支笔 | 下划线、圈画、箭头、对勾、波浪线 |
| **荧光笔/记号笔** | 给群里那句话划重点 | 主色下划线（`--primary`，唯一"亮"的手绘笔） |

一句话：**卡片是印的，批注是手写的。**
所以——卡片仍是干净的白色圆角矩形（v4 不动），手绘只出现在**卡片边缘、标题下、标签旁、节点上**。

### 1.2 新增设计令牌（贴进 `:root`）

```css
:root {
  /* ---- 手绘笔色（与 --ink 同源，只是"淡一档的铅笔"）---- */
  --ink-pencil:       #4a4660; /* 主铅笔线：白底 ≈9.0:1 —— 下划线/箭头/对勾 */
  --ink-pencil-soft:  #8b879d; /* 淡铅笔：白底 ≈3.5:1 —— 仅纯装饰，不承载信息 */
  --ink-pencil-faint: #b6b2c4; /* 极淡：白底 ≈2.1:1 —— 折角/纸纹边 */
  --hd-gold:          #d9a13c; /* 成就金（沿用 v4 图鉴已用色，不改） */

  /* ---- 手绘线宽（设计标注：实际线宽写在每个 SVG 的 stroke-width 里；
     viewBox 折算到屏幕后视觉值应落在 1.4–2.2px）---- */
  --hd-w-bold: 2px;    /* 下划线、圈画、对勾 */
  --hd-w-thin: 1.4px;  /* 波浪、折痕、星花 */

  /* ---- 手绘旋转（-2° ~ 2°，两侧交替，绝不叠加到正文块）---- */
  --hd-tilt-a: -1.6deg;
  --hd-tilt-b:  1.2deg;
  --hd-tilt-c: -0.8deg;

  /* ---- 统一时长/曲线（与 v4 §5 对齐，不新增曲线族）---- */
  --hd-ease: cubic-bezier(.22, 1, .36, 1);   /* 见"出"型，卡片/上浮 */
  --hd-pop:  cubic-bezier(.34, 1.4, .64, 1); /* 轻微过冲，贴纸/徽章 */
  --hd-t-1: .15s;  /* hover / 按压 */
  --hd-t-3: .36s;  /* 下划线绘制；其余一次性动画在代码里直接写字面量 .26/.3/.34/.38s */
}
```

> 色值全部为**新增令牌**，不覆盖 v4 任何变量。四数值色、`--primary`、`--line`、`--card` 一律不动。

### 1.3 手绘密度纪律（比任何单条样式都重要）

| 屏 | 手绘元素预算 | 说明 |
|---|---|---|
| 标题页 | 1 主 + 2 点缀 | logo 左上角一颗星 + 副标语前一颗星 + 页脚一朵小花；**不叠加纸胶带** |
| 选角页 | 1 主 | 仅「选中卡」的圈画/对勾；未选中卡不做任何手绘 |
| 游戏主界面 | 1 主 + 1 辅 | 事件标题下划线 + 状态区波浪分隔；**仪表盘与选项气泡不加装饰** |
| 结果卡 | 2 | 右上折角 + 顶边胶带（或标题圈画），三者取二 |
| 足迹抽屉 | 1 | 当前节点呼吸点；章节标题波浪线 |
| 结局页 | 2 | 左上角纸胶带 + 标题手写落下；正文区 0 个 |
| 图鉴页 | 2 | 已解锁成就卡的对勾 / 小星 + 结局卡拍立得框角；锁定卡 0 个 |
| 须知页 | 1 | 须知卡顶纸胶带；支持作者旁咖啡杯 |

**同一视口内：小星 ≤3 个、胶带 ≤2 段、圈画 ≤1 处。** 超出即判定为"偏离美术圣经"，需回退。

---

## 2. 手绘元素体系（11 个内联 SVG）

### 2.1 两种接入方式（先选后抄）

手绘 SVG 有两种落地方式，工程按"要不要动画 / 要不要固定比例"选用：

**方式 A —— 真 SVG 元素（写在 HTML 里）**
适合：需要 `stroke-dasharray` 描边动画的（下划线）、尺寸固定不能拉伸的（纸胶带、箭头、咖啡杯）。

```html
<!-- 通用类：.hd-svg 控制线色/对齐；aria-hidden 保证读屏器跳过 -->
<svg class="hd-svg hd-line" viewBox="0 0 200 10" preserveAspectRatio="none"
     aria-hidden="true" focusable="false"><!-- paths --></svg>
```

**方式 B —— CSS mask + data URI（零 DOM 改动）**
适合：挂在伪元素上的装饰（标题下划线、卡片折角、卡片角落小星、对勾）。
mask 只取 alpha 通道，所以 SVG 内部颜色无所谓；**颜色由 `background-color: currentColor` 决定**，因此可随 `color` 变量统一控制。

```css
/* 通用：任何 .hd-mask 元素都会被 --hd-xxx 的图形裁出来 */
.hd-mask {
  display: block; flex: none; pointer-events: none;
  background-color: currentColor;
  -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
  -webkit-mask-position: center; mask-position: center;
  -webkit-mask-size: contain;    mask-size: contain;
}
.hd-mask-line   { -webkit-mask-image: var(--hd-line);   mask-image: var(--hd-line); }
.hd-mask-wave   { -webkit-mask-image: var(--hd-wave);   mask-image: var(--hd-wave); }
.hd-mask-tape   { -webkit-mask-image: var(--hd-tape);   mask-image: var(--hd-tape); }
.hd-mask-fold   { -webkit-mask-image: var(--hd-fold);   mask-image: var(--hd-fold); }
.hd-mask-arrow  { -webkit-mask-image: var(--hd-arrow);  mask-image: var(--hd-arrow); }
.hd-mask-star   { -webkit-mask-image: var(--hd-star);   mask-image: var(--hd-star); }
.hd-mask-cup    { -webkit-mask-image: var(--hd-cup);    mask-image: var(--hd-cup); }
.hd-mask-circle { -webkit-mask-image: var(--hd-circle); mask-image: var(--hd-circle); }
.hd-mask-check  { -webkit-mask-image: var(--hd-check);  mask-image: var(--hd-check); }
.hd-mask-frame  { -webkit-mask-image: var(--hd-frame);  mask-image: var(--hd-frame); }
```

### 2.2 元素规格总表

共 **11 个图形**；其中下划线（`hd-line`）与波浪（`hd-wave`）是"同一支笔的两个变体"，在总表里合并成第 1 行，下面各给一节。10 个图形提供 CSS mask 变量，`hd-flower` 只做真 SVG 版（体积太小，挂伪元素没有收益）。

| # | 代号 | 中文名 | viewBox | 视觉尺寸建议 | 用在哪 | 接入 | 优先级 |
|---|---|---|---|---|---|---|---|
| 1 | `hd-line` / `hd-wave` | 手绘下划线 / 波浪分隔 | 200×10 · 240×8 | 高 7–9px，宽随容器 | 事件标题下、面板题下、抽屉章节标题 | A（描边动画）/ B | **P0** |
| 2 | `hd-tape` | 纸胶带 | 120×34 | 96–116×26px | 结局横幅两角、须知卡顶、结果卡顶 | A / B | **P0** |
| 3 | `hd-star` | 涂鸦小星 | 24×24 | 12–16px | 标题页两侧、成就卡右上、解锁横幅 | B | **P0** |
| 4 | `hd-fold` | 便签折角 | 32×32 | 22–28px | 结果卡右上、起名卡右上 | B | **P1** |
| 5 | `hd-arrow` | 铅笔箭头 | 72×44 | 28–40px | 结果卡「继续」按钮左侧、选角页"微调"提示 | A / B | **P1** |
| 6 | `hd-circle` | 圈画批注 | 140×60 | 覆盖 1 行文字 | 选中人设卡的名字、图鉴「已达成」 | B（拉伸） | **P1** |
| 7 | `hd-check` | 手绘对勾 | 24×24 | 14–18px | 选中卡（替代 v4 的 `✓` 文本）、成就卡左上 | B | **P1** |
| 8 | `hd-frame` | 拍立得框角 | 120×140 | 与卡同尺寸 | 图鉴结局卡、须知页二维码 | B | **P2** |
| 9 | `hd-cup` | 咖啡杯（冒热气） | 26×26 | 18–22px | 须知页「支持作者」、结局页点缀 | A | **P2** |
| 10 | `hd-flower` | 涂鸦小花 | 24×24 | 14–18px | 标题页底部、图鉴空态 | B | **P2** |

> 全部元素统一约束：**纯描边（`fill='none'`）+ `stroke-linecap='round'` + `stroke-linejoin='round'`**；唯一例外是纸胶带允许 `fill-opacity='.18'` 的淡底（线稿胶带的"半透明"暗示），以及折角允许 `fill-opacity='.07'`。无渐变、无滤镜、无 `<text>`、无外部字体。

---

### 2.3 ① `hd-line` 手绘下划线（P0）

**用途**：给标题划重点——全站最核心的一个手绘元素。双描（一条 2px 主笔 + 一条 1px 淡笔错位）是"手绘"和"一根线"的区别。

```html
<!-- 方式 A：真 SVG（推荐给 .event-title 用，可做描边绘制动画） -->
<svg class="hd-svg hd-line" viewBox="0 0 200 10" preserveAspectRatio="none"
     aria-hidden="true" focusable="false">
  <path d="M2 6.5C40 3.2 78 8.4 116 5.2S172 2.6 198 5.8"
        fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" pathLength="100"/>
  <path d="M6 8.7C44 6.1 80 9.9 118 7.4S170 5.4 194 8.2"
        fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity=".45"/>
</svg>
```

```css
.hd-svg { display: block; flex: none; overflow: visible; pointer-events: none;
          color: var(--ink-pencil); }
.hd-line { width: min(180px, 62%); height: 9px; color: var(--primary); }
```

**用点 A（P0，零 HTML 改动）：事件标题下方**
```css
.event-title { position: relative; }
.event-title::after {
  content: ''; display: block; width: min(170px, 58%); height: 8px; margin-top: 3px;
  background-color: var(--primary);
  -webkit-mask: var(--hd-line) left center / 100% 100% no-repeat;
  mask: var(--hd-line) left center / 100% 100% no-repeat;
  transform-origin: left center;                 /* 绘制动画的锚点（动画见 §4.9） */
}
/* 唯一的布局影响：标题盒高 +11px，用正文上边距抵消（16 → 6px），总间距几乎不变 */
.event-text { margin-top: 6px; }
@media (max-width: 560px) { .event-title::after { height: 7px; width: min(140px, 54%); } }
```

> ⚠️ 这是 v5 唯一一处**会影响布局**的改动，必须同时写 `.event-text { margin-top: 6px }`，否则标题与正文之间会多出 10px 空隙。移动端媒体查询里 v4 已有的 `.event-text` 规则不含 `margin-top`，不受影响。

**用点 B（P1）：面板题 / 须知题下方**（同上，宽度收窄到 `72px`、`height: 6px`、颜色 `--ink-pencil`）
**用点 C（P2）：结局标题下方**，颜色 `rgba(255,255,255,.7)`（横幅是深色底，改用白笔）。

---

### 2.4 ② `hd-wave` 波浪分隔线（P1）

**用途**：替代 v4 里 `.tl-chapter::after` 的 1px 直线、以及状态区/印记区上边的一条普通虚线——一条手画的小波浪让"分隔"这件事有人味。

```html
<svg class="hd-svg hd-wave" viewBox="0 0 240 8" preserveAspectRatio="none"
     aria-hidden="true" focusable="false">
  <path d="M0 4q10-4 20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0"
        fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</svg>
```

**用点（P1，零 HTML）：足迹抽屉章节行**
```css
.tl-chapter::after {
  content: ''; flex: 1; height: 7px;                    /* 替换 v4 的 1px 直线 */
  background-color: currentColor; color: var(--ink-pencil-faint);
  -webkit-mask: var(--hd-wave) left center / 100% 100% no-repeat;
  mask: var(--hd-wave) left center / 100% 100% no-repeat;
}
```
**用点（P2）：状态区 / 印记区上边的 `1px dashed` 换成波浪**——`.state-block`、`.flag-block` 的 `border-top` 改 `border-top: none` 并加同款 `::before`（高 6px、`opacity: .7`）。

> 拉伸版（`mask-size: 100% 100%`）会让波浪周期随宽度变，正好符合"手画的长短不一"；**不要**用 `contain`，那会留白。

---

### 2.5 ③ `hd-star` 涂鸦小星（P0）

**用途**：最省成本的一颗"人味"。四角内凹的手绘星（不是标准五角星），只在**留白处**出现，绝不压在文字上。

```html
<svg class="hd-svg hd-star" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M12 3c.6 5 1.4 6.4 6.6 9-5.2 2.6-6 4-6.6 9-.6-5-1.4-6.4-6.6-9 5.2-2.6 6-4 6.6-9z"
        fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
</svg>
```

```css
/* 用点 A（P0）：标题页 logo 左上角的空白处，一颗淡铅笔星（绝对定位，不参与布局） */
.title-wrap::after {
  content: ''; position: absolute; top: 5%; left: 7%;
  width: 15px; height: 15px; color: var(--ink-pencil-soft);
  background-color: currentColor; transform: rotate(var(--hd-tilt-c));
  -webkit-mask: var(--hd-star) center / contain no-repeat;
  mask: var(--hd-star) center / contain no-repeat;
  pointer-events: none;
}

/* 用点 B（P0）：副标语前一颗小星（流内，随文字居中，读作手绘项目符号） */
.title-tag::before {
  content: ''; display: inline-block; width: 12px; height: 12px;
  margin-right: 6px; vertical-align: -1px; color: var(--ink-pencil-soft);
  background-color: currentColor;
  -webkit-mask: var(--hd-star) center / contain no-repeat;
  mask: var(--hd-star) center / contain no-repeat;
}

/* 用点 C（P2）：已解锁成就卡右上角一颗金星（与左上角的对勾错开，不重叠） */
.col-card-ach.unlocked::after {
  content: ''; position: absolute; top: 5px; right: 6px;
  width: 12px; height: 12px; color: var(--hd-gold);
  background-color: currentColor; transform: rotate(var(--hd-tilt-b));
  -webkit-mask: var(--hd-star) center / contain no-repeat;
  mask: var(--hd-star) center / contain no-repeat;
}
@media (max-width: 380px) { .title-wrap::after { display: none; } }
```
> `.title-wrap` 在 v4 已是 `position: relative`（微光用），`::before` 被微光占用，所以星用 `::after`——两者不冲突。`.col-card-ach` 需要 `position: relative`（§2.10 的 `hd-check` 也要，同一行搞定）。

---

### 2.6 ④ `hd-tape` 纸胶带（P0）

**用途**：把"一张纸贴在屏幕上"这件事讲清楚。贴在卡片上沿、斜 1.5°，微微探出卡边 4–6px。

```html
<svg class="hd-svg hd-tape" viewBox="0 0 120 34" aria-hidden="true" focusable="false">
  <path d="M3 7q57-4 114 1l-2 19q-56 5-113-1z"
        fill="currentColor" fill-opacity=".18"
        stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M14 8.4l-4 20M34 7.4l-4 20M54 6.9l-4 20M74 7.4l-4 20M94 7.9l-4 20"
        fill="none" stroke="currentColor" stroke-width="1" opacity=".35"/>
</svg>
```

**用点 A（P0，结局横幅左上角）**：横幅是深色底、白字，胶带必须用**白笔**，且绝不能压到标题文字——只压左上角。
```css
.ending-banner { position: relative; overflow: hidden; } /* v4 已有，确认保留 */
.ending-banner::after {
  content: ''; position: absolute; top: -6px; left: 12px;
  width: 92px; height: 26px; color: rgba(255, 255, 255, .55);
  background-color: currentColor; transform: rotate(var(--hd-tilt-a));
  -webkit-mask: var(--hd-tape) center / 100% 100% no-repeat;
  mask: var(--hd-tape) center / 100% 100% no-repeat;
  pointer-events: none;
}
```
> **`top: -6px` 是故意的**：`.ending-banner` 的 `overflow: hidden`（v4 用来裁微光与圆角）会把胶带上沿切掉 6px，视觉上正好读成"胶带被卡边压住"。**不要**为了"露出完整胶带"把 `overflow` 改成 `visible`——那会让 v4 的横幅微光溢出圆角。
> 本规格的胶带只做**一处**（左上角），密度纪律 §1.3 规定"胶带 ≤2 段"是指整屏，结局页只此一段 + 标题 0 段。

**用点 B（P1，须知卡顶）**：`color: var(--ink-pencil-faint)`，`left: 28px`，`top: -5px`，`rotate(var(--hd-tilt-b))`，宽 84px；需 `.notice-card { position: relative }`（`.card` 默认无定位）。
**用点 C（P2，结果卡右上角）**：与 v4 的 3px 渐变带**冲突**（都占顶边），二者择一——**保留渐变带**，胶带改贴右上角：`top: 10px; right: -8px; width: 70px; height: 22px; rotate(var(--hd-tilt-a))`；`.modal-card` 的 `overflow: hidden` 会裁掉探出的 8px（同上，是被压住的效果）。

> 移动端 ≤380px：`.ending-banner::after { display: none }`（避免横幅换行后压字）。

---

### 2.7 ⑤ `hd-fold` 便签折角（P1）

**用途**：卡片右上角一个翻起的小三角 + 一道折痕，暗示"这是一张纸"。

```html
<svg class="hd-svg hd-fold" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
  <path d="M31 1v19L12 1z" fill="currentColor" fill-opacity=".07"
        stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M12 1l9 10 10 9" fill="none" stroke="currentColor"
        stroke-width="1.1" stroke-linecap="round" opacity=".5"/>
</svg>
```

```css
.modal-card::after {                 /* 结果卡/起名卡共用 .modal-card */
  content: ''; position: absolute; top: 3px; right: 0;   /* 让开 3px 渐变带 */
  width: 26px; height: 26px; color: var(--ink-pencil-faint);
  background-color: currentColor;
  -webkit-mask: var(--hd-fold) center / contain no-repeat;
  mask: var(--hd-fold) center / contain no-repeat;
  pointer-events: none;
}
```
**用点（P2）**：`.ending-card`、`.collect-card` 右上角同款（需给它们加 `position: relative`）。

---

### 2.8 ⑥ `hd-arrow` 铅笔箭头（P1）

**用途**：手绘的"往这儿看"。**只用在有空白余量的地方**——`.modal-card` 有 `overflow: hidden`，贴在按钮左侧会被裁切，所以结果卡**不用**箭头（见下方注意点）。

```html
<svg class="hd-svg hd-arrow" viewBox="0 0 72 44" aria-hidden="true" focusable="false">
  <path d="M5 33C21 36 41 28 62 12" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round"/>
  <path d="M62 12l-12 1.6M62 12l-2.4 10.6" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round"/>
</svg>
```

```css
.hd-arrow { width: 30px; height: 18px; color: var(--ink-pencil-soft); }

/* 用点 A（P1）：选角页「初始状态（可微调 ±N）」小标题前，指引视线往下的微调行 */
.char-detail .panel-subtitle::before {
  content: ''; display: inline-block; width: 18px; height: 11px;
  margin-right: 5px; vertical-align: -1px;
  background-color: var(--ink-pencil-soft);
  -webkit-mask: var(--hd-arrow) center / contain no-repeat;
  mask: var(--hd-arrow) center / contain no-repeat;
}

/* 用点 B（P1）：结局页两个按钮上方，一支"往下点"的笔（需 14px 顶部留白） */
.ending-actions { position: relative; padding-top: 14px; }
.ending-actions::before {
  content: ''; position: absolute; top: 0; left: 50%;
  width: 26px; height: 15px;
  transform: translateX(-50%) rotate(38deg);   /* 转成朝下，笔画方向不变 */
  background-color: var(--ink-pencil-soft);
  -webkit-mask: var(--hd-arrow) center / contain no-repeat;
  mask: var(--hd-arrow) center / contain no-repeat;
  pointer-events: none;
}
@media (max-width: 560px) { .ending-actions::before { display: none; } }
```

> **为什么结果卡不放箭头（重要）**：v4 的 `.modal-card` 是 `overflow: hidden`（为裁 3px 渐变带与圆角）。任何相对 `.modal-actions` 向左探出的绝对定位元素都会被裁掉，出现"半支箭头"。若真想在结果卡里放，只能改成 `.modal-actions { display: flex; justify-content: flex-end; align-items: center; gap: 10px }` 并把箭头作为**流内**元素插进 HTML——**这会动 DOM，超出 v5 范围，故不做**。
> `.ending-actions` 的 `padding-top: 14px` 是唯一一处为此新增的间距，请确认与 v4 的 `margin-top: 28px` 叠加后（42px）在 560px 竖屏下仍不显得空——若嫌空，把 `margin-top` 同时降到 `18px`。

---

### 2.9 ⑦ `hd-circle` 圈画批注（P1）

**用途**：用铅笔把某个词圈起来。**起笔与收笔故意不闭合、末段压过起点**，这是手绘圈的辨认特征。

```html
<svg class="hd-svg hd-circle" viewBox="0 0 140 60" preserveAspectRatio="none"
     aria-hidden="true" focusable="false">
  <path d="M21 15C60 3 118 4 131 21c10 15-32 32-71 32C22 53 3 41 9 25c5-12 32-19 55-18"
        fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>
```

```css
/* 选中卡的人设名：铅笔圈一下（v4 的 ✓ 保留在 hd-check 里，两者不同时开） */
.char-card.selected .char-name { position: relative; display: inline-block; padding: 0 6px; }
.char-card.selected .char-name::before {
  content: ''; position: absolute; inset: -6px -8px;
  color: var(--ink-pencil-soft); background-color: currentColor;
  -webkit-mask: var(--hd-circle) center / 100% 100% no-repeat;
  mask: var(--hd-circle) center / 100% 100% no-repeat;
  transform: rotate(var(--hd-tilt-c));
  pointer-events: none;
}
```
> 用点（P2）：图鉴「已达成」标签外圈；结果卡 `.modal-head` 文字外圈（此处宽度变化大，建议配 `preserveAspectRatio='none'` + 固定的 `inset: -5px -10px`，避免圈歪）。

---

### 2.10 ⑧ `hd-check` 手绘对勾（P1）

**用途**：替代 v4 §3-② 用 `content:'✓'` 打的文字勾——文字勾在不同系统字体下胖瘦不一，手绘勾可控。

```html
<svg class="hd-svg hd-check" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M3.5 12.5c3 3 5 5.6 6.2 8.2C13.4 13.6 17.4 7.6 21.6 2.6"
        fill="none" stroke="currentColor" stroke-width="2.4"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

```css
/* 覆盖 v4 的：.char-card.selected .char-name::after { content:'✓' } */
.char-card.selected .char-name::after {
  content: ''; display: inline-block; width: 15px; height: 15px;
  margin-left: 8px; vertical-align: -1px;
  background-color: var(--primary);
  -webkit-mask: var(--hd-check) center / contain no-repeat;
  mask: var(--hd-check) center / contain no-repeat;
}
/* 用点（P2）：成就卡左上角小勾 */
.col-card-ach.unlocked::before {
  content: ''; position: absolute; top: 6px; left: 7px; width: 13px; height: 13px;
  background-color: var(--hd-gold);
  -webkit-mask: var(--hd-check) center / contain no-repeat;
  mask: var(--hd-check) center / contain no-repeat;
}
.col-card-ach { position: relative; }
```

> 语义安全：选中卡除了对勾还有 `border-color: var(--primary)` + 背景渐变 + `aria`/按钮语义，"已选中"从不只靠图形表达。

---

### 2.11 ⑨ `hd-frame` 拍立得框角（P2）

**用途**：给图鉴结局卡一个"拍立得照片"的框（四角手绘 L 形刻线），不加任何图片。

```html
<svg class="hd-svg hd-frame" viewBox="0 0 120 140" preserveAspectRatio="none"
     aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
    <path d="M1 11V1h10"/><path d="M109 1h10v10"/>
    <path d="M119 129v10h-10"/><path d="M11 139H1v-10"/>
  </g>
</svg>
```

```css
.col-card-end { position: relative; }
.col-card-end::after {
  content: ''; position: absolute; inset: 3px; color: var(--ink-pencil-faint);
  background-color: currentColor;
  -webkit-mask: var(--hd-frame) center / 100% 100% no-repeat;
  mask: var(--hd-frame) center / 100% 100% no-repeat;
  pointer-events: none;
}
```
**用点（P2）**：须知页 `.reward-qr` 外层（`.reward-qr` 已有白边相框，改成 `padding: 10px 10px 26px` 的拍立得比例 + 角标即可）。

---

### 2.12 ⑩ `hd-cup` 咖啡杯（P2）

```html
<svg class="hd-svg hd-cup" viewBox="0 0 26 26" aria-hidden="true" focusable="false">
  <path d="M5 10.5q0 11 8 11t8-11z" fill="none" stroke="currentColor"
        stroke-width="1.7" stroke-linejoin="round"/>
  <path d="M21 12.4q4.2.5 3.3 3.1-.9 2.4-3.7 1.5" fill="none"
        stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M9.6 6.6q1.8-2.1-.4-3.8M14.2 6.6q1.8-2.1-.4-3.8" fill="none"
        stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".7"/>
</svg>
```

```css
.hd-cup { width: 20px; height: 20px; color: var(--ink-pencil-soft); display: inline-block;
          vertical-align: -4px; margin-left: 6px; }
```
**用点**：须知页 `.support-hint` 尾部内联（"请作者喝奶茶 ☞" 的位置感）、结局页 `.ending-actions` 上方。**需 1 处 HTML**，故列 P2。

---

### 2.13 ⑪ `hd-flower` 涂鸦小花（P2）

```html
<svg class="hd-svg hd-flower" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <circle cx="12" cy="12" r="2.1" fill="none" stroke="currentColor" stroke-width="1.4"/>
  <path d="M12 9.9C9.6 6.5 14.4 6.5 12 9.9M14.1 12c3.4-2.4 3.4 2.4 0 0M12 14.1c2.4 3.4-2.4 3.4 0 0M9.9 12C6.5 14.4 6.5 9.6 9.9 12"
        fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
</svg>
```

```css
.hd-flower { width: 16px; height: 16px; color: var(--ink-pencil-soft);
             display: inline-block; vertical-align: -3px; margin: 0 6px; }
```
**用点**：标题页 `.title-foot` 前后各一朵（P2，需 1 处 HTML）；图鉴空态文字旁。

---

### 2.14 用点对照表（工程照着这张表核）

| 位置 | 选择器 | 元素 | 接入 | 优先级 |
|---|---|---|---|---|
| 事件标题下 | `.event-title::after` | `hd-line` | mask + scaleX 绘制 | **P0** |
| 结局横幅角 | `.ending-banner::after` | `hd-tape` | mask | **P0** |
| 标题页 logo 左上 | `.title-wrap::after` | `hd-star` | mask | **P0** |
| 标题页副标语前 | `.title-tag::before` | `hd-star` | mask | **P0** |
| 抽屉章节分隔 | `.tl-chapter::after` | `hd-wave` | mask | P1 |
| 选中人设名 | `.char-card.selected .char-name::before` | `hd-circle` | mask | P1 |
| 选中人设名后缀 | `.char-card.selected .char-name::after` | `hd-check` | mask | P1 |
| 结果卡右上 | `.modal-card::after` | `hd-fold` | mask | P1 |
| 选角页微调提示 | `.char-detail .panel-subtitle::before` | `hd-arrow` | mask | P1 |
| 结局页按钮上方 | `.ending-actions::before` | `hd-arrow` | mask | P1 |
| 须知卡顶 | `.notice-card::before` | `hd-tape` | mask | P1 |
| 图鉴结局卡 | `.col-card-end::after` | `hd-frame` | mask | P2 |
| 成就卡左上 / 右上 | `.col-card-ach.unlocked::before` / `::after` | `hd-check` / `hd-star` | mask | P2 |
| 成就卡左上 | `.col-card-ach.unlocked::before` | `hd-check` | mask（金色） | P2 |
| 须知支持区 | 内联 `<svg>` | `hd-cup` | A | P2 |
| 标题页页脚 | 内联 `<svg>` | `hd-flower` | A | P2 |

---

## 3. 手绘质感规则

### 3.1 线条

- **视觉线宽**：主笔 2px（下划线/圈画/对勾/箭头），细笔 1.4px（波浪/折痕/星花），内部细节 1px。
- **双描是手绘的命门**：所有 ≥100px 长的线，都必须是「2px 主笔 + 1px 淡笔（`opacity .45`）+ 轻微错位（1~2px）」。单根细线看起来是"设计稿的线"，双描才像"笔"。
- **端点**：一律 `stroke-linecap="round"`，`stroke-linejoin="round"`。绝不出现方头。
- **不规则**：路径至少 3 段不同曲率（所以下划线用 `C…S…` 两次贝塞尔而不是一条 `L`），**不做完美对称**。
- **不要**用 `stroke-dasharray` 模拟粗糙感（会看成虚线），也不要引入 SVG filter（`feTurbulence` 在移动端成本高）。

### 3.2 笔画色

| 用途 | 色 | 说明 |
|---|---|---|
| 主批注笔（下划线、对勾、箭头） | `--primary #4a5fd0` | 唯一"亮"的手绘笔，让重点可见 |
| 铅笔线（圈画、淡装饰） | `--ink-pencil-soft #8b879d` | 3.5:1，**仅装饰** |
| 极淡（折角、框角、波浪） | `--ink-pencil-faint #b6b2c4` | 2.1:1，**仅装饰** |
| 深铅笔（规则说明性的手绘线） | `--ink-pencil #4a4660` | 9:1，可用在需要被看清的线条上 |
| 成就金 | `--hd-gold #d9a13c` | 与 v4 图鉴金同源 |
| 深色底上的笔 | `rgba(255,255,255,.55~.7)` | 结局横幅专用 |

**硬规则**：四数值色（`#d9537c / #d9912b / #7a5af8 / #2f9e77`）**不得**用作手绘笔色——它们已经绑定"数值"语义，出现在装饰上会误导。

### 3.3 纸张纹理（纯 CSS，不用图片）

选这一种：**横格纸**。它比噪点更省性能（规则直线、周期大、无摩尔纹风险），而且和"手写通知栏"的气质直接对上。

**做法：把横格线写进 `body` 自己的背景层**（而不是盖一个全屏伪元素）。这样 `.card` 的白底会**自然遮住**它——横格只出现在卡片之间的缝隙和页边，卡片上永远是干净的纸（正文对比度零损失）。

```css
/* 放在原有 body 规则之后，用显式属性覆盖 background 简写 */
body {
  background-color: var(--bg-a);           /* 兜底色，渐变未加载也不发白 */
  background-image:
    repeating-linear-gradient(0deg,        /* 上层：横格线（1px / 26px） */
      rgba(120, 110, 90, .045) 0, rgba(120, 110, 90, .045) 1px,
      transparent 1px, transparent 26px),
    linear-gradient(165deg, var(--bg-a) 0%, var(--bg-b) 100%);  /* 下层：v4 原渐变 */
  background-repeat: repeat, no-repeat;
  background-attachment: fixed, fixed;
  background-size: auto, cover;
}
```

- **零新增层级**：不引入伪元素、不引 `z-index`，天然不会盖住文字、也不会盖住模态/抽屉。
- **卡片不铺纹理**：`.card` 纯白保持，正文 11.6:1 对比度一点不掉。
- **不用** `mix-blend-mode`（会让整页进入合成层，低端机掉帧）。
- **不用** `radial-gradient` 噪点：全屏多层径向渐变栅格化成本高，且截图压缩后易出色带。
- 可选第二层（P2，仅桌面）：在 `background-image` 最前面再加一条
  `repeating-linear-gradient(90deg, rgba(120,110,90,.02) 0 1px, transparent 1px 4px)`；
  用 `@media (min-width: 861px)` 单独写一条 `body` 规则覆盖，别塞进主规则里。
- **硬度上限**：横格线 alpha **≤ .05**。超过这个值正文观感发"脏"，截图压缩后出现横条纹。

> 如果产品侧希望"纸纹压在卡片上也透出来"（更强的整张纸感），备选做法是 `body::before` 全屏 `fixed` + `pointer-events:none` + `z-index:1`。**代价**：卡片上出现横线（可能被读成"渲染错误"），且多一层全屏合成。**默认不采用**，需用户明确点头再做。

### 3.4 轻微旋转范围

| 对象 | 允许角度 | 说明 |
|---|---|---|
| 纸胶带 / 便签折角 / 小星 / 小花 | **-2° ~ +2°** | 相邻两个必须反向（左 -1.6°，右 +1.2°） |
| 标签文字（scene / kicker / panel-subtitle） | **-1° ~ +1°** | 可选；用 `--hd-tilt-c` |
| 标题（h1/event-title） | **0°** | 不旋转。中文大标题一歪，整块版面跟着歪 |
| 正文、数值、按钮文字、输入框 | **0°（禁止）** | 可读性红线 |
| hover 反馈 | 从原角度回到 **0°** | "拿手扶正"，是最自然的交互隐喻 |

### 3.5 手写体感（无网络字体，用参数模拟）

**结论先说：手写感交给图形，不交给文字。** 系统字体（PingFang / 微软雅黑）+ 任何"伪手写"参数，超过一定幅度就会变成"廉价特效"。所以只允许下面这张表里的参数，**超出即偏离规范**。

**字号 / 字重：不新增任何档位。** v4 的字号阶与 400/600/700/800 四档字重全部沿用——手写感**不靠加粗、不靠加大**（那是"标题感"不是"手写感"），只靠**字距 + 极淡重影 + 图形批注**三件事。任何试图用"加大字重模拟马克笔"的做法都会让 12px 标签糊成一团。

| 层级 | 具体参数（在 v4 字号阶基础上**只追加**这些） |
|---|---|
| 左对齐标题（`.event-title`、`.page-head h1`、`.notice-title`） | `letter-spacing: .035em`（v4 原为 .02–.04em，微调到统一值，差异在视觉噪声内，模拟手写字距不匀）+ `text-shadow: 0 1px 0 rgba(38,35,53,.06)`（铅笔重描的极淡重影）。**左对齐元素禁加 `text-indent`**——v4 的末字补偿只服务于居中的宽字距标签，加在左对齐标题上会凭空多出缩进 |
| 居中标题（`.ending-title`） | **保持 v4 原值**（`.06em` + 无 `text-indent`，居中由 `text-align: center` 保证）。它的宽字距是"海报感"，不要往下调 |
| 标签 / 批注（`.event-scene`、`.panel-subtitle`、`.ending-kicker`、`.tl-chapter`） | 颜色降到 `--ink-mute`（v4 已是）+ `letter-spacing` 保持 v4 + 可 `transform: rotate(var(--hd-tilt-c))`。**这就是"铅笔批注"的全部** |
| 数值（`.stat-num`、`.change-delta`、`.adjust-value`） | **不加任何参数**（tabular-nums 已足够）。加阴影会破坏数字对齐的清晰度 |
| 正文（`.event-text`、`.ending-text`、`.modal-narrate`、`.notice-card p`、`.char-intro`、`.col-desc`） | **一律 0 改动**：v4 的 16px / 1.95 / 400 / 字距 0 全部保留 |
| 按钮文字 | 0 改动 |

**明令禁止（这一栏是为了防止后来者"加一点手写字体感"而毁掉可读性）**：
1. `font-style: italic` —— 中文伪斜体（浏览器倾斜合成）在小字号下笔画糊成一团。
2. `-webkit-text-stroke` —— 移动端 1px 以下描边会脏、会掉笔画。
3. `font-family: cursive / "Comic Sans MS" / "楷体"` —— 系统 handwriting 字体跨平台不可控，且中文字形质量参差；**"零网络字体"不等于"可以用系统花体"**。
4. SVG `<text>` 写字 —— 不可选中、不可缩放、不可翻译。
5. `transform: skewX()` 作用于文本块 —— 中文方块字会被拉斜，识别率明显下降。
6. 逐字 span 做"手写抖动" —— DOM 爆炸，且 `ui.js` 用 `textContent` 写正文，会破坏转义路径。

### 3.6 与 v4 既有"手绘基因"的对接

v4 已有三处手绘倾向，v5 不重复实现、只做"笔的一致性"：
- `.panel-title::before` / `.modal-head::before` / `.notice-title::before`（4×14px 主色竖条）→ **保留不动**，它是"记号笔的起笔"。
- `.event-scene::before`（6×6 主色小方块）→ **保留不动**，v5 不再给它加星（密度纪律）。
- `.tl-chain-mark`（6×6 五色小方块）→ **保留不动**。

---

## 4. 动画规格（8 个 + 1 个伴随过渡）

### 4.1 通用约束（先立规矩）

| 项 | 规则 |
|---|---|
| 时长 | 一次性进入动画 **≤ 400ms**；hover/按压 `.15s`；循环动画周期 **1.6–2.4s**（呼吸/微光类） |
| 曲线 | 只有两条：`var(--hd-ease)`（见出型，绝大多数）、`var(--hd-pop)`（轻微过冲，仅贴纸/徽章/数字） |
| 属性白名单 | **只允许 `transform` / `opacity` / `clip-path` / `stroke-dashoffset`**。禁止 `width/height/top/left/margin/padding/box-shadow/filter/background-position` 做逐帧动画 |
| 位移上限 | 进入动画位移 ≤ 14px；缩放 0.96–1.06；旋转 ±2°（瞬时抖动可到 ±3°） |
| 重播语义 | 依赖 `hidden` 属性切换（`display:none → block`）自动重播；**不写 JS 触发器** |
| 填充模式 | **一律 `backwards`，禁止 `both` / `forwards`**（见下方 ⚠️） |
| 红线 | **正文元素禁止任何 animation**：`.event-text`、`.ending-text`、`.modal-narrate`、`.char-intro`、`.notice-card p`、`.col-desc`、`.tl-choice` |

> ⚠️ **为什么必须 `backwards` 而不是 `both`**
> `animation-fill-mode: both/forwards` 会让动画最后一帧的 `transform` **持续覆盖**元素自身的 `transform`。`.char-card:hover` 的 `translateY(-3px)`、`.option-btn:hover` 的 `translateX(4px)` 都会因此失效（看起来"hover 坏了"）。
> `backwards` 只在动画开始前应用首帧，结束后**交还**给正常样式——既能做入场，又不吃 hover。
>
> ⚠️ **为什么首帧要写在 `@keyframes` 里，而不是基样式里**
> 若基样式写 `opacity: 0`，一旦 `prefers-reduced-motion` 把 `animation-duration` 压到 `.01ms`，元素会直接停在最后一帧之前或干脆不可见——**降级即失去内容**。
> 本规格全部采用「**基样式 = 最终可见态，首帧（隐藏态）写在 keyframes 的 `from` 里**」。这样降级只损失"动"，绝不损失"看"。

### 4.2 A1 · `hdRise` 页面/卡片进入轻微上浮（P0）

**触发**：屏幕 `hidden` 切换后，容器内卡片和页头自动播一次（无需 JS）。
**关键**：**只加在"卡片级元素自身"**，绝不加在 `.screen` / `.game-layout` / `.select-layout` 这类布局容器上——容器一旦有 `transform`，内部 `position: fixed` 子元素会改以容器为参照（本项目模态/抽屉/toast 虽都在 body 层，但这是防未来的坑）；同时避免 `sticky` 行为异常。

```css
@keyframes hdRise {
  from { opacity: 0; transform: translate3d(0, 10px, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
}

.page-head,
.ending-banner,
.ending-card,
.collect-card,
.notice-card,
.stats-panel,
.char-card { animation: hdRise .3s var(--hd-ease) backwards; }

/* 选角卡轻微错峰（4 张，总时长 105ms 内错开 → 最晚 385ms 结束） */
.char-card:nth-of-type(1) { animation-delay: 0ms; }
.char-card:nth-of-type(2) { animation-delay: 35ms; }
.char-card:nth-of-type(3) { animation-delay: 70ms; }
.char-card:nth-of-type(4) { animation-delay: 105ms; }
```

### 4.3 A2 · `hdOptionIn` 选项逐条上浮 + A2-b 铅笔划动（P0）

**触发**：`ui.js` 每回合重建 `.option-btn` 元素（`renderEvent` 里 `box.innerHTML=''` 后重建）→ **天然重播，零 JS 改动**。
**伴随过渡（A2-b）**：hover 时气泡里"划"出一道铅笔线 + 轻微倾斜，离开时收回。

```css
/* ---- A2 入场 ---- */
@keyframes hdOptionIn {
  from { opacity: 0; transform: translate3d(-6px, 8px, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
}
.event-options > .option-btn { animation: hdOptionIn .26s var(--hd-ease) backwards; }
.event-options > .option-btn:nth-child(1) { animation-delay: 0ms; }
.event-options > .option-btn:nth-child(2) { animation-delay: 40ms; }
.event-options > .option-btn:nth-child(3) { animation-delay: 80ms; }
.event-options > .option-btn:nth-child(4) { animation-delay: 120ms; }

/* ---- A2-b hover 铅笔划动 ---- */
.option-btn { position: relative; }   /* v4 无绝对定位子元素，安全 */

.option-btn::after {
  content: ''; position: absolute; left: 18px; right: 18px; bottom: 5px; height: 6px;
  background-color: var(--primary);
  -webkit-mask: var(--hd-line) left center / 100% 100% no-repeat;
  mask: var(--hd-line) left center / 100% 100% no-repeat;
  transform-origin: left center;
  transform: scaleX(.18);          /* 基态：只露一个小笔尖 */
  opacity: 0;
  transition: opacity var(--hd-t-1) ease-out,
              transform .26s var(--hd-ease);
  pointer-events: none;
}
.option-btn:hover:not(.disabled)::after,
.option-btn:focus-visible::after { opacity: .5; transform: scaleX(1); }

/* 轻微倾斜：与 v4 的 translateX(4px) 合并（同一条 transform 里写，别拆两条） */
.option-btn:hover:not(.disabled) {
  transform: translateX(4px) rotate(-.35deg);
}
/* 触屏：v4 已取消 hover 位移，这里同步取消倾斜，改用按压时"划一下" */
@media (pointer: coarse) {
  .option-btn:hover:not(.disabled) { transform: none; }
  .option-btn:active:not(.disabled)::after { opacity: .45; transform: scaleX(1); }
  .option-btn:active:not(.disabled) { transform: scale(.994); }
}
@media (max-width: 560px) { .option-btn::after { left: 14px; right: 14px; } }
```

> `bottom: 5px` 落在 `.option-btn` 的 15px 底部内边距里，**不会压到文字**；带 `.option-why` 的置灰项因为 `:not(.disabled)` 永远不会出现划动线。

### 4.4 A3 · `hdStickerDrop` 结果卡弹出＝贴纸落下（P0）

**触发**：`.modal-card` 从 `hidden` 变可见（同名请**替换** v4 的 `cardIn` 写法，二选一，别叠加）。

```css
@keyframes hdStickerDrop {
  0%   { opacity: 0; transform: translate3d(0, -18px, 0) rotate(-1.6deg) scale(.97); }
  62%  { opacity: 1; transform: translate3d(0, 3px, 0)   rotate(.6deg)  scale(1.006); }
  100% { opacity: 1; transform: translate3d(0, 0, 0)     rotate(0)      scale(1); }
}
.modal-card { animation: hdStickerDrop .38s var(--hd-pop) backwards; }
```
> `.modal-card` 在 `index.html` 里是 body 直系（不在 `.screen` 内），`position: fixed` 的祖先链干净，`transform` 安全。

### 4.5 A4 · `hdTlBreath` 时间线当前节点呼吸（P1）

**触发**：足迹抽屉打开、当前节点渲染（`.tl-item.current`）。
**改进点**：v4 的 `tlPulse` 用 `box-shadow` 逐帧动画 → 每帧触发重绘。v5 改用 `transform: scale` + **静态** box-shadow 环：环会随 scale 一起放大缩小，视觉等价，成本降到合成层。

```css
@keyframes hdTlBreath {
  0%, 100% { transform: scale(1);    opacity: 1; }
  50%      { transform: scale(1.24); opacity: .82; }
}
/* 覆盖 v4 的 animation: tlPulse ... */
.tl-item.current .tl-dot {
  width: 12px; height: 12px; margin-top: 6px;
  background: var(--primary);
  box-shadow: 0 0 0 3px rgba(74, 95, 208, .22);   /* 静态环，随缩放呼吸 */
  animation: hdTlBreath 1.8s ease-in-out infinite;
}
```
> v4 的 `@keyframes tlPulse` 可留可删（不再被引用）。**同一视口只允许这一个循环动画**。

### 4.6 A5 · `hdNumBump` 数值变化脉冲（P1，替换 v4 `statPop`）

```css
@keyframes hdNumBump {
  0%   { transform: translate3d(0, 0, 0)     scale(1); }
  35%  { transform: translate3d(0, -2px, 0)  scale(1.16); }
  100% { transform: translate3d(0, 0, 0)     scale(1); }
}
.stat-num.pop { animation: hdNumBump .34s var(--hd-pop) backwards; }
/* .stat-num 在 v4 已有 display:inline-block（transform 生效的前提），不要动 */
```
> **语义红线**：脉冲只做形变，**不变色、不闪红绿**。涨跌语义仍由 `.change-row.up/.down` 的颜色与 `+ ↑ / − ↓` 符号表达（v4 §1.2 不动）。

### 4.7 A6 · `hdBadgeIn` 状态徽章进入抖动（P1，替换 v4 `flagIn` 的引用）

```css
@keyframes hdBadgeIn {
  0%   { opacity: 0; transform: translate3d(0, 4px, 0) scale(.82) rotate(-3deg); }
  55%  { opacity: 1; transform: translate3d(0, 0, 0)   scale(1.06) rotate(1.6deg); }
  78%  { opacity: 1; transform: translate3d(0, 0, 0)   scale(.99)  rotate(-.8deg); }
  100% { opacity: 1; transform: translate3d(0, 0, 0)   scale(1)    rotate(0); }
}
.state-chip.glow, .flag-chip.glow { animation: hdBadgeIn .38s var(--hd-pop) backwards; }
```
> 瞬时抖动放宽到 ±3°（规格 §3.4 的 ±2° 是**静态**角度上限，动画瞬时抖动单独放宽，且只在这一处）。

### 4.8 A7 · `hdWriteIn` 结局标题的手写描边感（P2）

**原理**：用 `clip-path` 从左到右分段揭开 + `steps()` 制造"一笔一笔写出来"的顿挫。文本始终是真实 DOM 文字（可选中、可朗读），只是逐步显形。

```css
@keyframes hdWriteIn {
  from { clip-path: inset(0 100% 0 0); }
  to   { clip-path: inset(0 0 0 0); }
}
.ending-title {
  animation: hdWriteIn .38s steps(9, end) 80ms backwards;
}
/* 低端/窄屏退化为纯淡入（steps 在多行标题上偶有重排感） */
@media (max-width: 380px) {
  .ending-title { animation: hdRise .3s var(--hd-ease) backwards; }
}
```
> `clip-path` 动画在部分 GPU 上非合成属性，但这是**单元素、一次性、380ms**，可接受。若工程 profiling 发现掉帧，直接删掉此条（视觉损失很小）。

### 4.9 A8 · `hdDraw` 手绘下划线绘制（`stroke-dasharray`）（P0，方式 A）

**原理**：`pathLength="100"` 把路径长度归一化成 100，`stroke-dasharray: 100` 即"一整段"，`stroke-dashoffset` 从 100 走到 0 = 一笔画出来。

```css
/* 基态 = 已画好（关键：降级时线必须还在） */
.hd-line path { stroke-dasharray: 100; stroke-dashoffset: 0; }

@keyframes hdDraw {
  from { stroke-dashoffset: 100; }
  to   { stroke-dashoffset: 0; }
}
.hd-draw path { animation: hdDraw .36s var(--hd-ease) backwards; }
```

**零 HTML 改动的等价版（推荐，方式 B）**：用 `::after` + `scaleX` 模拟同一观感，基态可见、动画从 0 长到 1：
```css
@keyframes hdGrow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.event-title::after { animation: hdGrow .36s var(--hd-ease) backwards; }
```
> **重播语义说明**：`.event-title` 元素跨回合不重建，所以这条下划线动画**每次进入游戏屏幕播一次**（`#screen-game` 的 `hidden` 切换会重启内部动画）。若希望每回合都重画一遍，需 JS 在 `renderEvent` 里给标题加一个类并下一帧移除（P2 可选项，见 §8-3）。**不要为此改 DOM 结构。**

### 4.10 动画 × 既有 v4 动画的合并关系表

| v4 动画 | 现状用处 | v5 处理 |
|---|---|---|
| `cardIn`（`.event-card`） | 事件卡进场 | **保留**（A1 不覆盖 `.event-card`，避免双重动画） |
| `cardIn`（`.modal-card`） | 结果卡进场 | **替换**为 A3 `hdStickerDrop` |
| `statPop`（`.stat-num.pop`） | 数字脉冲 | **替换**为 A5 `hdNumBump` |
| `flagIn`（`.flag-chip.glow` / `.state-chip.glow`） | 徽章进场 | **替换**为 A6 `hdBadgeIn` |
| `tlPulse`（`.tl-item.current .tl-dot`） | 呼吸环 | **替换**为 A4 `hdTlBreath` |
| 通用 `transition` | hover/按压 | 保留，仅按 §4.3 追加倾斜与划动线 |

### 4.11 `prefers-reduced-motion` 完整降级块（**必须整块落地**）

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-delay: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    transition-delay: 0ms !important;
  }
  /* 循环动画彻底关掉（不止"压到 0.01ms"，避免个别引擎仍逐帧走一遍） */
  .tl-item.current .tl-dot { animation: none !important; }
  /* 手绘装饰全部保留静态形态：它们是内容的一部分，不是动效 */
}
```
降级后的验收标准（QA 必须过）：
1. 事件标题下划线**仍然可见**（因为基态可见）。
2. 结局标题**完整可读**（clip-path 结束态 = 全显）。
3. hover 倾斜与划动线**取消**，但按钮的可点性/边框高亮仍在（v4 的 border-color 过渡压到 0.01ms 仍在）。
4. 足迹当前节点**仍可辨认**（静态主色点 + 静态环）。

---

## 5. 移动端与性能

### 5.1 并发上限（硬指标）

| 场景 | 上限 | 说明 |
|---|---|---|
| 同屏同时进行的一次性动画 | **≤ 3 个** | 例如：卡片上浮 + 4 个选项错峰 + 下划线 = 表面 6 个元素，但选项组视为 1 组（120ms 错峰 + 260ms = 380ms，同一条时间轴） |
| 同屏循环动画 | **≤ 1 个** | 只有 `.tl-item.current .tl-dot`，且仅抽屉打开时存在 |
| 手绘装饰元素数量 | 每屏 ≤ 6 个 DOM/pseudo 元素 | 见 §1.3 密度纪律 |
| 单次交互的总动效时长 | **≤ 400ms**（错峰总时长含在内） | 选项组：120ms 错峰 + 260ms = 380ms ✔ |
| 抽屉/模态的过渡 | 保留 v4 的 `.3s` | 不加新过渡 |

### 5.2 `will-change` 使用约束

- **默认全部不用**。现代移动浏览器对 `transform`/`opacity` 动画已有自动提升，手写 `will-change` 常带来"层爆炸"而非收益。
- 若 profiling 证明确实需要，只允许这 **2 个选择器**、且它们平时都处于 `[hidden]`（`display:none` → 不渲染 → 零常驻内存）：
  ```css
  .modal-card     { will-change: transform, opacity; }  /* 仅出现在两个模态内 */
  .timeline-panel { will-change: transform; }           /* 抽屉收起时 hidden */
  ```
- **禁止**：`.card`、`.option-btn`、`.char-card`、`.col-card`、`body`、`*`。禁止在 hover 里临时加 `will-change`（临时提升反而触发重排+层重建）。
- 单页 `will-change` 元素总数 **≤ 2**。

### 5.3 避免布局抖动（只用 transform）

| 别做 | 为什么 | 怎么做 |
|---|---|---|
| 动画 `width` / `height` | 逐帧 layout，长列表直接掉帧 | 用 `transform: scaleX()`（下划线） |
| 动画 `top` / `left` / `margin` | 同上 | `translate3d()` |
| 动画 `box-shadow` | 逐帧重绘（v4 `tlPulse` 就属于此类） | 静态 shadow + `scale`（A4） |
| 动画 `filter: blur()` | 移动端极贵 | 用 `opacity` 层次替代 |
| 给布局容器加 `transform` | 使内部 `fixed` 改参照、`sticky` 行为可疑 | 只给"卡片级元素自身"加（§4.2） |
| 用 `left/top` 定位伪元素后又动画它 | 触发 layout | 伪元素 `position: absolute` + `transform` 位移 |

**另两条工程级注意**
1. 纸纹写在 `body` 的背景层（`background-attachment: fixed`）——**滚动时不重绘**，且不新增层级、不新增元素。这是选它而不是"盖一个全屏伪元素"或"给每张卡片贴纹理"的原因。
2. `backdrop-filter: blur(3px)`（v4 模态遮罩）只在模态出现时生效，与 v5 无叠加，保留即可；**不要在遮罩上再加动画**。

### 5.4 低端机降级（三层，纯 CSS 可触发）

```css
/* 层一：系统/浏览器自报"慢"（Chromium/Safari 支持 update 特性） */
@media (update: slow) {
  .ending-banner::after,                         /* 胶带 */
  .modal-card::after,                            /* 折角 */
  .char-card.selected .char-name::before,        /* 圈画 */
  .col-card-end::after,                          /* 拍立得框角 */
  .col-card-ach.unlocked::before { display: none; }
  .event-title::after { animation: none; }       /* 保留静态下划线，只不播绘制 */
  .option-btn::after { display: none; }          /* 关掉 hover 划动线 */
  .ending-actions { padding-top: 0; }            /* 撤掉为箭头预留的间距 */
}

/* 层二：极窄屏（≤380px，多为老机型/分屏）——只保留"识别核心"三件 */
@media (max-width: 380px) {
  body { background-image: linear-gradient(165deg, var(--bg-a) 0%, var(--bg-b) 100%); }
                                                /* 撤掉横格层，省一次全屏栅格化 */
  .ending-banner::after,                        /* 胶带可能压字 */
  .modal-card::after,                           /* 折角 */
  .ending-actions::before,                      /* 箭头 */
  .char-card.selected .char-name::before,       /* 圈画 */
  .col-card-end::after,
  .col-card-ach.unlocked::before { display: none; }
  .ending-actions { padding-top: 0; }
  /* 保留：事件标题下划线（核心识别）、选中对勾（功能反馈）、当前节点呼吸 */
}

/* 层三（可选，需 1 行 JS）：html.motion-lite 手动/条件降级 */
.motion-lite *, .motion-lite *::before, .motion-lite *::after {
  animation-duration: .01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: .01ms !important;
}
```
> 层二里"撤掉横格"用**重写 `background-image`、不带 `background-attachment`** 的方式即可（简写没写 attachment 时沿用上一条声明，这里显式只留渐变层，视觉上就是"没有横格"）。若担心层叠顺序，也可写成 `background-image: none`（会掉成纯 `--bg-a` 底，略干，不推荐）。

### 5.5 手绘元素在窄屏的缩放

| 元素 | 桌面 | ≤560px | ≤380px |
|---|---|---|---|
| 事件标题下划线 | 高 8px / 宽 min(170px,58%) | 高 7px / 宽 min(140px,54%) | 同 560px |
| 结局横幅胶带 | 92×26px | 80×24px | 隐藏 |
| 小星 | 14–16px | 13px | 12px |
| 拍立得框角 | `inset: 3px` | `inset: 2px` | 隐藏 |

原则：**窄屏只缩尺寸，不改形状、不改色**（形状一致是"同一支笔"的前提）。

---

## 6. 与现有体系的兼容说明

### 6.1 四数值色（绝不参与手绘）

| 检查项 | 结论 |
|---|---|
| 四数值色 `#d9537c / #d9912b / #7a5af8 / #2f9e77` | **一毫不动**，仍是进度条填充 `.stat-fill` 与 `.mini-stat i` 的唯一颜色来源（JS 内联 `background-color`，v4 §8-① 已改好） |
| 手绘笔色是否用到四数值色 | **禁止**。手绘笔只用 `--primary` / `--ink-pencil*` / `--hd-gold` / 白色 |
| 装饰会不会盖住进度条 | 不会。仪表盘 `.stats-panel` 内手绘元素为 **0**（密度纪律 §1.3），只允许状态区上方一条波浪（P2） |
| `.stat-num.pop` 的脉冲 | 只 `transform`，**不改颜色**；四数值色仍只出现在条上 |

### 6.2 涨跌语义

| 语义 | 载体 | v5 是否触碰 |
|---|---|---|
| 升 = 绿 `--up` + `+` + `↑` | `.change-row.up` 的 `.change-delta` / `.change-arrow` 颜色 | **不触碰**。v5 不给 `.change-row` 任何 animation |
| 降 = 红 `--down` + `−` + `↓` | `.change-row.down` | **不触碰**。A5 数字脉冲是**仪表盘 `.stat-num`** 的动画，与结果卡 `.change-delta` 无关 |
| 平 = `--ink-soft` + `±` | `.change-row.flat` | 不触碰 |
| 边界截断提示 `title="…被 0-100 边界截断"` | JS | 不触碰 |

**红线**：任何"闪红/闪绿/抖动=警告"的动画都不允许——那会让玩家把"装饰"读成"危险提示"。

### 6.3 浅色主题锁定（**新增，防移动端自动反色**）

```css
:root { color-scheme: light; }        /* 声明：本页只有浅色 */
```
> **不要**顺手给 `html` 加 `background`：`body` 的背景会默认"传播"到画布，一旦 `html` 有了自己的背景，这个传播就断了——body 的渐变只会在 body 盒子内绘制，滚动越界区会露出另一块颜色。只声明 `color-scheme` 即可，`body { min-height: 100vh }`（v4 已有）足够覆盖视口。
- **不做深色模式**（延续 v4 §6-3）。`prefers-color-scheme: dark` **不处理**，靠 `color-scheme: light` 明确拒绝 Android Chrome / 部分国产浏览器的"强制深色"自动反色——否则手绘笔色 `#4a4660` 会被反成亮色、纸纹变成黑点，整套规格失效。
- 所有手绘元素在 `#fff` 卡面 / `#f8f4ec~#eaeef7` 背景上对比水平已标注（§1.2），无一处依赖深色底。
- 结局横幅是唯一的深色底（四 tone 渐变，v4 保留）：其上笔色一律 `rgba(255,255,255,.55~.7)`。

### 6.4 对比度自查表（新增装饰色）

| 元素 | 前景 | 背景 | 比值 | 承载信息？ | 判定 |
|---|---|---|---|---|---|
| 事件标题下划线 | `#4a5fd0` | `#fff` | ≈5.4:1 | 否（装饰） | ✔ 远超要求 |
| 选中卡对勾 | `#4a5fd0` | `#fff`/`#f7f7ff` | ≈5.3:1 | 是（有文案与边框兜底） | ✔ |
| 圈画 / 星 / 波浪 | `#8b879d` | `#fff` | ≈3.5:1 | 否 | ✔（仅装饰，≥3:1） |
| 折角 / 框角 | `#b6b2c4` | `#fff` | ≈2.1:1 | 否 | ✔（纯氛围，允许低对比） |
| 结局横幅胶带 | `rgba(255,255,255,.55)` | 渐变底 | ≈2.5–3:1 | 否 | ✔（且不压文字） |
| 纸纹横格线 | `rgba(120,110,90,.045)` | `#f8f4ec` | ≈1.02:1 | 否 | ✔（不得再提高透明度） |
| 正文（未改动） | `#34314a` | `#fff` | ≈11.6:1 | 是 | ✔ |

> 纸纹硬度上限：**`alpha ≤ .05`**。超过这个值，正文观感会变"脏"，且截图压缩后出现横条纹。

### 6.5 emoji 体系共存

v4 §6-5 的 emoji（👥🌤🏆⚡📜✦✓）继续使用，**不替换为 SVG**：
- emoji 是"群聊感"的一部分，也是零资源方案；
- 手绘 SVG 只在 emoji 无法表达的地方出现（线、胶带、圈、箭头、折角）；
- 唯一例外：`.char-card.selected` 的 `✓` 换成 `hd-check`（emoji/文字勾在不同字体下胖瘦差异大，且它紧贴人名牌，形变影响排版）。

### 6.6 不做的事（v5 边界）

1. 不引入任何图片/图标库/字体文件/构建。
2. 不做深色模式，不做主题切换。
3. 不改四数值色、不改涨跌符号与颜色、不改结局横幅四色调。
4. 不改 DOM 结构；全部通过**新增伪元素 / 新增 class / 覆盖少量 v4 规则**实现；HTML 改动仅限 P2 的 2 处内联 SVG（可选）。
5. 不给正文加任何动画、纹理叠加、字距、阴影。
6. 不做视差、不做滚动触发动画、不做 `IntersectionObserver`、不引入第三方库。
7. 不做 SVG 滤镜（`feTurbulence` / `feDisplacementMap`）——"手绘噪点"用几何不规则代替。
8. 不使用 `mix-blend-mode`。

---

## 7. 落地清单（工程照此执行）

### P0（先做这几项，气质立变）

| # | 内容 | 文件 | 位置 |
|---|---|---|---|
| 1 | §1.2 设计令牌（`--ink-pencil*`、`--hd-*`、时长曲线） | `css/style.css` | `:root` 内追加 |
| 2 | §2.14 十个 `--hd-*` data URI 变量 + §2.1 `.hd-mask*` 工具类 | `css/style.css` | 文件末尾追加 |
| 3 | §4.2 A1 `hdRise`（卡片上浮 + 选角卡错峰） | `css/style.css` | 末尾追加 |
| 4 | §4.3 A2/A2-b（选项入场 + hover 铅笔划动与倾斜） | `css/style.css` | 需覆盖 v4 的 `.option-btn:hover` transform 那一行 |
| 5 | §2.3 `hd-line` 事件标题下划线 + `.event-text { margin-top: 6px }` 补偿 + §4.9 A8 绘制 | `css/style.css` | 追加 + 改 1 行 |
| 6 | §4.4 A3 结果卡 `hdStickerDrop` | `css/style.css` | **替换** `.modal-card` 的 `animation:` |
| 7 | §4.11 `prefers-reduced-motion` 完整块 | `css/style.css` | **替换** v4 那块 |
| 8 | §6.3 `color-scheme: light` | `css/style.css` | `:root` |
| 9 | §2.6 结局横幅胶带 + §2.5 用点 A/B 标题页小星 | `css/style.css` | 追加 |
| 10 | §3.3 纸纹（`body` 背景层横格） | `css/style.css` | 追加（覆盖 `body` 的 background 简写） |
| 11 | §5.4 层一/层二降级 | `css/style.css` | 追加 |

### P1

| # | 内容 | 文件 |
|---|---|---|
| 12 | §2.4 `hd-wave`（`.tl-chapter::after` 波浪） | `css/style.css`（改 1 条规则） |
| 13 | §2.10 `hd-check` 替换选中卡 `✓` | `css/style.css`（改 1 条规则） |
| 14 | §2.9 `hd-circle` 选中卡人名圈画 | `css/style.css`（+1 条 `.char-name` 需 inline-block） |
| 15 | §2.7 `hd-fold` 结果卡折角 | `css/style.css` |
| 16 | §2.8 `hd-arrow`（选角页微调提示 + 结局页按钮上方） | `css/style.css` |
| 17 | §4.5 A4 呼吸 / §4.6 A5 数字脉冲 / §4.7 A6 徽章抖动（三条替换） | `css/style.css` |
| 18 | §2.6 须知卡顶胶带 | `css/style.css`（`.notice-card{position:relative}`） |

### P2

| # | 内容 | 文件 |
|---|---|---|
| 19 | §2.11 `hd-frame` 图鉴结局卡 | `css/style.css` |
| 20 | §4.8 A7 结局标题手写揭开 | `css/style.css` |
| 21 | §2.12 `hd-cup` 须知页支持区 | `index.html`（1 行内联 SVG）+ `css/style.css` |
| 22 | §2.13 `hd-flower` 标题页页脚 | `index.html`（1–2 行内联 SVG） |
| 23 | §2.5 用点 C 成就卡右上小星（金色） | `css/style.css` |
| 24 | 可选：`hd-*` 的 `will-change`（仅 2 处） | `css/style.css` |

**JS 改动：0 处**（§8-3 的增强未纳入本规格，不做不影响任何视觉产出）。

---

## 8. 给工程的硬性注意点与风险

1. **`animation-fill-mode` 只能是 `backwards`**，不能是 `both`/`forwards`——否则 `.char-card:hover`、`.option-btn:hover` 的位移会被动画末帧永久压制（表现＝"hover 坏了"）。这是本规格最容易踩的一脚。
2. **基样式必须是"最终可见态"**，首帧写进 `@keyframes from`。任何"靠动画把 `opacity:0` 的元素救回来"的写法，在 `prefers-reduced-motion` 下都会变成"内容消失"。
3. **事件标题下划线的绘制动画：每进入一次游戏屏幕播一次，不是每回合。** 这是有意的取舍——每回合的"动"集中在 4 个选项上（A2），避免整屏都在动。若产品侧要求每回合重播，需要 **2 处**改动（CSS 把动画挂到 `.event-title.hd-draw::after` + `ui.js` 的 `renderEvent` 末尾切一次类），属可选增强，本规格不纳入、也不建议在没有 profiling 前做。
4. **唯一会改变布局的一处**：`.event-title::after` 是块级伪元素，会让标题盒高 +11px。必须同步把 `.event-text` 的 `margin-top` 从 `16px` 改成 `6px`。若不改，标题与正文之间多出 10px 空隙（不影响功能，但会被看出"这里塌了"）。第二处轻微间距：`.ending-actions { padding-top: 14px }`（为箭头留位），已在该节注明可选回退。
5. **`.option-btn` 需要 `position: relative`**，且 `::after` 的 `bottom: 5px` 依赖当前的 `padding: 15px 18px`。若后续调整按钮内边距，请同步核对 `bottom` 值不超过底部内边距。
6. **无 `#` 的 data URI**：所有 mask 版 SVG 内部**不使用十六进制颜色**（统一用 `black`/`currentColor` + `opacity`），这样 data URI 里不需要 `%23` 转义，减少工程复制粘贴出错概率。若自行修改 SVG 请保持这个约定。
7. **SVG 必须带 `aria-hidden="true" focusable="false"`**（mask 版天然不进可访问树）。唯一的"语义型"手绘是选中对勾——它旁边始终有文字与边框状态兜底。
8. **纸纹走 `body` 自己的 `background-image`**，因此它会覆盖 v4 的 `background: linear-gradient(...) fixed` 简写——必须用显式属性（`background-image` / `-repeat` / `-attachment` / `-size`）重写那 4 条，**不要把新规则写成 `background:` 简写**，否则会把横格层冲掉。卡片 `.card` 的纯白背景会自动遮住横格，这正是我们要的"卡片是印的"。
9. **不要在 `.screen` / `.game-layout` / `.select-layout` 上加动画或 `transform`**——它们内部有 `position: sticky`（`.stats-panel`、`.char-detail`）与未来可能的 fixed 子元素。
10. **`backdrop-filter` 与纸纹层不要互相叠**：模态遮罩已有 `blur(3px)`，纸纹在 body 背景层上，两者天然分离；但若有人给 `body` 或 `.card` 再加 `filter`，全页会掉到 ~20fps。
11. **真机验收清单（QA 用）**：
    - 360×640 / 390×844 两档竖屏：标题下划线不压正文、胶带不压白字、选项划动线不出框、结局页箭头不挤出屏幕；
    - 开启系统"减弱动态效果"：下划线可见、结局标题完整、hover 无倾斜、当前节点仍可辨；
    - 图鉴"全解锁"状态：成就卡对勾不与名字重叠；
    - 结果卡长叙述（>6 行）：折角不压文字、遮罩可滚动、胶带不压叙述首行；
    - 低端安卓（若有）：滚动时无横格纹闪烁、抽屉开合无掉帧。

---

## 附录 A · P0 一次性粘贴块

> 直接追加到 `game/css/style.css` **末尾**（其中标注「替换」的 3 条需先删掉 v4 对应行）。已按落地顺序排好。

```css
/* =========================================================
 * v5：手绘风与动画（增量层，不改 v4 任何既有效果）
 * 设计：卡片是印的，批注是手写的。零图片/零字体/零 JS。
 * ========================================================= */

/* ---------- 1. 设计令牌 ---------- */
:root {
  --ink-pencil:       #4a4660;
  --ink-pencil-soft:  #8b879d;
  --ink-pencil-faint: #b6b2c4;
  --hd-gold:          #d9a13c;
  --hd-w-bold: 2px;
  --hd-w-thin: 1.4px;
  --hd-tilt-a: -1.6deg;
  --hd-tilt-b:  1.2deg;
  --hd-tilt-c: -0.8deg;
  --hd-ease: cubic-bezier(.22, 1, .36, 1);
  --hd-pop:  cubic-bezier(.34, 1.4, .64, 1);
  --hd-t-1: .15s;
  --hd-t-3: .36s;
  color-scheme: light;                 /* 锁定浅色，拒绝移动端强制反色 */
}

/* ---------- 2. 手绘 SVG（mask 源，alpha 通道，颜色由 background-color 控制） ---------- */
:root {
  --hd-line: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 10' preserveAspectRatio='none'%3E%3Cpath d='M2 6.5C40 3.2 78 8.4 116 5.2S172 2.6 198 5.8' fill='none' stroke='black' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M6 8.7C44 6.1 80 9.9 118 7.4S170 5.4 194 8.2' fill='none' stroke='black' stroke-width='1' stroke-linecap='round' opacity='.45'/%3E%3C/svg%3E");
  --hd-wave: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 8' preserveAspectRatio='none'%3E%3Cpath d='M0 4q10-4 20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E");
  --hd-tape: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 34'%3E%3Cpath d='M3 7q57-4 114 1l-2 19q-56 5-113-1z' fill='black' fill-opacity='.18' stroke='black' stroke-width='1.8' stroke-linejoin='round'/%3E%3Cpath d='M14 8.4l-4 20M34 7.4l-4 20M54 6.9l-4 20M74 7.4l-4 20M94 7.9l-4 20' fill='none' stroke='black' stroke-width='1' opacity='.35'/%3E%3C/svg%3E");
  --hd-fold: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath d='M31 1v19L12 1z' fill='black' fill-opacity='.07' stroke='black' stroke-width='1.5' stroke-linejoin='round'/%3E%3Cpath d='M12 1l9 10 10 9' fill='none' stroke='black' stroke-width='1.1' stroke-linecap='round' opacity='.5'/%3E%3C/svg%3E");
  --hd-arrow: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 72 44'%3E%3Cpath d='M5 33C21 36 41 28 62 12' fill='none' stroke='black' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M62 12l-12 1.6M62 12l-2.4 10.6' fill='none' stroke='black' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E");
  --hd-star: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 3c.6 5 1.4 6.4 6.6 9-5.2 2.6-6 4-6.6 9-.6-5-1.4-6.4-6.6-9 5.2-2.6 6-4 6.6-9z' fill='none' stroke='black' stroke-width='1.6' stroke-linejoin='round'/%3E%3C/svg%3E");
  --hd-cup: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 26'%3E%3Cpath d='M5 10.5q0 11 8 11t8-11z' fill='none' stroke='black' stroke-width='1.7' stroke-linejoin='round'/%3E%3Cpath d='M21 12.4q4.2.5 3.3 3.1-.9 2.4-3.7 1.5' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round'/%3E%3Cpath d='M9.6 6.6q1.8-2.1-.4-3.8M14.2 6.6q1.8-2.1-.4-3.8' fill='none' stroke='black' stroke-width='1.3' stroke-linecap='round' opacity='.7'/%3E%3C/svg%3E");
  --hd-circle: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 60' preserveAspectRatio='none'%3E%3Cpath d='M21 15C60 3 118 4 131 21c10 15-32 32-71 32C22 53 3 41 9 25c5-12 32-19 55-18' fill='none' stroke='black' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E");
  --hd-check: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M3.5 12.5c3 3 5 5.6 6.2 8.2C13.4 13.6 17.4 7.6 21.6 2.6' fill='none' stroke='black' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  --hd-frame: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 140' preserveAspectRatio='none'%3E%3Cg fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round'%3E%3Cpath d='M1 11V1h10'/%3E%3Cpath d='M109 1h10v10'/%3E%3Cpath d='M119 129v10h-10'/%3E%3Cpath d='M11 139H1v-10'/%3E%3C/g%3E%3C/svg%3E");
}

/* ---------- 3. 纸张纹理：横格纸（写进 body 背景层，卡片白底自然遮住） ---------- */
/* 注意：必须用显式属性覆盖 v4 的 background 简写，不能写 background: 简写，
   否则会把 v4 的渐变冲掉。 */
body {
  background-color: var(--bg-a);
  background-image:
    repeating-linear-gradient(0deg,
      rgba(120, 110, 90, .045) 0, rgba(120, 110, 90, .045) 1px,
      transparent 1px, transparent 26px),
    linear-gradient(165deg, var(--bg-a) 0%, var(--bg-b) 100%);
  background-repeat: repeat, no-repeat;
  background-attachment: fixed, fixed;
  background-size: auto, cover;
}

/* ---------- 4. A1 卡片上浮（只加卡片级元素，绝不加布局容器） ---------- */
@keyframes hdRise {
  from { opacity: 0; transform: translate3d(0, 10px, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
}
.page-head, .ending-banner, .ending-card, .collect-card,
.notice-card, .stats-panel, .char-card {
  animation: hdRise .3s var(--hd-ease) backwards;   /* backwards：不吃 hover */
}
.char-card:nth-of-type(1) { animation-delay: 0ms; }
.char-card:nth-of-type(2) { animation-delay: 35ms; }
.char-card:nth-of-type(3) { animation-delay: 70ms; }
.char-card:nth-of-type(4) { animation-delay: 105ms; }

/* ---------- 5. A2 选项入场 + A2-b hover 铅笔划动 ---------- */
@keyframes hdOptionIn {
  from { opacity: 0; transform: translate3d(-6px, 8px, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
}
.event-options > .option-btn { animation: hdOptionIn .26s var(--hd-ease) backwards; }
.event-options > .option-btn:nth-child(1) { animation-delay: 0ms; }
.event-options > .option-btn:nth-child(2) { animation-delay: 40ms; }
.event-options > .option-btn:nth-child(3) { animation-delay: 80ms; }
.event-options > .option-btn:nth-child(4) { animation-delay: 120ms; }

.option-btn { position: relative; }
.option-btn::after {
  content: ''; position: absolute; left: 18px; right: 18px; bottom: 5px; height: 6px;
  background-color: var(--primary);
  -webkit-mask: var(--hd-line) left center / 100% 100% no-repeat;
  mask: var(--hd-line) left center / 100% 100% no-repeat;
  transform-origin: left center; transform: scaleX(.18); opacity: 0;
  transition: opacity var(--hd-t-1) ease-out, transform .26s var(--hd-ease);
  pointer-events: none;
}
.option-btn:hover:not(.disabled)::after,
.option-btn:focus-visible::after { opacity: .5; transform: scaleX(1); }
/* 替换 v4 的 .option-btn:hover:not(.disabled) { transform: translateX(4px); ... } 中的 transform */
.option-btn:hover:not(.disabled) { transform: translateX(4px) rotate(-.35deg); }
@media (pointer: coarse) {
  .option-btn:hover:not(.disabled) { transform: none; }
  .option-btn:active:not(.disabled)::after { opacity: .45; transform: scaleX(1); }
  .option-btn:active:not(.disabled) { transform: scale(.994); }
}
@media (max-width: 560px) { .option-btn::after { left: 14px; right: 14px; } }

/* ---------- 6. 事件标题手绘下划线（P0 核心） ---------- */
/* 左对齐标题：只加字距与极淡重影；禁 text-indent（那是居中宽字距标签的补偿） */
.event-title { position: relative; letter-spacing: .035em;
               text-shadow: 0 1px 0 rgba(38, 35, 53, .06); }
.event-title::after {
  content: ''; display: block; width: min(170px, 58%); height: 8px; margin-top: 3px;
  background-color: var(--primary);
  -webkit-mask: var(--hd-line) left center / 100% 100% no-repeat;
  mask: var(--hd-line) left center / 100% 100% no-repeat;
  transform-origin: left center;
  animation: hdGrow var(--hd-t-3) var(--hd-ease) backwards;
}
@keyframes hdGrow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.event-text { margin-top: 6px; }        /* 补偿标题盒 +11px，总间距基本不变 */
@media (max-width: 560px) {
  .event-title::after { height: 7px; width: min(140px, 54%); }
}

/* ---------- 7. A3 结果卡＝贴纸落下（替换 .modal-card 的 cardIn） ---------- */
@keyframes hdStickerDrop {
  0%   { opacity: 0; transform: translate3d(0, -18px, 0) rotate(-1.6deg) scale(.97); }
  62%  { opacity: 1; transform: translate3d(0, 3px, 0)   rotate(.6deg)  scale(1.006); }
  100% { opacity: 1; transform: translate3d(0, 0, 0)     rotate(0)      scale(1); }
}
.modal-card { animation: hdStickerDrop .38s var(--hd-pop) backwards; }

/* ---------- 8. 结局横幅纸胶带（白笔，只压角不压字） ---------- */
.ending-banner::after {
  content: ''; position: absolute; top: -6px; left: 12px;
  width: 92px; height: 26px; color: rgba(255, 255, 255, .55);
  background-color: currentColor; transform: rotate(var(--hd-tilt-a));
  -webkit-mask: var(--hd-tape) center / 100% 100% no-repeat;
  mask: var(--hd-tape) center / 100% 100% no-repeat;
  pointer-events: none;
}

/* ---------- 9. 减弱动态偏好（替换 v4 的整块） ---------- */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-delay: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    transition-delay: 0ms !important;
  }
  .tl-item.current .tl-dot { animation: none !important; }
}

/* ---------- 10. 极窄屏：保住识别核心，删掉可选装饰 ---------- */
@media (max-width: 380px) {
  body { background-image: linear-gradient(165deg, var(--bg-a) 0%, var(--bg-b) 100%); }
  .ending-banner::after { display: none; }
  .modal-card::after { display: none; }
}
```

**P1/P2 追加块请照 §2、§4 各小节的代码逐段粘贴**（都已标注"覆盖/替换 v4 的哪一行"）。核心原则只有一句：

> **基样式 = 可见终态，首帧写进 keyframes，填充用 `backwards`，只动 `transform` 和 `opacity`。**
