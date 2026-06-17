const express = require('express');
const router = express.Router();
const { getDb, saveDb, query, run } = require('../db');

function now() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }

// 列表
router.get('/', async (req, res) => {
  await getDb();
  const { scenario } = req.query;
  let sql = 'SELECT * FROM ai_templates';
  const params = [];
  if (scenario) { sql += ' WHERE scenario=?'; params.push(scenario); }
  sql += ' ORDER BY is_default DESC, id ASC';
  const rows = query(sql, params);
  res.json(rows);
});

// 详情
router.get('/:id', async (req, res) => {
  await getDb();
  const rows = query('SELECT * FROM ai_templates WHERE id=?', [parseInt(req.params.id)]);
  if (!rows.length) return res.status(404).json({ error: '模板不存在' });
  res.json(rows[0]);
});

// 新建
router.post('/', async (req, res) => {
  await getDb();
  const t = req.body || {};
  const fields = ['name','scenario','agent_name','agent_style','opening_line','max_rounds','allow_refund','refund_ceiling','refund_ratio','allow_coupon','coupon_options','allow_reship','allow_exchange','handoff_keywords','description','is_default'];
  const placeholders = fields.map(() => '?').join(',');
  const values = fields.map(f => {
    if (f === 'coupon_options' || f === 'handoff_keywords') return typeof t[f] === 'string' ? t[f] : JSON.stringify(t[f] || []);
    return t[f] != null ? t[f] : null;
  });
  run(`INSERT INTO ai_templates (${fields.join(',')}) VALUES (${placeholders})`, values);
  saveDb();
  const rows = query('SELECT * FROM ai_templates ORDER BY id DESC LIMIT 1');
  res.status(201).json(rows[0]);
});

// 更新
router.put('/:id', async (req, res) => {
  await getDb();
  const id = parseInt(req.params.id);
  const t = req.body || {};
  const fields = ['name','scenario','agent_name','agent_style','opening_line','max_rounds','allow_refund','refund_ceiling','refund_ratio','allow_coupon','coupon_options','allow_reship','allow_exchange','handoff_keywords','description','is_default'];
  const updates = [];
  const values = [];
  for (const f of fields) {
    if (t[f] === undefined) continue;
    updates.push(`${f}=?`);
    if (f === 'coupon_options' || f === 'handoff_keywords') {
      values.push(typeof t[f] === 'string' ? t[f] : JSON.stringify(t[f] || []));
    } else {
      values.push(t[f]);
    }
  }
  if (!updates.length) return res.json({ success: true });
  values.push(id);
  run(`UPDATE ai_templates SET ${updates.join(',')} WHERE id=?`, values);
  saveDb();
  const rows = query('SELECT * FROM ai_templates WHERE id=?', [id]);
  res.json(rows[0]);
});

// 删除
router.delete('/:id', async (req, res) => {
  await getDb();
  run('DELETE FROM ai_templates WHERE id=?', [parseInt(req.params.id)]);
  saveDb();
  res.json({ success: true });
});

module.exports = router;
