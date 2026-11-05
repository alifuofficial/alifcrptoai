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
from typing import Tuple, Dict, Any, Optional

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
    equity: float,
    risk_pct: float,
    entry_price: float,
    sl_price: float,
    symbol: str,
    max_leverage: int = 30
) -> float:
    """
    Calculates precise lot/unit position sizing so total risk strictly equals:
    equity * risk_pct (e.g. $10,000 * 1% = $100 risk).
    Enforces broker maximum leverage boundaries.
    """
    if equity <= 0:
        equity = 10000.0  # Reference nominal equity for zero-balance paper tracking

    risk_dollars = equity * risk_pct
    price_distance = abs(float(entry_price) - float(sl_price))
    pip_size = get_forex_pip_size(symbol)

    if price_distance <= 0:
        price_distance = pip_size * 15.0  # Default 15 pips risk buffer

    # Lot units calculation: Units = Risk Dollars / Price Distance
    raw_units = risk_dollars / price_distance

    # Maximum position size under leverage ceiling
    max_allowable_units = (equity * max_leverage) / float(entry_price)
    units = min(raw_units, max_allowable_units)

    # Standard Forex contract lots: 1 Standard Lot = 100,000 units, 1 Mini = 10,000, 1 Micro = 1,000
    # In Bybit / CCXT contracts, order amount is typically in base units or contract quantity
    if "XAU" in symbol or "XAG" in symbol:
        return round(units, 2)
    elif units >= 1000:
        return round(units, 0)
    else:
        return round(units, 2)
