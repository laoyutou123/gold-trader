/**
 * 技术指标计算模块
 */

function calcMA(prices, period) {
  const result = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) { result.push(null); }
    else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += prices[j];
      result.push(sum / period);
    }
  }
  return result;
}

function calcEMA(prices, period) {
  const result = [];
  const multiplier = 2 / (period + 1);
  let ema = null;
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) { result.push(null); }
    else if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += prices[j];
      ema = sum / period;
      result.push(ema);
    } else {
      ema = prices[i] * multiplier + ema * (1 - multiplier);
      result.push(ema);
    }
  }
  return result;
}

function calcRSI(prices, period = 14) {
  const result = [];
  let gains = 0, losses = 0;
  for (let i = 0; i < prices.length; i++) {
    if (i === 0) { result.push(null); continue; }
    const change = prices[i] - prices[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    if (i <= period) {
      gains += gain;
      losses += loss;
      if (i === period) {
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        result.push(100 - 100 / (1 + rs));
      } else { result.push(null); }
    } else {
      const prevAvgGain = result[i - 1] !== null ? (gains / period) : 0;
      const prevAvgLoss = result[i - 1] !== null ? (losses / period) : 0;
      gains = (prevAvgGain * (period - 1) + gain) / period * period;
      losses = (prevAvgLoss * (period - 1) + loss) / period * period;
      const avgGain = gains / period;
      const avgLoss = losses / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
    }
  }
  return result;
}

function calcMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const emaFast = calcEMA(prices, fastPeriod);
  const emaSlow = calcEMA(prices, slowPeriod);
  const dif = [];
  for (let i = 0; i < prices.length; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) dif.push(emaFast[i] - emaSlow[i]);
    else dif.push(null);
  }
  const validDif = dif.filter(v => v !== null);
  const deaValid = calcEMA(validDif, signalPeriod);
  const dea = new Array(prices.length).fill(null);
  let deaIdx = 0;
  for (let i = 0; i < dif.length; i++) {
    if (dif[i] !== null) { dea[i] = deaValid[deaIdx] || null; deaIdx++; }
  }
  const macd = dif.map((d, i) => (d !== null && dea[i] !== null) ? (d - dea[i]) * 2 : null);
  return { dif, dea, macd };
}

function calcBoll(prices, period = 20, multiplier = 2) {
  const ma = calcMA(prices, period);
  const upper = [], lower = [], mid = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) { upper.push(null); lower.push(null); mid.push(null); }
    else {
      const slice = prices.slice(i - period + 1, i + 1);
      const mean = ma[i];
      const variance = slice.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / period;
      const std = Math.sqrt(variance);
      mid.push(mean);
      upper.push(mean + multiplier * std);
      lower.push(mean - multiplier * std);
    }
  }
  return { mid, upper, lower };
}

function generateSignal(candles) {
  if (candles.length < 30) {
    return { action: 'HOLD', score: 0, reasons: ['数据不足，等待更多K线'], indicators: {} };
  }

  const closes = candles.map(c => c.close);
  const lastIdx = closes.length - 1;
  const currentPrice = closes[lastIdx];

  const ma5 = calcMA(closes, 5);
  const ma10 = calcMA(closes, 10);
  const ma20 = calcMA(closes, 20);
  const rsi = calcRSI(closes, 14);
  const { dif, dea, macd } = calcMACD(closes);
  const boll = calcBoll(closes, 20, 2);

  const indicators = {
    price: currentPrice,
    ma5: ma5[lastIdx], ma10: ma10[lastIdx], ma20: ma20[lastIdx],
    rsi: rsi[lastIdx],
    macd_dif: dif[lastIdx], macd_dea: dea[lastIdx], macd_hist: macd[lastIdx],
    boll_upper: boll.upper[lastIdx], boll_mid: boll.mid[lastIdx], boll_lower: boll.lower[lastIdx],
  };

  let buyScore = 0, sellScore = 0;
  const buyReasons = [], sellReasons = [];

  // 1. 均线交叉
  const ma5Prev = ma5[lastIdx - 1], ma10Prev = ma10[lastIdx - 1];
  if (ma5[lastIdx] && ma10[lastIdx] && ma5Prev && ma10Prev) {
    if (ma5Prev <= ma10Prev && ma5[lastIdx] > ma10[lastIdx]) { buyScore += 2; buyReasons.push('MA5上穿MA10（金叉）'); }
    if (ma5Prev >= ma10Prev && ma5[lastIdx] < ma10[lastIdx]) { sellScore += 2; sellReasons.push('MA5下穿MA10（死叉）'); }
    if (ma5[lastIdx] > ma10[lastIdx] && ma10[lastIdx] > ma20[lastIdx]) { buyScore += 1; buyReasons.push('均线多头排列'); }
    if (ma5[lastIdx] < ma10[lastIdx] && ma10[lastIdx] < ma20[lastIdx]) { sellScore += 1; sellReasons.push('均线空头排列'); }
  }

  // 2. RSI
  const rsiVal = rsi[lastIdx];
  if (rsiVal !== null) {
    if (rsiVal < 30) { buyScore += 2; buyReasons.push(`RSI=${rsiVal.toFixed(1)} 超卖区域`); }
    else if (rsiVal > 70) { sellScore += 2; sellReasons.push(`RSI=${rsiVal.toFixed(1)} 超买区域`); }
    else if (rsiVal > 50) buyScore += 0.5;
    else if (rsiVal < 50) sellScore += 0.5;
  }

  // 3. MACD
  const difVal = dif[lastIdx], deaVal = dea[lastIdx], macdVal = macd[lastIdx];
  const difPrev = dif[lastIdx - 1], deaPrev = dea[lastIdx - 1];
  if (difVal !== null && deaVal !== null && difPrev !== null && deaPrev !== null) {
    if (difPrev <= deaPrev && difVal > deaVal) { buyScore += 2; buyReasons.push('MACD金叉'); }
    if (difPrev >= deaPrev && difVal < deaVal) { sellScore += 2; sellReasons.push('MACD死叉'); }
    if (macdVal > 0 && macd[lastIdx - 1] <= 0) { buyScore += 1; buyReasons.push('MACD柱状图由负转正'); }
    if (macdVal < 0 && macd[lastIdx - 1] >= 0) { sellScore += 1; sellReasons.push('MACD柱状图由正转负'); }
  }

  // 4. 布林带
  const bollUpper = boll.upper[lastIdx], bollLower = boll.lower[lastIdx], bollMid = boll.mid[lastIdx];
  if (bollUpper && bollLower && bollMid) {
    if (currentPrice <= bollLower) { buyScore += 2; buyReasons.push('价格触及布林带下轨'); }
    else if (currentPrice >= bollUpper) { sellScore += 2; sellReasons.push('价格触及布林带上轨'); }
    const bollWidth = (bollUpper - bollLower) / bollMid;
    if (bollWidth < 0.02) buyReasons.push('布林带收窄，注意突破');
  }

  const totalScore = buyScore - sellScore;
  let action = 'HOLD';
  if (totalScore >= 3) action = 'BUY';
  else if (totalScore <= -3) action = 'SELL';

  return {
    action, score: totalScore, buyScore, sellScore,
    reasons: [...buyReasons, ...sellReasons],
    indicators, timestamp: Date.now(),
  };
}

module.exports = { calcMA, calcEMA, calcRSI, calcMACD, calcBoll, generateSignal };
