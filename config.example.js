const config = {
  orderbookUrl: 'https://api.deversifi.com/bfx/v2/book/tETHUSD/R0',
  orderRange: 5, // percent
  allowedActiveOrders: 5,
  initialAccount: {
    eth: 10,
    usd: 2000,
  }
};

module.exports = config;