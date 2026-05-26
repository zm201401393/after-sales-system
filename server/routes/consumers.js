const express = require('express');
const router = express.Router();
const { getDb, query } = require('../db');

router.get('/:id', async (req, res) => {
  await getDb();
  const rows = query('SELECT * FROM consumers WHERE id=?', [parseInt(req.params.id)]);
  if (!rows.length) return res.status(404).json({ error: '消费者不存在' });
  res.json(rows[0]);
});

router.get('/:id/history', async (req, res) => {
  await getDb();
  const rows = query(`SELECT so.id, so.service_no, so.type, so.reason, so.status, so.created_at, o.product_name
    FROM service_orders so LEFT JOIN orders o ON so.order_id=o.id
    WHERE so.consumer_id=? ORDER BY so.created_at DESC`, [parseInt(req.params.id)]);
  res.json(rows);
});

module.exports = router;
