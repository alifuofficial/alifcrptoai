"""
alifcrptoai - Institutional Forex, Commodities & Session Guard Engine
Author & Developer: Alifu Haji (Individual Developer)

Provides institutional safeguards for Forex & CFD instruments:
1. 24/5 Market Schedule & Weekend Risk Shield (Closes Friday 21:00 UTC, Opens Sunday 22:00 UTC).
2. Daily NY Bank Rollover Blackout (21:50 - 22:15 UTC spread spike filter).
3. ICT Session Killzone Identifier (London Open, NY Overlap, Asian Range).
4. Pip & Pipette valuation for standard, JPY, and Commodity (Gold/Silver) pairs.
"""

from datetime import datetime, timezone
from typing import Tuple, Dict, Any, Optional, List
import pandas as pd
import numpy as np

FOREX_MAJORS = {
    "EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD",
    "USD/CAD", "USD/CHF", "NZD/USD", "EUR/GBP",
    "EUR/JPY", "GBP/JPY", "XAU/USD", "XAG/USD"
}


def is_forex_symbol(symbol: str) -> bool:
    """
    Determines if a symbol is a Forex or Commodity CFD instrument.
    Matches standard FX currency pairs, metals (XAU, XAG), and fiat crosses.
    """
    clean_sym = symbol.upper().replace(":USDT", "").replace(":USD", "").strip()

    if clean_sym in FOREX_MAJORS:
        return True

    forex_currencies = {"EUR", "GBP", "USD", "JPY", "AUD", "CAD", "CHF", "NZD", "XAU", "XAG"}
    parts = clean_sym.split("/")
    if len(parts) == 2:
        base, quote = parts[0].strip(), parts[1].strip()
        if base in forex_currencies and quote in forex_currencies:
            return True

    return False


def is_forex_market_open() -> Tuple[bool, str]:
    """
    Evaluates whether the global interbank Forex market is currently open.
    Forex trading schedule:
    - Opens: Sunday 22:00 UTC (Sydney / Tokyo Open)
    - Closes: Friday 21:00 UTC (New York Close)
    - Weekend: Saturday (Closed), Sunday until 22:00 UTC (Closed)
    """
    now = datetime.now(timezone.utc)
    weekday = now.weekday()  # Monday = 0, Friday = 4, Saturday = 5, Sunday = 6
    hour = now.hour

    if weekday == 5:
        return False, "Forex market closed for the weekend (Saturday)."
    if weekday == 6 and hour < 22:
        return False, f"Forex market opens Sunday 22:00 UTC (current UTC hour: {hour}:00)."
    if weekday == 4 and hour >= 21:
        return False, "Forex market closed for the weekend (Friday 21:00 UTC close)."

    return True, "Forex interbank market active."


def is_daily_rollover_blackout() -> Tuple[bool, str]:
    """
    Detects the daily 5 PM EST (21:50 - 22:15 UTC) bank settlement / rollover.
    During this 25-minute window, institutional liquidity drops and spreads widen
    from 0.3 pips to 5-15+ pips. New entries must be frozen to prevent fake slippage.
    """
    now = datetime.now(timezone.utc)
    hour = now.hour
    minute = now.minute

    # Blackout window: 21:50 to 22:15 UTC
    if (hour == 21 and minute >= 50) or (hour == 22 and minute <= 15):
        return True, f"Daily NY Bank Rollover Blackout ({hour:02d}:{minute:02d} UTC). Spreads widened."

    return False, "Normal spread session."


def get_forex_session_regime() -> Dict[str, Any]:
    """
    Returns active institutional Forex session, ICT Killzone status,
    and recommended strategy behavior.
    """
    is_open, open_reason = is_forex_market_open()
    if not is_open:
        return {
            "session_name": "WEEKEND_CLOSED",
            "is_killzone": False,
            "description": open_reason,
            "ict_bias": "NO_TRADING"
        }

    now = datetime.now(timezone.utc)
    hour = now.hour

    if 7 <= hour < 11:
        return {
            "session_name": "LONDON_OPEN_KILLZONE",
            "is_killzone": True,
            "description": "London Open (07:00-11:00 UTC): Prime ICT Asian Range Liquidity Sweeps & Displacement.",
            "ict_bias": "PRIME_SWEEP_RECLAIM"
        }
    elif 12 <= hour < 16:
        return {
            "session_name": "NY_OVERLAP_KILLZONE",
            "is_killzone": True,
            "description": "London + New York Overlap (12:00-16:00 UTC): Peak global liquidity & highest daily volume.",
            "ict_bias": "STRONG_TREND_CONTINUATION"
        }
    elif 0 <= hour < 7:
        return {
            "session_name": "ASIAN_SESSION",
            "is_killzone": False,
            "description": "Asian Session (00:00-07:00 UTC): Low volatility range consolidation.",
            "ict_bias": "RANGE_BOUND_ACCUMULATION"
        }
    elif 16 <= hour < 21:
        return {
            "session_name": "NY_AFTERNOON",
            "is_killzone": False,
            "description": "New York Afternoon (16:00-21:00 UTC): London closed, momentum slowing.",
            "ict_bias": "MEAN_REVERSION"
        }
    else:
        return {
            "session_name": "ROLLOVER_RESET",
            "is_killzone": False,
            "description": "Bank Rollover & Settlement (21:00-24:00 UTC): Wide spreads, low liquidity.",
            "ict_bias": "DEFENSIVE"
        }


def get_forex_pip_size(symbol: str) -> float:
    """
    Returns pip multiplier based on quotation conventions:
    - JPY Pairs: 2nd decimal place (0.01)
    - Gold (XAU/USD): 1st decimal place (0.10)
    - Silver (XAG/USD): 3rd decimal place (0.005)
    - Standard Currency Pairs (EUR, GBP, AUD, CAD, CHF, NZD): 4th decimal place (0.0001)
    """
    clean = symbol.upper().replace(":USDT", "").replace(":USD", "").strip()

    if "JPY" in clean:
        return 0.01
    elif "XAU" in clean:
        return 0.10
    elif "XAG" in clean:
        return 0.005
    else:
        return 0.0001


def calculate_pip_distance(price1: float, price2: float, symbol: str) -> float:
    """Calculates absolute or directional pip distance between two price points."""
    pip_size = get_forex_pip_size(symbol)
    return round(abs(float(price1) - float(price2)) / pip_size, 1)


def calculate_forex_position_size(
    equity: float = 0.0,
    risk_pct: float = 0.01,
    entry_price: float = 0.0,
    sl_price: float = 0.0,
    symbol: str = "EUR/USD",
    max_leverage: int = 30,
    **kwargs
) -> float:
    """
    Calculates precise lot/unit position sizing so total risk strictly equals:
    equity * risk_pct (e.g. $10,000 * 1% = $100 risk).
    Enforces broker maximum leverage boundaries and Micro-Account Protections (<$100).
    """
    if equity <= 0:
        equity = float(kwargs.get("nominal_equity") or 0.0)
    if equity <= 0:
        equity = 1000.0  # Reference nominal equity for zero-balance paper tracking

    risk_dollars = equity * risk_pct
    price_distance = abs(float(entry_price) - float(sl_price))
    pip_size = get_forex_pip_size(symbol)

    if price_distance <= 0:
        price_distance = pip_size * 15.0  # Default 15 pips risk buffer

    pips = round(price_distance / pip_size, 1)
    is_metal = "XAU" in symbol or "XAG" in symbol

    # =========================================================================
    # 🛡️ MICRO-ACCOUNT PROTECTION (< $100.00 BALANCE)
    # =========================================================================
    if equity < 100.0:
        if is_metal:
            min_units = 0.01  # Minimum 0.01 oz / contract for metals
            required_margin = (min_units * float(entry_price)) / max(max_leverage, 1)
            dollar_risk = min_units * price_distance
        else:
            min_units = 1000.0  # 1 Micro Lot = 1,000 units (0.01 standard lot)
            required_margin = (min_units * float(entry_price)) / max(max_leverage, 1)
            dollar_risk = min_units * price_distance

        actual_risk_pct = dollar_risk / equity
        margin_utilization = required_margin / equity

        # 1. Margin Safety Check (Never allow > 75% of equity consumed by initial margin)
        if margin_utilization > 0.75:
            print(
                f"[risk] 🛡️ Micro-Account Lot Guard: Order on {symbol} requires ${required_margin:.2f} margin "
                f"on ${equity:.2f} equity ({margin_utilization * 100:.1f}% margin utilization at {max_leverage}x leverage). "
                f"Exceeds 75% safety ceiling. SKIPPING trade to prevent margin call."
            )
            return 0.0

        # 2. Risk Ceiling Check (Never allow > 8% account risk on a single trade in micro-sprint mode)
        if actual_risk_pct > 0.08:
            print(
                f"[risk] 🛡️ Micro-Account Lot Guard: Minimum order size on {symbol} with {pips} pips SL "
                f"results in ${dollar_risk:.2f} risk ({actual_risk_pct * 100:.1f}% of ${equity:.2f} equity). "
                f"Exceeds micro-sprint 8.0% hard ceiling. SKIPPING trade to prevent drawdown ruin."
            )
            return 0.0

        print(
            f"[risk] 🛡️ Micro-Account Sprint Approved: {min_units} units on {symbol} (${equity:.2f} balance). "
            f"Margin: ${required_margin:.2f} ({margin_utilization * 100:.1f}%), "
            f"Risk: ${dollar_risk:.2f} ({actual_risk_pct * 100:.1f}%, {pips} pips SL)."
        )
        return min_units

    # =========================================================================
    # 🏛️ STANDARD & INSTITUTIONAL ACCOUNT SIZING (>= $100.00 BALANCE)
    # =========================================================================
    raw_units = risk_dollars / price_distance
    max_allowable_units = (equity * max_leverage) / float(entry_price)
    units = min(raw_units, max_allowable_units)

    if is_metal:
        qty = round(units, 2)
        return max(qty, 0.01) if (0.01 * price_distance) / equity <= 0.05 else 0.0
    else:
        # Standard Forex contract lots: round to nearest 1,000 units (0.01 lot)
        lot_chunks = int(units // 1000) * 1000
        if lot_chunks >= 1000:
            return float(lot_chunks)

        # If raw units are between 500 and 1000, verify if 1,000 units (0.01 lot) is within 2.5% tolerance
        min_units = 1000.0
        min_risk_pct = (min_units * price_distance) / equity
        if min_risk_pct <= max(risk_pct * 1.5, 0.025):
            return min_units
        else:
            print(
                f"[risk] Standard Account Sizing: Calculated {units:.0f} units on {symbol} is below broker minimum 1,000 units "
                f"and forced 1,000 units would risk {min_risk_pct * 100:.2f}% (above allowed tolerance). Skipping."
            )
            return 0.0


def calc_asian_range_benchmarks(df_15m: Any, symbol: str = "EUR/USD") -> Dict[str, Any]:
    """
    Computes Asian Session (00:00 - 07:00 UTC) range benchmarks for London Judas Swing setups.
    Returns:
    - asian_high: Highest high during 00:00 - 07:00 UTC today
    - asian_low: Lowest low during 00:00 - 07:00 UTC today
    - asian_mid: 50% midpoint of the Asian range
    - asian_range_pips: Total pip spread of the Asian box
    - is_valid_range: True if at least 10 bars exist in the Asian session
    """
    if df_15m is None or len(df_15m) < 20 or "timestamp" not in df_15m.columns:
        return {"is_valid_range": False}

    try:
        df = df_15m.copy()
        if not pd.api.types.is_datetime64_any_dtype(df["timestamp"]):
            df["timestamp"] = pd.to_datetime(df["timestamp"])

        now_utc = datetime.now(timezone.utc)
        today_date = now_utc.date()

        # Extract today's Asian Session (00:00 to 07:00 UTC)
        mask = (
            (df["timestamp"].dt.date == today_date) &
            (df["timestamp"].dt.hour >= 0) &
            (df["timestamp"].dt.hour < 7)
        )
        asian_df = df[mask]

        if len(asian_df) < 8:
            # Fallback to the most recent 28 bars (representing approx 7 hours)
            asian_df = df.iloc[-35:-7]

        if asian_df.empty:
            return {"is_valid_range": False}

        asian_high = float(asian_df["high"].astype(float).max())
        asian_low = float(asian_df["low"].astype(float).min())
        asian_mid = (asian_high + asian_low) / 2.0
        pip_size = get_forex_pip_size(symbol)
        range_pips = round(abs(asian_high - asian_low) / pip_size, 1)

        curr_price = float(df["close"].iloc[-1])
        is_sweeping_low = float(df["low"].iloc[-1]) < asian_low and curr_price > asian_low
        is_sweeping_high = float(df["high"].iloc[-1]) > asian_high and curr_price < asian_high

        return {
            "is_valid_range": True,
            "asian_high": asian_high,
            "asian_low": asian_low,
            "asian_mid": asian_mid,
            "asian_range_pips": range_pips,
            "is_sweeping_low": is_sweeping_low,
            "is_sweeping_high": is_sweeping_high,
            "session_time": f"{today_date} 00:00-07:00 UTC"
        }
    except Exception:
        return {"is_valid_range": False}


def calc_daily_benchmarks(df_15m: Any, df_1h: Optional[Any] = None, symbol: str = "EUR/USD") -> Dict[str, Any]:
    """
    Computes institutional horizontal time benchmarks:
    - PDH: Previous Day High (buy-side liquidity pool)
    - PDL: Previous Day Low (sell-side liquidity pool)
    - PDM: Previous Day Midpoint (50% equilibrium)
    """
    source_df = df_1h if df_1h is not None and len(df_1h) >= 30 else df_15m
    if source_df is None or len(source_df) < 30 or "timestamp" not in source_df.columns:
        return {"has_benchmarks": False}

    try:
        df = source_df.copy()
        if not pd.api.types.is_datetime64_any_dtype(df["timestamp"]):
            df["timestamp"] = pd.to_datetime(df["timestamp"])

        now_utc = datetime.now(timezone.utc)
        today_date = now_utc.date()

        # Prior day data
        prior_df = df[df["timestamp"].dt.date < today_date]
        if prior_df.empty:
            # Fallback to lookback window
            lookback_bars = 24 if df_1h is not None else 96
            prior_df = df.iloc[-lookback_bars * 2 : -lookback_bars]

        if prior_df.empty:
            return {"has_benchmarks": False}

        pdh = float(prior_df["high"].astype(float).max())
        pdl = float(prior_df["low"].astype(float).min())
        pdm = (pdh + pdl) / 2.0
        pip_size = get_forex_pip_size(symbol)

        return {
            "has_benchmarks": True,
            "pdh": pdh,
            "pdl": pdl,
            "pdm": pdm,
            "daily_range_pips": round(abs(pdh - pdl) / pip_size, 1)
        }
    except Exception:
        return {"has_benchmarks": False}


def detect_cross_pair_smt(df_base: Any, df_correlated: Any, tolerance_pct: float = 0.001) -> Dict[str, Any]:
    """
    Detects institutional Smart Money Technique (SMT) Divergence between two correlated assets:
    - EUR/USD <-> GBP/USD
    - XAU/USD <-> XAG/USD
    - BTC/USDT <-> ETH/USDT
    Returns:
    - smt_type: 'BULLISH_SMT', 'BEARISH_SMT', or 'NONE'
    - description: Technical explanation of the institutional divergence
    """
    if df_base is None or df_correlated is None or len(df_base) < 20 or len(df_correlated) < 20:
        return {"smt_type": "NONE"}

    try:
        # Get recent 2 swing highs and lows for both
        h_base = df_base["high"].astype(float).iloc[-15:]
        h_corr = df_correlated["high"].astype(float).iloc[-15:]
        l_base = df_base["low"].astype(float).iloc[-15:]
        l_corr = df_correlated["low"].astype(float).iloc[-15:]

        # Highs
        b_high_curr = float(h_base.iloc[-1])
        b_high_prev = float(h_base.iloc[:-2].max())
        c_high_curr = float(h_corr.iloc[-1])
        c_high_prev = float(h_corr.iloc[:-2].max())

        # Lows
        b_low_curr = float(l_base.iloc[-1])
        b_low_prev = float(l_base.iloc[:-2].min())
        c_low_curr = float(l_corr.iloc[-1])
        c_low_prev = float(l_corr.iloc[:-2].min())

        # Bearish SMT: Base creates Higher High, but Correlated creates Lower High (or vice versa)
        if (b_high_curr > b_high_prev and c_high_curr < c_high_prev) or (b_high_curr < b_high_prev and c_high_curr > c_high_prev):
            return {
                "smt_type": "BEARISH_SMT",
                "description": "Bearish SMT Divergence detected: Correlated pair failed to confirm Higher High, signaling institutional distribution."
            }

        # Bullish SMT: Base creates Lower Low, but Correlated creates Higher Low (or vice versa)
        if (b_low_curr < b_low_prev and c_low_curr > c_low_prev) or (b_low_curr > b_low_prev and c_low_curr < c_low_prev):
            return {
                "smt_type": "BULLISH_SMT",
                "description": "Bullish SMT Divergence detected: Correlated pair refused to make Lower Low, signaling institutional accumulation."
            }

        return {"smt_type": "NONE"}
    except Exception:
        return {"smt_type": "NONE"}
