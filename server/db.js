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
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function initTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT NOT NULL UNIQUE,
      product_name TEXT NOT NULL,
      product_image TEXT,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      buyer_name TEXT NOT NULL,
      buyer_phone TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS service_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_no TEXT NOT NULL UNIQUE,
      order_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('return', 'exchange', 'repair')),
      reason TEXT NOT NULL,
      description TEXT,
      images TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'feedback_required', 'completed')),
      merchant_remark TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);
}

function seedData() {
  const orders = [
    ['ORD20260501001', 'Apple iPhone 15 Pro 256GB', 'https://picsum.photos/seed/iphone/200', 8999.00, 1, '张三', '13800138001', '2026-05-01 10:30:00'],
    ['ORD20260502002', 'Sony WH-1000XM5 降噪耳机', 'https://picsum.photos/seed/sony/200', 2499.00, 1, '李四', '13800138002', '2026-05-02 14:20:00'],
    ['ORD20260503003', 'Nike Air Max 270 运动鞋', 'https://picsum.photos/seed/nike/200', 899.00, 2, '王五', '13800138003', '2026-05-03 09:15:00'],
    ['ORD20260504004', '戴森 V15 无线吸尘器', 'https://picsum.photos/seed/dyson/200', 4990.00, 1, '赵六', '13800138004', '2026-05-04 16:45:00'],
    ['ORD20260505005', 'iPad Air M2 256GB', 'https://picsum.photos/seed/ipad/200', 4799.00, 1, '孙七', '13800138005', '2026-05-05 11:00:00'],
    ['ORD20260506006', '海尔冰箱 BCD-510', 'https://picsum.photos/seed/haier/200', 3599.00, 1, '周八', '13800138006', '2026-05-06 13:30:00'],
    ['ORD20260507007', 'Levi\'s 501 经典牛仔裤', 'https://picsum.photos/seed/levis/200', 599.00, 3, '吴九', '13800138007', '2026-05-07 17:20:00'],
    ['ORD20260508008', '飞利浦电动牙刷 HX6856', 'https://picsum.photos/seed/philips/200', 399.00, 2, '郑十', '13800138008', '2026-05-08 08:50:00'],
  ];

  const stmt = db.prepare('INSERT INTO orders (order_no, product_name, product_image, price, quantity, buyer_name, buyer_phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (const order of orders) {
    stmt.run(order);
  }
  stmt.free();

  const serviceOrders = [
    ['SV20260510001', 1, 'return', '商品质量问题', '屏幕有明显划痕，疑似非全新商品', '[]', 'pending', null, '2026-05-10 09:00:00'],
    ['SV20260511002', 3, 'exchange', '尺码不合适', '购买的42码偏大，希望换40码', '[]', 'pending', null, '2026-05-11 10:30:00'],
    ['SV20260512003', 4, 'repair', '使用故障', '使用两天后吸力明显下降，无法正常工作', '[]', 'approved', '已安排维修，请将商品寄回', '2026-05-12 14:00:00'],
    ['SV20260513004', 2, 'return', '不想要了', '收到后觉得不太需要，申请退货', '[]', 'rejected', '商品已拆封使用，不符合退货条件', '2026-05-13 11:20:00'],
    ['SV20260514005', 6, 'repair', '外观损坏', '冰箱门把手松动，关门不严', '[]', 'feedback_required', '请提供购买凭证和故障照片', '2026-05-14 16:00:00'],
  ];

  const stmt2 = db.prepare('INSERT INTO service_orders (service_no, order_id, type, reason, description, images, status, merchant_remark, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const so of serviceOrders) {
    stmt2.run([...so, so[8]]);
  }
  stmt2.free();
}

module.exports = { getDb, saveDb };
