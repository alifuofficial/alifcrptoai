"""
alifcrptoai - Zero-Cost Live Crypto News & Red-Folder Macro Engine
Author & Developer: Alifu Haji (Individual Developer)

Integrates:
1. CryptoCompare News API (Cached per coin, 10 min TTL)
2. ForexFactory High-Impact Multi-Currency Economic Calendar (Cached 30 min TTL)
   Covers: USD, EUR, GBP, JPY, AUD, CAD, CHF (P3 & P6 fixes)
"""

import time
import requests
from datetime import datetime, timezone
from typing import List, Dict, Optional, Any

# In-memory caches
_NEWS_CACHE: Dict[str, Dict[str, Any]] = {}
_MACRO_CACHE: Dict[str, Any] = {
    "timestamp": 0.0,
    "events": []
}

NEWS_CACHE_TTL = 600    # 10 minutes in seconds
MACRO_CACHE_TTL = 1800  # P6 FIX: 30 minutes (was 6 hours / 21600s)
                        # Shorter TTL catches emergency macro events (surprise Fed statements etc.)

# P3 FIX: Expanded from USD-only to all major forex currencies
# Maps each currency to the pairs it appears in (so we can apply blackout only to relevant pairs)
HIGH_IMPACT_CURRENCIES = {"USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF"}

# Which pairs are affected by each currency's macro event
CURRENCY_PAIR_MAP = {
    "USD": ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT",
            "EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD",
            "USD/CHF", "NZD/USD", "XAU/USD", "XAG/USD"],
    "EUR": ["EUR/USD", "EUR/GBP", "EUR/JPY", "EUR/CHF", "EUR/AUD", "EUR/CAD"],
    "GBP": ["GBP/USD", "EUR/GBP", "GBP/JPY", "GBP/AUD", "GBP/CAD", "GBP/CHF"],
    "JPY": ["USD/JPY", "EUR/JPY", "GBP/JPY", "AUD/JPY", "CAD/JPY", "CHF/JPY"],
    "AUD": ["AUD/USD", "AUD/JPY", "AUD/NZD", "AUD/CAD", "AUD/CHF", "EUR/AUD", "GBP/AUD"],
    "CAD": ["USD/CAD", "CAD/JPY", "AUD/CAD", "EUR/CAD", "GBP/CAD", "NZD/CAD"],
    "CHF": ["USD/CHF", "EUR/CHF", "GBP/CHF", "AUD/CHF", "CAD/CHF", "NZD/CHF"],
}


def extract_base_coin(symbol: str) -> str:
    """Extracts base coin ticker from trading pair e.g., 'BTC/USDT' -> 'BTC'."""
    clean_sym = symbol.replace(":USDT", "").replace("/USDT", "").replace("-USDT", "").upper()
    if "/" in clean_sym:
        return clean_sym.split("/")[0]
    return clean_sym


def fetch_crypto_headlines(symbol: str) -> List[Dict[str, Any]]:
    """
    Fetches latest top 5 headlines for the specific crypto asset from CryptoCompare.
    Uses 10-minute in-memory caching and 5s timeout.
    """
    coin = extract_base_coin(symbol)
    now = time.time()

    # Check cache
    if coin in _NEWS_CACHE:
        cached_entry = _NEWS_CACHE[coin]
        if now - cached_entry["timestamp"] < NEWS_CACHE_TTL:
            return cached_entry["data"]

    url = f"https://min-api.cryptocompare.com/data/v2/news/?categories={coin}&excludeCategories=Sponsored"
    headers = {"User-Agent": "alifcrptoai/1.0 (Contabo VPS autonomous engine)"}

    try:
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code == 200:
            payload = response.json()
            articles = payload.get("Data", [])
            results: List[Dict[str, Any]] = []

            for item in articles[:5]:
                pub_time = item.get("published_on", int(now))
                mins_ago = max(0, int((now - pub_time) / 60))
                results.append({
                    "title": item.get("title", "").strip(),
                    "source": item.get("source_info", {}).get("name", "CryptoNews"),
                    "published_mins_ago": mins_ago,
                    "url": item.get("url", "")
                })

            _NEWS_CACHE[coin] = {
                "timestamp": now,
                "data": results
            }
            return results
    except Exception as exc:
        print(f"[news_macro] Warning: Failed to fetch news for {coin}: {exc}")

    # Fallback to existing stale cache if available, else empty list
    if coin in _NEWS_CACHE:
        return _NEWS_CACHE[coin]["data"]
    return []


def _refresh_macro_calendar() -> List[Dict[str, Any]]:
    """
    Fetches high-impact economic calendar events from ForexFactory JSON feed.
    P3 FIX: Now captures all major currencies (USD, EUR, GBP, JPY, AUD, CAD, CHF).
    P6 FIX: Cache TTL reduced from 6 hours to 30 minutes for intraday accuracy.
    """
    now = time.time()
    if now - _MACRO_CACHE["timestamp"] < MACRO_CACHE_TTL and _MACRO_CACHE["events"]:
        return _MACRO_CACHE["events"]

    url = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
    headers = {"User-Agent": "Mozilla/5.0 alifcrptoai-macro-shield"}

    try:
        response = requests.get(url, headers=headers, timeout=7)
        if response.status_code == 200:
            data = response.json()
            high_impact_events: List[Dict[str, Any]] = []
            for ev in data:
                currency = str(ev.get("country", "")).upper()
                impact = str(ev.get("impact", "")).lower()
                # P3 FIX: Include all major currency high-impact events, not just USD
                if currency in HIGH_IMPACT_CURRENCIES and impact == "high":
                    high_impact_events.append(ev)

            _MACRO_CACHE["timestamp"] = now
            _MACRO_CACHE["events"] = high_impact_events
            print(f"[news_macro] Macro calendar refreshed: {len(high_impact_events)} high-impact events loaded "
                  f"({', '.join(HIGH_IMPACT_CURRENCIES)}).")
            return high_impact_events
    except Exception as exc:
        print(f"[news_macro] Warning: Failed to refresh macro calendar: {exc}")

    return _MACRO_CACHE.get("events", [])


def check_usd_macro_blackout(symbol: str = "") -> Dict[str, Any]:
    """
    Checks if current UTC time is within 30 minutes before or 15 minutes after
    any High-Impact economic event for currencies relevant to the given symbol.

    P3 FIX: Symbol-aware blackout — EUR/USD is blocked on EUR AND USD events;
    GBP/USD is blocked on GBP AND USD events; crypto is blocked only on USD events.

    Args:
        symbol: The trading pair being evaluated (e.g. 'GBP/USD', 'BTC/USDT').
                If empty, falls back to USD-only check (backward compatible).

    Returns:
        {
            "macro_blackout": bool,
            "active_or_upcoming_event": str | None,
            "minutes_to_event": int | None,
            "event_currency": str | None
        }
    """
    events = _refresh_macro_calendar()
    now_utc = datetime.now(timezone.utc)

    # Determine which currencies to check for this symbol
    sym_upper = symbol.upper().replace(":USDT", "").replace("/USDT", "")
    relevant_currencies: set = {"USD"}  # Always check USD

    # P3: Add currency-specific blackout based on pair components
    for currency, affected_pairs in CURRENCY_PAIR_MAP.items():
        if any(sym_upper == p.replace("/", "").upper() or sym_upper in p for p in affected_pairs):
            relevant_currencies.add(currency)

    for ev in events:
        event_currency = str(ev.get("country", "")).upper()
        if event_currency not in relevant_currencies:
            continue  # This event does not affect the current trading pair

        date_str = ev.get("date")  # Format: "2026-11-02T13:30:00-05:00" or similar ISO
        if not date_str:
            continue

        try:
            # Parse ISO format with offset
            event_dt = datetime.fromisoformat(date_str)
            # Normalize to UTC
            event_dt_utc = event_dt.astimezone(timezone.utc)
            delta_seconds = (event_dt_utc - now_utc).total_seconds()
            delta_mins = int(delta_seconds / 60)

            # Blackout window: 30 minutes before event up to 15 minutes after event (-15 <= delta_mins <= 30)
            if -15 <= delta_mins <= 30:
                title = ev.get("title", f"{event_currency} High-Impact Release")
                return {
                    "macro_blackout": True,
                    "active_or_upcoming_event": f"{event_currency} High Impact: {title}",
                    "minutes_to_event": delta_mins,
                    "event_currency": event_currency
                }
        except Exception:
            continue

    return {
        "macro_blackout": False,
        "active_or_upcoming_event": None,
        "minutes_to_event": None,
        "event_currency": None
    }


def get_upcoming_events(hours_ahead: int = 4) -> List[Dict[str, Any]]:
    """
    Returns all high-impact events scheduled within the next `hours_ahead` hours.
    Useful for dashboard display and Qwen's macro context injection.
    """
    events = _refresh_macro_calendar()
    now_utc = datetime.now(timezone.utc)
    upcoming = []

    for ev in events:
        date_str = ev.get("date")
        if not date_str:
            continue
        try:
            event_dt = datetime.fromisoformat(date_str).astimezone(timezone.utc)
            delta_mins = (event_dt - now_utc).total_seconds() / 60
            if 0 <= delta_mins <= hours_ahead * 60:
                upcoming.append({
                    "currency": ev.get("country", ""),
                    "title": ev.get("title", ""),
                    "minutes_until": int(delta_mins),
                    "impact": ev.get("impact", "High")
                })
        except Exception:
            continue

    return sorted(upcoming, key=lambda x: x["minutes_until"])
