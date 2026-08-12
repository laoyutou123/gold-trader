/**
 * 金价数据管理模块
 */

const https = require('https');
const GOLD_API_URL = 'https://api.gold-api.com/price/XAU';

let candles = [];
let currentPrice = null;
let lastFetchTime = 0;
let priceHistory = [];
const CANDLE_PERIOD = 60 * 1000;

function fetchGoldPrice() {
  return new Promise((resolve, reject) => {
    https.get(GOLD_API_URL, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ price: json.price, updatedAt: json.updatedAt, timestamp: Date.now() });
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function updateCandles(price) {
  const now = Date.now();
  const candleTime = Math.floor(now / CANDLE_PERIOD) * CANDLE_PERIOD;

  priceHistory.push({ price, time: now });
  priceHistory = priceHistory.filter(p => now - p.time < 2 * 60 * 60 * 1000);

  if (candles.length === 0) {
    candles.push({ time: candleTime, open: price, high: price, low: price, close: price, volume: 1 });
  } else {
    const lastCandle = candles[candles.length - 1];
    if (lastCandle.time === candleTime) {
      lastCandle.close = price;
      lastCandle.high = Math.max(lastCandle.high, price);
      lastCandle.low = Math.min(lastCandle.low, price);
      lastCandle.volume++;
    } else {
      candles.push({
        time: candleTime,
        open: lastCandle.close,
        high: Math.max(lastCandle.close, price),
        low: Math.min(lastCandle.close, price),
        close: price,
        volume: 1,
      });
    }
  }

  if (candles.length > 120) candles = candles.slice(-120);
  currentPrice = price;
  lastFetchTime = now;
}

function generateInitialHistory(basePrice) {
  const now = Date.now();
  const count = 60;
  let price = basePrice;
  for (let i = count; i > 0; i--) {
    const candleTime = Math.floor((now - i * CANDLE_PERIOD) / CANDLE_PERIOD) * CANDLE_PERIOD;
    const volatility = basePrice * 0.003;
    const open = price;
    const close = open + (Math.random() - 0.5) * volatility * 2;
    const high = Math.max(open, close) + Math.random() * volatility;
    const low = Math.min(open, close) - Math.random() * volatility;
    candles.push({
      time: candleTime,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: Math.floor(Math.random() * 100) + 50,
    });
    price = close;
  }
  currentPrice = price;
}

function getState() {
  return {
    currentPrice,
    candles: candles.slice(),
    priceHistory: priceHistory.slice(),
    lastUpdate: lastFetchTime,
    candleCount: candles.length,
  };
}

async function startDataFeed(onUpdate) {
  console.log('[金价] 启动实时数据获取...');
  try {
    const data = await fetchGoldPrice();
    console.log('[金价] 初始价格:', data.price);
    generateInitialHistory(data.price);
    currentPrice = data.price;
    if (onUpdate) onUpdate(getState());
  } catch (e) {
    console.error('[金价] 初始获取失败:', e.message);
    generateInitialHistory(2400);
    if (onUpdate) onUpdate(getState());
  }

  setInterval(async () => {
    try {
      const data = await fetchGoldPrice();
      updateCandles(data.price);
      console.log(`[金价] ${new Date().toLocaleTimeString('zh-CN')} $${data.price}`);
      if (onUpdate) onUpdate(getState());
    } catch (e) {
      console.error('[金价] 获取失败:', e.message);
    }
  }, 5000);
}

module.exports = { fetchGoldPrice, updateCandles, getState, startDataFeed, generateInitialHistory };
