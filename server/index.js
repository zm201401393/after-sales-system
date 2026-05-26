const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb } = require('./db');

const ordersRouter = require('./routes/orders');
const serviceOrdersRouter = require('./routes/serviceOrders');
const communicationsRouter = require('./routes/communications');
const consumersRouter = require('./routes/consumers');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/orders', ordersRouter);
app.use('/api/service-orders', serviceOrdersRouter);
app.use('/api/service-orders', communicationsRouter);
app.use('/api/consumers', consumersRouter);

app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  }
});

async function start() {
  await getDb();
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

start();
