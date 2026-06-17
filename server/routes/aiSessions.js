const express = require('express');
const router = express.Router();
const { getDb, saveDb, query, run } = require('../db');
const { generateReply, summarizeSession, instantOpening } = require('../services/aiAgent');
const { synthesize } = require('../services/tts');

function now() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }

function getServiceOrderFull(soId) {
  const rows = query(
    `SELECT so.*, o.order_no, o.product_name, o.product_image, o.price, o.quantity,
            c.name as buyer_name, c.phone as buyer_phone, c.vip_level
     FROM service_orders so
     LEFT JOIN orders o ON so.order_id=o.id
     LEFT JOIN consumers c ON so.consumer_id=c.id
     WHERE so.id=?`, [soId]);
  return rows[0];
}

function getSession(id) {
  const rows = query('SELECT * FROM ai_sessions WHERE id=?', [id]);
  return rows[0];
}

function getTemplate(id) {
  const rows = query('SELECT * FROM ai_templates WHERE id=?', [id]);
  return rows[0];
}

function getMessages(sessionId) {
  return query('SELECT * FROM ai_messages WHERE session_id=? ORDER BY id ASC', [sessionId]);
}

function applyUpdates(sessionId, updates) {
  if (!updates || !Object.keys(updates).length) return;
  const fields = [];
  const values = [];
  for (const k of Object.keys(updates)) {
    fields.push(`${k}=?`);
    values.push(updates[k]);
  }
  values.push(sessionId);
  run(`UPDATE ai_sessions SET ${fields.join(',')} WHERE id=?`, values);
}

function pushTimeline(soId, type, title, desc) {
  run('INSERT INTO service_timeline (service_order_id,event_type,title,description,operator,created_at) VALUES (?,?,?,?,?,?)',
    [soId, type, title, desc, 'AI助理小棠', now()]);
}

// 引擎状态：是否配置了大模型 key
router.get('/engine-status', (req, res) => {
  res.json({
    has_api_key: !!(process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY),
    model: process.env.AI_MODEL || process.env.AI_NEGOTIATION_MODEL || 'GLM-5.1',
    base_url: (process.env.AI_BASE_URL || 'http://ai-api.jdcloud.com/v1'),
  });
});

// AI 协商数据分析
router.get('/stats', async (req, res) => {
  await getDb();
  const all = query('SELECT * FROM ai_sessions');
  const ended = all.filter(s => s.status !== 'running');
  // 使用过 AI 协商的服务单数（去重）
  const usedServiceOrders = new Set(all.map(s => s.service_order_id)).size;
  // 渠道占比
  const byChannel = { voice: all.filter(s => s.channel === 'voice').length, im: all.filter(s => s.channel !== 'voice').length };
  // 场景占比
  const byScenario = { negotiate: all.filter(s => s.scenario === 'negotiate').length, clarify: all.filter(s => s.scenario === 'clarify').length };
  // 成功定义：方案协商→deal；原因澄清→clarified
  const isSuccess = s => (s.scenario === 'clarify' ? s.outcome === 'clarified' : s.outcome === 'deal');
  const success = ended.filter(isSuccess);
  const failed = ended.filter(s => !isSuccess(s));
  // 成功明细（分场景）
  const successByScenario = {
    negotiate: success.filter(s => s.scenario === 'negotiate').length,
    clarify: success.filter(s => s.scenario === 'clarify').length,
  };
  // 失败原因下钻
  const failReasons = {
    handoff: failed.filter(s => s.outcome === 'handoff').length,       // 转人工（诉求超AI权限/情绪）
    no_deal: failed.filter(s => s.outcome === 'no_deal').length,       // 方案未谈拢
    other: failed.filter(s => !['handoff', 'no_deal'].includes(s.outcome)).length,
  };
  // 失败归因（演示用启发式：转人工=诉求超权限，no_deal=话术/方案不足）
  const failAnalysis = [
    { cause: '诉求超出AI权限/情绪激动（需人工）', count: failReasons.handoff },
    { cause: '方案未达成共识（话术或额度不足）', count: failReasons.no_deal },
    { cause: '其他', count: failReasons.other },
  ].filter(x => x.count > 0);

  res.json({
    total_sessions: all.length,
    used_service_orders: usedServiceOrders,
    ended: ended.length,
    running: all.length - ended.length,
    by_channel: byChannel,
    by_scenario: byScenario,
    success_count: success.length,
    fail_count: failed.length,
    success_rate: ended.length ? Math.round(success.length / ended.length * 100) : 0,
    success_by_scenario: successByScenario,
    fail_reasons: failReasons,
    fail_analysis: failAnalysis,
  });
});

// 发起一次 AI 协商
// body: { service_order_id, template_id, channel: 'voice'|'im', scenario, merchant_remark }
router.post('/start', async (req, res) => {
  await getDb();
  const { service_order_id, template_id, channel = 'im', scenario, merchant_remark = '', phone = '' } = req.body || {};
  if (!service_order_id) return res.status(400).json({ error: '缺少 service_order_id' });

  const so = getServiceOrderFull(parseInt(service_order_id));
  if (!so) return res.status(404).json({ error: '服务单不存在' });

  let tpl;
  if (template_id) {
    tpl = getTemplate(parseInt(template_id));
  } else {
    const rows = query('SELECT * FROM ai_templates WHERE scenario=? AND is_default=1 LIMIT 1', [scenario || 'negotiate']);
    tpl = rows[0] || query('SELECT * FROM ai_templates WHERE scenario=? LIMIT 1', [scenario || 'negotiate'])[0];
  }
  if (!tpl) return res.status(400).json({ error: '未找到可用模板' });

  const finalScenario = scenario || tpl.scenario;
  run(`INSERT INTO ai_sessions (service_order_id,template_id,channel,scenario,merchant_remark,status,stage,rounds,proposal_step) VALUES (?,?,?,?,?,?,?,?,?)`,
    [so.id, tpl.id, channel, finalScenario, merchant_remark, 'running', 'opening', 0, 0]);
  saveDb();
  const sessionId = query('SELECT id FROM ai_sessions ORDER BY id DESC LIMIT 1')[0].id;

  // 即时开场白（纯规则，零等待）——接通瞬间就能开口，不卡在大模型
  const session = getSession(sessionId);
  const opening = instantOpening({ template: tpl, serviceOrder: so, session });
  run('INSERT INTO ai_messages (session_id,role,content,intent,emotion,created_at) VALUES (?,?,?,?,?,?)',
    [sessionId, 'ai', opening.content, opening.intent || 'opening', '', now()]);
  applyUpdates(sessionId, { stage: 'empathize', rounds: 1 });
  const channelLabel = channel === 'voice' ? '[AI外呼]' : '[AI会话托管]';
  run('INSERT INTO communication_records (service_order_id,sender_type,message,created_at) VALUES (?,?,?,?)',
    [so.id, 'ai', `${channelLabel} ${opening.content}`, now()]);

  pushTimeline(so.id, 'ai_negotiation_started', 'AI协商已发起',
    `渠道：${channel === 'voice' ? '智能外呼' + (phone ? ' ' + phone : '') : '会话托管'}；模板：${tpl.name}` + (merchant_remark ? `；备注：${merchant_remark}` : ''));
  saveDb();

  res.status(201).json({ session_id: sessionId, ...getSession(sessionId), template: tpl, messages: getMessages(sessionId), engine: 'rules', phone });
});

// 消费者侧回复（DEMO中，由商家工作台模拟消费者输入）
// body: { content, images }
router.post('/:id/reply', async (req, res) => {
  await getDb();
  const sessionId = parseInt(req.params.id);
  const { content, images } = req.body || {};
  const imgArr = Array.isArray(images) ? images.filter(Boolean) : [];
  if (!content && !imgArr.length) return res.status(400).json({ error: '缺少内容' });

  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  if (session.status !== 'running') return res.status(400).json({ error: '会话已结束' });

  const tpl = getTemplate(session.template_id);
  const so = getServiceOrderFull(session.service_order_id);

  const imagesJson = JSON.stringify(imgArr);
  run('INSERT INTO ai_messages (session_id,role,content,images,created_at) VALUES (?,?,?,?,?)',
    [sessionId, 'consumer', content || '', imagesJson, now()]);
  const commMsg = (content || '') + (imgArr.length ? `［发来${imgArr.length}张图片］` : '');
  run('INSERT INTO communication_records (service_order_id,sender_type,message,created_at) VALUES (?,?,?,?)',
    [session.service_order_id, 'consumer', commMsg, now()]);

  // 生成 AI 回复（带历史上下文）
  const history = getMessages(sessionId);
  const reply = await generateReply({ session: getSession(sessionId), template: tpl, serviceOrder: so, history: history.slice(0, -1), lastConsumerMsg: content || '', lastConsumerImages: imgArr });
  run('INSERT INTO ai_messages (session_id,role,content,intent,emotion,created_at) VALUES (?,?,?,?,?,?)',
    [sessionId, 'ai', reply.content, reply.intent || '', reply.emotion || '', now()]);
  const channelLabel = session.channel === 'voice' ? '[AI外呼]' : '[AI会话托管]';
  run('INSERT INTO communication_records (service_order_id,sender_type,message,created_at) VALUES (?,?,?,?)',
    [session.service_order_id, 'ai', `${channelLabel} ${reply.content}`, now()]);

  applyUpdates(sessionId, reply.sessionUpdates);

  // 结束态
  const after = getSession(sessionId);
  if (after.status && after.status !== 'running') {
    if (after.outcome === 'deal') {
      pushTimeline(so.id, 'ai_negotiation_done', 'AI协商达成方案', after.outcome_detail || '');
    } else if (after.outcome === 'handoff') {
      pushTimeline(so.id, 'ai_negotiation_handoff', 'AI协商转人工', after.outcome_detail || '');
    } else if (after.outcome === 'clarified') {
      pushTimeline(so.id, 'ai_clarify_done', '原因澄清完成', after.outcome_detail || '');
    } else if (after.outcome === 'no_deal') {
      pushTimeline(so.id, 'ai_negotiation_no_deal', 'AI协商未达成', after.outcome_detail || '');
    }
  }
  saveDb();

  res.json({ session: after, ai_reply: reply, messages: getMessages(sessionId), engine: reply.engine });
});

// 人工接管
router.post('/:id/takeover', async (req, res) => {
  await getDb();
  const sessionId = parseInt(req.params.id);
  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  applyUpdates(sessionId, { status: 'handoff', outcome: 'handoff', outcome_detail: '商家手动接管', ended_at: now() });
  pushTimeline(session.service_order_id, 'ai_negotiation_handoff', '商家接管AI协商', '商家点击接管按钮');
  saveDb();
  res.json({ success: true, session: getSession(sessionId) });
});

// 售后单关联会话列表
router.get('/by-service/:soId', async (req, res) => {
  await getDb();
  const rows = query(`SELECT s.*, t.name as template_name FROM ai_sessions s LEFT JOIN ai_templates t ON s.template_id=t.id WHERE s.service_order_id=? ORDER BY s.id DESC`,
    [parseInt(req.params.soId)]);
  res.json(rows);
});

// 单个会话详情含消息
router.get('/:id', async (req, res) => {
  await getDb();
  const id = parseInt(req.params.id);
  const session = getSession(id);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  res.json({ ...session, template: getTemplate(session.template_id), messages: getMessages(id) });
});

// 生成会话总结（已结束会话适用）
router.post('/:id/summarize', async (req, res) => {
  await getDb();
  const id = parseInt(req.params.id);
  const session = getSession(id);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  const tpl = getTemplate(session.template_id);
  const so = getServiceOrderFull(session.service_order_id);
  const history = getMessages(id);
  const result = await summarizeSession({ session, template: tpl, serviceOrder: so, history });
  // 缓存到 session.summary
  run('UPDATE ai_sessions SET summary=? WHERE id=?', [JSON.stringify(result), id]);
  saveDb();
  res.json(result);
});

// 神经语音合成（外呼真人级语音）。失败返回 503，前端降级到浏览器 TTS。
// body: { text, voice? }
router.post('/tts', async (req, res) => {
  const { text, voice } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: '缺少文本' });
  try {
    const buf = await synthesize(text, voice);
    if (!buf) return res.status(503).json({ error: 'tts unavailable' });
    res.set('Content-Type', 'audio/mpeg');
    res.send(buf);
  } catch (e) {
    res.status(503).json({ error: 'tts failed' });
  }
});

module.exports = router;
