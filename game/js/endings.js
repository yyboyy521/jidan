/* =========================================================
 * endings.js —— 多结局数据 + 结局判定（EndingResolver）
 * ---------------------------------------------------------
 * 模块边界：
 *   结局数据（GAME.ENDINGS）与判定器分离。
 *   判定器只读最终数值 + 剧情印记 + 状态快照，从上到下取第一个命中的结局；
 *   最后一条 match 为空对象 = 兜底结局（永远命中）。
 *
 * 结局 JSON Schema：
 *   {
 *     "id":        "end_xxx",
 *     "tone":      "good" | "mid" | "bad" | "plain",  // 影响结局画面配色
 *     "title":     "……",
 *     "condition": "一句通俗的触发条件（图鉴里【解锁后】才展示）",
 *     "text":      "结语",
 *     "match": {   // 与事件 requires 同一套结构
 *       "stats":  { "fame": [70, 100], "relation": [60, 100] },
 *       "flags":  ["有外号"],
 *       "states": { "状态名": [min, max] }   // v5 起不再使用，保留契约
 *     }
 *   }
 *   注意：结局判定里的 stats 区间是【终值】判定，不是增减量。
 *
 * v3 变更：队列头部新增 4 个【崩坏结局】（任一数值归零 → 提前结束）。
 * v4 变更：阈值按新数值体系重校准；三个结局曾用状态累积数判定。
 * v5 变更（本次）：
 *   1. 状态改为「有时长的短时状态」后，终局状态是随机残留，
 *      不能再作为结局门槛（否则同一操作有时算有时不算）。因此
 *      v5 的结局只用【终值 + 剧情印记 flag】判定，match.states
 *      子句保留但不再使用（引擎侧仍兼容）。
 *   2. 阈值按 v5 事件库实际可达性重新校准（1600 局模拟，
 *      见 design/content-v5.md 第 7 节）：人际/声望/心情的高位
 *      都能摸到 100，精力是纯消耗型资源，因此精力类结局阈值下调。
 *   3. 每条结局新增 condition 字段：一句通俗的条件描述，
 *      不出现变量名，图鉴里【已解锁】后展示，未解锁不剧透。
 * ========================================================= */
window.GAME = window.GAME || {};

GAME.ENDINGS = [
  /* ---------- 潜水大师（v5.1：优先级最高的非崩坏结局） ----------
   * 判定 = 人际见底（relation ≤ 40）+ 明确的潜水选择（flag「潜水大师」，
   *   全库仅由 ev_lurker 第 3 个选项「关掉群，继续潜」写入）。
   * 放在崩坏结局之前：选了潜水的人关系见底时，收在「潜水大师」而不是
   *   「查无此人」；没选过潜水的人即使人际很低也照旧走崩坏判定，
   *   因此 4 个崩坏结局与 ach_all（集齐 12 结局）仍然全部可达。 */
  {
    id: 'end_lurker',
    tone: 'mid',
    title: '潜水大师',
    condition: '一学期结束时人际很低，几乎全程潜水',
    match: { stats: { relation: [0, 40] }, flags: ['潜水大师'] },
    text: '一个学期，你发的消息不超过二十条，但二百条未读你一条没落。群里的每个梗你都懂，每个人你都熟，只是他们不太知道你。散场那天有人考古翻到你进群时的欢迎语，你看着屏幕笑了笑，关掉了免打扰。',
  },
  /* ---------- 崩坏结局（数值归零，提前收场） ---------- */
  {
    id: 'end_zero_energy',
    tone: 'bad',
    title: '电量耗尽',
    condition: '精力被用到一点不剩，这一局提前散场',
    match: { stats: { energy: [0, 0] } },
    text: '群里还在热闹，你的手机屏幕暗了下去。社交是有限额的，你把这个学期的额度全部花完了。下学期，记得先给自己充会儿电。',
  },
  {
    id: 'end_zero_mood',
    tone: 'bad',
    title: '绷断了',
    condition: '心情被磨到一点不剩，这一局提前散场',
    match: { stats: { mood: [0, 0] } },
    text: '那个深夜你打了很长一段话，又一个字一个字删掉了。再后来你连打开群的力气都没有。这不是你想要的大学，但你也没力气说要什么。',
  },
  {
    id: 'end_zero_relation',
    tone: 'bad',
    title: '查无此人',
    condition: '人际关系掉到一点不剩，这一局提前散场',
    match: { stats: { relation: [0, 0] } },
    text: '学期结束那天，有人在群里问：「那位是谁来着？」没有人回答，因为没有人记得。潜水潜得太久，连气泡都不冒了。',
  },
  {
    id: 'end_zero_fame',
    tone: 'bad',
    title: '群聊隐身人',
    condition: '声望掉到一点不剩，这一局提前散场',
    match: { stats: { fame: [0, 0] } },
    text: '二百条消息刷过去，没有一条和你有关。你发过言，但没人记住；你帮过忙，但没人认领。存在感这东西，欠得太久就还不上了。',
  },

  /* ---------- 常规结局（终值 + 剧情印记，优先级从上到下） ---------- */
  {
    id: 'end_pet',
    tone: 'good',
    title: '群宠本宠',
    condition: '一学期结束时人际很高，而且被群友起了外号',
    match: { stats: { relation: [85, 100] }, flags: ['有外号'] },
    text: '一个学期过去，你在群里的外号比真名还响。你一发消息，三秒内必有人接；你一问谁吃饭，队形自动排好。[拥抱][拥抱]——当初欢迎你的那排表情，现在轮到你发给新人了。',
  },
  {
    id: 'end_top',
    tone: 'good',
    title: '卷王登基',
    condition: '一学期结束时声望很高，而且真的卷过一阵子',
    match: { stats: { fame: [85, 100] }, flags: ['卷过'] },
    text: '期末排名出来那天，群里有人转了你的成绩，配文：「参见卷王。」你回了个[合十]。从「大不了自己学」到期末满绩，这条路你一个人走完了——但庆功的时候，群里比你还热闹。',
  },
  {
    id: 'end_gym',
    tone: 'good',
    title: '薄肌战神',
    condition: '跟着群友进过健身房，而且一学期结束时精力还很足',
    match: { stats: { energy: [50, 100] }, flags: ['mol过'] },
    text: '体测成绩出来，你的引体向上是全专业数得着的。有人在群里问：「这位的身材是健美级别的还是薄肌呀？」你回了四个字：「我才是薄肌。」群里充满了快活的空气。',
  },
  {
    id: 'end_memelord',
    tone: 'good',
    title: '梗图批发商认证',
    condition: '一学期结束时声望很高，人际也不错',
    match: { stats: { fame: [70, 100], relation: [60, 100] } },
    text: '这个学期，群里的表情包有一半出自你手，名场面有一半因你而起。你随口一句话就能被做成图、被复读、被存进群精华。二百条群消息里，一百条是你的传说，另外一百条是对你传说的 reaction。',
  },
  {
    id: 'end_melon',
    tone: 'mid',
    title: '瓜田守护者',
    condition: '人际不低，而且当过一次群里的情感军师',
    match: { stats: { relation: [60, 100] }, flags: ['网恋军师'] },
    text: '从168亿到奔现翻车，这学期的瓜你一个没落下，还顺手当了回军师。现在群里一有感情问题，第一个@的就是你。你没谈过恋爱，但你懂所有的恋爱——这就是吃瓜吃到大成的境界。',
  },
  {
    id: 'end_happy',
    tone: 'mid',
    title: '快乐小登',
    condition: '一学期结束时心情特别好',
    match: { stats: { mood: [85, 100] } },
    text: '绩点平平，存在感一般，但你是真快乐。疯狂星期四你跟了，168亿你笑了，旦苑你骂了也吃了。有人问大学怎么过才算值，你把这学期的群聊精华翻给他看：就按这个过。',
  },
  {
    id: 'end_normal',
    tone: 'plain',
    title: '下学期见',
    condition: '没踩中上面任何一条，就这么过完了这一学期',
    match: {},
    text: '这学期像一顿旦苑的饭：说不上多好吃，但也吃完了。群还是那个群，二百条消息还是每天准时到货。寒假快乐——下学期换个活法，或者，接着这样也挺好。',
  },
];

(function () {
  'use strict';

  /* 复用事件系统的区间判断逻辑（stats 区间语义在结局侧 = 终值） */
  function matchStat(rule, value) {
    if (typeof rule === 'number') return value >= rule;
    if (Array.isArray(rule)) return value >= rule[0] && value <= rule[1];
    return true;
  }

  /* state: { stats, flags, states? }（engine.js 传入终局快照；
   * v5：states 为「有效状态表」，match.states 仅作兼容保留，当前数据未使用） */
  function EndingResolver(endings) {
    this._endings = endings || window.GAME.ENDINGS;
  }

  EndingResolver.prototype.resolve = function (state) {
    for (var i = 0; i < this._endings.length; i++) {
      var e = this._endings[i];
      var m = e.match || {};
      var ok = true;
      if (m.stats) {
        var keys = Object.keys(m.stats);
        for (var j = 0; j < keys.length; j++) {
          if (!matchStat(m.stats[keys[j]], state.stats[keys[j]])) { ok = false; break; }
        }
      }
      if (ok && m.flags) {
        for (var k = 0; k < m.flags.length; k++) {
          if (!state.flags[m.flags[k]]) { ok = false; break; }
        }
      }
      if (ok && m.states) {
        var skeys = Object.keys(m.states);
        for (var s = 0; s < skeys.length; s++) {
          var sv = (state.states && state.states[skeys[s]]) || 0;
          if (!matchStat(m.states[skeys[s]], sv)) { ok = false; break; }
        }
      }
      if (ok) return e;
    }
    return this._endings[this._endings.length - 1]; // 兜底
  };

  window.EndingResolver = EndingResolver;
})();
