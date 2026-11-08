const fs = require('fs');
const path = require('path');
const { getHistoricalRates } = require('../dashboard/node_modules/dukascopy-node');

const OUT_DIR = path.join(__dirname, '..', 'dashboard', 'public', 'data', 'forex');
fs.mkdirSync(OUT_DIR, { recursive: true });

async function downloadDukascopyPair(instrument, totalDays = 365) {
  const filePath = path.join(OUT_DIR, `${instrument.toLowerCase()}.json`);
  console.log(`\n=== Downloading Dukascopy ${instrument.toUpperCase()} (${totalDays} days) ===`);
  const t0 = Date.now();
  const chunkSizeDays = 14;
  const now = Date.now();
  const allCandles = [];
  const seenTs = new Set();

  for (let d = totalDays; d > 0; d -= chunkSizeDays) {
    const from = new Date(now - d * 86400 * 1000);
    const to = new Date(now - Math.max(0, d - chunkSizeDays) * 86400 * 1000);
    try {
      const chunk = await getHistoricalRates({
        instrument: instrument.toLowerCase(),
        dates: { from, to },
        timeframe: 'm15',
        format: 'json'
      });
      for (const c of chunk) {
        if (!seenTs.has(c.timestamp)) {
          seenTs.add(c.timestamp);
          allCandles.push(c);
        }
      }
      process.stdout.write(`.`);
    } catch (err) {
      console.warn(`\n[Warning] Chunk ${d}d failed for ${instrument}: ${err.message}`);
    }
    // Small 250ms sleep between chunks to respect Swiss feed rate limits
    await new Promise(r => setTimeout(r, 250));
  }

  allCandles.sort((a, b) => a.timestamp - b.timestamp);
  console.log(`\nCompleted ${instrument.toUpperCase()}: ${allCandles.length} candles in ${((Date.now() - t0)/1000).toFixed(1)}s`);

  if (allCandles.length > 500) {
    fs.writeFileSync(filePath, JSON.stringify(allCandles));
    const sizeMb = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(2);
    console.log(`Saved to ${filePath} (${sizeMb} MB)`);
    return allCandles.length;
  } else {
    console.warn(`Insufficient candles fetched for ${instrument}: ${allCandles.length}`);
    return 0;
  }
}

async function main() {
  const pairs = process.argv.slice(2);
  const targetPairs = pairs.length > 0 ? pairs : ['eurusd', 'gbpusd', 'usdjpy', 'xauusd'];
  const days = parseInt(process.env.DAYS || '365', 10);

  for (const pair of targetPairs) {
    try {
      await downloadDukascopyPair(pair, days);
    } catch (e) {
      console.error(`Error processing ${pair}:`, e);
    }
  }
}

main();
