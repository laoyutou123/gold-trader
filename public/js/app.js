let currentPrice = 0;
let prevPrice = 0;
let eventSource = null;
let sseConnected = false;
let pollTimer = null;

const $ = id => document.getElementById(id);
const elPrice = $('currentPrice');
const elPriceChange = $('priceChange');
const elPriceTime = $('priceTime');
const elStatusDot = $('statusDot');
const elStatusText = $('statusText');
const elSignalAction = $('signalAction');
const elSignalReasons = $('signalReasons');
const elSignalStrength = $('signalStrength');
const elTradeList = $('tradeList');

function fmtPrice(p) { return p ? p.toFixed(2) : '--'; }
function fmtMoney(v) {
  if (v === null || v === undefined) return '--';
  const sign = v >= 0 ? '' : '-';
  return sign + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtTime(ts) {
  if (!ts) return '--';
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function showToast(title, msg, type = 'info') {
  const container = $('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { buy: '📈', sell: '📉', info: 'ℹ️', error: '❌' };
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
    </div>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
function sendNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, tag: 'gold-signal' });
  }
}

function drawCandleChart(candles) {
  if (!candles || candles.length === 0) return;
  const canvas = $('priceChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.clientWidth || canvas.parentElement.clientWidth || 380;
  const H = 250;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  const padding = { top: 10, right: 54, bottom: 25, left: 5 };
  const chartW = W - padding.left - padding.right;
  const chartH = H - padding.top - padding.bottom;

  let minPrice = Infinity, maxPrice = -Infinity;
  candles.forEach(c => { minPrice = Math.min(minPrice, c.low); maxPrice = Math.max(maxPrice, c.high); });
  const range = maxPrice - minPrice || 1;
  const pPad = range * 0.1;
  minPrice -= pPad;
  maxPrice += pPad;

  ctx.fillStyle = '#131825';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(W - padding.right, y); ctx.stroke();
    const price = maxPrice - (range + 2 * pPad) / 4 * i;
    ctx.fillStyle = '#5a6378'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('$' + price.toFixed(1), W - padding.right + 4, y + 3);
  }

  const candleW = Math.max(chartW / candles.length * 0.7, 2);
  const gap = chartW / candles.length;
  candles.forEach((c, i) => {
    const x = padding.left + gap * i + gap / 2;
    const isUp = c.close >= c.open;
    const color = isUp ? '#00c853' : '#ff1744';
    const fillColor = isUp ? 'rgba(0,200,83,0.7)' : 'rgba(255,23,68,0.7)';
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, padding.top + (maxPrice - c.high) / (maxPrice - minPrice) * chartH);
    ctx.lineTo(x, padding.top + (maxPrice - c.low) / (maxPrice - minPrice) * chartH);
    ctx.stroke();
    const bodyTop = padding.top + (maxPrice - Math.max(c.open, c.close)) / (maxPrice - minPrice) * chartH;
    const bodyBot = padding.top + (maxPrice - Math.min(c.open, c.close)) / (maxPrice - minPrice) * chartH;
    const bodyH = Math.max(bodyBot - bodyTop, 1);
    ctx.fillStyle = fillColor;
    ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
    ctx.strokeRect(x - candleW / 2, bodyTop, candleW, bodyH);
  });

  ctx.fillStyle = '#5a6378'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
  const labelCount = 5;
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.floor(candles.length / (labelCount - 1) * i);
    if (idx >= candles.length) continue;
    const x = padding.left + gap * idx + gap / 2;
    const time = new Date(candles[idx].time);
    ctx.fillText(time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), x, H - 8);
  }

  if (currentPrice > 0) {
    const y = padding.top + (maxPrice - currentPrice) / (maxPrice - minPrice) * chartH;
    if (y >= padding.top && y <= padding.top + chartH) {
      ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(W - padding.right, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffd700'; ctx.fillRect(W - padding.right, y - 8, 48, 16);
      ctx.fillStyle = '#0a0e17'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('$' + currentPrice.toFixed(2), W - padding.right + 24, y + 3);
    }
  }
}

function updatePrice(price, time) {
  if (price === currentPrice) return;
  prevPrice = currentPrice;
  currentPrice = price;
  elPrice.textContent = fmtPrice(price);
  if (prevPrice > 0) {
    if (price > prevPrice) { elPrice.classList.remove('flash-down'); elPrice.classList.add('flash-up'); }
    else { elPrice.classList.remove('flash-up'); elPrice.classList.add('flash-down'); }
    setTimeout(() => elPrice.classList.remove('flash-up', 'flash-down'), 500);
    const change = price - prevPrice;
    const changePct = (change / prevPrice * 100);
    const sign = change >= 0 ? '+' : '';
    elPriceChange.textContent = `${sign}$${change.toFixed(2)} (${sign}${changePct.toFixed(3)}%)`;
    elPriceChange.className = 'price-change ' + (change >= 0 ? 'up' : 'down');
  }
  elPriceTime.textContent = '更新于 ' + fmtTime(time);
}

function updateSignal(signal) {
  let badgeClass = 'hold', badgeText = '观望';
  if (signal.action === 'BUY') { badgeClass = 'buy'; badgeText = '🟢 建议买入'; }
  else if (signal.action === 'SELL') { badgeClass = 'sell'; badgeText = '🔴 建议卖出'; }
  elSignalAction.innerHTML = `<span class="signal-badge ${badgeClass}">${badgeText}</span>`;
  elSignalStrength.textContent = `得分: ${signal.score > 0 ? '+' : ''}${signal.score}`;
  if (signal.reasons && signal.reasons.length > 0) {
    elSignalReasons.innerHTML = signal.reasons.map(r => {
      const isBuy = r.includes('金叉') || r.includes('超卖') || r.includes('下轨') || r.includes('多头') || r.includes('正转');
      const isSell = r.includes('死叉') || r.includes('超买') || r.includes('上轨') || r.includes('空头') || r.includes('负');
      const cls = isBuy ? 'buy' : (isSell ? 'sell' : '');
      return `<div class="reason-item ${cls}">• ${r}</div>`;
    }).join('');
  } else {
    elSignalReasons.innerHTML = '<div class="reason-item">暂无明显信号</div>';
  }
}

function updateIndicators(ind) {
  if (!ind) return;
  $('indMA5').textContent = ind.ma5 ? '$' + ind.ma5.toFixed(2) : '--';
  $('indMA10').textContent = ind.ma10 ? '$' + ind.ma10.toFixed(2) : '--';
  $('indMA20').textContent = ind.ma20 ? '$' + ind.ma20.toFixed(2) : '--';
  const rsiEl = $('indRSI');
  if (ind.rsi) { rsiEl.textContent = ind.rsi.toFixed(1); rsiEl.className = 'ind-value ' + (ind.rsi < 30 ? 'buy' : ind.rsi > 70 ? 'sell' : ''); }
  const macdEl = $('indMACD');
  if (ind.macd_hist !== null && ind.macd_hist !== undefined) { macdEl.textContent = ind.macd_hist.toFixed(2); macdEl.className = 'ind-value ' + (ind.macd_hist > 0 ? 'buy' : 'sell'); }
  const bollEl = $('indBoll');
  if (ind.boll_upper && ind.boll_lower) {
    bollEl.textContent = `${ind.boll_lower.toFixed(0)}/${ind.boll_upper.toFixed(0)}`;
    if (ind.price <= ind.boll_lower) bollEl.className = 'ind-value buy';
    else if (ind.price >= ind.boll_upper) bollEl.className = 'ind-value sell';
    else bollEl.className = 'ind-value';
  }
}

function updateAccount(acc) {
  if (!acc) return;
  $('totalAssets').textContent = fmtMoney(acc.totalAssets);
  $('cashBalance').textContent = fmtMoney(acc.cash);
  const pnlEl = $('totalPnl');
  pnlEl.textContent = (acc.totalPnl >= 0 ? '+' : '') + fmtMoney(acc.totalPnl).replace('-', '');
  pnlEl.className = 'acc-value ' + (acc.totalPnl >= 0 ? 'profit' : 'loss');
  $('winRate').textContent = acc.winRate + '%';
  if (acc.position) {
    $('positionSection').style.display = 'block';
    $('posGold').textContent = acc.position.gold.toFixed(4) + ' oz';
    $('posAvgPrice').textContent = '$' + acc.position.avgPrice.toFixed(2);
    const pnlEl2 = $('posPnl');
    pnlEl2.textContent = (acc.position.pnl >= 0 ? '+' : '') + fmtMoney(acc.position.pnl).replace('-', '');
    pnlEl2.className = 'pos-value ' + (acc.position.pnl >= 0 ? 'profit' : 'loss');
    const pctEl = $('posPnlPercent');
    pctEl.textContent = (acc.position.pnlPercent >= 0 ? '+' : '') + acc.position.pnlPercent.toFixed(2) + '%';
    pctEl.className = 'pos-value ' + (acc.position.pnlPercent >= 0 ? 'profit' : 'loss');
  } else {
    $('positionSection').style.display = 'none';
  }
}

function updateTradeList(trades) {
  if (!trades || trades.length === 0) { elTradeList.innerHTML = '<div class="empty-state">暂无交易记录</div>'; return; }
  elTradeList.innerHTML = trades.map(t => {
    const isBuy = t.type === 'BUY';
    const icon = isBuy ? '📈' : '📉';
    const typeText = isBuy ? '买入' : '卖出';
    const detail = `${t.amount.toFixed(4)} oz @ $${t.price.toFixed(2)}`;
    let pnlHtml = '';
    if (t.pnl !== undefined) {
      const cls = t.pnl >= 0 ? 'profit' : 'loss';
      const sign = t.pnl >= 0 ? '+' : '';
      pnlHtml = `<span class="trade-pnl ${cls}">${sign}${fmtMoney(t.pnl).replace('-', '')}</span>`;
    }
    return `<div class="trade-item ${isBuy ? 'buy' : 'sell'}">
      <span class="trade-icon">${icon}</span>
      <div class="trade-info"><div class="trade-type">${typeText}</div><div class="trade-detail">${detail}</div></div>
      <div class="trade-time">${fmtTime(t.time)}</div>${pnlHtml}</div>`;
  }).join('');
}

async function doTrade(type) {
  const amountInput = $('tradeAmount');
  const amount = amountInput.value ? parseFloat(amountInput.value) : null;
  if (amount !== null && (isNaN(amount) || amount <= 0)) { showToast('错误', '请输入有效金额', 'error'); return; }
  const url = type === 'buy' ? '/api/buy' : '/api/sell';
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount }) });
    const data = await res.json();
    if (data.success) {
      showToast(type === 'buy' ? '买入成功' : '卖出成功', data.message, type);
      loadTrades();
      amountInput.value = '';
    } else { showToast('交易失败', data.message, 'error'); }
  } catch (e) { showToast('网络错误', e.message, 'error'); }
}

async function loadTrades() {
  try { const res = await fetch('/api/trades'); const data = await res.json(); updateTradeList(data); }
  catch (e) { console.error('加载交易记录失败:', e); }
}

async function resetAccount() {
  if (!confirm('确定要重置账户吗？')) return;
  try { const res = await fetch('/api/reset', { method: 'POST' }); const data = await res.json(); updateAccount(data); loadTrades(); showToast('已重置', '账户已恢复', 'info'); }
  catch (e) { showToast('错误', e.message, 'error'); }
}

async function fetchAllData() {
  try {
    const [priceRes, signalRes, accountRes, candlesRes] = await Promise.all([
      fetch('/api/price'), fetch('/api/signal'), fetch('/api/account'), fetch('/api/candles'),
    ]);
    const priceData = await priceRes.json();
    const signal = await signalRes.json();
    const acc = await accountRes.json();
    const candles = await candlesRes.json();
    if (priceData.price) updatePrice(priceData.price, priceData.time || Date.now());
    if (candles && candles.length > 0) drawCandleChart(candles.slice(-60));
    updateIndicators(signal.indicators || {});
    updateSignal(signal);
    updateAccount(acc);
    if (!sseConnected) { elStatusDot.className = 'status-dot connected'; elStatusText.textContent = '已连接'; }
  } catch (e) {
    if (!sseConnected) { elStatusDot.className = 'status-dot disconnected'; elStatusText.textContent = '连接失败'; }
  }
}

function connectSSE() {
  elStatusDot.className = 'status-dot';
  elStatusText.textContent = '连接中...';
  eventSource = new EventSource('/api/stream');
  eventSource.addEventListener('open', () => { sseConnected = true; elStatusDot.className = 'status-dot connected'; elStatusText.textContent = '实时连接'; requestNotificationPermission(); });
  eventSource.addEventListener('price', (e) => {
    const data = JSON.parse(e.data);
    updatePrice(data.price, data.time);
    if (data.candles) drawCandleChart(data.candles);
  });
  eventSource.addEventListener('signal', (e) => {
    const signal = JSON.parse(e.data);
    updateSignal(signal);
    if (signal.action === 'BUY') { sendNotification('🟢 买入信号', `建议买入黄金 @ $${currentPrice.toFixed(2)}\n${signal.reasons.join(', ')}`); showToast('买入信号', `评分: +${signal.score}`, 'buy'); }
    else if (signal.action === 'SELL') { sendNotification('🔴 卖出信号', `建议卖出黄金 @ $${currentPrice.toFixed(2)}\n${signal.reasons.join(', ')}`); showToast('卖出信号', `评分: ${signal.score}`, 'sell'); }
  });
  eventSource.addEventListener('indicators', (e) => {
    const ind = JSON.parse(e.data);
    updateIndicators(ind);
    fetch('/api/signal').then(r => r.json()).then(s => updateSignal(s)).catch(() => {});
  });
  eventSource.addEventListener('account', (e) => { updateAccount(JSON.parse(e.data)); });
  eventSource.addEventListener('error', () => {
    sseConnected = false;
    elStatusDot.className = 'status-dot disconnected';
    elStatusText.textContent = '断开重连中...';
    eventSource.close();
    setTimeout(connectSSE, 3000);
  });
}

function setupQuickButtons() {
  document.querySelectorAll('.btn-quick').forEach(btn => {
    btn.addEventListener('click', () => {
      const pct = parseInt(btn.dataset.percent);
      fetch('/api/account').then(r => r.json()).then(acc => { $('tradeAmount').value = (acc.cash * pct / 100).toFixed(0); }).catch(() => {});
    });
  });
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('buyBtn').addEventListener('click', () => doTrade('buy'));
  $('sellBtn').addEventListener('click', () => doTrade('sell'));
  $('resetBtn').addEventListener('click', resetAccount);
  setupQuickButtons();
  loadTrades();
  fetchAllData();
  connectSSE();
  pollTimer = setInterval(fetchAllData, 3000);
  registerSW();
  setInterval(loadTrades, 10000);
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      fetch('/api/candles').then(r => r.json()).then(cs => { if (cs.length) drawCandleChart(cs.slice(-60)); }).catch(() => {});
    }, 300);
  });
});
