/**
 * 模拟交易账户管理
 */

const INITIAL_CAPITAL = 100000;

let account = {
  cash: INITIAL_CAPITAL,
  gold: 0,
  initialCapital: INITIAL_CAPITAL,
  totalPnl: 0,
  totalTrades: 0,
  winTrades: 0,
};

let trades = [];
let position = null;

function buy(price, amount = null) {
  const cost = amount ? amount : account.cash;
  if (cost > account.cash) return { success: false, message: '资金不足' };
  if (cost <= 0) return { success: false, message: '金额无效' };

  const goldAmount = cost / price;

  if (position) {
    const totalGold = position.gold + goldAmount;
    const totalCost = position.cost + cost;
    position.avgPrice = totalCost / totalGold;
    position.gold = totalGold;
    position.cost = totalCost;
  } else {
    position = { gold: goldAmount, avgPrice: price, cost: cost, openTime: Date.now() };
  }

  account.cash -= cost;
  account.totalTrades++;

  const trade = {
    id: Date.now(), type: 'BUY', price: price, amount: goldAmount, cost: cost,
    time: Date.now(), timeStr: new Date().toLocaleString('zh-CN'),
  };
  trades.push(trade);

  return {
    success: true,
    message: `买入成功: ${goldAmount.toFixed(4)}盎司 @ $${price.toFixed(2)}`,
    trade, account: getAccountSummary(price),
  };
}

function sell(price, amount = null) {
  if (!position || position.gold <= 0) return { success: false, message: '无持仓' };

  const sellGold = amount ? Math.min(amount, position.gold) : position.gold;
  const revenue = sellGold * price;
  const costBasis = sellGold * position.avgPrice;
  const pnl = revenue - costBasis;

  account.cash += revenue;
  account.gold = position.gold - sellGold;
  account.totalPnl += pnl;
  account.totalTrades++;
  if (pnl > 0) account.winTrades++;

  position.gold -= sellGold;
  if (position.gold <= 0.0001) position = null;

  const trade = {
    id: Date.now(), type: 'SELL', price: price, amount: sellGold, revenue: revenue,
    pnl: pnl, pnlPercent: (pnl / costBasis) * 100,
    time: Date.now(), timeStr: new Date().toLocaleString('zh-CN'),
  };
  trades.push(trade);

  return {
    success: true,
    message: `卖出成功: ${sellGold.toFixed(4)}盎司 @ $${price.toFixed(2)}, 盈亏: $${pnl.toFixed(2)}`,
    trade, account: getAccountSummary(price),
  };
}

function getAccountSummary(currentPrice) {
  const positionValue = position ? position.gold * currentPrice : 0;
  const totalAssets = account.cash + positionValue;
  const totalPnl = totalAssets - account.initialCapital;
  const totalPnlPercent = (totalPnl / account.initialCapital) * 100;

  let positionPnl = 0, positionPnlPercent = 0;
  if (position && currentPrice) {
    positionPnl = (currentPrice - position.avgPrice) * position.gold;
    positionPnlPercent = ((currentPrice - position.avgPrice) / position.avgPrice) * 100;
  }

  return {
    cash: parseFloat(account.cash.toFixed(2)),
    gold: position ? parseFloat(position.gold.toFixed(4)) : 0,
    initialCapital: account.initialCapital,
    totalAssets: parseFloat(totalAssets.toFixed(2)),
    totalPnl: parseFloat(totalPnl.toFixed(2)),
    totalPnlPercent: parseFloat(totalPnlPercent.toFixed(2)),
    totalTrades: account.totalTrades,
    winTrades: account.winTrades,
    winRate: account.totalTrades > 0 ? parseFloat((account.winTrades / account.totalTrades * 100).toFixed(1)) : 0,
    position: position ? {
      gold: parseFloat(position.gold.toFixed(4)),
      avgPrice: parseFloat(position.avgPrice.toFixed(2)),
      cost: parseFloat(position.cost.toFixed(2)),
      currentPrice: currentPrice,
      value: parseFloat(positionValue.toFixed(2)),
      pnl: parseFloat(positionPnl.toFixed(2)),
      pnlPercent: parseFloat(positionPnlPercent.toFixed(2)),
    } : null,
  };
}

function getTrades(limit = 50) {
  return trades.slice(-limit).reverse();
}

function reset() {
  account = {
    cash: INITIAL_CAPITAL, gold: 0, initialCapital: INITIAL_CAPITAL,
    totalPnl: 0, totalTrades: 0, winTrades: 0,
  };
  trades = [];
  position = null;
  return getAccountSummary(0);
}

module.exports = { buy, sell, getAccountSummary, getTrades, reset, INITIAL_CAPITAL };
