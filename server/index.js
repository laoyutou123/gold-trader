/**
 * 黄金模拟交易系统 - 主服务器
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const priceData = require('./priceData');
const indicators = require('./indicators');
const account = require('./account');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// SSE 客户端列表
const sseClients = [];
let lastSignal = null;

function broadcastSSE(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(res => {
    try { res.write(msg); } catch (e) {}
  });
}

function onDataUpdate(state) {
  broadcastSSE('price', {
    price: state.currentPrice,
    time: state.lastUpdate,
    candles: state.candles.slice(-60),
  });

  if (state.candles.length >= 30) {
    const signal = indicators.generateSignal(state.candles);
    const signalChanged = !lastSignal || signal.action !== lastSignal.action;
    if (signalChanged && signal.action !== 'HOLD') {
      broadcastSSE('signal', signal);
      console.log(`[信号] ${signal.action} 得分:${signal.score}`);
    }
    broadcastSSE('indicators', signal.indicators);
    lastSignal = signal;
  }

  if (state.currentPrice) {
    broadcastSSE('account', account.getAccountSummary(state.currentPrice));
  }
}

// ============ API 路由 ============

app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write('\n');
  sseClients.push(res);

  const state = priceData.getState();
  if (state.currentPrice) {
    res.write(`event: price\ndata: ${JSON.stringify({
      price: state.currentPrice,
      time: state.lastUpdate,
      candles: state.candles.slice(-60),
    })}\n\n`);

    if (state.candles.length >= 30) {
      const signal = indicators.generateSignal(state.candles);
      res.write(`event: indicators\ndata: ${JSON.stringify(signal.indicators)}\n\n`);
      res.write(`event: account\ndata: ${JSON.stringify(account.getAccountSummary(state.currentPrice))}\n\n`);
    }
  }

  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx > -1) sseClients.splice(idx, 1);
  });
});

app.get('/api/price', (req, res) => {
  const state = priceData.getState();
  res.json({ price: state.currentPrice, time: state.lastUpdate, candleCount: state.candleCount });
});

app.get('/api/candles', (req, res) => {
  res.json(priceData.getState().candles.slice(-120));
});

app.get('/api/signal', (req, res) => {
  const state = priceData.getState();
  if (state.candles.length < 30) return res.json({ action: 'HOLD', score: 0, reasons: ['数据不足'] });
  res.json(indicators.generateSignal(state.candles));
});

app.post('/api/buy', (req, res) => {
  const state = priceData.getState();
  if (!state.currentPrice) return res.status(400).json({ success: false, message: '价格未就绪' });
  const { amount } = req.body || {};
  res.json(account.buy(state.currentPrice, amount));
});

app.post('/api/sell', (req, res) => {
  const state = priceData.getState();
  if (!state.currentPrice) return res.status(400).json({ success: false, message: '价格未就绪' });
  const { amount } = req.body || {};
  res.json(account.sell(state.currentPrice, amount));
});

app.get('/api/account', (req, res) => {
  res.json(account.getAccountSummary(priceData.getState().currentPrice || 0));
});

app.get('/api/trades', (req, res) => {
  res.json(account.getTrades(100));
});

app.post('/api/reset', (req, res) => {
  res.json(account.reset());
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, async () => {
  console.log(`\n黄金模拟交易系统已启动: http://localhost:${PORT}`);
  priceData.startDataFeed(onDataUpdate);
});
