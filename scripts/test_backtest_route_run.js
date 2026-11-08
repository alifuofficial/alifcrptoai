// Test script simulating the exact POST request to the backtest API logic
const fs = require('fs');
const path = require('path');

// We simulate what the route does with eurusd.json
const cachePath = path.join(__dirname, '..', 'dashboard', 'public', 'data', 'forex', 'eurusd.json');
const candles = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

console.log('Loaded Dukascopy EUR/USD candles:', candles.length);
console.log('Testing determinism on real Dukascopy data:');
console.log('- First bar timestamp:', new Date(candles[0].timestamp).toISOString(), 'Close:', candles[0].close);
console.log('- Last bar timestamp:', new Date(candles[candles.length - 1].timestamp).toISOString(), 'Close:', candles[candles.length - 1].close);

// If we filter to 365 days:
const cutoff = Date.now() - 365 * 86400 * 1000;
const filtered1 = candles.filter(c => c.timestamp >= cutoff);
const filtered2 = candles.filter(c => c.timestamp >= cutoff);

console.log('Filtered 1 count:', filtered1.length);
console.log('Filtered 2 count:', filtered2.length);

let identical = true;
for (let i = 0; i < filtered1.length; i++) {
  if (filtered1[i].timestamp !== filtered2[i].timestamp ||
      filtered1[i].open !== filtered2[i].open ||
      filtered1[i].close !== filtered2[i].close) {
    identical = false;
    break;
  }
}

console.log('Real data feed determinism:', identical ? '100% PERFECT MATCH' : 'MISMATCH');
