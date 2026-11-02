"""
alifcrptoai - Zero-Cost Live Crypto News & Red-Folder Macro Engine
Author & Developer: Alifu Haji (Individual Developer)

Integrates:
1. CryptoCompare News API (Cached per coin, 10 min TTL)
2. ForexFactory High-Impact USD Economic Calendar (Cached 6 hours TTL)
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

NEWS_CACHE_TTL = 600   # 10 minutes in seconds
MACRO_CACHE_TTL = 21600 # 6 hours in seconds


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
    """Fetches high-impact economic calendar events from ForexFactory JSON feed."""
    now = time.time()
    if now - _MACRO_CACHE["timestamp"] < MACRO_CACHE_TTL and _MACRO_CACHE["events"]:
        return _MACRO_CACHE["events"]

    url = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
    headers = {"User-Agent": "Mozilla/5.0 alifcrptoai-macro-shield"}

    try:
        response = requests.get(url, headers=headers, timeout=7)
        if response.status_code == 200:
            data = response.json()
            high_impact_usd: List[Dict[str, Any]] = []
            for ev in data:
                # Filter for High Impact USD events (CPI, FOMC, NFP, GDP, Fed Chair Powell, etc.)
                if ev.get("country") == "USD" and ev.get("impact") == "High":
                    high_impact_usd.append(ev)

            _MACRO_CACHE["timestamp"] = now
            _MACRO_CACHE["events"] = high_impact_usd
            return high_impact_usd
    except Exception as exc:
        print(f"[news_macro] Warning: Failed to refresh macro calendar: {exc}")

    return _MACRO_CACHE.get("events", [])


def check_usd_macro_blackout() -> Dict[str, Any]:
    """
    Checks if current UTC time is within 30 minutes before or 15 minutes after
    any High-Impact USD economic event (CPI, FOMC, NFP, GDP, Powell).
    Returns:
        {
            "macro_blackout": bool,
            "active_or_upcoming_event": str | None,
            "minutes_to_event": int | None
        }
    """
    events = _refresh_macro_calendar()
    now_utc = datetime.now(timezone.utc)

    for ev in events:
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
                title = ev.get("title", "USD High-Impact Release")
                return {
                    "macro_blackout": True,
                    "active_or_upcoming_event": f"USD High Impact: {title}",
                    "minutes_to_event": delta_mins
                }
        except Exception:
            continue

    return {
        "macro_blackout": False,
        "active_or_upcoming_event": None,
        "minutes_to_event": None
    }
