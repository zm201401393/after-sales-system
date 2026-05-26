const express = require('express');
const router = express.Router();
const { getDb, saveDb, query, run } = require('../db');
const { getAISuggestion } = require('../services/aiSuggestion');

function generateServiceNo() {
  const now = new Date();
  const ts = now.getFullYear().toString() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0') + String(now.getSeconds()).padStart(2,'0');
  return `SV${ts}${String(Math.floor(Math.random()*1000)).padStart(3,'0')}`;
}

function now() { return new Date().toISOString().replace('T',' ').substring(0,19); }

router.get('/stats', async (req, res) => {
  await getDb();
  const rows = query('SELECT status, COUNT(*) as count FROM service_orders GROUP BY status');
  const stats = { pending:0, approved:0, rejected:0, feedback_required:0, completed:0, total:0 };
  rows.forEach(r => { stats[r.status] = r.count; stats.total += r.count; });
  const priorityRows = query('SELECT priority, COUNT(*) as count FROM service_orders WHERE status=\'pending\' GROUP BY priority');
  const priorities = { low:0, normal:0, high:0, urgent:0 };
  priorityRows.forEach(r => { priorities[r.priority] = r.count; });
  stats.priorities = priorities;
  res.json(stats);
});

router.get('/', async (req, res) => {
  await getDb();
  const { status, type, priority, search, page=1, pageSize=10, startDate, endDate } = req.query;
  let where = [], params = [];
  if (status) { where.push('so.status=?'); params.push(status); }
  if (type) { where.push('so.type=?'); params.push(type); }
  if (priority) { where.push('so.priority=?'); params.push(priority); }
  if (search) { where.push('(so.service_no LIKE ? OR o.order_no LIKE ? OR c.name LIKE ?)'); const l=`%${search}%`; params.push(l,l,l); }
  if (startDate) { where.push('so.created_at>=?'); params.push(startDate); }
  if (endDate) { where.push('so.created_at<=?'); params.push(endDate+' 23:59:59'); }
  const whereClause = where.length ? 'WHERE '+where.join(' AND ') : '';

  const countRows = query(`SELECT COUNT(*) as cnt FROM service_orders so LEFT JOIN orders o ON so.order_id=o.id LEFT JOIN consumers c ON so.consumer_id=c.id ${whereClause}`, params);
  const total = countRows.length ? countRows[0].cnt : 0;

  const offset = (parseInt(page)-1)*parseInt(pageSize);
  const data = query(`SELECT so.*, o.order_no, o.product_name, o.product_image, o.price, o.quantity, c.name as buyer_name, c.phone as buyer_phone, c.vip_level, c.credit_score
    FROM service_orders so LEFT JOIN orders o ON so.order_id=o.id LEFT JOIN consumers c ON so.consumer_id=c.id
    ${whereClause} ORDER BY CASE so.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, so.created_at DESC
    LIMIT ? OFFSET ?`, [...params, parseInt(pageSize), offset]);

  res.json({ data, total, page:parseInt(page), pageSize:parseInt(pageSize) });
});

router.get('/:id', async (req, res) => {
  await getDb();
  const rows = query(`SELECT so.*, o.order_no, o.product_name, o.product_image, o.price, o.quantity, o.created_at as order_created_at, c.name as buyer_name, c.phone as buyer_phone, c.vip_level, c.credit_score, c.order_count, c.return_rate
    FROM service_orders so LEFT JOIN orders o ON so.order_id=o.id LEFT JOIN consumers c ON so.consumer_id=c.id WHERE so.id=?`, [parseInt(req.params.id)]);
  if (!rows.length) return res.status(404).json({ error: '服务单不存在' });
  res.json(rows[0]);
});

router.get('/:id/ai-suggestion', async (req, res) => {
  await getDb();
  const suggestion = getAISuggestion(parseInt(req.params.id));
  if (!suggestion) return res.status(404).json({ error: '无法生成建议' });
  res.json(suggestion);
});

router.post('/', async (req, res) => {
  await getDb();
  const { order_id, type, reason, description, priority, refund_amount } = req.body;
  if (!order_id || !type || !reason) return res.status(400).json({ error: '缺少必填字段' });

  const order = query('SELECT consumer_id FROM orders WHERE id=?', [order_id]);
  if (!order.length) return res.status(400).json({ error: '订单不存在' });

  const serviceNo = generateServiceNo();
  const n = now();
  run('INSERT INTO service_orders (service_no,order_id,consumer_id,type,reason,description,priority,refund_amount,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [serviceNo, order_id, order[0].consumer_id, type, reason, description||'', priority||'normal', refund_amount||0, 'pending', n, n]);
  saveDb();

  const created = query('SELECT id FROM service_orders WHERE service_no=?', [serviceNo]);
  const id = created[0].id;
  run('INSERT INTO service_timeline (service_order_id,event_type,title,description,operator,created_at) VALUES (?,?,?,?,?,?)',
    [id, 'created', '提交售后申请', '消费者提交了'+({return:'退货',exchange:'换货',repair:'维修',refund_only:'仅退款'}[type])+'申请', '消费者', n]);
  saveDb();

  res.status(201).json({ id, service_no: serviceNo, status: 'pending' });
});

router.put('/:id/approve', async (req, res) => {
  await getDb();
  const { remark, actual_refund_amount } = req.body;
  const id = parseInt(req.params.id);
  const check = query('SELECT status,type FROM service_orders WHERE id=?', [id]);
  if (!check.length) return res.status(404).json({ error: '服务单不存在' });
  if (check[0].status !== 'pending') return res.status(400).json({ error: '只能审核待审核状态的服务单' });

  const n = now();
  const subStatus = check[0].type === 'refund_only' ? 'refund_processing' : 'waiting_buyer_ship';
  run('UPDATE service_orders SET status=?,sub_status=?,merchant_remark=?,actual_refund_amount=?,updated_at=? WHERE id=?',
    ['approved', subStatus, remark||null, actual_refund_amount||null, n, id]);
  run('INSERT INTO service_timeline (service_order_id,event_type,title,description,operator,created_at) VALUES (?,?,?,?,?,?)',
    [id, 'approved', '审核通过', remark||'商家同意了售后申请', '商家客服', n]);
  saveDb();
  res.json({ success: true });
});

router.put('/:id/reject', async (req, res) => {
  await getDb();
  const { remark } = req.body;
  if (!remark) return res.status(400).json({ error: '拒绝时必须填写原因' });
  const id = parseInt(req.params.id);
  const check = query('SELECT status FROM service_orders WHERE id=?', [id]);
  if (!check.length) return res.status(404).json({ error: '服务单不存在' });
  if (check[0].status !== 'pending') return res.status(400).json({ error: '只能拒绝待审核状态的服务单' });

  const n = now();
  run('UPDATE service_orders SET status=?,merchant_remark=?,updated_at=? WHERE id=?', ['rejected', remark, n, id]);
  run('INSERT INTO service_timeline (service_order_id,event_type,title,description,operator,created_at) VALUES (?,?,?,?,?,?)',
    [id, 'rejected', '审核拒绝', remark, '商家客服', n]);
  saveDb();
  res.json({ success: true });
});

router.put('/:id/feedback', async (req, res) => {
  await getDb();
  const { remark } = req.body;
  if (!remark) return res.status(400).json({ error: '必须填写反馈内容' });
  const id = parseInt(req.params.id);
  const check = query('SELECT status FROM service_orders WHERE id=?', [id]);
  if (!check.length) return res.status(404).json({ error: '服务单不存在' });
  if (check[0].status !== 'pending') return res.status(400).json({ error: '只能对待审核状态的服务单要求反馈' });

  const n = now();
  run('UPDATE service_orders SET status=?,merchant_remark=?,updated_at=? WHERE id=?', ['feedback_required', remark, n, id]);
  run('INSERT INTO service_timeline (service_order_id,event_type,title,description,operator,created_at) VALUES (?,?,?,?,?,?)',
    [id, 'feedback_requested', '要求补充信息', remark, '商家客服', n]);
  saveDb();
  res.json({ success: true });
});

router.put('/:id/complete', async (req, res) => {
  await getDb();
  const id = parseInt(req.params.id);
  const check = query('SELECT status FROM service_orders WHERE id=?', [id]);
  if (!check.length) return res.status(404).json({ error: '服务单不存在' });
  if (check[0].status !== 'approved') return res.status(400).json({ error: '只能完成已通过的服务单' });

  const n = now();
  run('UPDATE service_orders SET status=?,sub_status=null,updated_at=?,completed_at=? WHERE id=?', ['completed', n, n, id]);
  run('INSERT INTO service_timeline (service_order_id,event_type,title,description,operator,created_at) VALUES (?,?,?,?,?,?)',
    [id, 'completed', '服务完成', '售后服务已完成', '系统', n]);
  saveDb();
  res.json({ success: true });
});

router.put('/:id/rate', async (req, res) => {
  await getDb();
  const { rating, comment } = req.body;
  const id = parseInt(req.params.id);
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: '评分需在1-5之间' });
  const check = query('SELECT status FROM service_orders WHERE id=?', [id]);
  if (!check.length) return res.status(404).json({ error: '服务单不存在' });
  if (check[0].status !== 'completed') return res.status(400).json({ error: '只能评价已完成的服务单' });

  const n = now();
  run('UPDATE service_orders SET satisfaction_rating=?,satisfaction_comment=?,updated_at=? WHERE id=?', [rating, comment||null, n, id]);
  run('INSERT INTO service_timeline (service_order_id,event_type,title,description,operator,created_at) VALUES (?,?,?,?,?,?)',
    [id, 'rated', '服务评价', '消费者评价'+rating+'星'+(comment?('：'+comment):''), '消费者', n]);
  saveDb();
  res.json({ success: true });
});

router.post('/batch-approve', async (req, res) => {
  await getDb();
  const { ids, remark } = req.body;
  if (!ids || !ids.length) return res.status(400).json({ error: '请选择服务单' });
  const n = now();
  let count = 0;
  for (const id of ids) {
    const check = query('SELECT status,type FROM service_orders WHERE id=?', [id]);
    if (check.length && check[0].status === 'pending') {
      const subStatus = check[0].type === 'refund_only' ? 'refund_processing' : 'waiting_buyer_ship';
      run('UPDATE service_orders SET status=?,sub_status=?,merchant_remark=?,updated_at=? WHERE id=?', ['approved', subStatus, remark||null, n, id]);
      run('INSERT INTO service_timeline (service_order_id,event_type,title,description,operator,created_at) VALUES (?,?,?,?,?,?)',
        [id, 'approved', '批量审核通过', remark||'商家批量同意了售后申请', '商家客服', n]);
      count++;
    }
  }
  saveDb();
  res.json({ success: true, count });
});

router.post('/batch-reject', async (req, res) => {
  await getDb();
  const { ids, remark } = req.body;
  if (!ids || !ids.length) return res.status(400).json({ error: '请选择服务单' });
  if (!remark) return res.status(400).json({ error: '批量拒绝必须填写原因' });
  const n = now();
  let count = 0;
  for (const id of ids) {
    const check = query('SELECT status FROM service_orders WHERE id=?', [id]);
    if (check.length && check[0].status === 'pending') {
      run('UPDATE service_orders SET status=?,merchant_remark=?,updated_at=? WHERE id=?', ['rejected', remark, n, id]);
      run('INSERT INTO service_timeline (service_order_id,event_type,title,description,operator,created_at) VALUES (?,?,?,?,?,?)',
        [id, 'rejected', '批量审核拒绝', remark, '商家客服', n]);
      count++;
    }
  }
  saveDb();
  res.json({ success: true, count });
});

module.exports = router;
