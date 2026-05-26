const express = require('express');
const router = express.Router();
const { getDb, saveDb, query, run } = require('../db');

router.get('/:serviceOrderId/communications', async (req, res) => {
  await getDb();
  const rows = query('SELECT * FROM communication_records WHERE service_order_id=? ORDER BY created_at ASC', [parseInt(req.params.serviceOrderId)]);
  res.json(rows);
});

router.post('/:serviceOrderId/communications', async (req, res) => {
  await getDb();
  const { sender_type, message } = req.body;
  if (!sender_type || !message) return res.status(400).json({ error: '缺少必填字段' });
  const n = new Date().toISOString().replace('T',' ').substring(0,19);
  run('INSERT INTO communication_records (service_order_id,sender_type,message,created_at) VALUES (?,?,?,?)',
    [parseInt(req.params.serviceOrderId), sender_type, message, n]);
  run('INSERT INTO service_timeline (service_order_id,event_type,title,description,operator,created_at) VALUES (?,?,?,?,?,?)',
    [parseInt(req.params.serviceOrderId), 'consumer_replied', '新消息', message.substring(0,50), sender_type==='consumer'?'消费者':'商家客服', n]);
  saveDb();
  res.status(201).json({ success: true });
});

router.get('/:serviceOrderId/logistics', async (req, res) => {
  await getDb();
  const rows = query('SELECT * FROM logistics WHERE service_order_id=? ORDER BY created_at DESC', [parseInt(req.params.serviceOrderId)]);
  res.json(rows);
});

router.post('/:serviceOrderId/logistics', async (req, res) => {
  await getDb();
  const { direction, carrier, tracking_no } = req.body;
  if (!direction || !carrier || !tracking_no) return res.status(400).json({ error: '缺少必填字段' });
  const n = new Date().toISOString().replace('T',' ').substring(0,19);
  run('INSERT INTO logistics (service_order_id,direction,carrier,tracking_no,status,shipped_at,created_at) VALUES (?,?,?,?,?,?,?)',
    [parseInt(req.params.serviceOrderId), direction, carrier, tracking_no, 'shipped', n, n]);
  run('UPDATE service_orders SET sub_status=?,updated_at=? WHERE id=?', ['buyer_shipped', n, parseInt(req.params.serviceOrderId)]);
  run('INSERT INTO service_timeline (service_order_id,event_type,title,description,operator,created_at) VALUES (?,?,?,?,?,?)',
    [parseInt(req.params.serviceOrderId), 'logistics_updated', '物流更新', '已发货 '+carrier+' '+tracking_no, '系统', n]);
  saveDb();
  res.status(201).json({ success: true });
});

router.get('/:serviceOrderId/timeline', async (req, res) => {
  await getDb();
  const rows = query('SELECT * FROM service_timeline WHERE service_order_id=? ORDER BY created_at ASC', [parseInt(req.params.serviceOrderId)]);
  res.json(rows);
});

module.exports = router;
