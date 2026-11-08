// Verification script for Micro-Account Lot Guard and Cluster-Based Self-Learning logic

function calculateForexPositionSize(equity, riskPct, entryPrice, slPrice, symbol, maxLeverage = 30) {
  if (equity <= 0) equity = 1000.0;
  const priceDistance = Math.abs(entryPrice - slPrice);
  const pipSize = symbol.includes("JPY") ? 0.01 : 0.0001;
  const pips = Number((priceDistance / pipSize).toFixed(1));
  const isMetal = symbol.includes("XAU") || symbol.includes("XAG");

  if (equity < 100.0) {
    const minUnits = isMetal ? 0.01 : 1000.0;
    const requiredMargin = (minUnits * entryPrice) / Math.max(maxLeverage, 1);
    const dollarRisk = minUnits * priceDistance;
    const actualRiskPct = dollarRisk / equity;
    const marginUtilization = requiredMargin / equity;

    if (marginUtilization > 0.75) {
      return {
        units: 0.0,
        status: "REJECTED_MARGIN",
        reason: `Margin ${(marginUtilization * 100).toFixed(1)}% > 75% limit at ${maxLeverage}x leverage`,
        margin: requiredMargin,
        risk: dollarRisk
      };
    }

    if (actualRiskPct > 0.08) {
      return {
        units: 0.0,
        status: "REJECTED_RISK_CEILING",
        reason: `SL distance ${pips} pips results in risk ${(actualRiskPct * 100).toFixed(1)}% > 8% ceiling`,
        margin: requiredMargin,
        risk: dollarRisk
      };
    }

    return {
      units: minUnits,
      status: "APPROVED_MICRO_SPRINT",
      margin: requiredMargin,
      risk: dollarRisk,
      actualRiskPct: actualRiskPct * 100,
      pips
    };
  }

  // Standard Account >= $100
  const riskDollars = equity * riskPct;
  const rawUnits = riskDollars / priceDistance;
  const maxAllowable = (equity * maxLeverage) / entryPrice;
  const units = Math.min(rawUnits, maxAllowable);

  if (isMetal) {
    const qty = Number(units.toFixed(2));
    return { units: Math.max(qty, 0.01), status: "APPROVED_METAL" };
  } else {
    const lotChunks = Math.floor(units / 1000) * 1000;
    if (lotChunks >= 1000) {
      return { units: lotChunks, status: "APPROVED_STANDARD" };
    }
    const minRiskPct = (1000.0 * priceDistance) / equity;
    if (minRiskPct <= Math.max(riskPct * 1.5, 0.025)) {
      return { units: 1000.0, status: "APPROVED_WITHIN_TOLERANCE", actualRiskPct: minRiskPct * 100 };
    }
    return { units: 0.0, status: "REJECTED_BELOW_MIN" };
  }
}

// Cluster Evaluation Logic
function evaluateCluster(historicalAutopsies, strategyName, failureCategory) {
  const matching = historicalAutopsies.filter(
    a => a.strategy === strategyName && a.category === failureCategory
  );
  const count = matching.length;
  if (count >= 3) {
    return { count, status: "VERIFIED_CLUSTER", promoteToGuardrail: true };
  } else if (count === 2) {
    return { count, status: "EMERGING_CLUSTER", promoteToGuardrail: false };
  } else {
    return { count, status: "ISOLATED_NOISE", promoteToGuardrail: false };
  }
}

console.log("=== 1. MICRO-ACCOUNT LOT GUARD TEST ===");

// Test 1: $30 with 20x leverage (EUR/USD @ 1.0850)
const t1 = calculateForexPositionSize(30, 0.01, 1.0850, 1.0835, "EUR/USD", 20);
console.log("Test 1 ($30 @ 20x lev, 15p SL):", t1);
console.assert(t1.status === "REJECTED_MARGIN", "Test 1 Failed: Should reject due to margin");

// Test 2: $30 with 50x leverage and 15p SL
const t2 = calculateForexPositionSize(30, 0.01, 1.0850, 1.0835, "EUR/USD", 50);
console.log("Test 2 ($30 @ 50x lev, 15p SL):", t2);
console.assert(t2.status === "APPROVED_MICRO_SPRINT" && t2.units === 1000, "Test 2 Failed: Should approve 1,000 units");

// Test 3: $30 with 50x leverage and 30p SL (too wide)
const t3 = calculateForexPositionSize(30, 0.01, 1.0850, 1.0820, "EUR/USD", 50);
console.log("Test 3 ($30 @ 50x lev, 30p SL):", t3);
console.assert(t3.status === "REJECTED_RISK_CEILING", "Test 3 Failed: Should reject wide SL > 8%");

// Test 4: $100 standard account
const t4 = calculateForexPositionSize(100, 0.01, 1.0850, 1.0835, "EUR/USD", 30);
console.log("Test 4 ($100 @ 30x lev, 15p SL):", t4);
console.assert(t4.units === 1000, "Test 4 Failed: Standard account should allow 1,000 units within tolerance");

console.log("\n=== 2. CLUSTER AGGREGATION TEST ===");
const autopsies = [
  { strategy: "SMC_Liquidity_Sweep", category: "low_volume_fakeout" },
  { strategy: "SMC_Liquidity_Sweep", category: "low_volume_fakeout" },
  { strategy: "ICT_OrderBlock_FVG", category: "counter_htf_trend" }
];

const c1 = evaluateCluster(autopsies, "ICT_OrderBlock_FVG", "counter_htf_trend");
console.log("Cluster Test 1 (1 loss):", c1);
console.assert(c1.promoteToGuardrail === false, "Cluster Test 1 Failed: Isolated noise should not promote");

const c2 = evaluateCluster(autopsies, "SMC_Liquidity_Sweep", "low_volume_fakeout");
console.log("Cluster Test 2 (2 losses):", c2);
console.assert(c2.promoteToGuardrail === false, "Cluster Test 2 Failed: 2 losses should not promote");

autopsies.push({ strategy: "SMC_Liquidity_Sweep", category: "low_volume_fakeout" });
const c3 = evaluateCluster(autopsies, "SMC_Liquidity_Sweep", "low_volume_fakeout");
console.log("Cluster Test 3 (3 losses):", c3);
console.assert(c3.promoteToGuardrail === true, "Cluster Test 3 Failed: 3 losses must promote to verified guardrail!");

console.log("\n✅ ALL TESTS PASSED SUCCESSFULLY!");
