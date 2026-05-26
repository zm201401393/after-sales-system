const express = require('express');
const router = express.Router();
const { getDb, query } = require('../db');

router.get('/', async (req, res) => {
  await getDb();
  const { consumer_id } = req.query;
  let sql = 'SELECT o.*, c.name as buyer_name, c.phone as buyer_phone FROM orders o LEFT JOIN consumers c ON o.consumer_id=c.id';
  const params = [];
  if (consumer_id) { sql += ' WHERE o.consumer_id=?'; params.push(parseInt(consumer_id)); }
  sql += ' ORDER BY o.created_at DESC';
  const rows = query(sql, params);
  res.json(rows);
});

module.exports = router;
