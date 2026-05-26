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
  } else {
    db = new SQL.Database();
    initTables();
    seedData();
    saveDb();
  }
  return db;
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
}

module.exports = { getDb, saveDb, query, run };
