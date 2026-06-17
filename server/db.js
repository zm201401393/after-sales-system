const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data.db');
let db;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    ensureAiTables();
    const cnt = db.exec("SELECT COUNT(*) FROM ai_templates");
    if (!cnt.length || cnt[0].values[0][0] === 0) seedAiData();
    saveDb();
  } else {
    db = new SQL.Database();
    initTables();
    seedData();
    ensureAiTables();
    seedAiData();
    saveDb();
  }
  return db;
}

function tableExists(name) {
  const r = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`);
  return r.length > 0 && r[0].values.length > 0;
}

function ensureAiTables() {
  db.run(`CREATE TABLE IF NOT EXISTS ai_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    scenario TEXT NOT NULL,
    agent_name TEXT DEFAULT '小棠',
    agent_style TEXT DEFAULT 'warm',
    opening_line TEXT,
    max_rounds INTEGER DEFAULT 6,
    allow_refund INTEGER DEFAULT 1,
    refund_ceiling REAL DEFAULT 50,
    refund_ratio REAL DEFAULT 0.2,
    allow_coupon INTEGER DEFAULT 1,
    coupon_options TEXT DEFAULT '[10,15,20]',
    allow_reship INTEGER DEFAULT 0,
    allow_exchange INTEGER DEFAULT 0,
    handoff_keywords TEXT DEFAULT '["投诉","315","律师","曝光","媒体","起诉"]',
    description TEXT,
    is_default INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS ai_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_order_id INTEGER NOT NULL,
    template_id INTEGER,
    channel TEXT NOT NULL,
    scenario TEXT NOT NULL,
    merchant_remark TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    stage TEXT DEFAULT 'opening',
    rounds INTEGER DEFAULT 0,
    proposal_step INTEGER DEFAULT 0,
    outcome TEXT,
    outcome_detail TEXT,
    summary TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    ended_at TEXT,
    FOREIGN KEY (service_order_id) REFERENCES service_orders(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS ai_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    intent TEXT,
    emotion TEXT,
    images TEXT DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (session_id) REFERENCES ai_sessions(id)
  )`);

  // 迁移：旧库的 ai_messages 表可能没有 images 列，补上
  if (!columnExists('ai_messages', 'images')) {
    db.run(`ALTER TABLE ai_messages ADD COLUMN images TEXT DEFAULT '[]'`);
  }
}

function columnExists(table, col) {
  try {
    const r = db.exec(`PRAGMA table_info(${table})`);
    if (!r.length) return false;
    return r[0].values.some(row => row[1] === col);
  } catch { return false; }
}

function seedAiData() {
  const tpls = [
    [
      '标准退款协商', 'negotiate', '小棠', 'warm',
      '您好呀，我是XX店铺的售后助理小棠，您看您之前那个订单的售后我们这边正在帮您处理～',
      6, 1, 30, 0.2, 1, '[10,15,20]', 0, 0,
      '["投诉","315","律师","曝光","媒体","起诉","差评"]',
      '基础协商模板，适合金额较小的售后协商，可补偿小额现金或优惠券。', 1
    ],
    [
      '高客单价协商', 'negotiate', '小棠', 'professional',
      '您好，我是您之前订单的专属售后小棠，刚看了下您这个单子，确实给您添麻烦了，我来跟您具体聊一下补偿方案。',
      8, 1, 200, 0.15, 1, '[50,100,150]', 1, 1,
      '["投诉","315","律师","曝光","媒体","起诉"]',
      '高客单价场景，支持更高补贴金额和补发/换货方案。', 0
    ],
    [
      '原因澄清', 'clarify', '小棠', 'warm',
      '您好呀，我是XX店铺的售后助理小棠，刚收到您提交的售后申请～ 我看了下您填的原因，怕理解有偏差，想再跟您确认下具体情况，方便您讲两句吗？',
      4, 0, 0, 0, 0, '[]', 0, 0,
      '["投诉","315","律师","曝光","媒体","起诉"]',
      '当消费者填写的售后原因不清晰时使用，目标是问出具体的问题点和证据。', 1
    ],
  ];
  for (const t of tpls) {
    db.run(`INSERT INTO ai_templates (name,scenario,agent_name,agent_style,opening_line,max_rounds,allow_refund,refund_ceiling,refund_ratio,allow_coupon,coupon_options,allow_reship,allow_exchange,handoff_keywords,description,is_default) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, t);
  }
  seedDemoSessions();
}

// 为部分服务单造完整的 AI 协商会话（含完整对话记录 + 总结），保证演示效果与数据分析有数据
function seedDemoSessions() {
  const negTplId = query("SELECT id FROM ai_templates WHERE scenario='negotiate' AND is_default=1 LIMIT 1")[0]?.id || 1;
  const clarifyTplId = query("SELECT id FROM ai_templates WHERE scenario='clarify' LIMIT 1")[0]?.id || 3;

  // 每条：[serviceOrderId, channel, scenario, templateId, status, outcome, remark, summaryObj, messages[]]
  const demos = [
    {
      so: 6, channel: 'voice', scenario: 'negotiate', tpl: negTplId, status: 'achieved', outcome: 'deal',
      remark: '最多补20', baseTime: '2026-05-17 09:40:00',
      summary: { headline: '消费者接受¥20打款方案', consumer_need: '因iPad色差申请仅退款，实为不满色差想补偿', summary_text: '消费者因iPad Air色差申请仅退款，沟通中先拒绝¥10券、再拒绝¥15打款，AI在商家¥20上限内争取到¥20打款，消费者最终接受。', negotiation_steps: ['第1步：AI共情并提出¥10优惠券，消费者嫌少拒绝', '第2步：AI让步到¥15打款，消费者仍拒绝', '第3步：AI报上限¥20打款，消费者接受'], outcome: 'deal', deal_detail: '¥20打款补偿', next_action: '48小时内完成¥20打款，无需跟进', engine: 'llm' },
      msgs: [
        ['ai', '喂您好，这边是店铺的智能助理小棠，关于您iPad Air的售后单，想跟您聊聊处理方案，方便吗？'],
        ['consumer', '方便，我就是觉得这颜色跟图片差太多了'],
        ['ai', '嗯嗯我懂，色差确实挺影响心情的。这样，我先给您申请一张¥10的店铺券，您看行不？'],
        ['consumer', '才10块也太少了吧'],
        ['ai', '理解您，我再帮您争取下——给您¥15直接打款到账户，您看呢？'],
        ['consumer', '还是少，能不能再多点'],
        ['ai', '这样吧，我跟主管申请到顶了，¥20打款，这是我权限里最高的了，您看能接受不？'],
        ['consumer', '行吧，那就20吧'],
        ['ai', '好嘞，那我这就帮您安排¥20打款，到账您留意下哈，有问题随时找我～'],
      ],
    },
    {
      so: 1, channel: 'im', scenario: 'negotiate', tpl: negTplId, status: 'handoff', outcome: 'handoff',
      remark: '最多补30', baseTime: '2026-05-12 10:00:00',
      summary: { headline: '消费者要求换新并投诉，已转人工', consumer_need: 'iPhone屏幕亮点要求换新机，不接受补偿', summary_text: '消费者因iPhone屏幕亮点申请退货，沟通中坚持要换新机并提到要投诉，超出AI补偿权限，已转人工跟进。', negotiation_steps: ['第1步：AI提出¥30补偿，消费者拒绝坚持换新', '第2步：消费者情绪升级提到投诉', '第3步：AI安抚并转人工'], outcome: 'handoff', deal_detail: '', next_action: '⚠️ 立即安排人工客服联系，处理换新诉求', engine: 'llm' },
      msgs: [
        ['ai', '您好呀，我是店铺智能助理小棠，您iPhone的售后我帮您看了下，屏幕亮点确实给您添麻烦了。'],
        ['consumer', '这都新机，必须给我换一台新的'],
        ['ai', '理解您的心情。换新这块我先帮您申请¥30的补偿，您看能不能先接受？'],
        ['consumer', '不行，我要换新机，不然我就去投诉你们'],
        ['ai', '您先别急，这种情况我马上让人工客服跟您联系，他们权限更灵活能处理换新，您稍等哈。'],
      ],
    },
    {
      so: 2, channel: 'im', scenario: 'clarify', tpl: clarifyTplId, status: 'achieved', outcome: 'clarified',
      remark: '', baseTime: '2026-05-13 10:40:00',
      summary: { headline: '已澄清：42码偏大想换40码', consumer_need: '鞋子42码偏大，希望换小一码', summary_text: '消费者原因填写为"尺码不合适"，AI澄清后明确为42码偏大、希望换40码，且确认是收到即发现、已试穿未影响二次销售。', negotiation_steps: ['第1步：AI询问具体哪里不合适', '第2步：消费者说明42码偏大想换40', '第3步：AI确认收货时间和试穿情况，信息完整'], outcome: 'clarified', deal_detail: '换40码', next_action: '按换货流程处理，安排换40码', engine: 'llm' },
      msgs: [
        ['ai', '您好呀，我是售后助理小棠，您填的"尺码不合适"我想再跟您确认下，方便说说具体情况吗？'],
        ['consumer', '就是42码穿着太大了'],
        ['ai', '好的，那您是想换小一码是吗？想换多少码呢？'],
        ['consumer', '想换40码，是收到当天试穿就发现大了'],
        ['ai', '明白啦，42码偏大想换40码，收到当天发现的。信息我都记下了，马上帮您走换货流程哈～'],
      ],
    },
    {
      so: 8, channel: 'im', scenario: 'negotiate', tpl: negTplId, status: 'achieved', outcome: 'no_deal',
      remark: '只能补券不打款', baseTime: '2026-05-19 14:40:00',
      summary: { headline: '消费者拒绝优惠券方案，已登记反馈', consumer_need: '想直接退款，不接受只给券', summary_text: '消费者冲动消费想退款，但商家备注只能补券不能打款，消费者坚持要现金退款拒绝优惠券，沟通未达成，已登记反馈待专员跟进。', negotiation_steps: ['第1步：AI提出¥10、¥20优惠券方案', '第2步：消费者拒绝，坚持要现金退款', '第3步：AI说明只能发券，消费者不接受，登记反馈'], outcome: 'no_deal', deal_detail: '', next_action: '⚠️ 需人工评估是否可现金退款', engine: 'llm' },
      msgs: [
        ['ai', '您好呀，我是售后助理小棠，您牙刷的售后我来帮您处理～这样，我可以给您发一张¥20的店铺优惠券，您看行吗？'],
        ['consumer', '我不要券，我要直接退钱'],
        ['ai', '理解您，不过这单按规则只能用优惠券补偿，没法直接打款呢。¥20券下次买东西能直接抵，您看？'],
        ['consumer', '那不行，我就要退款'],
        ['ai', '好的，那我先把您的情况详细登记下来反馈给专员，后续会有人再跟您联系，您留意下哈。'],
      ],
    },
  ];

  for (const d of demos) {
    db.run(`INSERT INTO ai_sessions (service_order_id,template_id,channel,scenario,merchant_remark,status,stage,rounds,proposal_step,outcome,outcome_detail,summary,started_at,ended_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [d.so, d.tpl, d.channel, d.scenario, d.remark, d.status, 'closing', d.msgs.length, 2, d.outcome, d.summary.deal_detail || '', JSON.stringify(d.summary), d.baseTime, d.baseTime]);
    const sid = query('SELECT id FROM ai_sessions ORDER BY id DESC LIMIT 1')[0].id;
    let t = new Date(d.baseTime.replace(' ', 'T') + '+08:00').getTime();
    for (const [role, content] of d.msgs) {
      const ts = new Date(t).toISOString().replace('T', ' ').slice(0, 19);
      db.run('INSERT INTO ai_messages (session_id,role,content,intent,created_at) VALUES (?,?,?,?,?)',
        [sid, role, content, role === 'ai' ? 'propose' : '', ts]);
      t += 25000; // 每轮间隔约 25s
    }
  }
}

function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function query(sql, params = []) {
  const results = db.exec(sql, params);
  if (!results.length) return [];
  const columns = results[0].columns;
  return results[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  });
}

function run(sql, params = []) {
  db.run(sql, params);
}

function initTables() {
  db.run(`CREATE TABLE IF NOT EXISTS consumers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    vip_level INTEGER DEFAULT 0,
    order_count INTEGER DEFAULT 0,
    return_rate REAL DEFAULT 0.0,
    credit_score INTEGER DEFAULT 100,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT NOT NULL UNIQUE,
    consumer_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    product_image TEXT,
    price REAL NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (consumer_id) REFERENCES consumers(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS service_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_no TEXT NOT NULL UNIQUE,
    order_id INTEGER NOT NULL,
    consumer_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    reason TEXT NOT NULL,
    description TEXT,
    images TEXT DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    sub_status TEXT,
    priority TEXT DEFAULT 'normal',
    refund_amount REAL DEFAULT 0,
    actual_refund_amount REAL,
    merchant_remark TEXT,
    ai_suggestion TEXT,
    satisfaction_rating INTEGER,
    satisfaction_comment TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    completed_at TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (consumer_id) REFERENCES consumers(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS communication_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_order_id INTEGER NOT NULL,
    sender_type TEXT NOT NULL,
    message TEXT NOT NULL,
    attachments TEXT DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (service_order_id) REFERENCES service_orders(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS logistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_order_id INTEGER NOT NULL,
    direction TEXT NOT NULL,
    carrier TEXT,
    tracking_no TEXT,
    status TEXT DEFAULT 'pending',
    shipped_at TEXT,
    delivered_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (service_order_id) REFERENCES service_orders(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS service_timeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_order_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    operator TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (service_order_id) REFERENCES service_orders(id)
  )`);
}

function seedData() {
  const consumers = [
    ['王梦琪', '13812345001', 3, 58, 3.2, 98, '2024-01-15 10:00:00'],
    ['李明浩', '13812345002', 1, 12, 8.5, 85, '2024-06-20 14:00:00'],
    ['张小红', '13812345003', 0, 5, 42.0, 52, '2025-02-10 09:00:00'],
    ['陈思远', '13812345004', 2, 35, 5.7, 92, '2023-11-08 16:00:00'],
    ['赵婷婷', '13812345005', 0, 2, 0, 100, '2026-05-01 11:00:00'],
  ];
  for (const c of consumers) {
    db.run('INSERT INTO consumers (name,phone,vip_level,order_count,return_rate,credit_score,created_at) VALUES (?,?,?,?,?,?,?)', c);
  }

  const orders = [
    ['ORD20260501001', 1, 'Apple iPhone 15 Pro 256GB', 'https://picsum.photos/seed/iphone15/200', 8999.00, 1, '2026-05-01 10:30:00'],
    ['ORD20260502002', 2, 'Sony WH-1000XM5 降噪耳机', 'https://picsum.photos/seed/sonyxm5/200', 2499.00, 1, '2026-05-02 14:20:00'],
    ['ORD20260503003', 3, 'Nike Air Max 270 运动鞋 42码', 'https://picsum.photos/seed/nikeair/200', 899.00, 1, '2026-05-03 09:15:00'],
    ['ORD20260504004', 1, '戴森 V15 无线吸尘器', 'https://picsum.photos/seed/dysonv15/200', 4990.00, 1, '2026-05-04 16:45:00'],
    ['ORD20260505005', 4, 'iPad Air M2 256GB 星光色', 'https://picsum.photos/seed/ipadair/200', 4799.00, 1, '2026-05-05 11:00:00'],
    ['ORD20260506006', 2, '海尔冰箱 BCD-510 对开门', 'https://picsum.photos/seed/haier510/200', 3599.00, 1, '2026-05-06 13:30:00'],
    ['ORD20260507007', 5, 'Levi\'s 501 经典牛仔裤', 'https://picsum.photos/seed/levis501/200', 599.00, 2, '2026-05-07 17:20:00'],
    ['ORD20260508008', 3, '飞利浦电动牙刷 HX6856', 'https://picsum.photos/seed/philips6/200', 399.00, 1, '2026-05-08 08:50:00'],
    ['ORD20260509009', 4, '小米14 Ultra 512GB', 'https://picsum.photos/seed/mi14u/200', 6499.00, 1, '2026-05-09 10:00:00'],
    ['ORD20260510010', 1, '雅诗兰黛小棕瓶精华 50ml', 'https://picsum.photos/seed/estee50/200', 760.00, 2, '2026-05-10 15:30:00'],
  ];
  for (const o of orders) {
    db.run('INSERT INTO orders (order_no,consumer_id,product_name,product_image,price,quantity,created_at) VALUES (?,?,?,?,?,?,?)', o);
  }

  const serviceOrders = [
    ['SV20260512001', 1, 1, 'return', '商品质量问题', '屏幕右下角有明显亮点，疑似屏幕缺陷', 'pending', null, 'high', 8999.00, null, '2026-05-12 09:00:00'],
    ['SV20260513002', 3, 3, 'exchange', '尺码不合适', '42码偏大，希望换40码', 'pending', null, 'normal', 0, null, '2026-05-13 10:30:00'],
    ['SV20260514003', 1, 4, 'repair', '使用故障', '使用两天后吸力明显下降', 'approved', 'waiting_buyer_ship', 'normal', 0, null, '2026-05-14 14:00:00'],
    ['SV20260515004', 2, 2, 'return', '不想要了', '收到后觉得不太需要', 'rejected', null, 'low', 2499.00, null, '2026-05-15 11:20:00'],
    ['SV20260516005', 2, 6, 'repair', '外观损坏', '冰箱门把手松动，关门不严', 'feedback_required', null, 'normal', 0, null, '2026-05-16 16:00:00'],
    ['SV20260517006', 4, 5, 'refund_only', '商品与描述不符', '颜色与页面展示差异较大', 'approved', 'refund_processing', 'high', 4799.00, 4799.00, '2026-05-17 09:30:00'],
    ['SV20260518007', 5, 7, 'return', '商品质量问题', '牛仔裤缝线开裂', 'completed', null, 'normal', 599.00, 599.00, '2026-05-18 12:00:00'],
    ['SV20260519008', 3, 8, 'refund_only', '不想要了', '冲动消费想退款', 'pending', null, 'low', 399.00, null, '2026-05-19 14:30:00'],
  ];
  for (const so of serviceOrders) {
    db.run(`INSERT INTO service_orders (service_no,consumer_id,order_id,type,reason,description,status,sub_status,priority,refund_amount,actual_refund_amount,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [...so, so[11]]);
  }

  const communications = [
    [5, 'consumer', '门把手一直松动，开关门时有异响', '2026-05-16 16:10:00'],
    [5, 'merchant', '请提供购买凭证和故障照片以便我们判断', '2026-05-16 17:00:00'],
    [5, 'consumer', '已拍照，附件中是把手和门缝的照片', '2026-05-17 09:00:00'],
    [1, 'consumer', '请尽快处理，已经影响正常使用了', '2026-05-12 15:00:00'],
    [1, 'consumer', '买了2天就出问题，很不满意', '2026-05-13 10:00:00'],
    [3, 'merchant', '已审核通过，请您将商品寄回以下地址：上海市浦东新区XX路XX号', '2026-05-14 15:00:00'],
    [3, 'consumer', '好的，今天下午寄出', '2026-05-14 16:00:00'],
    [7, 'consumer', '裤子只穿了一次缝线就开了', '2026-05-18 12:05:00'],
    [7, 'merchant', '非常抱歉给您带来不便，已同意退货退款', '2026-05-18 14:00:00'],
  ];
  for (const c of communications) {
    db.run('INSERT INTO communication_records (service_order_id,sender_type,message,created_at) VALUES (?,?,?,?)', c);
  }

  const logisticsData = [
    [3, 'return', '顺丰速运', 'SF1234567890', 'shipped', '2026-05-15 14:00:00', null, '2026-05-15 14:00:00'],
    [7, 'return', '中通快递', 'ZT9876543210', 'delivered', '2026-05-19 10:00:00', '2026-05-20 15:00:00', '2026-05-19 10:00:00'],
  ];
  for (const l of logisticsData) {
    db.run('INSERT INTO logistics (service_order_id,direction,carrier,tracking_no,status,shipped_at,delivered_at,created_at) VALUES (?,?,?,?,?,?,?,?)', l);
  }

  const timeline = [
    [1, 'created', '提交售后申请', '消费者王梦琪提交了退货申请', '王梦琪', '2026-05-12 09:00:00'],
    [2, 'created', '提交售后申请', '消费者张小红提交了换货申请', '张小红', '2026-05-13 10:30:00'],
    [3, 'created', '提交售后申请', '消费者王梦琪提交了维修申请', '王梦琪', '2026-05-14 14:00:00'],
    [3, 'approved', '审核通过', '商家同意维修，等待消费者寄回', '商家客服', '2026-05-14 15:00:00'],
    [3, 'logistics_updated', '物流更新', '消费者已发货 顺丰SF1234567890', '系统', '2026-05-15 14:00:00'],
    [4, 'created', '提交售后申请', '消费者李明浩提交了退货申请', '李明浩', '2026-05-15 11:20:00'],
    [4, 'rejected', '审核拒绝', '商品已拆封使用，不符合退货条件', '商家客服', '2026-05-15 14:00:00'],
    [5, 'created', '提交售后申请', '消费者李明浩提交了维修申请', '李明浩', '2026-05-16 16:00:00'],
    [5, 'feedback_requested', '要求补充信息', '请提供购买凭证和故障照片', '商家客服', '2026-05-16 17:00:00'],
    [6, 'created', '提交售后申请', '消费者陈思远提交了仅退款申请', '陈思远', '2026-05-17 09:30:00'],
    [6, 'approved', '审核通过', '同意全额退款¥4799.00', '商家客服', '2026-05-17 10:00:00'],
    [7, 'created', '提交售后申请', '消费者赵婷婷提交了退货申请', '赵婷婷', '2026-05-18 12:00:00'],
    [7, 'approved', '审核通过', '同意退货退款', '商家客服', '2026-05-18 14:00:00'],
    [7, 'logistics_updated', '物流更新', '消费者已发货 中通ZT9876543210', '系统', '2026-05-19 10:00:00'],
    [7, 'completed', '服务完成', '商品已签收，退款¥599.00已原路退回', '系统', '2026-05-20 16:00:00'],
    [8, 'created', '提交售后申请', '消费者张小红提交了仅退款申请', '张小红', '2026-05-19 14:30:00'],
  ];
  for (const t of timeline) {
    db.run('INSERT INTO service_timeline (service_order_id,event_type,title,description,operator,created_at) VALUES (?,?,?,?,?,?)', t);
  }

  db.run('UPDATE service_orders SET satisfaction_rating=5, satisfaction_comment=\'处理速度很快，态度很好\', completed_at=\'2026-05-20 16:00:00\' WHERE id=7');
  db.run('UPDATE service_orders SET merchant_remark=\'已安排维修，请寄回\' WHERE id=3');
  db.run('UPDATE service_orders SET merchant_remark=\'商品已拆封使用，不符合退货条件\' WHERE id=4');
  db.run('UPDATE service_orders SET merchant_remark=\'请提供购买凭证和故障照片\' WHERE id=5');
  db.run('UPDATE service_orders SET merchant_remark=\'同意全额退款\' WHERE id=6');

  seedMorePending();
}

// 补充更多待审核服务单（保证演示时待审核 >=10 条）
function seedMorePending() {
  // 追加订单（consumer_id 取已有 1-5）
  const moreOrders = [
    ['ORD20260511011', 2, 'Bose QC45 头戴耳机', 'https://picsum.photos/seed/boseqc45/200', 2299.00, 1, '2026-05-11 09:10:00'],
    ['ORD20260512012', 3, 'Nike 运动卫衣 L码', 'https://picsum.photos/seed/nikehoodie/200', 459.00, 1, '2026-05-12 10:20:00'],
    ['ORD20260513013', 5, '美的电饭煲 4L', 'https://picsum.photos/seed/midea4l/200', 329.00, 1, '2026-05-13 11:30:00'],
    ['ORD20260514014', 4, '罗技 MX Master 3S 鼠标', 'https://picsum.photos/seed/mxmaster/200', 699.00, 1, '2026-05-14 13:40:00'],
    ['ORD20260515015', 1, '兰蔻菁纯面霜 50ml', 'https://picsum.photos/seed/lancome/200', 1280.00, 1, '2026-05-15 15:50:00'],
    ['ORD20260516016', 2, 'Switch OLED 游戏机', 'https://picsum.photos/seed/switcholed/200', 2099.00, 1, '2026-05-16 16:00:00'],
    ['ORD20260517017', 3, 'Adidas 跑鞋 41码', 'https://picsum.photos/seed/adidasrun/200', 599.00, 1, '2026-05-17 09:25:00'],
    ['ORD20260518018', 5, '九阳破壁机 Y88', 'https://picsum.photos/seed/joyoung/200', 899.00, 1, '2026-05-18 10:35:00'],
    ['ORD20260519019', 4, 'Kindle Paperwhite 6.8寸', 'https://picsum.photos/seed/kindle/200', 1099.00, 1, '2026-05-19 14:45:00'],
    ['ORD20260520020', 1, 'SK-II 神仙水 230ml', 'https://picsum.photos/seed/skii/200', 1540.00, 1, '2026-05-20 15:55:00'],
  ];
  for (const o of moreOrders) {
    db.run('INSERT INTO orders (order_no,consumer_id,product_name,product_image,price,quantity,created_at) VALUES (?,?,?,?,?,?,?)', o);
  }
  // 取这些订单的自增 id
  const moreNos = moreOrders.map(o => o[0]);
  const placeholders = moreNos.map(() => '?').join(',');
  const ordIds = query(`SELECT id, consumer_id FROM orders WHERE order_no IN (${placeholders}) ORDER BY id ASC`, moreNos);
  const pendings = [
    ['return', '商品质量问题', '耳机右耳无声，疑似喇叭故障', 'high', 2299.00],
    ['exchange', '尺码不合适', 'L码偏小，想换XL', 'normal', 0],
    ['refund_only', '商品与描述不符', '内胆涂层有划痕，和详情页不一样', 'normal', 329.00],
    ['repair', '使用故障', '鼠标连接经常断连', 'normal', 0],
    ['return', '商品质量问题', '面霜膏体有分层，疑似变质', 'high', 1280.00],
    ['return', '七天无理由', '买重复了想退一台', 'low', 2099.00],
    ['exchange', '尺码不合适', '41码偏大半码，想换40.5', 'normal', 0],
    ['repair', '使用故障', '破壁机加热档位失灵', 'normal', 0],
    ['refund_only', '不想要了', '看了一周没怎么用想退', 'low', 1099.00],
    ['return', '商品质量问题', '瓶口漏液，收到时盒子已渗出', 'urgent', 1540.00],
  ];
  let n = 1;
  for (let i = 0; i < ordIds.length && i < pendings.length; i++) {
    const o = ordIds[i];
    const p = pendings[i];
    const created = `2026-05-${String(20 + Math.floor(i / 3)).padStart(2, '0')} ${String(9 + i).padStart(2, '0')}:15:00`;
    const svNo = 'SV2026052' + String(100 + n).slice(1);
    db.run(`INSERT INTO service_orders (service_no,consumer_id,order_id,type,reason,description,status,sub_status,priority,refund_amount,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [svNo, o.consumer_id, o.id, p[0], p[1], p[2], 'pending', null, p[3], p[4], created, created]);
    const soId = query('SELECT id FROM service_orders ORDER BY id DESC LIMIT 1')[0].id;
    db.run('INSERT INTO service_timeline (service_order_id,event_type,title,description,operator,created_at) VALUES (?,?,?,?,?,?)',
      [soId, 'created', '提交售后申请', '消费者提交了售后申请', '消费者', created]);
    n++;
  }
}

module.exports = { getDb, saveDb, query, run };
