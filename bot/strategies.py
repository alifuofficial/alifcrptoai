"""
alifcrptoai - Quantitative Strategy Plugins & Indicator Engine
Author & Developer: Alifu Haji (Individual Developer)

Implements 4 institutional quantitative strategies:
1. SMC_Liquidity_Sweep (15-bar high/low sweep + displacement reclaim + FVG)
2. EMA_Trend_Pullback (EMA 20/50 dynamic trend bounce/rejection)
3. BB_Volatility_Breakout (Squeeze compression < 0.025 + RVOL >= 1.4 expansion)
4. RSI_Divergence_Reversal (Exhaustion < 28 or > 72 + engulfing reclaim)
"""

import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional


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
        df[col] = pd.to_numeric(df[col], errors="coerce")

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
    df["rvol_20"] = df["volume"] / (vol_sma_20 + 1e-9)

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
        if curr["close"] > curr["open"]: # Bullish candle
            # Check for bullish FVG (low of bar i > high of bar i-2)
            has_fvg = float(curr["low"]) > float(prev2["high"])
            swept_low = min(float(prev["low"]), float(curr["low"]))
            entry = float(curr["close"])
            sl = swept_low - (0.5 * atr)
            risk = entry - sl
            if risk > 0:
                tp = entry + (2.5 * risk)
                rr = round((tp - entry) / risk, 2)
                return {
                    "strategy_name": "SMC_Liquidity_Sweep",
                    "side": "LONG",
                    "entry": round(entry, 4),
                    "sl": round(sl, 4),
                    "tp": round(tp, 4),
                    "setup_notes": f"Swept 15-bar low ({swing_low:.2f}) with reclaim. FVG: {has_fvg}. RVOL: {rvol:.2f}x",
                    "rvol": round(rvol, 2),
                    "rr": rr
                }

    # --- Bearish Sweep Setup ---
    # Price swept above swing_high, but closed back below swing_high with bearish displacement
    if (prev["high"] > swing_high or curr["high"] > swing_high) and curr["close"] < swing_high:
        if curr["close"] < curr["open"]: # Bearish candle
            # Check for bearish FVG (high of bar i < low of bar i-2)
            has_fvg = float(curr["high"]) < float(prev2["low"])
            swept_high = max(float(prev["high"]), float(curr["high"]))
            entry = float(curr["close"])
            sl = swept_high + (0.5 * atr)
            risk = sl - entry
            if risk > 0:
                tp = entry - (2.5 * risk)
                rr = round((entry - tp) / risk, 2)
                return {
                    "strategy_name": "SMC_Liquidity_Sweep",
                    "side": "SHORT",
                    "entry": round(entry, 4),
                    "sl": round(sl, 4),
                    "tp": round(tp, 4),
                    "setup_notes": f"Swept 15-bar high ({swing_high:.2f}) with reclaim. FVG: {has_fvg}. RVOL: {rvol:.2f}x",
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
            risk = entry - sl
            if risk > 0:
                tp = entry + (2.2 * risk)
                rr = round((tp - entry) / risk, 2)
                return {
                    "strategy_name": "EMA_Trend_Pullback",
                    "side": "LONG",
                    "entry": round(entry, 4),
                    "sl": round(sl, 4),
                    "tp": round(tp, 4),
                    "setup_notes": f"Bullish dynamic bounce off EMA 20 ({ema_20:.2f}). RVOL: {rvol:.2f}x",
                    "rvol": round(rvol, 2),
                    "rr": rr
                }

    # Bearish Continuation Pullback
    # EMA 20 < EMA 50 with negative slope, high touches near EMA 20, close reclaims below EMA 20
    if ema_20 < ema_50 and ema_20 <= prev_ema_20:
        if float(curr["high"]) >= ema_20 * 0.998 and float(curr["close"]) < ema_20 and float(curr["close"]) < float(curr["open"]):
            entry = float(curr["close"])
            sl = max(ema_50 + (0.3 * atr), entry + (1.5 * atr))
            risk = sl - entry
            if risk > 0:
                tp = entry - (2.2 * risk)
                rr = round((entry - tp) / risk, 2)
                return {
                    "strategy_name": "EMA_Trend_Pullback",
                    "side": "SHORT",
                    "entry": round(entry, 4),
                    "sl": round(sl, 4),
                    "tp": round(tp, 4),
                    "setup_notes": f"Bearish dynamic rejection off EMA 20 ({ema_20:.2f}). RVOL: {rvol:.2f}x",
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
        risk = entry - sl
        if risk > 0:
            tp = entry + (2.5 * risk)
            rr = round((tp - entry) / risk, 2)
            return {
                "strategy_name": "BB_Volatility_Breakout",
                "side": "LONG",
                "entry": round(entry, 4),
                "sl": round(sl, 4),
                "tp": round(tp, 4),
                "setup_notes": f"Bollinger Squeeze Breakout Upper. Width expanded from <0.025. RVOL: {rvol:.2f}x",
                "rvol": round(rvol, 2),
                "rr": rr
            }

    # Bearish Breakout
    if entry < bb_lower and rvol >= 1.4 and float(curr["close"]) < float(curr["open"]):
        sl = min(bb_mid, entry + (1.5 * atr))
        risk = sl - entry
        if risk > 0:
            tp = entry - (2.5 * risk)
            rr = round((entry - tp) / risk, 2)
            return {
                "strategy_name": "BB_Volatility_Breakout",
                "side": "SHORT",
                "entry": round(entry, 4),
                "sl": round(sl, 4),
                "tp": round(tp, 4),
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
            risk = entry - sl
            if risk > 0:
                tp = entry + (2.2 * risk)
                rr = round((tp - entry) / risk, 2)
                return {
                    "strategy_name": "RSI_Divergence_Reversal",
                    "side": "LONG",
                    "entry": round(entry, 4),
                    "sl": round(sl, 4),
                    "tp": round(tp, 4),
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
            risk = sl - entry
            if risk > 0:
                tp = entry - (2.2 * risk)
                rr = round((entry - tp) / risk, 2)
                return {
                    "strategy_name": "RSI_Divergence_Reversal",
                    "side": "SHORT",
                    "entry": round(entry, 4),
                    "sl": round(sl, 4),
                    "tp": round(tp, 4),
                    "setup_notes": f"RSI Overbought Exhaustion Rejection ({curr_rsi:.1f}). Bearish Engulfing. RVOL: {rvol:.2f}x",
                    "rvol": round(rvol, 2),
                    "rr": rr
                }

    return None


STRATEGY_REGISTRY = {
    "SMC_Liquidity_Sweep": smc_liquidity_sweep,
    "EMA_Trend_Pullback": ema_trend_pullback,
    "BB_Volatility_Breakout": bb_volatility_breakout,
    "RSI_Divergence_Reversal": rsi_divergence_reversal
}


def evaluate_enabled_strategies(df: pd.DataFrame, enabled_list: List[str]) -> List[Dict[str, Any]]:
    """
    Calculates technical indicators and runs all currently enabled strategies.
    Returns candidate setup dictionaries matching the unified schema.
    """
    if df.empty or len(df) < 50:
        return []

    # Calculate indicators once for all strategy plugins
    ind_df = calc_indicators(df)
    candidate_setups: List[Dict[str, Any]] = []

    for strat_name in enabled_list:
        handler = STRATEGY_REGISTRY.get(strat_name)
        if handler:
            try:
                candidate = handler(ind_df)
                if candidate:
                    candidate_setups.append(candidate)
            except Exception as exc:
                print(f"[strategies] Error executing {strat_name}: {exc}")

    return candidate_setups
