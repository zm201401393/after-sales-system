const express = require('express');
const router = express.Router();
const { getDb, saveDb } = require('../db');

function rowsToObjects(results) {
  if (!results.length) return [];
  const columns = results[0].columns;
  return results[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  });
}

function generateServiceNo() {
  const now = new Date();
  const ts = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `SV${ts}${rand}`;
}

router.get('/stats', async (req, res) => {
  const db = await getDb();
  const results = db.exec(`
    SELECT status, COUNT(*) as count FROM service_orders GROUP BY status
  `);
  const stats = { pending: 0, approved: 0, rejected: 0, feedback_required: 0, completed: 0, total: 0 };
  if (results.length) {
    results[0].values.forEach(([status, count]) => {
      stats[status] = count;
      stats.total += count;
    });
  }
  res.json(stats);
});

router.get('/', async (req, res) => {
  const db = await getDb();
  const { status, type, search, page = 1, pageSize = 10, startDate, endDate } = req.query;

  let where = [];
  let params = [];

  if (status) {
    where.push('so.status = ?');
    params.push(status);
  }
  if (type) {
    where.push('so.type = ?');
    params.push(type);
  }
  if (search) {
    where.push('(so.service_no LIKE ? OR o.order_no LIKE ? OR o.buyer_name LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (startDate) {
    where.push('so.created_at >= ?');
    params.push(startDate);
  }
  if (endDate) {
    where.push('so.created_at <= ?');
    params.push(endDate + ' 23:59:59');
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const countResult = db.exec(`
    SELECT COUNT(*) FROM service_orders so
    LEFT JOIN orders o ON so.order_id = o.id
    ${whereClause}
  `, params);
  const total = countResult.length ? countResult[0].values[0][0] : 0;

  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const dataResult = db.exec(`
    SELECT so.*, o.order_no, o.product_name, o.product_image, o.price, o.quantity, o.buyer_name, o.buyer_phone
    FROM service_orders so
    LEFT JOIN orders o ON so.order_id = o.id
    ${whereClause}
    ORDER BY so.created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, parseInt(pageSize), offset]);

  const rows = dataResult.length ? (() => {
    const columns = dataResult[0].columns;
    return dataResult[0].values.map(row => {
      const obj = {};
      columns.forEach((col, i) => obj[col] = row[i]);
      return obj;
    });
  })() : [];

  res.json({ data: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

router.get('/:id', async (req, res) => {
  const db = await getDb();
  const results = db.exec(`
    SELECT so.*, o.order_no, o.product_name, o.product_image, o.price, o.quantity, o.buyer_name, o.buyer_phone, o.created_at as order_created_at
    FROM service_orders so
    LEFT JOIN orders o ON so.order_id = o.id
    WHERE so.id = ?
  `, [parseInt(req.params.id)]);

  if (!results.length || !results[0].values.length) {
    return res.status(404).json({ error: '服务单不存在' });
  }

  const columns = results[0].columns;
  const row = results[0].values[0];
  const obj = {};
  columns.forEach((col, i) => obj[col] = row[i]);
  res.json(obj);
});

router.post('/', async (req, res) => {
  const db = await getDb();
  const { order_id, type, reason, description, images } = req.body;

  if (!order_id || !type || !reason) {
    return res.status(400).json({ error: '缺少必填字段' });
  }

  const serviceNo = generateServiceNo();
  const imagesJson = JSON.stringify(images || []);
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  db.run(
    'INSERT INTO service_orders (service_no, order_id, type, reason, description, images, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [serviceNo, order_id, type, reason, description || '', imagesJson, 'pending', now, now]
  );
  saveDb();

  const idResult = db.exec('SELECT id FROM service_orders WHERE service_no = ?', [serviceNo]);
  const id = idResult[0].values[0][0];

  res.status(201).json({ id, service_no: serviceNo, status: 'pending' });
});

router.put('/:id/approve', async (req, res) => {
  const db = await getDb();
  const { remark } = req.body;
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  const check = db.exec('SELECT status FROM service_orders WHERE id = ?', [parseInt(req.params.id)]);
  if (!check.length || !check[0].values.length) return res.status(404).json({ error: '服务单不存在' });
  if (check[0].values[0][0] !== 'pending') return res.status(400).json({ error: '只能审核待审核状态的服务单' });

  db.run('UPDATE service_orders SET status = ?, merchant_remark = ?, updated_at = ? WHERE id = ?',
    ['approved', remark || null, now, parseInt(req.params.id)]);
  saveDb();
  res.json({ success: true });
});

router.put('/:id/reject', async (req, res) => {
  const db = await getDb();
  const { remark } = req.body;
  if (!remark) return res.status(400).json({ error: '拒绝时必须填写原因' });

  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  const check = db.exec('SELECT status FROM service_orders WHERE id = ?', [parseInt(req.params.id)]);
  if (!check.length || !check[0].values.length) return res.status(404).json({ error: '服务单不存在' });
  if (check[0].values[0][0] !== 'pending') return res.status(400).json({ error: '只能拒绝待审核状态的服务单' });

  db.run('UPDATE service_orders SET status = ?, merchant_remark = ?, updated_at = ? WHERE id = ?',
    ['rejected', remark, now, parseInt(req.params.id)]);
  saveDb();
  res.json({ success: true });
});

router.put('/:id/feedback', async (req, res) => {
  const db = await getDb();
  const { remark } = req.body;
  if (!remark) return res.status(400).json({ error: '待反馈时必须填写反馈内容' });

  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  const check = db.exec('SELECT status FROM service_orders WHERE id = ?', [parseInt(req.params.id)]);
  if (!check.length || !check[0].values.length) return res.status(404).json({ error: '服务单不存在' });
  if (check[0].values[0][0] !== 'pending') return res.status(400).json({ error: '只能对待审核状态的服务单要求反馈' });

  db.run('UPDATE service_orders SET status = ?, merchant_remark = ?, updated_at = ? WHERE id = ?',
    ['feedback_required', remark, now, parseInt(req.params.id)]);
  saveDb();
  res.json({ success: true });
});

router.put('/:id/complete', async (req, res) => {
  const db = await getDb();
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  const check = db.exec('SELECT status FROM service_orders WHERE id = ?', [parseInt(req.params.id)]);
  if (!check.length || !check[0].values.length) return res.status(404).json({ error: '服务单不存在' });
  if (check[0].values[0][0] !== 'approved') return res.status(400).json({ error: '只能完成已通过的服务单' });

  db.run('UPDATE service_orders SET status = ?, updated_at = ? WHERE id = ?',
    ['completed', now, parseInt(req.params.id)]);
  saveDb();
  res.json({ success: true });
});

module.exports = router;
