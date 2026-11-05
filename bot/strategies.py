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


def smc_liquidity_sweep(df: pd.DataFrame) -> Optional[Dict[str, Any]]:
    """
    SMC Liquidity Sweep Strategy:
    Scans for a 15-bar swing high/low sweep followed by displacement reclaim
    and Fair Value Gap (FVG) confirmation.
    """
    if len(df) < 30:
        return None

    # Focus on the most recent completed and triggering bars
    curr = df.iloc[-1]
    prev = df.iloc[-2]
    prev2 = df.iloc[-3]

    atr = float(curr["atr_14"]) if pd.notnull(curr["atr_14"]) else float(curr["close"] * 0.01)
    rvol = float(curr["rvol_20"]) if pd.notnull(curr["rvol_20"]) else 1.0

    # 15-bar swing lookback excluding the current bar
    swing_window = df.iloc[-16:-1]
    swing_low = float(swing_window["low"].min())
    swing_high = float(swing_window["high"].max())

    # --- Bullish Sweep Setup ---
    # Price swept below swing_low, but closed back above swing_low with bullish displacement
    if (prev["low"] < swing_low or curr["low"] < swing_low) and curr["close"] > swing_low:
        if curr["close"] > curr["open"]:  # Bullish candle
            # Check for bullish FVG (low of bar i > high of bar i-2 or bar i-1 > bar i-3)
            has_fvg = (float(curr["low"]) > float(prev2["high"])) or (float(prev["low"]) > float(df.iloc[-4]["high"]))
            if not has_fvg:
                return None
            swept_low = min(float(prev["low"]), float(curr["low"]))
            entry = float(curr["close"])
            sl = swept_low - (0.5 * atr)
            if entry > sl:
                entry_r, sl_r, tp_r, rr = finalize_setup_geometry("LONG", entry, sl, target_rr=2.5)
                return {
                    "strategy_name": "SMC_Liquidity_Sweep",
                    "side": "LONG",
                    "entry": entry_r,
                    "sl": sl_r,
                    "tp": tp_r,
                    "setup_notes": f"Swept 15-bar low ({format_price_dynamic(swing_low)}) with bullish displacement reclaim. Verified Bullish FVG. RVOL: {rvol:.2f}x",
                    "rvol": round(rvol, 2),
                    "rr": rr
                }

    # --- Bearish Sweep Setup ---
    # Price swept above swing_high, but closed back below swing_high with bearish displacement
    if (prev["high"] > swing_high or curr["high"] > swing_high) and curr["close"] < swing_high:
        if curr["close"] < curr["open"]:  # Bearish candle
            # Check for bearish FVG (high of bar i < low of bar i-2 or bar i-1 < low of bar i-3)
            has_fvg = (float(curr["high"]) < float(prev2["low"])) or (float(prev["high"]) < float(df.iloc[-4]["low"]))
            if not has_fvg:
                return None
            swept_high = max(float(prev["high"]), float(curr["high"]))
            entry = float(curr["close"])
            sl = swept_high + (0.5 * atr)
            if sl > entry:
                entry_r, sl_r, tp_r, rr = finalize_setup_geometry("SHORT", entry, sl, target_rr=2.5)
                return {
                    "strategy_name": "SMC_Liquidity_Sweep",
                    "side": "SHORT",
                    "entry": entry_r,
                    "sl": sl_r,
                    "tp": tp_r,
                    "setup_notes": f"Swept 15-bar high ({format_price_dynamic(swing_high)}) with bearish displacement reclaim. Verified Bearish FVG. RVOL: {rvol:.2f}x",
                    "rvol": round(rvol, 2),
                    "rr": rr
                }

    return None


def strat_ict_orderblock_fvg(df: pd.DataFrame) -> Optional[Dict[str, Any]]:
    """
    ICT Order Block + Fair Value Gap Strategy (smartmoneyconcepts library):
    1. Detects structural swing points with smc.swing_highs_lows.
    2. Identifies BOS/CHoCH with smc.bos_choch.
    3. Finds institutional Order Blocks with smc.ob and FVGs with smc.fvg.
    4. Triggers LONG if bullish structure break occurred in last 3 bars paired with
       an unmitigated bullish FVG/OB below current price (SL placed at bottom * 0.997, TP at 2.3R).
    5. Triggers SHORT if bearish structure break occurred in last 3 bars paired with
       an unmitigated bearish FVG/OB above current price (SL placed at top * 1.003, TP at 2.3R).
    """
    if len(df) < 30:
        return None

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
                entry_r, sl_r, tp_r, rr = finalize_setup_geometry("LONG", entry, sl, target_rr=2.3)
                return {
                    "strategy_name": "ICT_OrderBlock_FVG",
                    "side": "LONG",
                    "entry": entry_r,
                    "sl": sl_r,
                    "tp": tp_r,
                    "setup_notes": f"Bullish BOS/CHoCH with unmitigated FVG/OB support at {format_price_dynamic(sl_anchor)}. RVOL: {rvol:.2f}x",
                    "rvol": round(rvol, 2),
                    "rr": rr
                }

    # --- Bearish ICT Setup ---
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
                entry_r, sl_r, tp_r, rr = finalize_setup_geometry("SHORT", entry, sl, target_rr=2.3)
                return {
                    "strategy_name": "ICT_OrderBlock_FVG",
                    "side": "SHORT",
                    "entry": entry_r,
                    "sl": sl_r,
                    "tp": tp_r,
                    "setup_notes": f"Bearish BOS/CHoCH with unmitigated FVG/OB resistance at {format_price_dynamic(sl_anchor)}. RVOL: {rvol:.2f}x",
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


def strat_supertrend_adx(df: pd.DataFrame) -> Optional[Dict[str, Any]]:
    """
    Supertrend + ADX Momentum Strategy (pandas-ta-classic library with auto-math fallback):
    1. Computes Supertrend (10, 3.0) and ADX (14).
    2. Detects direction flip on latest closed candle (from -1 to 1 for LONG, or 1 to -1 for SHORT).
    3. Confirms trend strength: ADX_14 > 25 and RVOL >= 1.2.
    4. Sets SL at the active Supertrend line and TP at 2.2R.
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

    # --- Bullish Supertrend Flip (-1 -> 1) ---
    if prev_dir == -1 and curr_dir == 1:
        sl = st_line if st_line < entry else (entry - (1.5 * atr))
        if entry > sl:
            entry_r, sl_r, tp_r, rr = finalize_setup_geometry("LONG", entry, sl, target_rr=2.2)
            return {
                "strategy_name": "Supertrend_ADX_Momentum",
                "side": "LONG",
                "entry": entry_r,
                "sl": sl_r,
                "tp": tp_r,
                "setup_notes": f"Supertrend Bullish Flip (-1->1) with ADX: {adx_val:.1f} > 25. RVOL: {rvol:.2f}x. SL at ST line {format_price_dynamic(st_line)}",
                "rvol": round(rvol, 2),
                "rr": rr
            }

    # --- Bearish Supertrend Flip (1 -> -1) ---
    if prev_dir == 1 and curr_dir == -1:
        sl = st_line if st_line > entry else (entry + (1.5 * atr))
        if sl > entry:
            entry_r, sl_r, tp_r, rr = finalize_setup_geometry("SHORT", entry, sl, target_rr=2.2)
            return {
                "strategy_name": "Supertrend_ADX_Momentum",
                "side": "SHORT",
                "entry": entry_r,
                "sl": sl_r,
                "tp": tp_r,
                "setup_notes": f"Supertrend Bearish Flip (1->-1) with ADX: {adx_val:.1f} > 25. RVOL: {rvol:.2f}x. SL at ST line {format_price_dynamic(st_line)}",
                "rvol": round(rvol, 2),
                "rr": rr
            }

    return None


def ema_trend_pullback(df: pd.DataFrame) -> Optional[Dict[str, Any]]:
    """
    EMA Trend Pullback Strategy:
    Detects strong trend alignment (EMA 20 > EMA 50) and enters on a clean
    pullback bounce / rejection candle touching EMA 20.
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

    # Bullish Continuation Pullback
    # EMA 20 > EMA 50 with positive slope, low touches near EMA 20, close reclaims above EMA 20
    if ema_20 > ema_50 and ema_20 >= prev_ema_20:
        if float(curr["low"]) <= ema_20 * 1.002 and float(curr["close"]) > ema_20 and float(curr["close"]) > float(curr["open"]):
            entry = float(curr["close"])
            # SL placed below EMA 50 or 1.5 * ATR
            sl = min(ema_50 - (0.3 * atr), entry - (1.5 * atr))
            if entry > sl:
                entry_r, sl_r, tp_r, rr = finalize_setup_geometry("LONG", entry, sl, target_rr=2.2)
                return {
                    "strategy_name": "EMA_Trend_Pullback",
                    "side": "LONG",
                    "entry": entry_r,
                    "sl": sl_r,
                    "tp": tp_r,
                    "setup_notes": f"Bullish dynamic bounce off EMA 20 ({format_price_dynamic(ema_20)}). RVOL: {rvol:.2f}x",
                    "rvol": round(rvol, 2),
                    "rr": rr
                }

    # Bearish Continuation Pullback
    # EMA 20 < EMA 50 with negative slope, high touches near EMA 20, close reclaims below EMA 20
    if ema_20 < ema_50 and ema_20 <= prev_ema_20:
        if float(curr["high"]) >= ema_20 * 0.998 and float(curr["close"]) < ema_20 and float(curr["close"]) < float(curr["open"]):
            entry = float(curr["close"])
            sl = max(ema_50 + (0.3 * atr), entry + (1.5 * atr))
            if sl > entry:
                entry_r, sl_r, tp_r, rr = finalize_setup_geometry("SHORT", entry, sl, target_rr=2.2)
                return {
                    "strategy_name": "EMA_Trend_Pullback",
                    "side": "SHORT",
                    "entry": entry_r,
                    "sl": sl_r,
                    "tp": tp_r,
                    "setup_notes": f"Bearish dynamic rejection off EMA 20 ({format_price_dynamic(ema_20)}). RVOL: {rvol:.2f}x",
                    "rvol": round(rvol, 2),
                    "rr": rr
                }

    return None


def bb_volatility_breakout(df: pd.DataFrame) -> Optional[Dict[str, Any]]:
    """
    BB Volatility Breakout Strategy:
    Detects severe volatility compression (BB Width < 0.025 in recent bars)
    followed by an explosive expansion breakout candle with RVOL >= 1.4.
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

    # Bullish Breakout
    if entry > bb_upper and rvol >= 1.4 and float(curr["close"]) > float(curr["open"]):
        sl = max(bb_mid, entry - (1.5 * atr))
        if entry > sl:
            entry_r, sl_r, tp_r, rr = finalize_setup_geometry("LONG", entry, sl, target_rr=2.5)
            return {
                "strategy_name": "BB_Volatility_Breakout",
                "side": "LONG",
                "entry": entry_r,
                "sl": sl_r,
                "tp": tp_r,
                "setup_notes": f"Bollinger Squeeze Breakout Upper. Width expanded from <0.025. RVOL: {rvol:.2f}x",
                "rvol": round(rvol, 2),
                "rr": rr
            }

    # Bearish Breakout
    if entry < bb_lower and rvol >= 1.4 and float(curr["close"]) < float(curr["open"]):
        sl = min(bb_mid, entry + (1.5 * atr))
        if sl > entry:
            entry_r, sl_r, tp_r, rr = finalize_setup_geometry("SHORT", entry, sl, target_rr=2.5)
            return {
                "strategy_name": "BB_Volatility_Breakout",
                "side": "SHORT",
                "entry": entry_r,
                "sl": sl_r,
                "tp": tp_r,
                "setup_notes": f"Bollinger Squeeze Breakout Lower. Width expanded from <0.025. RVOL: {rvol:.2f}x",
                "rvol": round(rvol, 2),
                "rr": rr
            }

    return None


def rsi_divergence_reversal(df: pd.DataFrame) -> Optional[Dict[str, Any]]:
    """
    RSI Divergence / Exhaustion Reversal Strategy:
    Detects extreme oversold (< 28) or overbought (> 72) conditions followed by
    a momentum reclaim and an engulfing reversal price action candle.
    """
    if len(df) < 30:
        return None

    curr = df.iloc[-1]
    prev = df.iloc[-2]
    atr = float(curr["atr_14"]) if pd.notnull(curr["atr_14"]) else float(curr["close"] * 0.01)
    rvol = float(curr["rvol_20"]) if pd.notnull(curr["rvol_20"]) else 1.0

    curr_rsi = float(curr["rsi_14"])
    recent_rsi = df["rsi_14"].iloc[-6:-1]

    # Bullish Reversal: Prior RSI dipped below 28, now reclaiming above 30 with Bullish Engulfing
    had_oversold = (recent_rsi < 28.0).any()
    if had_oversold and curr_rsi > 30.0:
        is_bullish_engulfing = (
            float(curr["close"]) > float(curr["open"]) and
            float(curr["close"]) >= float(prev["high"]) and
            float(curr["open"]) <= float(prev["close"])
        )
        if is_bullish_engulfing:
            entry = float(curr["close"])
            sl = min(float(curr["low"]), float(prev["low"])) - (0.5 * atr)
            if entry > sl:
                entry_r, sl_r, tp_r, rr = finalize_setup_geometry("LONG", entry, sl, target_rr=2.2)
                return {
                    "strategy_name": "RSI_Divergence_Reversal",
                    "side": "LONG",
                    "entry": entry_r,
                    "sl": sl_r,
                    "tp": tp_r,
                    "setup_notes": f"RSI Oversold Exhaustion Reclaim ({curr_rsi:.1f}). Bullish Engulfing. RVOL: {rvol:.2f}x",
                    "rvol": round(rvol, 2),
                    "rr": rr
                }

    # Bearish Reversal: Prior RSI spiked above 72, now falling below 70 with Bearish Engulfing
    had_overbought = (recent_rsi > 72.0).any()
    if had_overbought and curr_rsi < 70.0:
        is_bearish_engulfing = (
            float(curr["close"]) < float(curr["open"]) and
            float(curr["close"]) <= float(prev["low"]) and
            float(curr["open"]) >= float(prev["close"])
        )
        if is_bearish_engulfing:
            entry = float(curr["close"])
            sl = max(float(curr["high"]), float(prev["high"])) + (0.5 * atr)
            if sl > entry:
                entry_r, sl_r, tp_r, rr = finalize_setup_geometry("SHORT", entry, sl, target_rr=2.2)
                return {
                    "strategy_name": "RSI_Divergence_Reversal",
                    "side": "SHORT",
                    "entry": entry_r,
                    "sl": sl_r,
                    "tp": tp_r,
                    "setup_notes": f"RSI Overbought Exhaustion Rejection ({curr_rsi:.1f}). Bearish Engulfing. RVOL: {rvol:.2f}x",
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


def evaluate_enabled_strategies(df: pd.DataFrame, enabled_list: List[str], ind_df: Optional[pd.DataFrame] = None) -> List[Dict[str, Any]]:
    """
    Calculates technical indicators and runs all currently enabled strategies.
    Returns candidate setup dictionaries matching the unified schema.
    Supports case-insensitive & underscore-resilient strategy name matching.
    """
    if df.empty or len(df) < 50:
        return []

    # Calculate indicators once for all strategy plugins if not passed
    if ind_df is None:
        ind_df = calc_indicators(df)
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
                candidate = handler(ind_df)
                if candidate:
                    candidate_setups.append(candidate)
            except Exception as exc:
                print(f"[strategies] Error executing {actual_name}: {exc}")

    return candidate_setups
