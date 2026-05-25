const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

router.get('/', async (req, res) => {
  const db = await getDb();
  const results = db.exec('SELECT * FROM orders ORDER BY created_at DESC');
  if (!results.length) return res.json([]);

  const columns = results[0].columns;
  const rows = results[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  });
  res.json(rows);
});

module.exports = router;
