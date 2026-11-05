"""
alifcrptoai - Quantitative Strategy Plugins & Indicator Engine
Author & Developer: Alifu Haji (Individual Developer)

Implements 6 institutional quantitative strategies:
1. SMC_Liquidity_Sweep (15-bar high/low sweep + displacement reclaim + FVG)
2. ICT_OrderBlock_FVG (smartmoneyconcepts: BOS/CHoCH + unmitigated FVG/OB confirmation)
3. Supertrend_ADX_Momentum (pandas-ta-classic: Supertrend flip + ADX > 25 + RVOL filter)
4. EMA_Trend_Pullback (EMA 20/50 dynamic trend bounce/rejection)
5. BB_Volatility_Breakout (Squeeze compression < 0.025 + RVOL >= 1.4 expansion)
6. RSI_Divergence_Reversal (Exhaustion < 28 or > 72 + engulfing reclaim)
"""

import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional

from smartmoneyconcepts import smc

# Resilient Technical Analysis import: pandas-ta-classic (preferred on pandas 2.0+ / Python 3.12+)
# with transparent fallback to legacy pandas-ta
try:
    import pandas_ta_classic as ta
except ImportError:
    try:
        import pandas_ta as ta
    except ImportError:
        ta = None


def get_price_decimals(price: float) -> int:
    """Returns dynamic decimal places depending on asset price tier."""
    p = abs(float(price)) if price is not None else 0.0
    if p >= 1000.0:
        return 2
    elif p >= 2.0:
        return 4
    elif p >= 0.5:
        # Institutional Forex Tier (EUR/USD, GBP/USD, AUD/USD, USD/CAD, USD/CHF)
        # Trades with 5 decimal places (pipettes, where 1 pip = 0.00010)
        return 5
    elif p >= 0.01:
        return 6
    else:
        return 8


def round_price_dynamic(price: float) -> float:
    """Rounds price dynamically to preserve significant digits on micro/memecoin pairs."""
    if price is None:
        return 0.0
    decimals = get_price_decimals(price)
    return round(float(price), decimals)


def format_price_dynamic(price: float) -> str:
    """Formats price into human-readable string with proper dynamic precision."""
    if price is None:
        return "0.00"
    decimals = get_price_decimals(price)
    return f"{float(price):.{decimals}f}"


def finalize_setup_geometry(side: str, entry: float, sl: float, target_rr: float = 2.2) -> tuple:
    """
    Enforces institutional precision, minimum noise buffers for Forex,
    and exact mathematical consistency between Entry, SL, TP, and stated R:R.
    Returns (entry_rounded, sl_rounded, tp_rounded, actual_rr).
    """
    entry_r = round_price_dynamic(entry)
    sl_r = round_price_dynamic(sl)

    # 1. Forex minimum stop buffer protection:
    # Assets in the 0.5 to 2.0 range (EUR/USD, GBP/USD, etc.) must have at least 10 pips (0.0010)
    # stop distance so they cannot be suffocated by 15m session noise or spread.
    if 0.5 <= entry_r <= 2.0:
        min_forex_buffer = 0.0010  # 10 pips minimum buffer
        curr_buffer = abs(entry_r - sl_r)
        if curr_buffer < min_forex_buffer:
            if side == "LONG":
                sl_r = round_price_dynamic(entry_r - min_forex_buffer)
            else:
                sl_r = round_price_dynamic(entry_r + min_forex_buffer)

    risk_r = abs(entry_r - sl_r)
    if risk_r <= 1e-7:
        risk_r = max(abs(entry_r * 0.005), 1e-5)
        sl_r = round_price_dynamic(entry_r - risk_r if side == "LONG" else entry_r + risk_r)
        risk_r = abs(entry_r - sl_r)

    # 2. Derive TP directly from rounded entry, sl, and target_rr to guarantee 100% mathematical consistency
    if side == "LONG":
        tp_r = round_price_dynamic(entry_r + (target_rr * risk_r))
        actual_rr = round((tp_r - entry_r) / max(risk_r, 1e-9), 2)
    else:
        tp_r = round_price_dynamic(entry_r - (target_rr * risk_r))
        actual_rr = round((entry_r - tp_r) / max(risk_r, 1e-9), 2)

    return entry_r, sl_r, tp_r, actual_rr


def calc_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Computes technical indicators across the OHLCV DataFrame:
    - EMA 20, EMA 50
    - ATR 14
    - RVOL 20 (Relative Volume)
    - RSI 14
    - Bollinger Bands 20, 2 Std + BB Width
    """
    df = df.copy()

    # Ensure numeric columns
    for col in ["open", "high", "low", "close", "volume"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
        elif col == "volume" and "vol" in df.columns:
            df["volume"] = pd.to_numeric(df["vol"], errors="coerce")

    # 1. EMAs
    df["ema_20"] = df["close"].ewm(span=20, adjust=False).mean()
    df["ema_50"] = df["close"].ewm(span=50, adjust=False).mean()

    # 2. Average True Range (ATR 14)
    high_low = df["high"] - df["low"]
    high_close = (df["high"] - df["close"].shift()).abs()
    low_close = (df["low"] - df["close"].shift()).abs()
    tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    df["atr_14"] = tr.rolling(window=14).mean()

    # 3. RVOL 20 (Relative Volume: Current Volume / 20-period Volume SMA)
    vol_sma_20 = df["volume"].rolling(window=20).mean()
    base_rvol = df["volume"] / (vol_sma_20 + 1e-9)

    # Dynamic In-Progress Candle RVOL Projection:
    # On 15m candles, the forming bar (iloc[-1]) has only accumulated a fraction of its volume.
    # We project the full-bar volume based on elapsed seconds and also check the last settled bar (iloc[-2]).
    if "timestamp" in df.columns and len(df) >= 2:
        try:
            curr_ts = pd.to_datetime(df["timestamp"].iloc[-1])
            now_utc = pd.Timestamp.now(tz="UTC")
            if curr_ts.tzinfo is None:
                curr_ts = curr_ts.tz_localize("UTC")

            elapsed_sec = max((now_utc - curr_ts).total_seconds(), 10.0)
            # 15m candle bar has 900 seconds total
            bar_fraction = min(max(elapsed_sec / 900.0, 0.05), 1.0)

            # Projected volume for the current forming bar
            projected_vol = float(df["volume"].iloc[-1]) / bar_fraction
            projected_curr_rvol = projected_vol / (float(vol_sma_20.iloc[-1]) + 1e-9)

            # Last closed bar's settled RVOL
            settled_prev_rvol = float(base_rvol.iloc[-2]) if len(base_rvol) >= 2 else 1.0

            # Effective RVOL: highest of projected current pace or confirmed previous bar
            effective_curr_rvol = max(projected_curr_rvol, settled_prev_rvol * 0.95)
            base_rvol.iloc[-1] = effective_curr_rvol
        except Exception:
            pass

    df["rvol_20"] = base_rvol

    # 4. RSI 14 (Wilder's Smoothing)
    delta = df["close"].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=13, adjust=False).mean()
    avg_loss = loss.ewm(com=13, adjust=False).mean()
    rs = avg_gain / (avg_loss + 1e-9)
    df["rsi_14"] = 100 - (100 / (1 + rs))

    # 5. Bollinger Bands (20, 2.0) & Width
    df["bb_mid"] = df["close"].rolling(window=20).mean()
    bb_std = df["close"].rolling(window=20).std(ddof=0)
    df["bb_upper"] = df["bb_mid"] + (2.0 * bb_std)
    df["bb_lower"] = df["bb_mid"] - (2.0 * bb_std)
    df["bb_width"] = (df["bb_upper"] - df["bb_lower"]) / (df["bb_mid"] + 1e-9)

    return df


def detect_fractal_pivots(df: pd.DataFrame, window: int = 2) -> Dict[str, List[Dict[str, Any]]]:
    """
    Computes 5-bar Bill Williams fractal pivot highs and lows (window=2 bars on each side).
    High fractal: High[i] > High[i-1], High[i-2], High[i+1], High[i+2]
    Low fractal:  Low[i]  < Low[i-1], Low[i-2], Low[i+1], Low[i+2]
    Returns confirmed un-repainting pivot dictionaries.
    """
    if len(df) < (window * 2 + 1):
        return {"highs": [], "lows": []}

    highs: List[Dict[str, Any]] = []
    lows: List[Dict[str, Any]] = []
    n = len(df)

    # Evaluate up to n - window so we don't repaint the in-progress forming bar
    for i in range(window, n - window):
        curr_high = float(df["high"].iloc[i])
        curr_low = float(df["low"].iloc[i])

        # Check high fractal
        is_high = True
        for offset in range(-window, window + 1):
            if offset != 0 and float(df["high"].iloc[i + offset]) >= curr_high:
                is_high = False
                break
        if is_high:
            highs.append({
                "index": i,
                "price": curr_high,
                "timestamp": str(df["timestamp"].iloc[i]) if "timestamp" in df.columns else None
            })

        # Check low fractal
        is_low = True
        for offset in range(-window, window + 1):
            if offset != 0 and float(df["low"].iloc[i + offset]) <= curr_low:
                is_low = False
                break
        if is_low:
            lows.append({
                "index": i,
                "price": curr_low,
                "timestamp": str(df["timestamp"].iloc[i]) if "timestamp" in df.columns else None
            })

    return {"highs": highs, "lows": lows}


def detect_liquidity_pools(df_15m: pd.DataFrame, tolerance_pct: float = 0.0015) -> Dict[str, Any]:
    """
    Identifies institutional liquidity pools on the 15m timeframe:
    1. Equal Highs (EQH): Multiple swing highs within 0.15% tolerance where retail buy stops reside.
    2. Equal Lows (EQL): Multiple swing lows within 0.15% tolerance where retail sell stops reside.
    3. Most recent validated fractal swing high and swing low.
    """
    pivots = detect_fractal_pivots(df_15m, window=2)
    highs = pivots["highs"]
    lows = pivots["lows"]

    eqh_pools: List[Dict[str, Any]] = []
    if len(highs) >= 2:
        for i in range(len(highs) - 1):
            for j in range(i + 1, min(i + 4, len(highs))):
                p1, p2 = highs[i]["price"], highs[j]["price"]
                diff = abs(p1 - p2) / max(p1, 1e-9)
                if diff <= tolerance_pct:
                    eqh_pools.append({
                        "price": max(p1, p2),
                        "indices": (highs[i]["index"], highs[j]["index"]),
                        "diff_pct": round(diff * 100, 3)
                    })

    eql_pools: List[Dict[str, Any]] = []
    if len(lows) >= 2:
        for i in range(len(lows) - 1):
            for j in range(i + 1, min(i + 4, len(lows))):
                p1, p2 = lows[i]["price"], lows[j]["price"]
                diff = abs(p1 - p2) / max(p1, 1e-9)
                if diff <= tolerance_pct:
                    eql_pools.append({
                        "price": min(p1, p2),
                        "indices": (lows[i]["index"], lows[j]["index"]),
                        "diff_pct": round(diff * 100, 3)
                    })

    recent_swing_high = highs[-1]["price"] if highs else float(df_15m["high"].iloc[-15:-1].max())
    recent_swing_low = lows[-1]["price"] if lows else float(df_15m["low"].iloc[-15:-1].min())

    return {
        "eqh_pools": eqh_pools,
        "eql_pools": eql_pools,
        "recent_swing_high": recent_swing_high,
        "recent_swing_low": recent_swing_low,
        "all_pivots": pivots
    }


def calc_top_down_structure(
    df_15m: pd.DataFrame,
    df_1h: Optional[pd.DataFrame] = None,
    df_4h: Optional[pd.DataFrame] = None
) -> Dict[str, Any]:
    """
    Computes institutional Top-Down Market Structure across 4H, 1H, and 15m:
    1. 4H Macro Trend & Structure (Higher Highs/Higher Lows vs Lower Highs/Lower Lows, 4H EMA 50 alignment).
    2. 1H Intermediate Dealing Range [Range Low, Range High], Equilibrium (50%), and Premium vs. Discount zone.
    3. 15m Local Liquidity Pools (EQH, EQL, Fractal Pivots).
    """
    latest_price = float(df_15m["close"].iloc[-1])

    # --- 1. 4H Macro Analysis ---
    htf_4h_bias = "NEUTRAL"
    htf_4h_high = latest_price * 1.05
    htf_4h_low = latest_price * 0.95
    ema_50_4h = None

    if df_4h is not None and len(df_4h) >= 20:
        c4 = df_4h["close"].astype(float)
        ema_20_4h = float(c4.ewm(span=20, adjust=False).mean().iloc[-1])
        ema_50_4h = float(c4.ewm(span=50, adjust=False).mean().iloc[-1])
        curr_4h_close = float(c4.iloc[-1])

        htf_4h_high = float(df_4h["high"].astype(float).max())
        htf_4h_low = float(df_4h["low"].astype(float).min())

        pivots_4h = detect_fractal_pivots(df_4h, window=2)
        h4_highs = pivots_4h["highs"]
        h4_lows = pivots_4h["lows"]

        is_hh_hl = False
        is_lh_ll = False
        if len(h4_highs) >= 2 and len(h4_lows) >= 2:
            is_hh_hl = (h4_highs[-1]["price"] > h4_highs[-2]["price"]) and (h4_lows[-1]["price"] > h4_lows[-2]["price"])
            is_lh_ll = (h4_highs[-1]["price"] < h4_highs[-2]["price"]) and (h4_lows[-1]["price"] < h4_lows[-2]["price"])

        if curr_4h_close > ema_50_4h and (is_hh_hl or curr_4h_close > ema_20_4h):
            htf_4h_bias = "BULLISH"
        elif curr_4h_close < ema_50_4h and (is_lh_ll or curr_4h_close < ema_20_4h):
            htf_4h_bias = "BEARISH"
        else:
            htf_4h_bias = "NEUTRAL_RANGE"

    # --- 2. 1H Intermediate Dealing Range & Equilibrium ---
    itf_1h_bias = "NEUTRAL"
    range_high_1h = latest_price * 1.03
    range_low_1h = latest_price * 0.97
    equilibrium_1h = latest_price
    range_depth = 0.50
    zone_1h = "EQUILIBRIUM"
    is_ote = False

    if df_1h is not None and len(df_1h) >= 20:
        c1 = df_1h["close"].astype(float)
        ema_20_1h = float(c1.ewm(span=20, adjust=False).mean().iloc[-1])
        ema_50_1h = float(c1.ewm(span=50, adjust=False).mean().iloc[-1])
        curr_1h_close = float(c1.iloc[-1])

        h1_window = df_1h.iloc[-30:]
        range_high_1h = float(h1_window["high"].astype(float).max())
        range_low_1h = float(h1_window["low"].astype(float).min())

        equilibrium_1h = (range_high_1h + range_low_1h) / 2.0
        range_span = max(range_high_1h - range_low_1h, 1e-9)
        range_depth = (latest_price - range_low_1h) / range_span
        range_depth = max(0.0, min(1.0, range_depth))

        if range_depth < 0.48:
            zone_1h = "DISCOUNT"
        elif range_depth > 0.52:
            zone_1h = "PREMIUM"
        else:
            zone_1h = "EQUILIBRIUM"

        # Bullish OTE (deep retracement 61.8% to 78.6% from top)
        # Bearish OTE (deep retracement 61.8% to 78.6% from bottom)
        if (0.214 <= range_depth <= 0.382) or (0.618 <= range_depth <= 0.786):
            is_ote = True

        if curr_1h_close > ema_20_1h and curr_1h_close > ema_50_1h:
            itf_1h_bias = "BULLISH"
        elif curr_1h_close < ema_20_1h and curr_1h_close < ema_50_1h:
            itf_1h_bias = "BEARISH"
        else:
            itf_1h_bias = "NEUTRAL"

    # --- 3. 15m Local Liquidity Pools ---
    pools_15m = detect_liquidity_pools(df_15m)

    return {
        "htf_4h": {
            "bias": htf_4h_bias,
            "range_high": htf_4h_high,
            "range_low": htf_4h_low,
            "ema_50": ema_50_4h
        },
        "itf_1h": {
            "bias": itf_1h_bias,
            "range_high": range_high_1h,
            "range_low": range_low_1h,
            "equilibrium": equilibrium_1h,
            "range_depth_pct": round(range_depth * 100, 1),
            "zone": zone_1h,
            "is_ote": is_ote
        },
        "ltf_15m": pools_15m,
        "latest_price": latest_price
    }


def smc_liquidity_sweep(
    df: pd.DataFrame,
    top_down_context: Optional[Dict[str, Any]] = None,
    target_rr: float = 2.5
) -> Optional[Dict[str, Any]]:
    """
    SMC Liquidity Sweep Strategy (Top-Down Multi-Timeframe Price Action):
    1. Scans for 15m sweep of a confirmed Fractal Swing or Equal High/Low (EQH/EQL) liquidity pool.
    2. Requires displacement reclaim candle back inside the range with verified Fair Value Gap (FVG).
    3. Enforces 4H Trend and 1H Dealing Range discipline:
       - LONG: 4H != BEARISH, 1H in DISCOUNT (depth <= 52%) or OTE.
       - SHORT: 4H != BULLISH, 1H in PREMIUM (depth >= 48%) or OTE.
    4. Projects dynamic Take Profit using configurable target_rr.
    """
    if len(df) < 30:
        return None

    # Focus on the most recent completed and triggering bars
    curr = df.iloc[-1]
    prev = df.iloc[-2]
    prev2 = df.iloc[-3]

    atr = float(curr["atr_14"]) if pd.notnull(curr["atr_14"]) else float(curr["close"] * 0.01)
    rvol = float(curr["rvol_20"]) if pd.notnull(curr["rvol_20"]) else 1.0

    # Extract 15m liquidity levels
    if top_down_context and "ltf_15m" in top_down_context:
        pools = top_down_context["ltf_15m"]
    else:
        pools = detect_liquidity_pools(df)

    swing_low = pools.get("recent_swing_low")
    swing_high = pools.get("recent_swing_high")
    eql_pools = pools.get("eql_pools", [])
    eqh_pools = pools.get("eqh_pools", [])

    sweep_target_low = float(swing_low) if swing_low is not None else float(df["low"].iloc[-16:-1].min())
    if eql_pools:
        sweep_target_low = min(sweep_target_low, float(eql_pools[-1]["price"]))

    sweep_target_high = float(swing_high) if swing_high is not None else float(df["high"].iloc[-16:-1].max())
    if eqh_pools:
        sweep_target_high = max(sweep_target_high, float(eqh_pools[-1]["price"]))

    # Top-Down Context filters
    htf_bias = "NEUTRAL"
    itf_zone = "EQUILIBRIUM"
    itf_depth = 50.0
    itf_ote = False
    if top_down_context:
        htf = top_down_context.get("htf_4h", {})
        itf = top_down_context.get("itf_1h", {})
        htf_bias = htf.get("bias", "NEUTRAL")
        itf_zone = itf.get("zone", "EQUILIBRIUM")
        itf_depth = float(itf.get("range_depth_pct", 50.0))
        itf_ote = itf.get("is_ote", False)

    # --- Bullish Sweep Setup ---
    # Price swept below sweep_target_low, but closed back above sweep_target_low with bullish displacement
    if (prev["low"] < sweep_target_low or curr["low"] < sweep_target_low) and curr["close"] > sweep_target_low:
        if curr["close"] > curr["open"]:  # Bullish candle
            # Top-Down Institutional Discipline: NEVER buy in high Premium or against strong 4H Bearish trend
            if htf_bias == "BEARISH" and itf_depth > 35.0:
                return None
            if itf_zone == "PREMIUM" and itf_depth > 55.0:
                return None  # Do not chase longs in premium

            # Check for bullish FVG (low of bar i > high of bar i-2 or bar i-1 > bar i-3)
            has_fvg = (float(curr["low"]) > float(prev2["high"])) or (float(prev["low"]) > float(df.iloc[-4]["high"]))
            if not has_fvg:
                return None
            swept_low = min(float(prev["low"]), float(curr["low"]))
            entry = float(curr["close"])
            sl = swept_low - (0.5 * atr)
            if entry > sl:
                entry_r, sl_r, tp_r, rr = finalize_setup_geometry("LONG", entry, sl, target_rr=target_rr)
                ote_tag = " [OTE Fib 61.8-78.6%]" if itf_ote else ""
                pool_desc = "Equal Lows (EQL)" if eql_pools and sweep_target_low == eql_pools[-1]["price"] else "15m Fractal Low"
                return {
                    "strategy_name": "SMC_Liquidity_Sweep",
                    "side": "LONG",
                    "entry": entry_r,
                    "sl": sl_r,
                    "tp": tp_r,
                    "setup_notes": f"Swept {pool_desc} (${format_price_dynamic(sweep_target_low)}) + Bullish FVG reclaim. 4H: {htf_bias} | 1H: {itf_zone} ({itf_depth}% depth){ote_tag}. RVOL: {rvol:.2f}x",
                    "rvol": round(rvol, 2),
                    "rr": rr
                }

    # --- Bearish Sweep Setup ---
    # Price swept above sweep_target_high, but closed back below sweep_target_high with bearish displacement
    if (prev["high"] > sweep_target_high or curr["high"] > sweep_target_high) and curr["close"] < sweep_target_high:
        if curr["close"] < curr["open"]:  # Bearish candle
            # Top-Down Institutional Discipline: NEVER sell in deep Discount or against strong 4H Bullish trend
            if htf_bias == "BULLISH" and itf_depth < 65.0:
                return None
            if itf_zone == "DISCOUNT" and itf_depth < 45.0:
                return None  # Do not short in discount

            # Check for bearish FVG (high of bar i < low of bar i-2 or bar i-1 < low of bar i-3)
            has_fvg = (float(curr["high"]) < float(prev2["low"])) or (float(prev["high"]) < float(df.iloc[-4]["low"]))
            if not has_fvg:
                return None
            swept_high = max(float(prev["high"]), float(curr["high"]))
            entry = float(curr["close"])
            sl = swept_high + (0.5 * atr)
            if sl > entry:
                entry_r, sl_r, tp_r, rr = finalize_setup_geometry("SHORT", entry, sl, target_rr=target_rr)
                ote_tag = " [OTE Fib 61.8-78.6%]" if itf_ote else ""
                pool_desc = "Equal Highs (EQH)" if eqh_pools and sweep_target_high == eqh_pools[-1]["price"] else "15m Fractal High"
                return {
                    "strategy_name": "SMC_Liquidity_Sweep",
                    "side": "SHORT",
                    "entry": entry_r,
                    "sl": sl_r,
                    "tp": tp_r,
                    "setup_notes": f"Swept {pool_desc} (${format_price_dynamic(sweep_target_high)}) + Bearish FVG reclaim. 4H: {htf_bias} | 1H: {itf_zone} ({itf_depth}% depth){ote_tag}. RVOL: {rvol:.2f}x",
                    "rvol": round(rvol, 2),
                    "rr": rr
                }

    return None


def strat_ict_orderblock_fvg(
    df: pd.DataFrame,
    top_down_context: Optional[Dict[str, Any]] = None,
    target_rr: float = 2.5
) -> Optional[Dict[str, Any]]:
    """
    ICT Order Block + Fair Value Gap Strategy (smartmoneyconcepts library):
    1. Detects structural swing points with smc.swing_highs_lows.
    2. Identifies BOS/CHoCH with smc.bos_choch.
    3. Finds institutional Order Blocks with smc.ob and FVGs with smc.fvg.
    4. Enforces Top-Down 4H & 1H structural alignment:
       - LONG: 1H in DISCOUNT (depth <= 55%), 4H != BEARISH.
       - SHORT: 1H in PREMIUM (depth >= 45%), 4H != BULLISH.
    5. Triggers LONG if bullish structure break occurred in last 3 bars paired with
       an unmitigated bullish FVG/OB below current price (SL placed at bottom * 0.997, TP at 2.3R).
    6. Triggers SHORT if bearish structure break occurred in last 3 bars paired with
       an unmitigated bearish FVG/OB above current price (SL placed at top * 1.003, TP at 2.3R).
    """
    if len(df) < 30:
        return None

    # Top-Down Context filters
    htf_bias = "NEUTRAL"
    itf_zone = "EQUILIBRIUM"
    itf_depth = 50.0
    if top_down_context:
        htf = top_down_context.get("htf_4h", {})
        itf = top_down_context.get("itf_1h", {})
        htf_bias = htf.get("bias", "NEUTRAL")
        itf_zone = itf.get("zone", "EQUILIBRIUM")
        itf_depth = float(itf.get("range_depth_pct", 50.0))

    # Format column names for smartmoneyconcepts library
    ohlc = df.rename(columns={"vol": "volume"}).copy()
    for col in ["open", "high", "low", "close", "volume"]:
        if col in ohlc.columns:
            ohlc[col] = pd.to_numeric(ohlc[col], errors="coerce")

    curr = df.iloc[-1]
    entry = float(curr["close"])
    atr = float(curr["atr_14"]) if pd.notnull(curr.get("atr_14")) else float(entry * 0.01)
    rvol = float(curr["rvol_20"]) if pd.notnull(curr.get("rvol_20")) else 1.0

    try:
        swings = smc.swing_highs_lows(ohlc, swing_length=10)
        fvg_data = smc.fvg(ohlc, join_consecutive=True)
        ob_data = smc.ob(ohlc, swings)
        try:
            bos_data = smc.bos_choch(ohlc, swings, close_break=True)
        except TypeError:
            bos_data = smc.bos_choch(ohlc, close_break=True)
    except Exception as exc:
        # Fallback or pass if calculation error occurs
        return None

    if bos_data is None or fvg_data is None:
        return None

    # Check for Bullish BOS or CHoCH in the last 3 bars
    bullish_structure = False
    if "BOS" in bos_data.columns and (bos_data["BOS"].iloc[-3:] == 1).any():
        bullish_structure = True
    if "CHOCH" in bos_data.columns and (bos_data["CHOCH"].iloc[-3:] == 1).any():
        bullish_structure = True

    # Check for Bearish BOS or CHoCH in the last 3 bars
    bearish_structure = False
    if "BOS" in bos_data.columns and (bos_data["BOS"].iloc[-3:] == -1).any():
        bearish_structure = True
    if "CHOCH" in bos_data.columns and (bos_data["CHOCH"].iloc[-3:] == -1).any():
        bearish_structure = True

    # --- Bullish ICT Setup ---
    if bullish_structure:
        # Top-down filter: Never enter ICT Long into HTF resistance or high Premium
        if htf_bias == "BEARISH" and itf_depth > 35.0:
            bullish_structure = False
        elif itf_zone == "PREMIUM" and itf_depth > 55.0:
            bullish_structure = False

    if bullish_structure:
        support_levels: List[float] = []

        # Check for unmitigated Bullish FVG (FVG == 1) below entry
        if "FVG" in fvg_data.columns and "Bottom" in fvg_data.columns:
            fvg_bull = fvg_data[fvg_data["FVG"] == 1]
            if "MitigatedIndex" in fvg_bull.columns:
                fvg_bull = fvg_bull[fvg_bull["MitigatedIndex"].isna() | (fvg_bull["MitigatedIndex"] == 0) | (fvg_bull["MitigatedIndex"] >= len(df) - 1)]
            fvg_below = fvg_bull[fvg_bull["Bottom"] < entry]
            if not fvg_below.empty:
                support_levels.append(float(fvg_below["Bottom"].iloc[-1]))

        # Check for unmitigated Bullish Order Block (OB == 1) below entry
        if ob_data is not None and "OB" in ob_data.columns and "Bottom" in ob_data.columns:
            ob_bull = ob_data[ob_data["OB"] == 1]
            if "MitigatedIndex" in ob_bull.columns:
                ob_bull = ob_bull[ob_bull["MitigatedIndex"].isna() | (ob_bull["MitigatedIndex"] == 0) | (ob_bull["MitigatedIndex"] >= len(df) - 1)]
            ob_below = ob_bull[ob_bull["Bottom"] < entry]
            if not ob_below.empty:
                support_levels.append(float(ob_below["Bottom"].iloc[-1]))

        if support_levels:
            sl_anchor = max(support_levels)
            sl = sl_anchor * 0.997
            risk = entry - sl
            if risk > (0.2 * atr) and risk < (4.0 * atr):
                entry_r, sl_r, tp_r, rr = finalize_setup_geometry("LONG", entry, sl, target_rr=target_rr)
                return {
                    "strategy_name": "ICT_OrderBlock_FVG",
                    "side": "LONG",
                    "entry": entry_r,
                    "sl": sl_r,
                    "tp": tp_r,
                    "setup_notes": f"Bullish BOS/CHoCH with unmitigated FVG/OB support at {format_price_dynamic(sl_anchor)}. 4H: {htf_bias} | 1H: {itf_zone} ({itf_depth}%). RVOL: {rvol:.2f}x",
                    "rvol": round(rvol, 2),
                    "rr": rr
                }

    # --- Bearish ICT Setup ---
    if bearish_structure:
        # Top-down filter: Never enter ICT Short into HTF support or deep Discount
        if htf_bias == "BULLISH" and itf_depth < 65.0:
            bearish_structure = False
        elif itf_zone == "DISCOUNT" and itf_depth < 45.0:
            bearish_structure = False

    if bearish_structure:
        resistance_levels: List[float] = []

        # Check for unmitigated Bearish FVG (FVG == -1) above entry
        if "FVG" in fvg_data.columns and "Top" in fvg_data.columns:
            fvg_bear = fvg_data[fvg_data["FVG"] == -1]
            if "MitigatedIndex" in fvg_bear.columns:
                fvg_bear = fvg_bear[fvg_bear["MitigatedIndex"].isna() | (fvg_bear["MitigatedIndex"] == 0) | (fvg_bear["MitigatedIndex"] >= len(df) - 1)]
            fvg_above = fvg_bear[fvg_bear["Top"] > entry]
            if not fvg_above.empty:
                resistance_levels.append(float(fvg_above["Top"].iloc[-1]))

        # Check for unmitigated Bearish Order Block (OB == -1) above entry
        if ob_data is not None and "OB" in ob_data.columns and "Top" in ob_data.columns:
            ob_bear = ob_data[ob_data["OB"] == -1]
            if "MitigatedIndex" in ob_bear.columns:
                ob_bear = ob_bear[ob_bear["MitigatedIndex"].isna() | (ob_bear["MitigatedIndex"] == 0) | (ob_bear["MitigatedIndex"] >= len(df) - 1)]
            ob_above = ob_bear[ob_bear["Top"] > entry]
            if not ob_above.empty:
                resistance_levels.append(float(ob_above["Top"].iloc[-1]))

        if resistance_levels:
            sl_anchor = min(resistance_levels)
            sl = sl_anchor * 1.003
            risk = sl - entry
            if risk > (0.2 * atr) and risk < (4.0 * atr):
                entry_r, sl_r, tp_r, rr = finalize_setup_geometry("SHORT", entry, sl, target_rr=target_rr)
                return {
                    "strategy_name": "ICT_OrderBlock_FVG",
                    "side": "SHORT",
                    "entry": entry_r,
                    "sl": sl_r,
                    "tp": tp_r,
                    "setup_notes": f"Bearish BOS/CHoCH with unmitigated FVG/OB resistance at {format_price_dynamic(sl_anchor)}. 4H: {htf_bias} | 1H: {itf_zone} ({itf_depth}%). RVOL: {rvol:.2f}x",
                    "rvol": round(rvol, 2),
                    "rr": rr
                }

    return None


def _calc_supertrend_adx_math(df: pd.DataFrame, length: int = 10, multiplier: float = 3.0, adx_length: int = 14):
    """
    Pure NumPy/Pandas mathematical calculation of Supertrend & ADX.
    Ensures uninterrupted execution if third-party ta accessors encounter environment issues.
    """
    try:
        high = df["high"].astype(float).values
        low = df["low"].astype(float).values
        close = df["close"].astype(float).values
        n = len(df)
        if n < length + 2:
            return None, None, None, None

        # 1. True Range & ATR
        hl = high - low
        hc = np.abs(high - np.roll(close, 1))
        hc[0] = hl[0]
        lc = np.abs(low - np.roll(close, 1))
        lc[0] = hl[0]
        tr = np.maximum(hl, np.maximum(hc, lc))
        atr = pd.Series(tr).ewm(span=length, adjust=False).mean().values

        # 2. Supertrend Bands & Direction
        hl2 = (high + low) / 2.0
        upper_band = hl2 + (multiplier * atr)
        lower_band = hl2 - (multiplier * atr)

        st_direction = np.ones(n, dtype=int)
        st_line = np.zeros(n, dtype=float)

        for i in range(1, n):
            if close[i - 1] > upper_band[i - 1]:
                upper_band[i] = max(upper_band[i], upper_band[i - 1])
            if close[i - 1] < lower_band[i - 1]:
                lower_band[i] = min(lower_band[i], lower_band[i - 1])

            if close[i] > upper_band[i - 1]:
                st_direction[i] = 1
            elif close[i] < lower_band[i - 1]:
                st_direction[i] = -1
            else:
                st_direction[i] = st_direction[i - 1]
                if st_direction[i] == 1 and lower_band[i] < lower_band[i - 1]:
                    lower_band[i] = lower_band[i - 1]
                if st_direction[i] == -1 and upper_band[i] > upper_band[i - 1]:
                    upper_band[i] = upper_band[i - 1]

            st_line[i] = lower_band[i] if st_direction[i] == 1 else upper_band[i]

        # 3. Directional Movement & ADX
        up_move = high[1:] - high[:-1]
        down_move = low[:-1] - low[1:]
        plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
        minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

        plus_dm_s = pd.Series(np.insert(plus_dm, 0, 0.0)).ewm(span=adx_length, adjust=False).mean()
        minus_dm_s = pd.Series(np.insert(minus_dm, 0, 0.0)).ewm(span=adx_length, adjust=False).mean()
        atr_s = pd.Series(tr).ewm(span=adx_length, adjust=False).mean()

        plus_di = 100.0 * (plus_dm_s / (atr_s + 1e-9))
        minus_di = 100.0 * (minus_dm_s / (atr_s + 1e-9))
        dx = 100.0 * np.abs(plus_di - minus_di) / (plus_di + minus_di + 1e-9)
        adx = dx.ewm(span=adx_length, adjust=False).mean().values

        return int(st_direction[-1]), int(st_direction[-2]), float(st_line[-1]), float(adx[-1])
    except Exception:
        return None, None, None, None


def strat_supertrend_adx(
    df: pd.DataFrame,
    top_down_context: Optional[Dict[str, Any]] = None,
    target_rr: float = 2.5
) -> Optional[Dict[str, Any]]:
    """
    Supertrend + ADX Momentum Strategy (pandas-ta-classic library with auto-math fallback):
    1. Computes Supertrend (10, 3.0) and ADX (14).
    2. Detects direction flip on latest closed candle (from -1 to 1 for LONG, or 1 to -1 for SHORT).
    3. Confirms trend strength: ADX_14 > 25 and RVOL >= 1.2.
    4. Top-Down Guardrail: Blocks chasing into extreme HTF boundaries (no longs at >70% range, no shorts at <30%).
    5. Sets SL at the active Supertrend line and TP dynamically using target_rr.
    """
    if len(df) < 30:
        return None

    curr_dir = None
    prev_dir = None
    st_line = None
    adx_val = None

    # Step 1: Attempt standard accessor calculation via pandas-ta-classic
    try:
        if hasattr(df, "ta"):
            st = df.ta.supertrend(length=10, multiplier=3.0)
            adx = df.ta.adx(length=14)
            if st is not None and adx is not None and not st.empty and not adx.empty:
                dir_cols = [c for c in st.columns if "SUPERTd" in c or "d" in c.lower()]
                line_cols = [c for c in st.columns if c.startswith("SUPERT_")]
                adx_cols = [c for c in adx.columns if c.startswith("ADX_")]
                if dir_cols and line_cols and adx_cols:
                    curr_dir = int(st[dir_cols[0]].iloc[-1])
                    prev_dir = int(st[dir_cols[0]].iloc[-2])
                    st_line = float(st[line_cols[0]].iloc[-1])
                    adx_val = float(adx[adx_cols[0]].iloc[-1])
    except Exception:
        pass

    # Step 2: Resilient fallback to pure math if accessor returned None
    if curr_dir is None or prev_dir is None or st_line is None or adx_val is None:
        curr_dir, prev_dir, st_line, adx_val = _calc_supertrend_adx_math(df, length=10, multiplier=3.0, adx_length=14)

    if curr_dir is None or prev_dir is None or st_line is None or adx_val is None:
        return None

    curr = df.iloc[-1]
    entry = float(curr["close"])
    rvol = float(curr["rvol_20"]) if pd.notnull(curr.get("rvol_20")) else 1.0
    atr = float(curr["atr_14"]) if pd.notnull(curr.get("atr_14")) else float(entry * 0.01)

    # Condition: Trend strength confirmation
    if adx_val < 25.0 or rvol < 1.2:
        return None

    # Top-Down Context filters
    htf_bias = "NEUTRAL"
    itf_depth = 50.0
    if top_down_context:
        htf = top_down_context.get("htf_4h", {})
        itf = top_down_context.get("itf_1h", {})
        htf_bias = htf.get("bias", "NEUTRAL")
        itf_depth = float(itf.get("range_depth_pct", 50.0))

    # --- Bullish Supertrend Flip (-1 -> 1) ---
    if prev_dir == -1 and curr_dir == 1:
        if top_down_context:
            if htf_bias == "BEARISH":
                return None
            if itf_depth > 70.0:
                return None  # Do not chase breakout into extreme range ceiling

        sl = st_line if st_line < entry else (entry - (1.5 * atr))
        if entry > sl:
            entry_r, sl_r, tp_r, rr = finalize_setup_geometry("LONG", entry, sl, target_rr=target_rr)
            return {
                "strategy_name": "Supertrend_ADX_Momentum",
                "side": "LONG",
                "entry": entry_r,
                "sl": sl_r,
                "tp": tp_r,
                "setup_notes": f"Supertrend Bullish Flip with ADX: {adx_val:.1f} > 25. 4H: {htf_bias} | 1H: {itf_depth}%. RVOL: {rvol:.2f}x",
                "rvol": round(rvol, 2),
                "rr": rr
            }

    # --- Bearish Supertrend Flip (1 -> -1) ---
    if prev_dir == 1 and curr_dir == -1:
        if top_down_context:
            if htf_bias == "BULLISH":
                return None
            if itf_depth < 30.0:
                return None  # Do not chase breakdown into extreme range floor

        sl = st_line if st_line > entry else (entry + (1.5 * atr))
        if sl > entry:
            entry_r, sl_r, tp_r, rr = finalize_setup_geometry("SHORT", entry, sl, target_rr=target_rr)
            return {
                "strategy_name": "Supertrend_ADX_Momentum",
                "side": "SHORT",
                "entry": entry_r,
                "sl": sl_r,
                "tp": tp_r,
                "setup_notes": f"Supertrend Bearish Flip with ADX: {adx_val:.1f} > 25. 4H: {htf_bias} | 1H: {itf_depth}%. RVOL: {rvol:.2f}x",
                "rvol": round(rvol, 2),
                "rr": rr
            }

    return None


def ema_trend_pullback(
    df: pd.DataFrame,
    top_down_context: Optional[Dict[str, Any]] = None,
    target_rr: float = 2.5
) -> Optional[Dict[str, Any]]:
    """
    EMA Trend Pullback Strategy:
    Detects strong trend alignment (EMA 20 > EMA 50) and enters on a clean
    pullback bounce / rejection candle touching EMA 20.
    Enforces Top-Down 4H & 1H structural guardrails and configurable target_rr.
    """
    if len(df) < 55:
        return None

    curr = df.iloc[-1]
    prev = df.iloc[-2]
    atr = float(curr["atr_14"]) if pd.notnull(curr["atr_14"]) else float(curr["close"] * 0.01)
    rvol = float(curr["rvol_20"]) if pd.notnull(curr["rvol_20"]) else 1.0

    ema_20 = float(curr["ema_20"])
    ema_50 = float(curr["ema_50"])
    prev_ema_20 = float(prev["ema_20"])

    # Top-Down Context filters
    htf_bias = "NEUTRAL"
    itf_depth = 50.0
    if top_down_context:
        htf = top_down_context.get("htf_4h", {})
        itf = top_down_context.get("itf_1h", {})
        htf_bias = htf.get("bias", "NEUTRAL")
        itf_depth = float(itf.get("range_depth_pct", 50.0))

    # Bullish Continuation Pullback
    # EMA 20 > EMA 50 with positive slope, low touches near EMA 20, close reclaims above EMA 20
    if ema_20 > ema_50 and ema_20 >= prev_ema_20:
        if top_down_context:
            if htf_bias == "BEARISH" or itf_depth > 65.0:
                return None

        if float(curr["low"]) <= ema_20 * 1.002 and float(curr["close"]) > ema_20 and float(curr["close"]) > float(curr["open"]):
            entry = float(curr["close"])
            # SL placed below EMA 50 or 1.5 * ATR
            sl = min(ema_50 - (0.3 * atr), entry - (1.5 * atr))
            if entry > sl:
                entry_r, sl_r, tp_r, rr = finalize_setup_geometry("LONG", entry, sl, target_rr=target_rr)
                return {
                    "strategy_name": "EMA_Trend_Pullback",
                    "side": "LONG",
                    "entry": entry_r,
                    "sl": sl_r,
                    "tp": tp_r,
                    "setup_notes": f"Bullish dynamic bounce off EMA 20 ({format_price_dynamic(ema_20)}). 4H: {htf_bias} | 1H: {itf_depth}%. RVOL: {rvol:.2f}x",
                    "rvol": round(rvol, 2),
                    "rr": rr
                }

    # Bearish Continuation Pullback
    # EMA 20 < EMA 50 with negative slope, high touches near EMA 20, close reclaims below EMA 20
    if ema_20 < ema_50 and ema_20 <= prev_ema_20:
        if top_down_context:
            if htf_bias == "BULLISH" or itf_depth < 35.0:
                return None

        if float(curr["high"]) >= ema_20 * 0.998 and float(curr["close"]) < ema_20 and float(curr["close"]) < float(curr["open"]):
            entry = float(curr["close"])
            sl = max(ema_50 + (0.3 * atr), entry + (1.5 * atr))
            if sl > entry:
                entry_r, sl_r, tp_r, rr = finalize_setup_geometry("SHORT", entry, sl, target_rr=target_rr)
                return {
                    "strategy_name": "EMA_Trend_Pullback",
                    "side": "SHORT",
                    "entry": entry_r,
                    "sl": sl_r,
                    "tp": tp_r,
                    "setup_notes": f"Bearish dynamic rejection off EMA 20 ({format_price_dynamic(ema_20)}). 4H: {htf_bias} | 1H: {itf_depth}%. RVOL: {rvol:.2f}x",
                    "rvol": round(rvol, 2),
                    "rr": rr
                }

    return None


def bb_volatility_breakout(
    df: pd.DataFrame,
    top_down_context: Optional[Dict[str, Any]] = None,
    target_rr: float = 2.5
) -> Optional[Dict[str, Any]]:
    """
    BB Volatility Breakout Strategy:
    Detects severe volatility compression (BB Width < 0.025 in recent bars)
    followed by an explosive expansion breakout candle with RVOL >= 1.4.
    Enforces Top-Down 4H & 1H structural guardrails and configurable target_rr.
    """
    if len(df) < 30:
        return None

    curr = df.iloc[-1]
    atr = float(curr["atr_14"]) if pd.notnull(curr["atr_14"]) else float(curr["close"] * 0.01)
    rvol = float(curr["rvol_20"]) if pd.notnull(curr["rvol_20"]) else 1.0

    # Check for compression in the last 5 bars (excluding current expansion bar)
    recent_widths = df["bb_width"].iloc[-6:-1]
    was_compressed = (recent_widths < 0.025).any()

    if not was_compressed:
        return None

    entry = float(curr["close"])
    bb_upper = float(curr["bb_upper"])
    bb_lower = float(curr["bb_lower"])
    bb_mid = float(curr["bb_mid"])

    # Top-Down Context filters
    htf_bias = "NEUTRAL"
    itf_depth = 50.0
    if top_down_context:
        htf = top_down_context.get("htf_4h", {})
        itf = top_down_context.get("itf_1h", {})
        htf_bias = htf.get("bias", "NEUTRAL")
        itf_depth = float(itf.get("range_depth_pct", 50.0))

    # Bullish Breakout
    if entry > bb_upper and rvol >= 1.4 and float(curr["close"]) > float(curr["open"]):
        if top_down_context:
            if htf_bias == "BEARISH" or itf_depth > 75.0:
                return None

        sl = max(bb_mid, entry - (1.5 * atr))
        if entry > sl:
            entry_r, sl_r, tp_r, rr = finalize_setup_geometry("LONG", entry, sl, target_rr=target_rr)
            return {
                "strategy_name": "BB_Volatility_Breakout",
                "side": "LONG",
                "entry": entry_r,
                "sl": sl_r,
                "tp": tp_r,
                "setup_notes": f"Bollinger Squeeze Breakout Upper. 4H: {htf_bias} | 1H: {itf_depth}%. RVOL: {rvol:.2f}x",
                "rvol": round(rvol, 2),
                "rr": rr
            }

    # Bearish Breakout
    if entry < bb_lower and rvol >= 1.4 and float(curr["close"]) < float(curr["open"]):
        if top_down_context:
            if htf_bias == "BULLISH" or itf_depth < 25.0:
                return None

        sl = min(bb_mid, entry + (1.5 * atr))
        if sl > entry:
            entry_r, sl_r, tp_r, rr = finalize_setup_geometry("SHORT", entry, sl, target_rr=target_rr)
            return {
                "strategy_name": "BB_Volatility_Breakout",
                "side": "SHORT",
                "entry": entry_r,
                "sl": sl_r,
                "tp": tp_r,
                "setup_notes": f"Bollinger Squeeze Breakout Lower. 4H: {htf_bias} | 1H: {itf_depth}%. RVOL: {rvol:.2f}x",
                "rvol": round(rvol, 2),
                "rr": rr
            }

    return None


def rsi_divergence_reversal(
    df: pd.DataFrame,
    top_down_context: Optional[Dict[str, Any]] = None,
    target_rr: float = 2.5
) -> Optional[Dict[str, Any]]:
    """
    RSI Divergence / Exhaustion Reversal Strategy:
    Detects extreme oversold (< 28) or overbought (> 72) conditions followed by
    a momentum reclaim and an engulfing reversal price action candle.
    Enforces Top-Down 4H & 1H structural guardrails and configurable target_rr.
    """
    if len(df) < 30:
        return None

    curr = df.iloc[-1]
    prev = df.iloc[-2]
    atr = float(curr["atr_14"]) if pd.notnull(curr["atr_14"]) else float(curr["close"] * 0.01)
    rvol = float(curr["rvol_20"]) if pd.notnull(curr["rvol_20"]) else 1.0

    curr_rsi = float(curr["rsi_14"])
    recent_rsi = df["rsi_14"].iloc[-6:-1]

    # Top-Down Context filters
    itf_zone = "EQUILIBRIUM"
    itf_depth = 50.0
    if top_down_context:
        itf = top_down_context.get("itf_1h", {})
        itf_zone = itf.get("zone", "EQUILIBRIUM")
        itf_depth = float(itf.get("range_depth_pct", 50.0))

    # Bullish Reversal: Prior RSI dipped below 28, now reclaiming above 30 with Bullish Engulfing
    had_oversold = (recent_rsi < 28.0).any()
    if had_oversold and curr_rsi > 30.0:
        if top_down_context and itf_zone == "PREMIUM" and itf_depth > 55.0:
            return None  # Reversal longs only valid in Discount or Equilibrium

        is_bullish_engulfing = (
            float(curr["close"]) > float(curr["open"]) and
            float(curr["close"]) >= float(prev["high"]) and
            float(curr["open"]) <= float(prev["close"])
        )
        if is_bullish_engulfing:
            entry = float(curr["close"])
            sl = min(float(curr["low"]), float(prev["low"])) - (0.5 * atr)
            if entry > sl:
                entry_r, sl_r, tp_r, rr = finalize_setup_geometry("LONG", entry, sl, target_rr=target_rr)
                return {
                    "strategy_name": "RSI_Divergence_Reversal",
                    "side": "LONG",
                    "entry": entry_r,
                    "sl": sl_r,
                    "tp": tp_r,
                    "setup_notes": f"RSI Exhaustion Reclaim ({curr_rsi:.1f}). Bullish Engulfing. 1H: {itf_zone} ({itf_depth}%). RVOL: {rvol:.2f}x",
                    "rvol": round(rvol, 2),
                    "rr": rr
                }

    # Bearish Reversal: Prior RSI spiked above 72, now falling below 70 with Bearish Engulfing
    had_overbought = (recent_rsi > 72.0).any()
    if had_overbought and curr_rsi < 70.0:
        if top_down_context and itf_zone == "DISCOUNT" and itf_depth < 45.0:
            return None  # Reversal shorts only valid in Premium or Equilibrium

        is_bearish_engulfing = (
            float(curr["close"]) < float(curr["open"]) and
            float(curr["close"]) <= float(prev["low"]) and
            float(curr["open"]) >= float(prev["close"])
        )
        if is_bearish_engulfing:
            entry = float(curr["close"])
            sl = max(float(curr["high"]), float(prev["high"])) + (0.5 * atr)
            if sl > entry:
                entry_r, sl_r, tp_r, rr = finalize_setup_geometry("SHORT", entry, sl, target_rr=target_rr)
                return {
                    "strategy_name": "RSI_Divergence_Reversal",
                    "side": "SHORT",
                    "entry": entry_r,
                    "sl": sl_r,
                    "tp": tp_r,
                    "setup_notes": f"RSI Exhaustion Rejection ({curr_rsi:.1f}). Bearish Engulfing. 1H: {itf_zone} ({itf_depth}%). RVOL: {rvol:.2f}x",
                    "rvol": round(rvol, 2),
                    "rr": rr
                }

    return None


STRATEGY_REGISTRY = {
    "SMC_Liquidity_Sweep": smc_liquidity_sweep,
    "ICT_OrderBlock_FVG": strat_ict_orderblock_fvg,
    "Supertrend_ADX_Momentum": strat_supertrend_adx,
    "EMA_Trend_Pullback": ema_trend_pullback,
    "BB_Volatility_Breakout": bb_volatility_breakout,
    "RSI_Divergence_Reversal": rsi_divergence_reversal,
}


def evaluate_enabled_strategies(
    df: pd.DataFrame,
    enabled_list: List[str],
    ind_df: Optional[pd.DataFrame] = None,
    df_1h: Optional[pd.DataFrame] = None,
    df_4h: Optional[pd.DataFrame] = None,
    top_down_context: Optional[Dict[str, Any]] = None,
    target_rr: float = 2.5
) -> List[Dict[str, Any]]:
    """
    Calculates technical indicators and runs all currently enabled strategies.
    Supports full Top-Down Multi-Timeframe Price Action (4H -> 1H -> 15m) and dynamic target_rr.
    Returns candidate setup dictionaries matching the unified schema.
    Supports case-insensitive & underscore-resilient strategy name matching.
    """
    if df.empty or len(df) < 50:
        return []

    # Calculate indicators once for all strategy plugins if not passed
    if ind_df is None:
        ind_df = calc_indicators(df)

    # Compute Top-Down Market Structure context if not provided
    if top_down_context is None:
        top_down_context = calc_top_down_structure(ind_df, df_1h=df_1h, df_4h=df_4h)

    candidate_setups: List[Dict[str, Any]] = []

    # Build case-insensitive lookup
    normalized_registry = {k.lower().replace("_", ""): (k, fn) for k, fn in STRATEGY_REGISTRY.items()}

    # If enabled_list is empty, default to all registered strategies
    targets = enabled_list if enabled_list else list(STRATEGY_REGISTRY.keys())

    for item in targets:
        key = str(item).strip().lower().replace("_", "")
        if key in normalized_registry:
            actual_name, handler = normalized_registry[key]
            try:
                # Invoke with top_down_context and target_rr keywords if supported
                try:
                    candidate = handler(ind_df, top_down_context=top_down_context, target_rr=target_rr)
                except TypeError:
                    try:
                        candidate = handler(ind_df, top_down_context=top_down_context)
                    except TypeError:
                        candidate = handler(ind_df)

                if candidate:
                    candidate_setups.append(candidate)
            except Exception as exc:
                print(f"[strategies] Error executing {actual_name}: {exc}")

    return candidate_setups
