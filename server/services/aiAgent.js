/**
 * AI 协商 Agent —— 大模型驱动 + 强化规则兜底
 * - 优先调用 OpenAI 兼容网关（默认京东云 ai-api.jdcloud.com，模型 GLM-5.1）
 * - 通过环境变量配置：AI_API_KEY / AI_BASE_URL / AI_MODEL
 * - 未配置或调用失败时自动降级到规则引擎，规则引擎也尽量"有人味"
 */

const AI_API_KEY = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || '';
const AI_BASE_URL = (process.env.AI_BASE_URL || 'http://ai-api.jdcloud.com/v1').replace(/\/$/, '');
const MODEL = process.env.AI_MODEL || process.env.AI_NEGOTIATION_MODEL || 'GLM-5.1';
const MAX_TOKENS = Number(process.env.AI_MAX_TOKENS) || 2000;
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 30000;

const MAX_RETRIES = Number(process.env.AI_MAX_RETRIES) || 3;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 统一的 OpenAI 兼容 Chat Completions 调用（含 429 限流退避重试） */
async function chatCompletion({ system, messages, maxTokens = MAX_TOKENS, timeoutMs = TIMEOUT_MS, disableThinking = false, maxRetries = MAX_RETRIES, backoffBase = 800 }) {
  if (!AI_API_KEY) return null;
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'system', content: system }, ...messages],
  };
  // 关闭推理模式（大幅提速：7-9s → 2-3s），用于外呼等对时延敏感的场景
  if (disableThinking) body.chat_template_kwargs = { enable_thinking: false };

  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let resp;
    try {
      resp = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      lastErr = e;
      // 网络错误/超时：退避后重试
      if (attempt < maxRetries) { await sleep(backoffBase * Math.pow(2, attempt)); continue; }
      throw e;
    } finally {
      clearTimeout(timer);
    }

    // 限流：指数退避后重试
    if (resp.status === 429 && attempt < maxRetries) {
      const wait = backoffBase * Math.pow(2, attempt);
      console.warn(`[aiAgent] 429 限流，第 ${attempt + 1} 次退避 ${wait}ms 后重试`);
      await sleep(wait);
      continue;
    }
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`gateway ${resp.status}: ${errText.slice(0, 200)}`);
    }
    const data = await resp.json();
    return (data.choices?.[0]?.message?.content || '').trim();
  }
  throw lastErr || new Error('gateway 429: rate limited after retries');
}

function pick(arr, exclude = []) {
  const pool = arr.filter(x => !exclude.includes(x));
  const src = pool.length ? pool : arr;
  return src[Math.floor(Math.random() * src.length)];
}

/* =============== 商家备注硬约束解析 =============== */
function parseRemarkConstraints(remark) {
  const c = { hardCeiling: null, exclude: [], notes: remark || '' };
  if (!remark) return c;
  const m = remark.match(/最多?[补打赔][\s]*(\d+)/) || remark.match(/上限[\s]*(\d+)/) || remark.match(/(\d+)[\s]*以内/);
  if (m) c.hardCeiling = Number(m[1]);
  if (/不[换补]货|没库存|不接受换货|不换/.test(remark)) c.exclude.push('exchange', 'reship');
  if (/不打款|不退现金|不要退钱/.test(remark)) c.exclude.push('refund');
  if (/只能?(?:用|发)?券|只给券/.test(remark)) c.exclude.push('refund', 'reship', 'exchange');
  return c;
}

/* =============== 强化的意图识别 =============== */
function detectIntent(text) {
  if (!text) return 'silence';
  const t = String(text);
  // 优先识别"找人工"——这是用户最强的信号
  if (/(人工|转人工|找人|换个人|真人|让人来|不跟[你机]说|要客服|找客服|叫客服)/.test(t)) return 'request_human';
  // 强情绪
  if (/(投诉|315|消协|律师|起诉|曝光|媒体|工商|曝你|网曝|恶心|垃圾|无良)/.test(t)) return 'anger';
  if (/(气死|生气|烦死|搞什么|我服了|无语|你们什么意思|敷衍|糊弄|应付)/.test(t)) return 'anger';
  // 接受
  if (/^(好的?|可以|行|同意|接受|没问题|那就这样|就这样|ok|嗯好|嗯可以|成|可以的|行吧|好的可以|嗯|是|对)[!?。！？～~。\s]*$/i.test(t)) return 'accept';
  if (/(^|[，。！？\s])(好的?|可以|行|同意|接受|可以接受|没问题|就这样|那就[选定要]|就要这个|要这个)([。！？\s]|$)/.test(t) && !/不/.test(t)) return 'accept';
  // 拒绝
  if (/(不行|不可以|不接受|不同意|不要|不够|太少|怎么这么少|这点钱|开玩笑|不能接受|拒绝|不满意)/.test(t)) return 'reject';
  // 提供详细信息
  if (t.length >= 10 && /(因为|是因为|具体是|问题是|当时|收到|发现|拍照|拍了|看到|图片|照片|视频|前天|昨天|今天|刚|有[一一]|出现)/.test(t)) return 'clarify_provided';
  // 提问
  if (/[？?]|什么意思|怎么|为啥|为什么|是吗|然后呢|具体|怎么操作|怎么弄|啥时候|多久/.test(t)) return 'ask';
  if (t.length < 3) return 'silence';
  return 'neutral';
}

/* =============== 构造 System Prompt =============== */
function buildSystemPrompt({ template, serviceOrder, session }) {
  const constraints = parseRemarkConstraints(session.merchant_remark);
  const ceiling = constraints.hardCeiling != null
    ? constraints.hardCeiling
    : Math.min(template.refund_ceiling || 0, (serviceOrder.price || 0) * (serviceOrder.quantity || 1) * (template.refund_ratio || 0.2));
  const exclude = new Set(constraints.exclude);
  const couponList = (() => { try { return JSON.parse(template.coupon_options || '[]'); } catch { return []; } })();
  const handoffWords = (() => { try { return JSON.parse(template.handoff_keywords || '[]'); } catch { return []; } })();

  const allow = {
    refund: !!template.allow_refund && !exclude.has('refund'),
    coupon: !!template.allow_coupon && !exclude.has('coupon'),
    reship: !!template.allow_reship && !exclude.has('reship'),
    exchange: !!template.allow_exchange && !exclude.has('exchange'),
  };

  const styleHint = ({
    warm: '温暖、亲切、像邻家姐姐，自然口语化，可适度使用"哎/嗯/那个/这样啊"等口头语',
    professional: '专业、稳重、清晰，礼貌但不刻板，少口语词',
    chill: '轻松、自然、不端着，但不油腻',
  })[template.agent_style] || '温暖、亲切、自然口语化';

  const channelHint = session.channel === 'voice'
    ? `本次是【电话外呼】场景，你说的话会被转成语音念给消费者听。请做到像真人打电话一样自然：
- 本轮只说一段话（一个 JSON），整体控制在 30-60 字，简短但要把意思说完整，不要半句就停。
- 多用口语连接词和语气词："那个""这样哈""您看哈""嗯嗯""行嘞""哎呀"，但别堆太密。
- 顺着对方的话接，先简短回应情绪（"我懂我懂""明白您意思"）再说方案，共情和方案揉在同一句里。
- 不要书面腔：别说"针对您的问题""根据相关规定""为您提供如下方案"，改成大白话。
- 一次只报一个方案，等对方反应；不要一口气报一堆。`
    : '本次是【在线会话】场景，单条回复控制在 60-90 字。';

  const scenarioBlock = template.scenario === 'clarify'
    ? `# 当前场景：售后原因澄清
你的目标：消费者填写的售后原因不清晰（如"东西不好""有问题"），你需要通过 2-4 轮对话问出：
- 具体问题点（哪里坏 / 哪里不对 / 是什么现象）
- 发生时间（收到就有 / 用了一段时间 / 物流损坏）
- 是否有图片/视频证据

绝不协商任何赔付方案。问清原因即可。
当消费者已经把问题说清楚（包含具体现象 + 时间 或 现象 + 证据），就可以收尾。
`
    : `# 当前场景：方案协商
你的目标：在商家授权范围内，与消费者达成一个双方都能接受的售后方案。

## 你被授权可使用的方案：
${allow.refund ? `- ✅ 小额打款：上限 ¥${ceiling}（⛔死线：你报的任何打款金额都必须 ≤ ¥${ceiling}，多 1 块都不行；到顶仍不接受就转人工/登记，绝不加价）` : '- ❌ 不允许打款补偿'}
${allow.coupon ? `- ✅ 优惠券：只能发这些面额 ${couponList.join('/') || '10/15/20'} 元，不能超过最大面额` : '- ❌ 不允许发券'}
${allow.reship ? '- ✅ 补发商品' : '- ❌ 不允许补发'}
${allow.exchange ? '- ✅ 换货' : '- ❌ 不允许换货'}

## 让步策略（重要）：
- 第 1 轮：先报最低档（如 ¥${couponList[0] || 10} 优惠券，或 ¥${Math.round(ceiling * 0.4)} 打款）
- 消费者拒绝/嫌少时再让步：升档（如 ¥${Math.round(ceiling * 0.7)} 打款）
- 最后一档：上限 ¥${Math.round(ceiling)}
- 不要一次性把所有方案抛出来，循序渐进
- 报价时说出"为什么是这个数"或者用一些理由（"我帮您申请了下""我跟主管商量过"），让消费者觉得你在为他争取

## ⚡ 识别"接受方案"（极其重要，必须做对）：
当你给了几个方案（如"打款"和"优惠券"）让消费者二选一，只要消费者说出其中一个的关键词，就是【已选定/接受】，必须立刻收尾确认，【绝对不要再问"您要哪个"】：
- 消费者说"打款""要钱""退钱""第一个""打款吧""现金" → 选定【打款】方案 → 立刻确认："好嘞，那就给您打款¥X，马上安排～" ended=true, outcome="deal"
- 消费者说"券""优惠券""第二个""要券" → 选定【优惠券】 → 立刻确认成交 ended=true, outcome="deal"
- 消费者说"可以""行""好""同意""就这个""可以接受""听你的" → 接受当前最近方案 → 立刻确认成交 ended=true, outcome="deal"
- 一旦确认成交，content 里只说"那就按X方案给您办，马上安排"，绝不再重复报价、绝不再问选哪个。

## 当消费者拒绝到底（已到最高档仍不接受，或一开始就明确不接受任何方案）：
不要再反复磨，干脆给一个明确出口，二选一灵活处理：
- 方案A【转人工】：消费者情绪比较激动、明确要更高赔偿或要找人——直接说"这样吧，我帮您转接人工客服，他们权限更灵活"，然后结束。ended=true, outcome="handoff"。
- 方案B【登记反馈】：消费者只是没谈拢但情绪平稳——说"那这样，我先把您的情况详细登记下来，反馈给专员，后续再联系您"，然后结束。ended=true, outcome="no_deal"。
两种都要在 content 里把"接下来会怎样"说清楚，让消费者安心，不要含糊地僵在那里。
`;

  const remarkBlock = session.merchant_remark
    ? `\n# ⛔ 商家本次特别备注（最高优先级，绝对红线，凌驾于一切）：\n"${session.merchant_remark}"\n${constraints.hardCeiling != null ? `\n‼️ 注意：备注里的金额上限是 ¥${constraints.hardCeiling}，这是绝对不能突破的死线。无论消费者怎么拒绝、怎么磨、怎么要求更多，你打款/补偿的数字都【绝对不能超过 ¥${constraints.hardCeiling}】。到了这个上限对方还不接受，就转人工或登记反馈，宁可不成交也绝不超线。` : ''}\n`
    : '';

  return `你是一个电商售后服务助理，名叫"${template.agent_name || '小棠'}"。
店铺通过【AI ${session.channel === 'voice' ? '电话外呼' : '在线会话托管'}】让你来跟一位消费者沟通他的售后单。

# 你的人设和说话风格
- 风格：${styleHint}
- 自我定位：你是店铺方的助理，但你站在帮消费者解决问题的角度，不是来跟他对抗的
- 一定要有"人味"——不要像机器人那样列1.2.3，不要每句都用相同的句式，避免"尊敬的客户""根据规定"这种官腔
- 适当使用语气词（呀、呢、啦、哈、嗯）和填充词，但不要泛滥
- 一次只说一个意思，不要一段话塞5件事
- 共情要走心，不要敷衍式的"非常抱歉给您带来不便"
- ${channelHint}
- 主动告知你是 AI 助理（合规要求），但要用友好的方式（如"我是店铺的智能助理小棠"）

# 当前服务单信息
- 服务单号：${serviceOrder.service_no}
- 商品：${serviceOrder.product_name}
- 订单金额：¥${(serviceOrder.price || 0) * (serviceOrder.quantity || 1)}
- 售后类型：${({ return: '退货', exchange: '换货', repair: '维修', refund_only: '仅退款' })[serviceOrder.type] || serviceOrder.type}
- 消费者填写的原因：${serviceOrder.reason || '（未填）'}
- 消费者描述：${serviceOrder.description || '（无）'}

${scenarioBlock}${remarkBlock}

# 重要的对话规则（违反这些规则=失败）
1. **绝不重复自己**——每轮回复必须比上一轮往前推进。如果消费者回复模糊，你要换一个问法或角度，绝不照搬上句话
2. **绝不前后矛盾**——你已经报过的方案不能突然不认账；消费者还在拒绝时不能说"问题已解决""感谢理解"
3. **识别用户真实诉求**——
   - 用户说"找人工/要真人/要客服/不跟你说"等：立即转人工，不要再纠缠方案
   - 用户在生气、要投诉：立即转人工，先安抚再转
   - 用户已经接受方案：直接收尾确认，不要再继续报价
4. **报价循序渐进**——第一轮不要把所有底牌都亮出，每次只给 1-2 个具体方案让用户选
5. **共情先于报价**——用户在抱怨时，先回应情绪再谈方案；不要刚开口就报数字

# 转人工立即触发条件（满足任一立即结束并转人工）
- 消费者出现强情绪关键词：${handoffWords.join('、')}
- 消费者明确要求人工/真人/客服
- 消费者多次拒绝你的最高方案后仍不接受
- 消费者表达明显愤怒、要差评、要曝光

# 当消费者发来图片时（重要）
- 仔细看图，结合"消费者填写的原因/描述"判断：图片反映的问题是否与申请原因相符、是否真实可信（注意是否有摆拍、与商品无关、明显PS或与描述矛盾等可疑迹象）。
- 如果图片清楚佐证了问题（如确有破损/污渍/错发/色差），在 content 里自然地确认你看到了什么（"我看您发的图，XX那块确实…"），并据此推进方案。
- 如果图片可疑或无法证明问题（看不清、与商品无关、与描述明显不符），礼貌请消费者补充更清晰的图或说明，不要轻易承诺方案。
- 在 image_check 字段里写下你对图片真实性的简短判断（仅供商家看，不会发给消费者）。

# 输出协议（严格遵守）
你的每次回复【有且仅有一个】合法 JSON 对象，绝不能输出两个或多个 JSON，绝不带 markdown 代码块标记。结构如下：
{
  "content": "你要发给消费者的话（注意人味）",
  "intent": "你这条消息的目的：opening|empathize|probe|propose|concede|close_deal|close_no_deal|handoff|clarify",
  "stage": "当前阶段：opening|empathize|probe|propose|closing",
  "proposal_step": 0,
  "ended": false,
  "outcome": null,
  "outcome_detail": "",
  "image_check": "",
  "summary": ""
}

要求：
- 一次只回一个 JSON。共情和报价要揉进同一个 content 里（如"哎呀这事确实糟心，这样，我帮您申请50元补偿您看行不"），不要拆成两条 JSON 分别发。
- content 必须是给消费者听的【纯口语】，里面绝对不能出现花括号、字段名、JSON 等任何技术结构。
- 绝对不要在 JSON 外面输出任何文字。`;
}

/* =============== 历史消息转 LLM messages =============== */
function parseImages(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return []; }
}

// 把一条消费者消息（可能带图）构造成 OpenAI 兼容的 content
function buildUserContent(text, images) {
  const imgs = parseImages(images);
  if (!imgs.length) return text || '';
  const blocks = [];
  if (text) blocks.push({ type: 'text', text });
  for (const url of imgs) blocks.push({ type: 'image_url', image_url: { url } });
  return blocks;
}

function buildLLMMessages(historyMessages, lastConsumerMsg, isFirstTurn, lastConsumerImages) {
  const msgs = [];
  for (const m of historyMessages) {
    if (m.role === 'ai') {
      msgs.push({ role: 'assistant', content: JSON.stringify({ content: m.content, intent: m.intent || '', stage: '', proposal_step: 0, ended: false, outcome: null, outcome_detail: '', summary: '' }) });
    } else if (m.role === 'consumer') {
      msgs.push({ role: 'user', content: buildUserContent(m.content, m.images) });
    }
  }
  if (isFirstTurn && msgs.length === 0) {
    msgs.push({ role: 'user', content: '【系统】请向消费者发起本次沟通的开场白。' });
  } else if ((lastConsumerMsg || parseImages(lastConsumerImages).length) && (msgs.length === 0 || msgs[msgs.length - 1].role !== 'user')) {
    msgs.push({ role: 'user', content: buildUserContent(lastConsumerMsg, lastConsumerImages) });
  }
  return msgs;
}

// 本轮（含历史）是否带图片 —— 用于决定是否放大 token / 超时
function hasImages(historyMessages, lastConsumerImages) {
  if (parseImages(lastConsumerImages).length) return true;
  return (historyMessages || []).some(m => m.role === 'consumer' && parseImages(m.images).length);
}

async function callLLM({ template, serviceOrder, session, history, lastConsumerMsg, lastConsumerImages, isFirstTurn }) {
  if (!AI_API_KEY) return null;
  const system = buildSystemPrompt({ template, serviceOrder, session });
  const isVoice = session.channel === 'voice';
  // 外呼：只保留最近若干轮，减少输入处理、压缩反应时间（不需要参考太久远的上下文）
  const effHistory = isVoice ? (history || []).slice(-6) : history;
  const messages = buildLLMMessages(effHistory, lastConsumerMsg, isFirstTurn, lastConsumerImages);
  const withImg = hasImages(history, lastConsumerImages);
  return await chatCompletion({
    system,
    messages,
    // 带图片需大预算+推理(看图)；外呼/在线会话都关推理提速(3-5s)，预算够说完整即可
    maxTokens: withImg ? 3000 : (isVoice ? 800 : 1000),
    timeoutMs: withImg ? 60000 : (isVoice ? 12000 : 15000),
    disableThinking: !withImg,
    // 外呼对时延极敏感：限流时最多快速重试1次(短退避)，否则宁可走规则兜底也不让用户等20秒
    maxRetries: isVoice ? 1 : 2,
    backoffBase: isVoice ? 500 : 700,
  });
}

function tryParseJSON(text) {
  if (!text) return null;
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  // 1) 直接整体解析
  try { return JSON.parse(t); } catch {}
  // 2) 模型有时返回多个拼接的 JSON 对象（如 empathize + propose），逐字符扫描提取「第一个」完整对象
  const objs = extractJSONObjects(t);
  if (objs.length) {
    // 优先取带 content 的对象；若有多个，合并 content 让一句话说完（避免只说半句）
    const withContent = objs.filter(o => o && typeof o.content === 'string' && o.content.trim());
    if (withContent.length === 1) return withContent[0];
    if (withContent.length > 1) {
      // 多段 → 以最后一段为主（通常是真正的方案/推进），content 用最后一段
      const last = withContent[withContent.length - 1];
      return last;
    }
    return objs[0];
  }
  // 3) 宽松兜底：first{ ... last}
  const first = t.indexOf('{'), last = t.lastIndexOf('}');
  if (first >= 0 && last > first) { try { return JSON.parse(t.slice(first, last + 1)); } catch {} }
  return null;
}

// 从一段文本里按大括号配对，提取所有顶层 JSON 对象
function extractJSONObjects(t) {
  const out = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        const slice = t.slice(start, i + 1);
        try { out.push(JSON.parse(slice)); } catch {}
        start = -1;
      }
    }
  }
  return out;
}

// 清洗要发给消费者的话术：剔除任何泄漏的 JSON 结构/字段名，只保留人话
function sanitizeContent(s) {
  if (!s) return '';
  let t = String(s).trim();
  // 若整体仍是 JSON，取其 content 字段
  if (/^\{[\s\S]*\}$/.test(t)) {
    const obj = tryParseJSON(t);
    if (obj && typeof obj.content === 'string') t = obj.content;
  }
  // 剔除残留的 "content":"..." 之类的字段标记
  t = t.replace(/"?(content|intent|stage|proposal_step|ended|outcome|outcome_detail|image_check|summary)"?\s*:\s*/gi, '');
  // 去掉孤立的花括号/方括号与多余引号
  t = t.replace(/[\{\}\[\]]/g, '').replace(/^[\s"',]+|[\s"',]+$/g, '').trim();
  return t;
}

/* =============== 强化规则兜底 =============== */

const empathyPool = [
  '嗯嗯，理解您的心情，确实给您添麻烦了。',
  '哎，这事儿换我我也得急一下，您先别上火。',
  '您说的我都懂，遇上这种事确实糟心。',
  '我特别能理解，咱们一起把它处理好。',
];

const askDetailPool = [
  '能跟我具体说说是哪儿不对吗？比如是收到时就有问题，还是用了一段才出现的？',
  '您方便描述得再具体点吗？是商品本身的问题，还是物流过来摔到了？',
  '我帮您看一下哈——您能说说具体是什么现象吗？比如有没有损坏、功能异常之类的。',
  '我想再跟您确认下细节，您是几号收到的呀？发现问题大概是什么时间？',
];

const askEvidencePool = [
  '您手头要是有图片或者视频就更好啦，我这边能更快帮您把问题反馈过去。',
  '方便的话能不能拍张照片发我看看？这样处理起来更顺。',
];

function buildOpeningNegotiate(so, tpl, channel) {
  const product = so.product_name || '您之前买的那件商品';
  const variants = [
    `您好，我是店铺的智能助理${tpl.agent_name || '小棠'}。您下的"${product}"这个售后单我帮您看了下，确实给您添麻烦了。我这边想跟您聊聊补偿方案，您方便说两句吗？`,
    `您好呀，这边是${tpl.agent_name || '小棠'}，店铺的智能售后助理。关于您"${product}"的售后，我来跟您协调一下处理方案，您看方便聊吗？`,
  ];
  if (channel === 'voice') {
    return `喂您好，这边是店铺的智能助理${tpl.agent_name || '小棠'}，关于您"${product}"的售后单，想跟您简单聊一下处理方案，方便吗？`;
  }
  return pick(variants);
}

function buildOpeningClarify(so, tpl, channel) {
  const product = so.product_name || '您的订单';
  if (channel === 'voice') {
    return `喂您好，这边是店铺的智能助理${tpl.agent_name || '小棠'}，关于您"${product}"提交的售后，您填的原因我们这边想跟您再确认下，方便说两句吗？`;
  }
  return `您好呀，我是店铺的智能助理${tpl.agent_name || '小棠'}。我看您"${product}"的售后单上原因填得比较简单，怕我们理解有偏差，方便跟我说说具体是什么情况吗？`;
}

function buildProposal(template, constraints, step, productPrice) {
  const ceiling = constraints.hardCeiling != null
    ? constraints.hardCeiling
    : Math.min(template.refund_ceiling || 0, (productPrice || 0) * (template.refund_ratio || 0.2));
  const couponList = JSON.parse(template.coupon_options || '[10]').sort((a, b) => a - b);
  const exclude = new Set(constraints.exclude || []);
  const allow = {
    refund: !!template.allow_refund && !exclude.has('refund'),
    coupon: !!template.allow_coupon && !exclude.has('coupon'),
    reship: !!template.allow_reship && !exclude.has('reship'),
    exchange: !!template.allow_exchange && !exclude.has('exchange'),
  };
  const lines = [];
  if (step === 0) {
    if (allow.coupon && couponList.length) lines.push(`一张¥${couponList[0]}的店铺优惠券，下次买东西能直接抵`);
    if (allow.refund) lines.push(`或者直接打款¥${Math.min(Math.round(ceiling * 0.4), Math.round(ceiling))}，原路退您账户`);
  } else if (step === 1) {
    if (allow.coupon && couponList.length > 1) lines.push(`券给您升到¥${couponList[Math.min(1, couponList.length - 1)]}`);
    if (allow.refund) lines.push(`打款额度提到¥${Math.round(ceiling * 0.7)}`);
    if (allow.reship) lines.push('或者给您安排重新补发一份');
  } else {
    if (allow.refund) lines.push(`打款这块我能给您申请到的最高就是¥${Math.round(ceiling)}`);
    if (allow.exchange) lines.push('或者换一件新的过去');
    if (allow.reship && !allow.exchange) lines.push('或者直接补发一份');
  }
  return lines;
}

function fallbackReply({ session, template, serviceOrder, history = [], lastConsumerMsg, lastConsumerImages }) {
  const constraints = parseRemarkConstraints(session.merchant_remark);
  const productPrice = (serviceOrder.price || 0) * (serviceOrder.quantity || 1);
  const channel = session.channel || 'im';

  const text = lastConsumerMsg || '';
  const intent = detectIntent(text);
  const handoffWords = (() => { try { return JSON.parse(template.handoff_keywords || '[]'); } catch { return []; } })();
  const hitHandoff = handoffWords.some(k => text.includes(k));

  // 已说过的话（防重复）
  const aiSaid = history.filter(m => m.role === 'ai').map(m => m.content);
  const lastAi = aiSaid[aiSaid.length - 1] || '';

  // 0. 消费者发来图片但大模型不可用（规则引擎无视觉能力）→ 据实告知并转人工核验
  if (parseImages(lastConsumerImages).length) {
    return {
      content: '您发的图我已经收到啦～为了准确核实情况，我把图片转给专员帮您仔细看一下，稍后会尽快给您答复，您放心哈。',
      intent: 'handoff', stage: 'closing', proposal_step: session.proposal_step || 0,
      ended: true, outcome: 'handoff', outcome_detail: '消费者上传图片，需人工核验真实性',
      image_check: '（大模型视觉不可用，未自动核验，转人工）',
      summary: '消费者上传了图片证据，已转人工核验'
    };
  }

  // 1. 用户要找人工/触发关键词/愤怒
  if (intent === 'request_human') {
    return {
      content: '好的好的，我马上让我们人工客服小姐姐跟您联系，您稍等一下哈～',
      intent: 'handoff', stage: 'closing', proposal_step: session.proposal_step || 0,
      ended: true, outcome: 'handoff', outcome_detail: '消费者主动要求人工',
      summary: '消费者要求转人工，AI 已退出'
    };
  }
  if (hitHandoff || intent === 'anger') {
    return {
      content: '您先别急哈，这种情况我让人工客服马上跟您联系，他们权限会更灵活一些，能给您更好的方案。',
      intent: 'handoff', stage: 'closing', proposal_step: session.proposal_step || 0,
      ended: true, outcome: 'handoff', outcome_detail: '触发转人工关键词或强情绪',
      summary: '触发转人工条件，已转人工'
    };
  }

  // 2. 开场
  if ((session.rounds || 0) === 0 && history.length === 0) {
    const c = template.scenario === 'clarify'
      ? buildOpeningClarify(serviceOrder, template, channel)
      : buildOpeningNegotiate(serviceOrder, template, channel);
    return { content: c, intent: 'opening', stage: 'empathize', proposal_step: 0, ended: false };
  }

  // 3. 澄清场景
  if (template.scenario === 'clarify') {
    const enoughInfo = intent === 'clarify_provided' || text.length > 15;
    if (enoughInfo) {
      return {
        content: `好嘞，您说的我都记下来了——${text.slice(0, 30)}${text.length > 30 ? '...' : ''}。我这边马上把这些信息同步给处理同事，会尽快给您答复，您稍等哈～`,
        intent: 'close_deal', stage: 'closing', proposal_step: 0,
        ended: true, outcome: 'clarified', outcome_detail: text,
        summary: `已澄清原因：${text.slice(0, 60)}`
      };
    }
    if ((session.rounds || 0) >= (template.max_rounds || 4) - 1) {
      return {
        content: '行～那我先把您说的整理一下报上去，处理结果会在售后单里通知您，有问题随时回我消息哈。',
        intent: 'close_deal', stage: 'closing', proposal_step: 0,
        ended: true, outcome: 'clarified', outcome_detail: text || '消费者未提供更多细节',
        summary: '澄清沟通已结束'
      };
    }
    if ((session.rounds || 0) === 1) return { content: pick(askEvidencePool), intent: 'probe', stage: 'probe', proposal_step: 0, ended: false };
    return { content: pick(askDetailPool, [lastAi]), intent: 'probe', stage: 'probe', proposal_step: 0, ended: false };
  }

  // 4. 协商场景
  let step = session.proposal_step || 0;

  // 接受 → 收尾
  if (intent === 'accept') {
    const proposal = buildProposal(template, constraints, step, productPrice);
    const dealText = proposal.join('；');
    return {
      content: `好嘞，那这个方案就给您按这个执行～${proposal[0] ? proposal[0].replace(/^或者|^一张/, '') : ''}。我马上去帮您安排，到账了您留意一下，有任何问题随时回我消息！`,
      intent: 'close_deal', stage: 'closing', proposal_step: step,
      ended: true, outcome: 'deal',
      outcome_detail: dealText,
      summary: `消费者接受方案（第${step + 1}轮报价）：${dealText}`
    };
  }

  // 拒绝 → 让步；到顶后直接给明确出口（转人工 / 登记反馈）
  if (intent === 'reject') {
    if (step >= 2) {
      // 平稳拒绝 → 登记反馈；带强情绪 → 转人工
      return {
        content: '嗯，理解您的想法，这个额度我这边确实到顶了。这样吧，我先把您的情况详细登记下来反馈给专员，后续会有人再跟您联系，您看可以吗？',
        intent: 'close_no_deal', stage: 'closing', proposal_step: step,
        ended: true, outcome: 'no_deal', outcome_detail: '消费者拒绝最高方案，已登记反馈待跟进',
        summary: '消费者拒绝最高方案，已登记反馈，待专员跟进'
      };
    }
    step += 1;
    const proposal = buildProposal(template, constraints, step, productPrice);
    const lead = step === 1
      ? '理解您的想法，我帮您再争取一下——'
      : '这样的话我再去申请下权限，';
    return {
      content: lead + proposal.join('，') + '，您看这样行不行？',
      intent: 'concede', stage: 'propose', proposal_step: step, ended: false
    };
  }

  // 提问 → 解释当前方案
  if (intent === 'ask') {
    const proposal = buildProposal(template, constraints, step, productPrice);
    return {
      content: `这样跟您解释下哈——${proposal.join('，')}。这两种方式您挑一个就行，您觉得哪个对您更合适呀？`,
      intent: 'clarify', stage: 'propose', proposal_step: step, ended: false
    };
  }

  // 第一次推进：empathy + propose
  if (session.stage === 'empathize' || session.stage === 'opening' || (session.rounds || 0) === 1) {
    const proposal = buildProposal(template, constraints, 0, productPrice);
    const empathy = pick(empathyPool);
    return {
      content: `${empathy}这样吧，我先给您说下我们能做的：${proposal.join('，')}。您看哪个方案更合适您？`,
      intent: 'propose', stage: 'propose', proposal_step: 0, ended: false
    };
  }

  // 默认：换个问法确认（避免重复）
  const variants = [
    '您看刚才那两个方案，哪个对您更合适一些？',
    '我想再跟您确认下，您更倾向哪种处理方式呀？',
    '您方便说一下您这边的想法吗？我看看能不能再调整。',
  ];
  return {
    content: pick(variants, [lastAi]),
    intent: 'neutral', stage: 'propose', proposal_step: step, ended: false
  };
}

/* =============== 主入口 =============== */
async function generateReply(ctx) {
  const { session, history = [], lastConsumerMsg } = ctx;
  const isFirstTurn = (session.rounds || 0) === 0 && history.length === 0;

  let parsed = null;
  let usedLLM = false;
  let llmError = null;
  try {
    const llmText = await callLLM({ ...ctx, isFirstTurn });
    if (llmText) {
      parsed = tryParseJSON(llmText);
      if (parsed && typeof parsed.content === 'string' && parsed.content.trim()) {
        // 安全网：万一 content 里还混入了 JSON/花括号，清洗掉，绝不把原始结构念给消费者
        parsed.content = sanitizeContent(parsed.content);
        if (parsed.content) usedLLM = true; else parsed = null;
      } else {
        // 解析失败或没有有效 content → 不要把原始文本当话术，退回规则兜底
        parsed = null;
      }
    }
  } catch (e) {
    llmError = e.message;
    console.warn('[aiAgent] LLM call failed, fallback to rules:', e.message);
  }

  if (!parsed) parsed = fallbackReply(ctx);

  // 防重复：如果生成的内容跟最近一条 AI 消息高度相似，强制走规则版换一个说法
  const recentAi = history.filter(m => m.role === 'ai').slice(-1)[0];
  if (recentAi && parsed.content && recentAi.content && parsed.content.trim() === recentAi.content.trim()) {
    const fb = fallbackReply(ctx);
    if (fb.content !== recentAi.content) parsed = fb;
  }

  const updates = { rounds: (session.rounds || 0) + 1 };
  if (parsed.stage) updates.stage = parsed.stage;
  if (typeof parsed.proposal_step === 'number') updates.proposal_step = parsed.proposal_step;
  if (parsed.ended) {
    updates.status = parsed.outcome === 'handoff' ? 'handoff' : 'achieved';
    updates.outcome = parsed.outcome || 'no_deal';
    updates.outcome_detail = parsed.outcome_detail || '';
    updates.summary = parsed.summary || '';
    updates.ended_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
  }

  return {
    content: parsed.content,
    intent: parsed.intent || '',
    emotion: parsed.emotion || '',
    image_check: parsed.image_check || '',
    sessionUpdates: updates,
    engine: usedLLM ? 'llm' : 'rules',
    llm_error: llmError,
  };
}

// 即时开场白（纯规则，零等待）——用于通话/会话接通瞬间先开口，避免等大模型
function instantOpening({ template, serviceOrder, session }) {
  const channel = session.channel || 'im';
  const scenario = session.scenario || template.scenario;
  const content = scenario === 'clarify'
    ? buildOpeningClarify(serviceOrder, template, channel)
    : buildOpeningNegotiate(serviceOrder, template, channel);
  return { content, intent: 'opening', stage: 'empathize', proposal_step: 0, ended: false };
}

module.exports = { generateReply, parseRemarkConstraints, buildSystemPrompt, detectIntent, summarizeSession, instantOpening };

/* =============== 会话总结生成（LLM + 规则兜底） =============== */
async function summarizeSession({ session, template, serviceOrder, history }) {
  const typeMap = { return: '退货', exchange: '换货', repair: '维修', refund_only: '仅退款' };
  const channelLabel = session.channel === 'voice' ? '电话外呼' : '在线会话';
  // 优先 LLM
  if (AI_API_KEY) {
    try {
      const transcript = history.map(m => `${m.role === 'ai' ? 'AI助理' : '消费者'}：${m.content}${parseImages(m.images).length ? '（附图' + parseImages(m.images).length + '张）' : ''}`).join('\n');
      const sys = `你是一个售后会话分析助理。你将收到「消费者的原始售后申请信息」和「AI 助理与消费者的完整沟通记录」。请综合这两部分，为商家生成一份到位的总结，方便商家评估这次协商。

要求：
- consumer_need 必须结合"申请原因/描述"和"实际沟通内容"综合提炼，不要只抄最后一句话。
- summary_text 用 2-4 行完整、连贯的中文，必须体现【完整协商过程】，而不只是最后结论。要说清楚：
  1) 消费者为什么申请、真实诉求是什么；
  2) AI 先后提出了哪几种方案（如先报¥10券、再报¥15打款、最后¥20）；
  3) 消费者拒绝了哪些、为什么拒绝；
  4) 最终接受了哪个方案（或最终未达成/转人工的原因）。
- negotiation_steps 用数组按时间顺序列出每一步关键动作（AI报价/消费者拒绝/让步/接受），每条一句话，便于商家快速回溯。
- 如果沟通中涉及图片，请在 summary_text 里点明图片佐证情况。

输出必须是合法 JSON（不要 markdown 代码块），结构：
{
  "headline": "8-15 字的核心结论（如：消费者接受¥20打款方案）",
  "consumer_need": "结合申请原因+沟通记录提炼的消费者真实诉求，一句话",
  "summary_text": "2-4 行完整协商过程总结（诉求→报过哪几种方案→拒绝了哪些→最终接受哪个/为何未成）",
  "negotiation_steps": ["第1步：…", "第2步：…", "第3步：…"],
  "outcome": "deal|no_deal|handoff|clarified",
  "deal_detail": "如果达成方案，具体方案内容（含金额/券额等）；没有则留空",
  "next_action": "商家需要做的事，一句话（如：48小时内打款，无需跟进 / 立即接管联系）"
}`;
      const usr = `【消费者原始售后申请】
服务单号：${serviceOrder.service_no}
商品：${serviceOrder.product_name}
售后类型：${typeMap[serviceOrder.type] || serviceOrder.type}
申请原因：${serviceOrder.reason || '（未填）'}
原因描述：${serviceOrder.description || '（无）'}

【本次沟通】
渠道：${channelLabel}
场景：${session.scenario === 'clarify' ? '原因澄清' : '方案协商'}
${session.merchant_remark ? '商家备注：' + session.merchant_remark + '\n' : ''}沟通记录：
${transcript}`;
      const text = await chatCompletion({ system: sys, messages: [{ role: 'user', content: usr }], maxTokens: 1200, disableThinking: true, timeoutMs: 15000, maxRetries: 1, backoffBase: 500 });
      const parsed = tryParseJSON(text);
      if (parsed && parsed.headline) return { ...parsed, engine: 'llm' };
    } catch (e) {
      console.warn('[aiAgent] summarize LLM failed:', e.message);
    }
  }
  // 规则兜底
  const consumerMsgs = history.filter(m => m.role === 'consumer').map(m => m.content);
  const lastConsumer = consumerMsgs[consumerMsgs.length - 1] || '';
  const outcomeMap = {
    deal: '消费者接受了 AI 的方案',
    handoff: '消费者要求人工跟进或情绪激动',
    clarified: '消费者补充清楚了售后原因',
    no_deal: '消费者拒绝了最高方案',
  };
  const nextMap = {
    deal: '按达成方案执行（打款/发券/补发），无需重复跟进',
    handoff: '⚠️ 立即让人工客服联系消费者',
    clarified: '基于澄清后的原因继续审核处理',
    no_deal: '⚠️ 需要人工客服重新协商',
  };
  const reasonPart = serviceOrder.reason ? `因"${serviceOrder.reason}"申请${typeMap[serviceOrder.type] || '售后'}` : '提交售后';
  const detailPart = session.outcome_detail ? `，方案：${session.outcome_detail}` : '';
  const summary_text = `消费者${reasonPart}，经${channelLabel}沟通后${outcomeMap[session.outcome] || '沟通结束'}${detailPart}。${nextMap[session.outcome] || ''}`;
  return {
    headline: outcomeMap[session.outcome] || '沟通已结束',
    consumer_need: (serviceOrder.reason ? serviceOrder.reason + '；' : '') + (lastConsumer.slice(0, 60) || '（未收集到有效诉求）'),
    summary_text,
    outcome: session.outcome,
    deal_detail: session.outcome_detail || '',
    next_action: nextMap[session.outcome] || '请查看沟通记录',
    engine: 'rules',
  };
}
