const fetch = require('node-fetch');
const BigNumber = require('bignumber.js');
const {
  orderbookUrl,
  orderRange,
  initialAccount,
  allowedActiveOrders,
} = require('./config');

let account = {
  usd: BigNumber(initialAccount.usd),
  eth: BigNumber(initialAccount.eth)
};

let activeOrders = {
  bids: [],
  asks: [],
};

function getSpreadMargins(orders) {
  let asks = [];
  let bids = [];
  orders.forEach((o) => {
    if (o[2] < 0) { asks.push(o); return; }
    bids.push(o);
  });

  if (bids.length === 0) {
    throw new Error('No bids');
  }

  if (asks.length === 0) {
    throw new Error('No asks');
  }

  const highestBid = bids.reduce((h, bid) => h = bid[1] > h ? bid[1] : h, bids[0][1]);
  const lowestAsk = asks.reduce((l, ask) => l = ask[1] < l ? ask[1] : l, asks[0][1]);

  return { highestBid, lowestAsk };
}

function getPlacementRange(bestValue, percentRange, boundaries = {}) {
  const percentageMultiplier = BigNumber(1).plus(percentRange / 2 / 100);
  let high = BigNumber(bestValue).times(percentageMultiplier);
  let low = BigNumber(bestValue).dividedBy(percentageMultiplier);

  high = boundaries.upper && high.isGreaterThan(boundaries.upper) ? boundaries.upper : high;
  low = boundaries.lower && low.isLessThan(boundaries.lower) ? boundaries.lower : low;
  return { low, high };
}

function getOrderPrice(placementRange) {
  const rangeSpread = placementRange.high.minus(placementRange.low);
  return BigNumber.random().times(rangeSpread).plus(placementRange.low);
}

function getBidOrderAmounts(orderPrice, accountUsd, activeBids, maxBids) {
  const bidUsdAmount = BigNumber(accountUsd).dividedBy(maxBids - activeBids);
  const bidEthAmount = BigNumber(bidUsdAmount / orderPrice);
  return { bidUsdAmount, bidEthAmount };
}

function getAskOrderAmounts(orderPrice, accountEth, activeAsks, maxAsks) {
  const askEthAmount = BigNumber(accountEth).dividedBy(maxAsks - activeAsks);
  const askUsdAmount = BigNumber(askEthAmount * orderPrice);
  return { askUsdAmount, askEthAmount };
}

function placeBid(bidPlacementRange) {
  const orderPrice = getOrderPrice(bidPlacementRange);
  const { bidUsdAmount, bidEthAmount } = getBidOrderAmounts(
    orderPrice, account.usd, activeOrders.bids.length, allowedActiveOrders
  );
  activeOrders.bids.push({ orderPrice, usdAmount: bidUsdAmount, ethAmount: bidEthAmount });
  account.usd = account.usd.minus(bidUsdAmount);

  console.info(`PLACED BID @${orderPrice} ${bidEthAmount}`);
}

function placeAsk(askPlacementRange) {
  const orderPrice = getOrderPrice(askPlacementRange);
  const { askUsdAmount, askEthAmount } = getAskOrderAmounts(
    orderPrice, account.eth, activeOrders.asks.length, allowedActiveOrders
  );
  activeOrders.asks.push({ orderPrice, usdAmount: askUsdAmount, ethAmount: askEthAmount });
  account.eth = account.eth.minus(askEthAmount);

  console.info(`PLACED ASK @${orderPrice} ${askEthAmount}`);
}

function placeOrders(bidPlacementRange, askPlacementRange) {
  const activeBids = activeOrders.bids.length;
  if (activeBids < allowedActiveOrders) {
    for (let i = 0; i < allowedActiveOrders - activeBids; i++) {
      placeBid(bidPlacementRange);
    }
  }

  const activeAsks = activeOrders.asks.length;
  if (activeAsks < allowedActiveOrders) {
    for (let i = 0; i < allowedActiveOrders - activeAsks; i++) {
      placeAsk(askPlacementRange);
    }
  }
}

function checkClosedPositions(activeOrders, highestBid, lowestAsk) {
  let aquiredAssets = { usd: BigNumber(0), eth: BigNumber(0) };
  activeOrders.bids = activeOrders.bids.filter((b) => {
    const isOpen = !b.orderPrice.isGreaterThan(highestBid);
    if (!isOpen) {
      aquiredAssets.eth = aquiredAssets.eth.plus(b.ethAmount);
      console.info(`FILLED BID @ ${b.orderPrice} (ETH - ${b.ethAmount} | USD - ${b.usdAmount})`);
    }
    return isOpen;
  });

  activeOrders.asks = activeOrders.asks.filter((b) => {
    const isOpen = !b.orderPrice.isLessThan(lowestAsk);
    if (!isOpen) {
      aquiredAssets.usd = aquiredAssets.usd.plus(b.usdAmount);
      console.info(`FILLED ASK @ ${b.orderPrice} (ETH - ${b.ethAmount} | USD - ${b.usdAmount})`);
    }
    return isOpen;
  });

  return aquiredAssets;
}

async function updateOrders() {
  const res = await fetch(orderbookUrl);
  if (res.status !== 200) {
    console.error('Failed to reach orderbook api status', res.status);
    return;
  }
  const orders = await res.json();
  const { highestBid, lowestAsk } = getSpreadMargins(orders);

  const spreadMiddle = BigNumber(highestBid + lowestAsk).dividedBy(2);

  const bidPlacementRange = getPlacementRange(highestBid, orderRange, { upper: spreadMiddle });
  const askPlacementRange = getPlacementRange(lowestAsk, orderRange, { lower: spreadMiddle });

  const aquiredAssets = checkClosedPositions(activeOrders, highestBid, lowestAsk);
  account.usd = account.usd.plus(aquiredAssets.usd);
  account.eth = account.eth.plus(aquiredAssets.eth);
  placeOrders(bidPlacementRange, askPlacementRange);
}

async function main() {
  // bot order updating
  let isUpdating;
  setInterval(async () => {
    if (isUpdating) { console.error('Perfomance in order update interval'); return; }
    isUpdating = true;
    console.info('Checking market...');
    await updateOrders();
    isUpdating = false;
  }, 5000);

  // balance printing
  setInterval(() => {
    console.info('---balance in ACCOUNT---');
    console.info('USD: ', account.usd.toFixed());
    console.info('ETH ', account.eth.toFixed());

    console.info('---balance in USE---');
    const usd = activeOrders.bids.reduce((usd, b) => usd.plus(b.usdAmount), BigNumber(0));
    const eth = activeOrders.asks.reduce((eth, a) => eth.plus(a.ethAmount), BigNumber(0));
    console.info('USD: ', usd.toFixed());
    console.info('ETH ', eth.toFixed());
  }, 30000);
}

if (process.env.NODE_ENV === 'dev') {
  main();
}

module.exports = {
  _getSpreadMargins: getSpreadMargins,
  _getPlacementRange: getPlacementRange,
  _getBidOrderAmounts: getBidOrderAmounts,
  _getAskOrderAmounts: getAskOrderAmounts,
  _checkClosedPositions: checkClosedPositions,
};