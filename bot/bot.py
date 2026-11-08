"""
alifcrptoai - Master Autonomous Derivatives Execution, Risk & Self-Learning Engine
Author & Developer: Alifu Haji (Individual Developer)

Architecture:
1. Dynamic Configuration Sync (Supabase bot_config with runtime overrides)
2. Emergency Panic Flatten Handler
3. Account Telemetry Sync (Equity, Free Margin, Open Positions)
4. Institutional Trade Management (+1.0R BE & 50% TP, Zombie Time-Stop, Autopsies)
5. Multi-Strategy Scanner with HTF Confirmation & Macro Shield
6. Deterministic DeepSeek AI Risk Audit (Clamped Discrete Rubric)
7. Correlation & Directional Exposure Protection
8. Native Server-Side Binance Orders (Limit Maker, STOP_MARKET, TAKE_PROFIT_MARKET)
9. Statistical Self-Optimizer & Guardrail Rule Generator
"""

import os
import sys
import json
import re
import time
import math
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

import ccxt
import pandas as pd
import numpy as np
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from dotenv import load_dotenv
from openai import OpenAI
from supabase import create_client, Client

class BotHealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "application/json")
        self.end_headers()
        payload = json.dumps({
            "status": "ONLINE",
            "service": "alifcrptoai-bot",
            "author": "Alifu Haji",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }).encode("utf-8")
        self.wfile.write(payload)

    def log_message(self, format, *args):
        pass  # Suppress health-check polling noise in logs

def start_health_server(port: int = 80):
    """Starts a lightweight daemon HTTP health server on port 80 for CapRover swarm health checks."""
    try:
        server = HTTPServer(("0.0.0.0", port), BotHealthHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        print(f"[bot] CapRover Swarm Health server active on port {port}")
    except Exception as exc:
        print(f"[bot] Note: Health server port {port} unavailable ({exc}); continuing worker loop.")

from strategies import (
    evaluate_enabled_strategies,
    calc_indicators,
    calc_top_down_structure,
    detect_liquidity_pools,
    round_price_dynamic,
    format_price_dynamic
)
from forex_guard import (
    is_forex_symbol,
    is_forex_market_open,
    is_daily_rollover_blackout,
    get_forex_session_regime,
    get_forex_pip_size,
    calculate_pip_distance,
    calculate_forex_position_size,
)
from news_macro import check_usd_macro_blackout, fetch_crypto_headlines, _refresh_macro_calendar
from notifier import (
    send_telegram_alert,
    notify_trade_opened,
    notify_breakeven_partial,
    notify_scaled_exit,
    notify_trade_closed,
    notify_strategy_quarantined,
    notify_panic_activated
)
from concurrent.futures import ThreadPoolExecutor, as_completed
from prompts import (
    GEMINI_CHARTIST_SYSTEM_PROMPT,
    QWEN_QUANT_MACRO_SYSTEM_PROMPT,
    DEEPSEEK_CHIEF_JUDGE_SYSTEM_PROMPT,
    DEEPSEEK_AUTOPSY_SYSTEM_PROMPT,
    SYSTEM_AUDIT_PROMPT,
    AUTOPSY_PROMPT,
)

# Load local environment if available
load_dotenv()

# --- INITIALIZATION & CLIENT FACTORIES ---

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("[bot] Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured in env.")


def get_supabase_client() -> Client:
    """Creates authenticated Supabase client using Service Role key for backend privileges."""
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


# Institutional Correlated Pairs for SMT Divergence Triangulation
CORRELATED_PAIR_MAP = {
    "EUR/USD": "GBP/USD",
    "GBP/USD": "EUR/USD",
    "XAU/USD": "XAG/USD",
    "XAG/USD": "XAU/USD",
    "BTC/USDT": "ETH/USDT",
    "ETH/USDT": "BTC/USDT",
}

# Cached exchange clients to preserve pre-loaded markets across loops
_EXCHANGE_CLIENT: Optional[ccxt.binanceusdm] = None
_EXCHANGE_CONFIG_SIG: Optional[str] = None
_BYBIT_CLIENT: Optional[ccxt.bybit] = None
_BYBIT_CONFIG_SIG: Optional[str] = None

# In-memory TTL cache for 1H, 4H, and 1D OHLCV candles to prevent CCXT exchange rate limiting (P2 FIX)
_HTF_CANDLE_CACHE: Dict[str, Dict[str, Any]] = {}
# In-memory cache for 15m OHLCV DataFrames for cross-pair SMT evaluation
_LTF_15M_CACHE: Dict[str, pd.DataFrame] = {}
# In-memory cache for Open Interest (P5 FIX)
_OPEN_INTEREST_CACHE: Dict[str, Dict[str, Any]] = {}
# Global tracking for peak equity and daily drawdown halt (P1 & P13 FIX)
_PEAK_EQUITY: float = 0.0
_DAILY_HALT_DATE: Optional[str] = None


def get_cached_ohlcv(exchange: Any, ex_sym: str, timeframe: str, limit: int = 60, ttl_sec: int = 600) -> Optional[List[Any]]:
    """
    Fetches OHLCV bars with in-memory TTL caching:
    - 1H bars cached for 10 minutes (600s).
    - 4H bars cached for 30 minutes (1800s).
    - 1D bars cached for 60 minutes (3600s) (P2 FIX).
    """
    if not exchange or not ex_sym:
        return None
    cache_key = f"{getattr(exchange, 'id', 'ex')}:{ex_sym}:{timeframe}"
    now = time.time()

    if cache_key in _HTF_CANDLE_CACHE:
        entry = _HTF_CANDLE_CACHE[cache_key]
        if (now - entry["timestamp"]) < ttl_sec and len(entry["data"]) >= (limit // 2):
            return entry["data"]

    try:
        data = exchange.fetch_ohlcv(ex_sym, timeframe=timeframe, limit=limit)
        if data and len(data) > 0:
            _HTF_CANDLE_CACHE[cache_key] = {
                "timestamp": now,
                "data": data
            }
            return data
    except Exception as exc:
        if cache_key in _HTF_CANDLE_CACHE:
            return _HTF_CANDLE_CACHE[cache_key]["data"]
        return None

    return None


def get_cached_open_interest(exchange: Any, ex_sym: str, ttl_sec: int = 180) -> Dict[str, Any]:
    """
    Fetches Binance USDT-M / Bybit Open Interest with 3-minute in-memory caching (P5 FIX).
    Returns {"open_interest": float | None, "open_interest_usd": float | None}
    """
    if not exchange or not ex_sym:
        return {"open_interest": None, "open_interest_usd": None}
    cache_key = f"{getattr(exchange, 'id', 'ex')}:{ex_sym}:oi"
    now = time.time()

    if cache_key in _OPEN_INTEREST_CACHE:
        entry = _OPEN_INTEREST_CACHE[cache_key]
        if (now - entry["timestamp"]) < ttl_sec:
            return entry["data"]

    result: Dict[str, Any] = {"open_interest": None, "open_interest_usd": None}
    try:
        if hasattr(exchange, "fetch_open_interest"):
            oi_raw = exchange.fetch_open_interest(ex_sym)
            if oi_raw:
                amount = float(oi_raw.get("openInterestAmount") or oi_raw.get("openInterest") or 0.0)
                val_usd = float(oi_raw.get("openInterestValue") or 0.0)
                result = {
                    "open_interest": amount if amount > 0 else None,
                    "open_interest_usd": val_usd if val_usd > 0 else None
                }
        elif hasattr(exchange, "fetch_open_interest_history"):
            hist = exchange.fetch_open_interest_history(ex_sym, limit=2)
            if hist:
                last_oi = hist[-1]
                val = float(last_oi.get("openInterest") or last_oi.get("openInterestValue") or 0.0)
                result = {"open_interest": val if val > 0 else None, "open_interest_usd": None}
    except Exception:
        pass

    _OPEN_INTEREST_CACHE[cache_key] = {"timestamp": now, "data": result}
    return result


def resolve_exchange_symbol(exchange: Any, symbol: str) -> str:
    """
    Translates a canonical pair (e.g. 'BTC/USDT' or 'EUR/USD') to CCXT's exchange-specific market symbol.
    For Binance USDT-M Perpetuals: 'BTC/USDT:USDT'.
    For Bybit V5 Unified / Forex: preserves 'EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD'
    or resolves to exchange market mapping.
    Auto-corrects crypto typos (e.g. 'SUI/USD' -> 'SUI/USDT' or 'INJ/USDTT' -> 'INJ/USDT').
    """
    if not symbol:
        return symbol
    clean = str(symbol).strip().upper()

    # Preserve Forex & Commodity CFD symbols (do NOT convert to /USDT)
    if is_forex_symbol(clean):
        # Direct mapping for Bybit V5 Linear FX, Gold, and Silver perpetuals
        if exchange and "bybit" in getattr(exchange, "id", "").lower():
            bybit_fx_map = {
                "XAU/USD": "XAU/USDT:USDT",
                "XAUUSD": "XAU/USDT:USDT",
                "GOLD": "XAU/USDT:USDT",
                "XAU/USDT": "XAU/USDT:USDT",
                "XAG/USD": "XAG/USDT:USDT",
                "XAGUSD": "XAG/USDT:USDT",
                "SILVER": "XAG/USDT:USDT",
                "XAG/USDT": "XAG/USDT:USDT",
                "EUR/USD": "EURUSD/USDT:USDT",
                "EURUSD": "EURUSD/USDT:USDT",
                "EUR/USDT": "EURUSD/USDT:USDT",
                "GBP/USD": "GBPUSD/USDT:USDT",
                "GBPUSD": "GBPUSD/USDT:USDT",
                "GBP/USDT": "GBPUSD/USDT:USDT",
                "USD/JPY": "USDJPY/USDT:USDT",
                "USDJPY": "USDJPY/USDT:USDT",
                "USD/JPY:USDT": "USDJPY/USDT:USDT",
                "USDBRL/USD": "USDBRL/USDT:USDT",
                "USDBRL": "USDBRL/USDT:USDT",
                "PAXG/USD": "PAXG/USDT:USDT",
                "PAXG/USDT": "PAXG/USDT:USDT",
                "XAUT/USD": "XAUT/USDT:USDT",
                "XAUT/USDT": "XAUT/USDT:USDT",
            }
            if clean in bybit_fx_map:
                target = bybit_fx_map[clean]
                if hasattr(exchange, "markets") and exchange.markets:
                    if target in exchange.markets:
                        return target
                    # Try fallback key variants in CCXT's market dictionary
                    for alt in (
                        target.split(":")[0],
                        target.replace("/USDT:USDT", "USDT"),
                        target.replace("/USDT:USDT", "/USDT"),
                        clean
                    ):
                        if alt in exchange.markets:
                            return alt
                return target

        try:
            if exchange and hasattr(exchange, "markets") and exchange.markets:
                if clean in exchange.markets:
                    return clean

                # Dynamic candidate checks for Bybit linear
                base = clean.split("/")[0] if "/" in clean else clean
                raw_base = base.replace("USD", "").replace("USDT", "") or base
                candidates = [
                    f"{base}/USDT:USDT",
                    f"{raw_base}/USDT:USDT",
                    f"{base}/USDT",
                    f"{raw_base}/USDT",
                    f"{clean}:USDT",
                    f"{base}USDT",
                    f"{raw_base}USDT"
                ]
                for c in candidates:
                    if c in exchange.markets:
                        return c

                # Look up by market ID or base ID in markets
                raw_clean = clean.replace("/", "").replace(":", "")
                for m_sym, m_data in exchange.markets.items():
                    m_id = str(m_data.get("id", "")).upper()
                    m_base = str(m_data.get("base", "")).upper()
                    if m_id in (raw_clean, f"{raw_clean}USDT", f"{base}USDT", f"{raw_base}USDT") or m_base in (base, raw_base):
                        return m_sym
        except Exception:
            pass
        return clean

    # Crypto self-healing typo correction (e.g. 'SUI/USD' -> 'SUI/USDT', 'INJ/USDTT' -> 'INJ/USDT')
    if "/" in clean:
        base, quote = clean.split("/", 1)
        if quote in ("USD", "USDTT", "UDST", "USTD"):
            clean = f"{base}/USDT"
    elif not "/" in clean and not ":" in clean:
        if clean.endswith("USDTT"):
            clean = f"{clean[:-5]}/USDT"
        elif clean.endswith("USDT"):
            clean = f"{clean[:-4]}/USDT"
        elif clean.endswith("USD"):
            clean = f"{clean[:-3]}/USDT"
        else:
            clean = f"{clean}/USDT"

    # If it already includes the settle colon (e.g. BTC/USDT:USDT), return as-is
    if ":" in clean:
        return clean

    # If markets are loaded in exchange, check against exchange.markets
    try:
        if exchange and hasattr(exchange, "markets") and exchange.markets:
            if clean in exchange.markets:
                return clean
            # Check linear settle candidate: e.g. BTC/USDT -> BTC/USDT:USDT
            if "/" in clean:
                quote = clean.split("/")[1]
                candidate = f"{clean}:{quote}"
                if candidate in exchange.markets:
                    return candidate
            # Check market id (e.g. BTCUSDT)
            raw_id = clean.replace("/", "")
            for m_sym, m_data in exchange.markets.items():
                if m_data.get("id") == raw_id:
                    return m_sym
    except Exception:
        pass

    # Standard default for Binance USDT-M futures: append :USDT
    if "/" in clean and clean.endswith("/USDT"):
        return f"{clean}:USDT"
    elif "/" in clean:
        quote = clean.split("/")[1]
        return f"{clean}:{quote}"

    return clean


def to_canonical_symbol(symbol: str) -> str:
    """
    Translates CCXT exchange market symbols (e.g. 'BTC/USDT:USDT' or 'BTCUSDT' or 'XAU/USDT:USDT')
    back to the canonical dashboard format 'BTC/USDT', 'EUR/USD', 'XAU/USD'.
    """
    if not symbol:
        return symbol
    clean = str(symbol).strip().upper()
    if clean in ("XAU/USDT:USDT", "XAU/USDT", "XAUUSDT"):
        return "XAU/USD"
    if clean in ("XAG/USDT:USDT", "XAG/USDT", "XAGUSDT"):
        return "XAG/USD"
    if clean in ("EURUSD/USDT:USDT", "EURUSD/USDT", "EURUSDUSDT"):
        return "EUR/USD"
    if clean in ("GBPUSD/USDT:USDT", "GBPUSD/USDT", "GBPUSDUSDT"):
        return "GBP/USD"
    if clean in ("USDJPY/USDT:USDT", "USDJPY/USDT", "USDJPYUSDT"):
        return "USD/JPY"
    if ":" in clean:
        return clean.split(":")[0]
    return clean


def get_binance_client(cfg: Dict[str, Any]) -> ccxt.binanceusdm:
    """
    Initializes Binance USDT-M Futures client with API key overrides from bot_config.
    Connects to live market data streams without testnet URL deprecation issues.
    Caches the client instance to preserve loaded markets and avoid per-loop re-instantiation overhead.
    """
    global _EXCHANGE_CLIENT, _EXCHANGE_CONFIG_SIG

    api_key = cfg.get("binance_api_key_override") or os.getenv("BINANCE_API_KEY", "")
    secret = cfg.get("binance_secret_override") or os.getenv("BINANCE_API_SECRET", "")
    config_sig = f"{api_key}:{secret}"

    if _EXCHANGE_CLIENT is not None and _EXCHANGE_CONFIG_SIG == config_sig:
        return _EXCHANGE_CLIENT

    exchange = ccxt.binanceusdm({
        "apiKey": api_key,
        "secret": secret,
        "enableRateLimit": True,
        "options": {
            "defaultType": "future",
            "adjustForTimeDifference": True,
        }
    })

    try:
        exchange.load_markets()
    except Exception as e:
        print(f"[binance] Notice during load_markets: {e}")

    _EXCHANGE_CLIENT = exchange
    _EXCHANGE_CONFIG_SIG = config_sig
    return exchange


def get_bybit_client(cfg: Dict[str, Any]) -> ccxt.bybit:
    """
    Initializes Bybit V5 Unified Trading Account (UTA) client with API key overrides.
    Caches the client instance to preserve loaded markets and avoid per-loop re-instantiation.
    """
    global _BYBIT_CLIENT, _BYBIT_CONFIG_SIG

    api_key = cfg.get("bybit_api_key_override") or os.getenv("BYBIT_API_KEY", "")
    secret = cfg.get("bybit_secret_override") or os.getenv("BYBIT_API_SECRET", "")
    config_sig = f"{api_key}:{secret}"

    if _BYBIT_CLIENT is not None and _BYBIT_CONFIG_SIG == config_sig:
        return _BYBIT_CLIENT

    exchange = ccxt.bybit({
        "apiKey": api_key,
        "secret": secret,
        "enableRateLimit": True,
        "options": {
            "defaultType": "swap",       # V5 Unified Derivatives / Linear
            "adjustForTimeDifference": True,
            "recvWindow": 10000,
        }
    })

    try:
        exchange.load_markets()
    except Exception as e:
        print(f"[bybit] Notice during load_markets: {e}")

    _BYBIT_CLIENT = exchange
    _BYBIT_CONFIG_SIG = config_sig
    return exchange


def get_ai_client(provider: str, cfg: Dict[str, Any]) -> Tuple[OpenAI, str]:
    """
    Returns an OpenAI-compatible client configured for the selected provider:
    - 'openai':   OpenAI official API (e.g. gpt-4o-mini, gpt-4o)
    - 'grok'/'xai': xAI official API (e.g. grok-beta, grok-2-latest)
    - 'gemini':   Google Gemini official OpenAI-compatible endpoint
    - 'qwen':     Alibaba DashScope OpenAI-compatible endpoint
    - 'deepseek': DeepSeek official API (default)
    along with the resolved model name.
    """
    prov = str(provider).strip().lower()
    if prov == "openai":
        openai_key = cfg.get("openai_api_key_override") or os.getenv("OPENAI_API_KEY", "")
        openai_base_url = cfg.get("openai_base_url") or os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
        openai_model = cfg.get("openai_model") or os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        client = OpenAI(
            api_key=openai_key or "sk-dummy-openai-key",
            base_url=openai_base_url
        )
        return client, openai_model
    elif prov in ["grok", "xai"]:
        grok_key = cfg.get("grok_api_key_override") or os.getenv("GROK_API_KEY") or os.getenv("XAI_API_KEY", "")
        grok_base_url = cfg.get("grok_base_url") or os.getenv("GROK_BASE_URL", "https://api.x.ai/v1")
        grok_model = cfg.get("grok_model") or os.getenv("GROK_MODEL", "grok-beta")
        client = OpenAI(
            api_key=grok_key or "xai-dummy-grok-key",
            base_url=grok_base_url
        )
        return client, grok_model
    elif prov == "gemini":
        gemini_key = cfg.get("gemini_api_key_override") or os.getenv("GEMINI_API_KEY", "")
        gemini_model = cfg.get("gemini_model") or os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
        # Auto-upgrade deprecated / retired model identifiers
        if gemini_model in ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-3.1-flash-lite"]:
            gemini_model = "gemini-3.5-flash"
        client = OpenAI(
            api_key=gemini_key or "dummy-gemini-key",
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
        )
        return client, gemini_model
    elif prov == "qwen":
        qwen_key = cfg.get("qwen_api_key_override") or os.getenv("QWEN_API_KEY", "")
        qwen_base_url = cfg.get("qwen_base_url") or os.getenv("QWEN_BASE_URL", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1")
        qwen_model = cfg.get("qwen_model") or os.getenv("QWEN_MODEL", "qwen3.7-flash")
        client = OpenAI(
            api_key=qwen_key or "sk-dummy-qwen-key",
            base_url=qwen_base_url
        )
        return client, qwen_model
    else:
        api_key = cfg.get("deepseek_key_override") or os.getenv("DEEPSEEK_API_KEY", "")
        base_url = cfg.get("deepseek_base_url") or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
        deepseek_model = cfg.get("deepseek_model") or os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
        client = OpenAI(
            api_key=api_key or "sk-dummy-key",
            base_url=base_url
        )
        return client, deepseek_model


def get_deepseek_client(cfg: Dict[str, Any]) -> OpenAI:
    """
    Backwards-compatible wrapper returning the primary OpenAI client.
    """
    client, _ = get_ai_client("deepseek", cfg)
    return client


def execute_ai_completion(
    cfg: Dict[str, Any], 
    system_prompt: str, 
    user_prompt: str, 
    max_tokens: int = 700
) -> Tuple[str, str]:
    """
    Dispatches chat completion respecting cfg['ai_provider']:
    - 'deepseek': Routes strictly to DeepSeek
    - 'gemini':   Routes strictly to Google Gemini (Free Tier)
    - 'auto':     Hybrid Mode: Tries DeepSeek first; if DeepSeek fails with 402 Insufficient Balance
                  or connection error, automatically falls back to Gemini free tier!
    Returns (raw_content_string, model_name_used).
    """
    provider = str(cfg.get("ai_provider", "deepseek")).strip().lower()

    if provider == "gemini":
        client, model = get_ai_client("gemini", cfg)
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,
                max_tokens=max_tokens
            )
            return (resp.choices[0].message.content or "{}"), model
        except Exception as e:
            if ("404" in str(e) or "not found" in str(e).lower() or "no longer available" in str(e).lower()) and model != "gemini-3.5-flash":
                print(f"[ai_router] Gemini model '{model}' unavailable ({e}). Retrying with 'gemini-3.5-flash'...")
                resp = client.chat.completions.create(
                    model="gemini-3.5-flash",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    temperature=0.1,
                    max_tokens=max_tokens
                )
                return (resp.choices[0].message.content or "{}"), "gemini-3.5-flash"
            raise e

    elif provider == "auto":
        # Hybrid Auto-Fallback Mode: DeepSeek primary -> Gemini backup
        primary_client, primary_model = get_ai_client("deepseek", cfg)
        try:
            resp = primary_client.chat.completions.create(
                model=primary_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,
                max_tokens=max_tokens
            )
            return (resp.choices[0].message.content or "{}"), primary_model
        except Exception as ds_err:
            print(f"[ai_router] DeepSeek error ({ds_err}). Auto-falling back to Google Gemini free tier...")
            gemini_client, gemini_model = get_ai_client("gemini", cfg)
            try:
                resp = gemini_client.chat.completions.create(
                    model=gemini_model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    temperature=0.1,
                    max_tokens=max_tokens
                )
                return (resp.choices[0].message.content or "{}"), gemini_model
            except Exception as gem_err:
                if ("404" in str(gem_err) or "not found" in str(gem_err).lower() or "no longer available" in str(gem_err).lower()) and gemini_model != "gemini-3.5-flash":
                    print(f"[ai_router] Gemini fallback model '{gemini_model}' retired. Retrying with 'gemini-3.5-flash'...")
                    resp = gemini_client.chat.completions.create(
                        model="gemini-3.5-flash",
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        temperature=0.1,
                        max_tokens=max_tokens
                    )
                    return (resp.choices[0].message.content or "{}"), "gemini-3.5-flash"
                raise gem_err

    elif provider == "openai":
        client, model = get_ai_client("openai", cfg)
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.1,
            max_tokens=max_tokens
        )
        return (resp.choices[0].message.content or "{}"), model

    elif provider in ["grok", "xai"]:
        client, model = get_ai_client("grok", cfg)
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.1,
            max_tokens=max_tokens
        )
        return (resp.choices[0].message.content or "{}"), model

    elif provider == "qwen":
        client, model = get_ai_client("qwen", cfg)
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.1,
            max_tokens=max_tokens
        )
        return (resp.choices[0].message.content or "{}"), model

    else:
        # Default: deepseek
        client, model = get_ai_client("deepseek", cfg)
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.1,
            max_tokens=max_tokens
        )
        return (resp.choices[0].message.content or "{}"), model


# --- CONFIGURATION LAYER ---

def fetch_bot_config(supabase: Client) -> Dict[str, Any]:
    """Fetches the singleton configuration row (id = 1) from bot_config."""
    try:
        res = supabase.table("bot_config").select("*").eq("id", 1).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]
    except Exception as exc:
        print(f"[bot] Error reading bot_config: {exc}")

    # Fallback default configuration
    return {
        "id": 1,
        "is_active": False,
        "sandbox_mode": True,
        "auto_apply_lessons": False,
        "symbols": ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
        "active_strategies": [
            "SMC_Liquidity_Sweep",
            "ICT_OrderBlock_FVG",
            "Supertrend_ADX_Momentum",
            "EMA_Trend_Pullback",
            "BB_Volatility_Breakout",
            "RSI_Divergence_Reversal",
            "Asian_Judas_Swing",
            "SMT_Divergence"
        ],
        "timeframe": "15m",
        "risk_pct": 0.01,
        "min_score": 75,
        "min_rvol": 1.0,
        "daily_loss_limit_pct": 2.5,        # P1 FIX: Daily drawdown circuit breaker threshold (-2.5%)
        "enable_breakeven_partial": True,
        "max_directional_exposure_pct": 0.015,
        "max_hold_bars": 20,
        "use_limit_maker_entry": True,
        "max_funding_rate_pct": 0.05,
        "telegram_notifications": True,
        "blocked_utc_hours": [],
        "quarantined_symbols": [],
        "deepseek_model": "deepseek-chat",
        "deepseek_base_url": "https://api.deepseek.com",
        "ai_provider": "council_3model",
        "gemini_api_key_override": None,
        "gemini_model": "gemini-3.5-flash",
        "qwen_api_key_override": None,
        "qwen_base_url": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        "qwen_model": "qwen3.7-flash",
        "openai_api_key_override": None,
        "openai_model": "gpt-4o-mini",
        "openai_base_url": "https://api.openai.com/v1",
        "grok_api_key_override": None,
        "grok_model": "grok-beta",
        "grok_base_url": "https://api.x.ai/v1",
        "council_chartist_provider": "openai",
        "council_quant_provider": "grok",
        "exchange_mode": "binance",
        "bybit_api_key_override": None,
        "bybit_secret_override": None,
        "enable_forex_trading": True,
        "forex_symbols": ["EUR/USD", "GBP/USD", "USD/JPY", "XAU/USD", "XAG/USD"],
        "forex_max_leverage": 30,
        "forex_weekend_shield": True,
        "forex_rollover_shield": True,
        "forex_max_spread_pips": 3.5,
        "panic_close_target": "ALL",
        "panic_close_all": False
    }


def update_bot_config(supabase: Client, updates: Dict[str, Any]) -> None:
    """Updates the singleton configuration row in bot_config."""
    try:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        supabase.table("bot_config").update(updates).eq("id", 1).execute()
    except Exception as exc:
        print(f"[bot] Error updating bot_config: {exc}")


# --- EMERGENCY PANIC FLATTEN HANDLER ---

def handle_panic_close_all(
    supabase: Client,
    binance_client: ccxt.binanceusdm,
    bybit_client: Optional[ccxt.bybit],
    cfg: Dict[str, Any]
) -> None:
    """
    Emergency Circuit Breaker:
    Supports granular target panic flattening: 'ALL', 'CRYPTO' (Binance), or 'FOREX' (Bybit).
    Cancels open orders, closes active positions at Market, updates Supabase,
    deactivates the bot, and fires an alert.
    """
    target = str(cfg.get("panic_close_target", "ALL")).upper()
    print(f"[PANIC] !!! INITIATING EMERGENCY PANIC FLATTEN (Target: {target}) !!!")
    notify_panic_activated(cfg, f"Emergency Panic Flatten Triggered (Target: {target})")

    now_str = datetime.now(timezone.utc).isoformat()

    try:
        # A. Flatten Binance (Crypto)
        if target in ("ALL", "CRYPTO") and binance_client:
            print("[PANIC] Flattening Binance USD-M Orders & Positions...")
            for sym in cfg.get("symbols", []):
                try:
                    ex_sym = resolve_exchange_symbol(binance_client, sym)
                    binance_client.cancel_all_orders(ex_sym)
                except Exception as e:
                    print(f"[PANIC] Binance cancel order error for {sym}: {e}")

            try:
                positions = binance_client.fetch_positions()
                for pos in positions:
                    contracts = float(pos.get("contracts", 0.0) or 0.0)
                    if contracts > 0:
                        sym = pos.get("symbol")
                        pos_side = pos.get("side", "").upper()
                        close_side = "sell" if pos_side == "LONG" else "buy"
                        print(f"[PANIC] Closing Binance {pos_side} position on {sym} ({contracts} contracts)")
                        binance_client.create_market_order(
                            sym, close_side, contracts, params={"reduceOnly": True}
                        )
            except Exception as e:
                print(f"[PANIC] Binance position close error: {e}")

            try:
                supabase.table("trade_executions").update({
                    "status": "MANUAL_CLOSE",
                    "closed_at": now_str
                }).eq("status", "OPEN").eq("exchange", "binance").execute()
            except Exception as e:
                print(f"[PANIC] Supabase Binance trade update error: {e}")

        # B. Flatten Bybit (Forex / CFDs)
        if target in ("ALL", "FOREX") and bybit_client:
            print("[PANIC] Flattening Bybit V5 Forex Orders & Positions...")
            for sym in cfg.get("forex_symbols", []):
                try:
                    ex_sym = resolve_exchange_symbol(bybit_client, sym)
                    bybit_client.cancel_all_orders(ex_sym)
                except Exception as e:
                    print(f"[PANIC] Bybit cancel order error for {sym}: {e}")

            try:
                positions = bybit_client.fetch_positions()
                for pos in positions:
                    contracts = float(pos.get("contracts", 0.0) or 0.0)
                    if contracts > 0:
                        sym = pos.get("symbol")
                        pos_side = pos.get("side", "").upper()
                        close_side = "sell" if pos_side == "LONG" else "buy"
                        print(f"[PANIC] Closing Bybit {pos_side} position on {sym} ({contracts} contracts)")
                        bybit_client.create_market_order(
                            sym, close_side, contracts, params={"reduceOnly": True}
                        )
            except Exception as e:
                print(f"[PANIC] Bybit position close error: {e}")

            try:
                supabase.table("trade_executions").update({
                    "status": "MANUAL_CLOSE",
                    "closed_at": now_str
                }).eq("status", "OPEN").eq("exchange", "bybit").execute()
            except Exception as e:
                print(f"[PANIC] Supabase Bybit trade update error: {e}")

        # If ALL, ensure any remaining OPEN trades are marked MANUAL_CLOSE
        if target == "ALL":
            try:
                supabase.table("trade_executions").update({
                    "status": "MANUAL_CLOSE",
                    "closed_at": now_str
                }).eq("status", "OPEN").execute()
            except Exception as e:
                print(f"[PANIC] Supabase open trades cleanup notice: {e}")

    finally:
        update_bot_config(supabase, {
            "is_active": False,
            "panic_close_all": False
        })
        print(f"[PANIC] Panic routine finished (Target: {target}). Bot deactivated safely.")


# --- ACCOUNT TELEMETRY SYNC ---

def sync_account_telemetry(
    supabase: Client,
    binance_client: ccxt.binanceusdm,
    bybit_client: Optional[ccxt.bybit],
    cfg: Dict[str, Any]
) -> Dict[str, float]:
    """
    Synchronizes wallet equity, free margin, intraday PnL, and open positions
    across Binance and Bybit into account_snapshots table.
    """
    equity = 0.0
    free_margin = 0.0
    daily_pnl = 0.0
    daily_pnl_pct = 0.0
    active_positions_json: List[Dict[str, Any]] = []

    sandbox = cfg.get("sandbox_mode", True)
    mode = str(cfg.get("exchange_mode", "binance")).lower()

    # 1. Binance Telemetry
    if mode in ("binance", "dual") and binance_client:
        try:
            if not sandbox and binance_client.apiKey and binance_client.secret:
                balance = binance_client.fetch_balance()
                usdt_info = balance.get("USDT", {})
                raw_total = usdt_info.get("total")
                raw_free = usdt_info.get("free")
                equity += float(raw_total) if raw_total is not None else 0.0
                free_margin += float(raw_free) if raw_free is not None else 0.0

                positions = binance_client.fetch_positions()
                for p in positions:
                    contracts = float(p.get("contracts", 0.0) or 0.0)
                    if contracts > 0:
                        raw_sym = p.get("symbol", "")
                        active_positions_json.append({
                            "symbol": to_canonical_symbol(raw_sym),
                            "side": p.get("side"),
                            "size": contracts,
                            "entry_price": float(p.get("entryPrice", 0.0) or 0.0),
                            "mark_price": float(p.get("markPrice", 0.0) or 0.0),
                            "unrealized_pnl": float(p.get("unrealizedPnl", 0.0) or 0.0),
                            "leverage": p.get("leverage"),
                            "exchange": "binance",
                            "asset_class": "crypto"
                        })
        except Exception as exc:
            print(f"[telemetry] Binance sync notice: {exc}")

    # 2. Bybit Telemetry
    if mode in ("bybit", "dual") and bybit_client:
        try:
            if not sandbox and bybit_client.apiKey and bybit_client.secret:
                b_bal = bybit_client.fetch_balance()
                b_usdt = b_bal.get("USDT", {}) or b_bal.get("total", {})
                b_total = b_usdt.get("total") if isinstance(b_usdt, dict) else None
                b_free = b_usdt.get("free") if isinstance(b_usdt, dict) else None
                if b_total is not None:
                    equity += float(b_total)
                if b_free is not None:
                    free_margin += float(b_free)

                b_positions = bybit_client.fetch_positions()
                for p in b_positions:
                    contracts = float(p.get("contracts", 0.0) or 0.0)
                    if contracts > 0:
                        raw_sym = p.get("symbol", "")
                        is_fx = is_forex_symbol(raw_sym)
                        active_positions_json.append({
                            "symbol": to_canonical_symbol(raw_sym),
                            "side": p.get("side"),
                            "size": contracts,
                            "entry_price": float(p.get("entryPrice", 0.0) or 0.0),
                            "mark_price": float(p.get("markPrice", 0.0) or 0.0),
                            "unrealized_pnl": float(p.get("unrealizedPnl", 0.0) or 0.0),
                            "leverage": p.get("leverage"),
                            "exchange": "bybit",
                            "asset_class": "commodity" if ("XAU" in raw_sym or "XAG" in raw_sym) else ("forex" if is_fx else "crypto")
                        })
        except Exception as exc:
            print(f"[telemetry] Bybit sync notice: {exc}")

    # Calculate daily PnL from trades closed today (if table exists)
    try:
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        res = supabase.table("trade_executions").select("pnl_usdt").gte("closed_at", today_start).execute()
        if res.data:
            daily_pnl = sum([float(t.get("pnl_usdt") or 0.0) for t in res.data])
            if equity > 0:
                daily_pnl_pct = round((daily_pnl / equity) * 100.0, 2)
    except Exception:
        pass

    # Track Peak Equity and Equity Drawdown (P13 FIX)
    global _PEAK_EQUITY
    if equity > _PEAK_EQUITY:
        _PEAK_EQUITY = equity

    drawdown_from_peak_pct = 0.0
    if _PEAK_EQUITY > 0 and equity > 0:
        drawdown_from_peak_pct = round(((_PEAK_EQUITY - equity) / _PEAK_EQUITY) * 100.0, 2)

    # Insert snapshot
    try:
        supabase.table("account_snapshots").insert({
            "equity_usdt": round(equity, 2),
            "free_usdt": round(free_margin, 2),
            "daily_pnl_usdt": round(daily_pnl, 2),
            "daily_pnl_pct": round(daily_pnl_pct, 2),
            "open_positions": active_positions_json
        }).execute()
    except Exception as exc:
        print(f"[telemetry] Snapshot insert notice: {exc}")

    return {
        "equity": equity,
        "free_margin": free_margin,
        "daily_pnl_pct": daily_pnl_pct,
        "daily_pnl_usdt": daily_pnl,
        "drawdown_from_peak_pct": drawdown_from_peak_pct
    }


# --- DETERMINISTIC AI AUDIT VERIFICATION & RESILIENT JSON PARSER ---

def parse_ai_json(raw_text: str) -> Dict[str, Any]:
    """
    Resiliently cleans and extracts a JSON payload from AI model responses.
    Handles markdown code blocks (```json ... ```), raw strings, and third-party
    free proxy wrappers (e.g. beatapi.io, OpenRouter) using regex stripping.
    """
    if not raw_text:
        return {}

    text = raw_text.strip()

    # 1. Strip leading/trailing markdown code fences using multi-line regex
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.MULTILINE).strip()

    # 2. Try parsing direct cleaned text
    try:
        return json.loads(cleaned)
    except Exception:
        pass

    # 3. Secondary extraction: find outermost JSON object {...}
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group(0))
        except Exception:
            pass

    # 4. Fallback to basic cleaner
    return extract_json_safely(raw_text)


def extract_json_safely(text: str) -> Dict[str, Any]:
    """Cleans markdown code blocks and extracts parsed JSON payload."""
    clean = text.strip()
    if clean.startswith("```json"):
        clean = clean[7:]
    elif clean.startswith("```"):
        clean = clean[3:]
    if clean.endswith("```"):
        clean = clean[:-3]
    clean = clean.strip()
    return json.loads(clean)


def verify_and_score_audit(raw_audit: Dict[str, Any]) -> Tuple[int, bool, Optional[str], Dict[str, Any]]:
    """
    Enforces deterministic validation and clamping of DeepSeek's audit JSON.
    Guarantees:
    - Veto trigger integrity
    - Allowed discrete integer sets for sub-scores:
      * htf_regime: {0, 12, 25}
      * ltf_location: {0, 12, 25}
      * momentum_volume: {0, 7, 15}
      * news_catalyst: {0, 10, 20}
      * intermarket_tide: {0, 7, 15}
    - Total score is mathematically the exact sum of clamped sub-scores.
    """
    veto = bool(raw_audit.get("veto_triggered", False))
    veto_reason = raw_audit.get("veto_reason")

    if veto:
        return 0, True, veto_reason or "Binary Kill-Switch Veto Triggered", raw_audit.get("rubric_breakdown", {})

    breakdown = raw_audit.get("rubric_breakdown", {})

    # Discrete clamping helper
    def clamp_discrete(val: Any, allowed: List[int], default: int) -> int:
        try:
            val_int = int(val)
            if val_int in allowed:
                return val_int
            # Snap to closest allowed integer
            return min(allowed, key=lambda x: abs(x - val_int))
        except (ValueError, TypeError):
            return default

    # 1. HTF Regime: {0, 12, 25}
    htf_item = breakdown.get("htf_regime", {})
    htf_score = clamp_discrete(htf_item.get("score"), [0, 12, 25], 0)
    htf_item["score"] = htf_score

    # 2. LTF Location: {0, 12, 25}
    ltf_item = breakdown.get("ltf_location", {})
    ltf_score = clamp_discrete(ltf_item.get("score"), [0, 12, 25], 0)
    ltf_item["score"] = ltf_score

    # 3. Momentum Volume: {0, 7, 15}
    mom_item = breakdown.get("momentum_volume", {})
    mom_score = clamp_discrete(mom_item.get("score"), [0, 7, 15], 0)
    mom_item["score"] = mom_score

    # 4. News Catalyst: {0, 10, 20}
    news_item = breakdown.get("news_catalyst", {})
    news_score = clamp_discrete(news_item.get("score"), [0, 10, 20], 10)
    news_item["score"] = news_score

    # 5. Intermarket Tide: {0, 7, 15}
    tide_item = breakdown.get("intermarket_tide", {})
    tide_score = clamp_discrete(tide_item.get("score"), [0, 7, 15], 0)
    tide_item["score"] = tide_score

    total_clamped = htf_score + ltf_score + mom_score + news_score + tide_score
    return total_clamped, False, None, breakdown


def verify_and_score_council(
    gemini_rep: Dict[str, Any],
    qwen_rep: Dict[str, Any],
    deepseek_rep: Dict[str, Any]
) -> Tuple[int, bool, Optional[str], Dict[str, Any], Dict[str, int]]:
    """
    Synthesizes and validates the 3-Model AI Council consensus score:
    - Gemini Chartist:
      * htf_regime: clamped {0, 10, 20}
      * ltf_location: clamped {0, 10, 20}
      * chart_veto: bool
      Max Gemini Score: 40 points
    - Qwen Quant & Macro:
      * momentum_volume: clamped {0, 5, 10}
      * news_catalyst: clamped {0, 5, 10}
      * intermarket_tide: clamped {0, 5, 10}
      * macro_or_funding_veto: bool
      Max Qwen Score: 30 points
    - DeepSeek Chief Risk Officer:
      * risk_audit: clamped {0, 15, 30}
      * kill_switch: { macro_blackout, specialist_conflict, insufficient_rr, lesson_violation, veto_triggered, veto_reason }
      Max DeepSeek Score: 30 points
    - Total Consensus Score: 0 to 100 points
    """
    def clamp_discrete(val: Any, allowed: List[int], default: int) -> int:
        try:
            val_int = int(val)
            if val_int in allowed:
                return val_int
            return min(allowed, key=lambda x: abs(x - val_int))
        except (ValueError, TypeError):
            return default

    # Check for hard vetoes across all 3 models
    gemini_veto = bool(gemini_rep.get("chart_veto", False))
    qwen_veto = bool(qwen_rep.get("macro_or_funding_veto", False))
    ds_kill = deepseek_rep.get("kill_switch", {}) if isinstance(deepseek_rep.get("kill_switch"), dict) else {}
    ds_veto = bool(ds_kill.get("veto_triggered", False)) or bool(deepseek_rep.get("veto_triggered", False))

    veto_reason = None
    if gemini_veto:
        veto_reason = f"Chartist Veto: {gemini_rep.get('chart_verdict', 'Opposing market structure wall')}"
    elif qwen_veto:
        veto_reason = f"Quant/Macro Veto: {qwen_rep.get('quant_summary', 'Macro blackout or funding crowding')}"
    elif ds_veto:
        veto_reason = ds_kill.get("veto_reason") or deepseek_rep.get("veto_reason") or "DeepSeek Chief Judge Veto Triggered"

    # Clamping Chartist / Gemini Scores (Max 40)
    htf_score = clamp_discrete(gemini_rep.get("htf_regime", {}).get("score"), [0, 10, 20], 10)
    ltf_score = clamp_discrete(gemini_rep.get("ltf_location", {}).get("score"), [0, 10, 20], 10)
    gemini_total = htf_score + ltf_score

    # Clamping Quant / Qwen Scores (Max 30)
    mom_score = clamp_discrete(qwen_rep.get("momentum_volume", {}).get("score"), [0, 5, 10], 5)
    news_score = clamp_discrete(qwen_rep.get("news_catalyst", {}).get("score"), [0, 5, 10], 5)
    tide_score = clamp_discrete(qwen_rep.get("intermarket_tide", {}).get("score"), [0, 5, 10], 5)
    qwen_total = mom_score + news_score + tide_score

    # Clamping DeepSeek Risk Score (Max 30)
    risk_item = deepseek_rep.get("risk_audit", {}) if isinstance(deepseek_rep.get("risk_audit"), dict) else {}
    risk_score = clamp_discrete(risk_item.get("score"), [0, 15, 30], 15)
    deepseek_total = risk_score

    total_score = gemini_total + qwen_total + deepseek_total
    is_veto = gemini_veto or qwen_veto or ds_veto

    if is_veto:
        total_score = 0

    rubric_breakdown = {
        "htf_regime": {
            "score": htf_score,
            "max": 20,
            "flaw_or_deduction": gemini_rep.get("htf_regime", {}).get("flaw_or_deduction", "Structure evaluated")
        },
        "ltf_location": {
            "score": ltf_score,
            "max": 20,
            "flaw_or_deduction": gemini_rep.get("ltf_location", {}).get("flaw_or_deduction", "Location evaluated")
        },
        "momentum_volume": {
            "score": mom_score,
            "max": 10,
            "flaw_or_deduction": qwen_rep.get("momentum_volume", {}).get("flaw_or_deduction", "Volume evaluated")
        },
        "news_catalyst": {
            "score": news_score,
            "max": 10,
            "flaw_or_deduction": qwen_rep.get("news_catalyst", {}).get("flaw_or_deduction", "Catalyst evaluated")
        },
        "intermarket_tide": {
            "score": tide_score,
            "max": 10,
            "flaw_or_deduction": qwen_rep.get("intermarket_tide", {}).get("flaw_or_deduction", "Intermarket evaluated")
        },
        "risk_execution": {
            "score": risk_score,
            "max": 30,
            "flaw_or_deduction": risk_item.get("flaw_or_deduction", "Risk verified")
        }
    }

    council_scores = {
        "chartist": gemini_total,
        "quant": qwen_total,
        "deepseek": deepseek_total,
        "gemini": gemini_total,
        "qwen": qwen_total,
        "total": total_score
    }

    return total_score, is_veto, veto_reason, rubric_breakdown, council_scores


def execute_council_audit(
    cfg: Dict[str, Any],
    candidate_setup: Dict[str, Any],
    top_down_context: Dict[str, Any],
    market_snapshot: Dict[str, Any],
    headlines: List[Dict[str, Any]],
    lessons_block: str,
    macro_status: Dict[str, Any],
    session_info: Optional[Dict[str, Any]]
) -> Tuple[int, bool, Optional[str], Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, int], str]:
    """
    Executes the Pluggable 3-Model AI Council consensus audit:
    - Stage 1: Parallel dispatch to Chartist Engine (OpenAI or Gemini, 40 pts) 
               & Quant/Macro Engine (Grok or Qwen, 30 pts) via ThreadPoolExecutor.
    - Stage 2: DeepSeek Chief Risk Officer (30 pts) synthesizes both specialist reports, runs adversarial debate,
               enforces kill-switches, and computes final consensus.
    Returns:
    (total_score, veto_triggered, veto_reason, rubric_breakdown, chartist_rep, quant_rep, deepseek_rep, council_scores, primary_model)
    """
    symbol = candidate_setup["symbol"]
    side = candidate_setup["side"]
    strat_name = candidate_setup["strategy_name"]

    # Resolve Pluggable Providers with Auto-Fallback
    chartist_prov = str(cfg.get("council_chartist_provider") or "openai").strip().lower()
    has_openai_key = bool(cfg.get("openai_api_key_override") or os.getenv("OPENAI_API_KEY"))
    has_gemini_key = bool(cfg.get("gemini_api_key_override") or os.getenv("GEMINI_API_KEY"))
    if chartist_prov == "openai" and not has_openai_key and has_gemini_key:
        chartist_prov = "gemini"
    elif chartist_prov == "gemini" and not has_gemini_key and has_openai_key:
        chartist_prov = "openai"

    quant_prov = str(cfg.get("council_quant_provider") or "grok").strip().lower()
    has_grok_key = bool(cfg.get("grok_api_key_override") or os.getenv("GROK_API_KEY") or os.getenv("XAI_API_KEY"))
    has_qwen_key = bool(cfg.get("qwen_api_key_override") or os.getenv("QWEN_API_KEY"))
    if quant_prov in ["grok", "xai"] and not has_grok_key and has_qwen_key:
        quant_prov = "qwen"
    elif quant_prov == "qwen" and not has_qwen_key and has_grok_key:
        quant_prov = "grok"

    # 1. Chartist Payload (OpenAI or Gemini)
    def _run_chartist() -> Tuple[Dict[str, Any], str]:
        chartist_user_payload = {
            "symbol": symbol,
            "direction": side,
            "strategy_name": strat_name,
            "entry_price": candidate_setup["entry"],
            "stop_loss": candidate_setup["sl"],
            "take_profit": candidate_setup["tp"],
            "reward_risk_ratio": candidate_setup["rr"],
            "top_down_market_structure": {
                "daily_1d_macro_bias": top_down_context.get("daily_1d", {}).get("bias"),
                "daily_1d_range_high": top_down_context.get("daily_1d", {}).get("range_high"),
                "daily_1d_range_low": top_down_context.get("daily_1d", {}).get("range_low"),
                "daily_1d_ema_50": top_down_context.get("daily_1d", {}).get("ema_50"),
                "daily_1d_key_support": top_down_context.get("daily_1d", {}).get("key_support"),
                "daily_1d_key_resistance": top_down_context.get("daily_1d", {}).get("key_resistance"),
                "4h_macro_bias": top_down_context.get("htf_4h", {}).get("bias"),
                "1h_dealing_zone": top_down_context.get("itf_1h", {}).get("zone"),
                "1h_depth_pct": top_down_context.get("itf_1h", {}).get("range_depth_pct"),
                "1h_equilibrium": top_down_context.get("itf_1h", {}).get("equilibrium"),
                "is_ote_fib": top_down_context.get("itf_1h", {}).get("is_ote"),
            },
            "institutional_benchmarks": {
                "asian_range": top_down_context.get("asian_range"),
                "daily_benchmarks": top_down_context.get("daily_benchmarks"),
            },
            "local_liquidity_pools_15m": top_down_context.get("ltf_15m"),
            "setup_notes": candidate_setup.get("setup_notes")
        }
        
        # Try primary chosen chartist provider
        try:
            content, model = execute_ai_completion(
                {**cfg, "ai_provider": chartist_prov},
                system_prompt=GEMINI_CHARTIST_SYSTEM_PROMPT,
                user_prompt=json.dumps(chartist_user_payload, indent=2),
                max_tokens=600
            )
            return parse_ai_json(content), model
        except Exception as e:
            print(f"[council] Primary Chartist ({chartist_prov}) warning: {e}")
            # Try alternate provider if configured
            alt_prov = "gemini" if chartist_prov == "openai" else "openai"
            alt_key = (cfg.get("gemini_api_key_override") or os.getenv("GEMINI_API_KEY")) if alt_prov == "gemini" else (cfg.get("openai_api_key_override") or os.getenv("OPENAI_API_KEY"))
            if alt_key:
                try:
                    print(f"[council] Auto-falling back to alternate Chartist ({alt_prov})...")
                    content, model = execute_ai_completion(
                        {**cfg, "ai_provider": alt_prov},
                        system_prompt=GEMINI_CHARTIST_SYSTEM_PROMPT,
                        user_prompt=json.dumps(chartist_user_payload, indent=2),
                        max_tokens=600
                    )
                    return parse_ai_json(content), f"{model} (alt-fallback)"
                except Exception as alt_err:
                    print(f"[council] Alternate Chartist ({alt_prov}) error: {alt_err}")
            
            return {
                "htf_bias": "RANGING",
                "htf_regime": {"flaw_or_deduction": f"Chartist fallback: {e}", "score": 10},
                "ltf_location": {"flaw_or_deduction": "Default location score", "score": 10},
                "chart_veto": False,
                "chart_verdict": f"Chartist connection fallback: {e}"
            }, f"{chartist_prov}-fallback"

    # 2. Quant & Macro Payload (Grok or Qwen)
    def _run_quant() -> Tuple[Dict[str, Any], str]:
        has_quant_key = bool(has_grok_key or has_qwen_key)
        if not has_quant_key:
            # Deterministic fallback when neither Grok nor Qwen API key is configured
            rvol = float(market_snapshot.get("rvol", 1.0) or 1.0)
            funding = float(market_snapshot.get("funding_rate", 0.0) or 0.0)
            is_blackout = bool(macro_status.get("in_blackout", False)) if isinstance(macro_status, dict) else False
            mom_pts = 10 if rvol >= 1.4 else (5 if rvol >= 1.0 else 0)
            news_pts = 0 if is_blackout else (10 if headlines else 5)
            tide_pts = 10 if "ALIGNED" in str(market_snapshot.get("htf_status", "")) else 5
            return {
                "momentum_volume": {
                    "flaw_or_deduction": f"RVOL {rvol:.2f}x with funding {funding:.4f}%",
                    "score": mom_pts
                },
                "news_catalyst": {
                    "flaw_or_deduction": "ForexFactory macro window clear" if not is_blackout else "Macro blackout active",
                    "score": news_pts
                },
                "intermarket_tide": {
                    "flaw_or_deduction": f"Session {session_info.get('session_name') if session_info else 'Crypto'} flow",
                    "score": tide_pts
                },
                "macro_or_funding_veto": is_blackout,
                "quant_summary": "Deterministic quantitative metrics applied (Quant API key unconfigured)."
            }, "deterministic-quant-fallback"

        quant_user_payload = {
            "symbol": symbol,
            "direction": side,
            "strategy_name": strat_name,
            "relative_volume_rvol": market_snapshot.get("rvol", 1.0),
            "atr": market_snapshot.get("atr"),
            "funding_rate_pct": market_snapshot.get("funding_rate", 0.0),
            "open_interest": market_snapshot.get("open_interest"),
            "open_interest_usd": market_snapshot.get("open_interest_usd"),
            "broker_spread_pips": market_snapshot.get("spread_pips"),
            "active_session": session_info.get("session_name") if session_info else "24/7 Crypto Market",
            "forex_factory_macro_blackout": macro_status,
            "latest_headlines": headlines[:5] if headlines else [],
            "cross_pair_smt_divergence": top_down_context.get("smt_divergence", {}).get("description", "None"),
            "benchmark_context": market_snapshot.get("htf_status")
        }

        # Try primary chosen quant provider (Grok or Qwen)
        try:
            content, model = execute_ai_completion(
                {**cfg, "ai_provider": quant_prov},
                system_prompt=QWEN_QUANT_MACRO_SYSTEM_PROMPT,
                user_prompt=json.dumps(quant_user_payload, indent=2),
                max_tokens=600
            )
            return parse_ai_json(content), model
        except Exception as e:
            print(f"[council] Primary Quant ({quant_prov}) warning: {e}")
            # Try alternate provider if configured
            alt_prov = "qwen" if quant_prov in ["grok", "xai"] else "grok"
            alt_key = (cfg.get("qwen_api_key_override") or os.getenv("QWEN_API_KEY")) if alt_prov == "qwen" else (cfg.get("grok_api_key_override") or os.getenv("GROK_API_KEY") or os.getenv("XAI_API_KEY"))
            if alt_key:
                try:
                    print(f"[council] Auto-falling back to alternate Quant ({alt_prov})...")
                    content, model = execute_ai_completion(
                        {**cfg, "ai_provider": alt_prov},
                        system_prompt=QWEN_QUANT_MACRO_SYSTEM_PROMPT,
                        user_prompt=json.dumps(quant_user_payload, indent=2),
                        max_tokens=600
                    )
                    return parse_ai_json(content), f"{model} (alt-fallback)"
                except Exception as alt_err:
                    print(f"[council] Alternate Quant ({alt_prov}) error: {alt_err}")

            return {
                "momentum_volume": {"flaw_or_deduction": f"Quant fallback: {e}", "score": 5},
                "news_catalyst": {"flaw_or_deduction": "Default neutral news", "score": 5},
                "intermarket_tide": {"flaw_or_deduction": "Default neutral tide", "score": 5},
                "macro_or_funding_veto": False,
                "quant_summary": f"Quant connection fallback: {e}"
            }, f"{quant_prov}-fallback"

    # Parallel Stage 1 Execution
    print(f"[council] 🏛️ Stage 1: Parallel dispatch to Chartist ({chartist_prov.upper()}, 40 pts) & Quant ({quant_prov.upper()}, 30 pts) for {symbol} {side}...")
    with ThreadPoolExecutor(max_workers=2) as executor:
        future_chart = executor.submit(_run_chartist)
        future_quant = executor.submit(_run_quant)
        chartist_rep, chartist_model = future_chart.result(timeout=16)
        quant_rep, quant_model = future_quant.result(timeout=16)

    # Stage 2 Execution: DeepSeek Chief Risk Officer & Final Rubric Judge
    print(f"[council] ⚖️ Stage 2: DeepSeek Chief Risk Officer auditing Chartist ({chartist_prov}) & Quant ({quant_prov}) reports with adversarial debate...")
    deepseek_user_payload = {
        "candidate_setup": {
            "symbol": symbol,
            "direction": side,
            "strategy_name": strat_name,
            "entry_price": candidate_setup["entry"],
            "stop_loss": candidate_setup["sl"],
            "take_profit": candidate_setup["tp"],
            "reward_risk_ratio": candidate_setup["rr"],
            "setup_notes": candidate_setup.get("setup_notes")
        },
        "specialist_reports": {
            "chartist_report": chartist_rep,
            "quant_macro_report": quant_rep,
            "gemini_chartist_report": chartist_rep,
            "qwen_quant_macro_report": quant_rep
        },
        "active_bot_lessons": lessons_block
    }

    try:
        ds_content, ds_model = execute_ai_completion(
            {**cfg, "ai_provider": "deepseek"},
            system_prompt=DEEPSEEK_CHIEF_JUDGE_SYSTEM_PROMPT,
            user_prompt=json.dumps(deepseek_user_payload, indent=2),
            max_tokens=800
        )
        deepseek_rep = parse_ai_json(ds_content)
    except Exception as ds_err:
        print(f"[council] DeepSeek Chief Judge warning: {ds_err}")
        deepseek_rep = {
            "proposed_direction": side,
            "debate": {
                "bearish_devils_advocate": f"DeepSeek audit fallback: {ds_err}",
                "bullish_defense": f"Specialist signals approved by {chartist_prov} and {quant_prov}."
            },
            "kill_switch": {"veto_triggered": False, "veto_reason": None},
            "risk_audit": {"flaw_or_deduction": "Default risk audit score due to timeout", "score": 15},
            "executive_summary": "DeepSeek fallback audit completed."
        }
        ds_model = "deepseek-fallback"

    # Consensus Synthesis
    total_score, veto_triggered, veto_reason, rubric, council_scores = verify_and_score_council(
        chartist_rep, quant_rep, deepseek_rep
    )

    primary_model = f"Council (Chartist:{chartist_prov}:{chartist_model} + Quant:{quant_prov}:{quant_model} + Judge:DeepSeek:{ds_model})"

    return total_score, veto_triggered, veto_reason, rubric, chartist_rep, quant_rep, deepseek_rep, council_scores, primary_model


# --- CORRELATED EXPOSURE PROTECTION ---

def check_correlated_exposure(
    supabase: Client,
    proposed_symbol: str,
    proposed_side: str,
    proposed_risk_pct: float,
    max_exposure_pct: float
) -> bool:
    """
    Correlation & Beta-Stacking Lock (P9 FIX):
    1. Ensures total active un-hedged open risk (where breakeven_activated == False)
       in the same direction across the portfolio does not exceed max_directional_exposure_pct.
    2. Currency Component Correlation Check:
       - Prevents stacking identical USD-quote positions (e.g. EUR/USD Long + GBP/USD Long = 2x short USD).
       - Prevents stacking correlated twin assets (e.g. BTC + ETH simultaneously Long without BE).
    """
    try:
        res = supabase.table("trade_executions").select("symbol, side, initial_qty, entry_price, stop_loss, breakeven_activated").eq("status", "OPEN").execute()
        open_trades = res.data or []
        current_dir_risk = 0.0

        for t in open_trades:
            if t.get("side") == proposed_side and not t.get("breakeven_activated", False):
                current_dir_risk += 0.01

        if (current_dir_risk + proposed_risk_pct) > max_exposure_pct:
            print(f"[risk] Blocked entry on {proposed_symbol}: Directional exposure {current_dir_risk + proposed_risk_pct:.4f} > limit {max_exposure_pct:.4f}")
            return False

        # Currency & Twin-Asset correlation guard
        clean_prop = proposed_symbol.replace(":USDT", "").replace("/USDT", "").upper()
        for t in open_trades:
            if t.get("breakeven_activated", False):
                continue
            ex_sym = t.get("symbol", "").replace(":USDT", "").replace("/USDT", "").upper()
            ex_side = t.get("side")

            # Correlated pair check (e.g. EUR/USD vs GBP/USD, XAU/USD vs XAG/USD, BTC vs ETH)
            corr_target = CORRELATED_PAIR_MAP.get(clean_prop) or CORRELATED_PAIR_MAP.get(proposed_symbol)
            if corr_target and (ex_sym == corr_target or t.get("symbol") == corr_target):
                if ex_side == proposed_side:
                    print(f"[risk] Blocked entry on {proposed_symbol} {proposed_side}: Correlated twin {t.get('symbol')} is already active {ex_side} without Breakeven lock.")
                    return False

            # Forex USD-quote stacking check (e.g. EUR/USD + GBP/USD in same direction)
            if is_forex_symbol(proposed_symbol) and is_forex_symbol(t.get("symbol", "")):
                if clean_prop.endswith("/USD") and ex_sym.endswith("/USD") and ex_side == proposed_side:
                    print(f"[risk] Blocked entry on {proposed_symbol}: Redundant USD-quote stacking with active {t.get('symbol')} {ex_side}.")
                    return False
    except Exception as exc:
        print(f"[risk] Exposure check warning: {exc}")

    return True


# --- INSTITUTIONAL TRADE MANAGEMENT ---

def run_trade_autopsy(supabase: Client, deepseek_client: OpenAI, cfg: Dict[str, Any], trade: Dict[str, Any]) -> None:
    """
    Triggers DeepSeek Post-Mortem Autopsy for a losing trade (CLOSED_SL),
    records the root cause in trade_autopsies, and injects a new lesson in bot_lessons.
    P12 FIX: Injects trading session and UTC hour into autopsy diagnosis and lesson guardrails.
    """
    session_tag = trade.get("forex_session") or "Continuous_Crypto"
    hour_tag = trade.get("entry_session_utc")
    print(f"[autopsy] Conducting forensic autopsy on trade #{trade['id']} ({trade['symbol']}, session: {session_tag}, hour: {hour_tag} UTC)...")
    payload = {
        "symbol": trade.get("symbol"),
        "strategy_name": trade.get("strategy_name"),
        "side": trade.get("side"),
        "trading_session": session_tag,
        "entry_session_utc": hour_tag,
        "entry_price": trade.get("entry_price"),
        "exit_price": trade.get("exit_price"),
        "stop_loss": trade.get("stop_loss"),
        "take_profit": trade.get("take_profit"),
        "pnl_usdt": trade.get("pnl_usdt"),
        "pnl_r": trade.get("pnl_r"),
        "mfe_r": trade.get("mfe_r"),
        "mae_r": trade.get("mae_r"),
        "entry_scores": trade.get("entry_scores")
    }

    try:
        # Fetch initial Council audit to provide DeepSeek with Gemini and Qwen context
        audit_res = (
            supabase.table("ai_audit_logs")
            .select("gemini_report, qwen_report, deepseek_report, council_scores")
            .eq("symbol", trade.get("symbol"))
            .order("created_at", ascending=False)
            .limit(1)
            .execute()
        )
        if audit_res.data and len(audit_res.data) > 0:
            payload["gemini_chart_report"] = audit_res.data[0].get("gemini_report", {})
            payload["qwen_quant_report"] = audit_res.data[0].get("qwen_report", {})
            payload["initial_council_scores"] = audit_res.data[0].get("council_scores", {})
    except Exception:
        pass

    try:
        content, model_used = execute_ai_completion(
            cfg,
            system_prompt=AUTOPSY_PROMPT,
            user_prompt=f"Analyze this closed loss trade:\n{json.dumps(payload, indent=2)}",
            max_tokens=600
        )
        autopsy_data = parse_ai_json(content)

        # 1. Insert into trade_autopsies (P12 FIX: includes session tag and hour in root cause)
        supabase.table("trade_autopsies").insert({
            "trade_id": trade["id"],
            "symbol": trade["symbol"],
            "strategy_name": trade["strategy_name"],
            "outcome": "LOSS",
            "ai_model": model_used,
            "failure_category": autopsy_data.get("failure_category", "premature_entry_before_sweep"),
            "root_cause_analysis": f"[{session_tag} @ {hour_tag}:00 UTC] " + str(autopsy_data.get("root_cause_analysis", "Liquidity sweep was shallow.")),
            "recommended_rule_adjustment": autopsy_data.get("recommended_rule_adjustment", "Enforce higher RVOL.")
        }).execute()

        # 2. Insert into bot_lessons (PENDING approval unless auto_apply is enabled)
        initial_status = "ACTIVE" if cfg.get("auto_apply_lessons", False) else "PENDING"
        supabase.table("bot_lessons").insert({
            "symbol": trade["symbol"],
            "strategy_name": trade["strategy_name"],
            "weakness_detected": f"[{session_tag}] " + str(autopsy_data.get("failure_category", "Risk weakness")),
            "prompt_guardrail_rule": autopsy_data.get("prompt_guardrail_rule", "Require clean displacement."),
            "suggested_param_key": autopsy_data.get("suggested_param_key", "min_rvol"),
            "suggested_param_value": autopsy_data.get("suggested_param_value", 1.4),
            "win_rate_impact": autopsy_data.get("win_rate_impact", "+3-5% expected win rate"),
            "status": initial_status
        }).execute()

        # Mark autopsy completed
        supabase.table("trade_executions").update({"autopsy_completed": True}).eq("id", trade["id"]).execute()

        # Dispatch Telegram notification
        notify_trade_closed(cfg, trade, autopsy=autopsy_data)
        print(f"[autopsy] Successfully recorded session-tagged autopsy & lesson for trade #{trade['id']}.")

    except Exception as exc:
        print(f"[autopsy] Error executing autopsy: {exc}")


def manage_open_positions(
    supabase: Client,
    binance_client: ccxt.binanceusdm,
    bybit_client: Optional[ccxt.bybit],
    deepseek_client: OpenAI,
    cfg: Dict[str, Any]
) -> None:
    """
    Monitors active positions across Binance and Bybit, updates MFE/MAE,
    executes +1.0R Break-Even & 50% Partial TP, enforces Zombie Trade Time-Stop,
    detects stop/target hits, and computes pip PnL for Forex/Commodities.
    """
    try:
        res = supabase.table("trade_executions").select("*").eq("status", "OPEN").execute()
        open_trades = res.data or []
        if not open_trades:
            return

        for t in open_trades:
            trade_id = t["id"]
            symbol = t["symbol"]
            trade_exchange = t.get("exchange", "binance").lower()
            exchange = bybit_client if trade_exchange == "bybit" and bybit_client else binance_client
            if not exchange:
                continue

            ex_sym = resolve_exchange_symbol(exchange, symbol)
            side = t["side"]
            entry = float(t["entry_price"])
            sl = float(t["stop_loss"])
            tp = float(t["take_profit"])
            qty = float(t["qty"])
            breakeven_activated = bool(t.get("breakeven_activated", False))
            opened_at_str = t.get("opened_at")
            is_sim = bool(t.get("is_simulated", False)) or str(t.get("exchange_order_id", "")).startswith("ANALYTICS_") or str(t.get("exchange_order_id", "")).startswith("sim_")

            # Fetch current ticker
            try:
                ticker = exchange.fetch_ticker(ex_sym)
                current_price = float(ticker.get("last", entry))
            except Exception:
                current_price = entry

            # Calculate R-Multiple
            if side == "LONG":
                risk_dist = max(entry - sl, 1e-6)
                curr_r = (current_price - entry) / risk_dist
            else:
                risk_dist = max(sl - entry, 1e-6)
                curr_r = (entry - current_price) / risk_dist

            # Update MFE / MAE
            new_mfe = max(float(t.get("mfe_r", 0.0) or 0.0), curr_r)
            new_mae = min(float(t.get("mae_r", 0.0) or 0.0), curr_r)

            # --- BANKER'S SCALED EXITS (1.5R BE -> 3.0R PARTIAL -> 15M FRACTAL TRAIL) ---
            initial_qty = float(t.get("initial_qty") or qty)
            be_threshold = float(cfg.get("breakeven_trigger_r", 1.5))
            is_fx = is_forex_symbol(symbol)
            pip_sz = get_forex_pip_size(symbol) if is_fx else 0.0001

            # Step 1: Target 1 (+1.5R Milestone) -> Bank 40% Partial & Move SL to BE + Spread Buffer
            if (curr_r >= be_threshold and 
                cfg.get("enable_breakeven_partial", True) and 
                not breakeven_activated):

                partial_qty = round(qty * 0.40, 2 if is_fx else (4 if qty < 10.0 else 2))
                new_remaining_qty = round(qty - partial_qty, 2 if is_fx else (4 if qty < 10.0 else 2))
                
                if is_fx:
                    be_sl_price = round_price_dynamic(entry + 2.0 * pip_sz) if side == "LONG" else round_price_dynamic(entry - 2.0 * pip_sz)
                else:
                    be_sl_price = round_price_dynamic(entry * 1.0015) if side == "LONG" else round_price_dynamic(entry * 0.9985)
                
                new_sl_id = f"sim_be_sl_{int(time.time())}" if is_sim else None

                if not is_sim:
                    print(f"[trade_mgmt] 🏛️ Banker's Step 1: +{be_threshold}R reached for {symbol} trade #{trade_id} ({trade_exchange}). Banking 40% partial TP and moving SL to BE+Spread ({be_sl_price})!")
                    close_side = "sell" if side == "LONG" else "buy"
                    try:
                        exchange.create_market_order(
                            ex_sym,
                            close_side,
                            partial_qty,
                            params={"reduceOnly": True}
                        )
                    except Exception as e:
                        print(f"[trade_mgmt] Partial market order warning: {e}")

                    old_sl_id = t.get("sl_order_id")
                    if old_sl_id:
                        try:
                            exchange.cancel_order(old_sl_id, ex_sym)
                        except Exception as e:
                            print(f"[trade_mgmt] Cancel old SL warning: {e}")

                    try:
                        order_type = "STOP_MARKET" if trade_exchange == "binance" else "market"
                        new_sl_order = exchange.create_order(
                            symbol=ex_sym,
                            type=order_type,
                            side=close_side,
                            amount=new_remaining_qty,
                            params={
                                "stopPrice": be_sl_price,
                                "workingType": "MARK_PRICE",
                                "reduceOnly": True
                            }
                        )
                        new_sl_id = str(new_sl_order.get("id"))
                    except Exception as e:
                        print(f"[trade_mgmt] Place BE SL warning: {e}")
                else:
                    print(f"[trade_mgmt] (ANALYTICAL SIGNAL) 🏛️ Banker's Step 1: +{be_threshold}R reached for {symbol} trade #{trade_id}. Banking 40% partial profit lock & moving SL to BE+Spread at ${format_price_dynamic(be_sl_price)}!")

                # Update database record
                supabase.table("trade_executions").update({
                    "qty": new_remaining_qty,
                    "breakeven_activated": True,
                    "stop_loss": be_sl_price,
                    "sl_order_id": new_sl_id,
                    "mfe_r": round(new_mfe, 2),
                    "mae_r": round(new_mae, 2)
                }).eq("id", trade_id).execute()

                notify_scaled_exit(
                    cfg, t, "Target 1 (+1.5R Milestone)", current_price,
                    f"Banked 40% profit ({partial_qty} units). SL shifted to Risk-Free BE+Spread (${format_price_dynamic(be_sl_price)})."
                )
                continue

            # Step 2: Target 2 (+3.0R Expansion) -> Bank 30% Partial & Lock SL to +1.5R Profit
            if (curr_r >= 3.0 and 
                breakeven_activated and 
                qty > (initial_qty * 0.35)):

                partial_qty2 = round(initial_qty * 0.30, 2 if is_fx else (4 if qty < 10.0 else 2))
                runner_qty = round(qty - partial_qty2, 2 if is_fx else (4 if qty < 10.0 else 2))
                lock_sl_price = round_price_dynamic(entry + 1.5 * risk_dist) if side == "LONG" else round_price_dynamic(entry - 1.5 * risk_dist)
                new_sl_id2 = f"sim_lock_sl_{int(time.time())}" if is_sim else None

                if not is_sim:
                    print(f"[trade_mgmt] 🚀 Banker's Step 2: +3.0R Expansion reached for {symbol} trade #{trade_id}. Banking 30% partial and locking SL to +1.5R (${format_price_dynamic(lock_sl_price)})!")
                    close_side = "sell" if side == "LONG" else "buy"
                    try:
                        exchange.create_market_order(ex_sym, close_side, partial_qty2, params={"reduceOnly": True})
                    except Exception as e:
                        print(f"[trade_mgmt] Step 2 partial order warning: {e}")

                    old_sl_id = t.get("sl_order_id")
                    if old_sl_id:
                        try:
                            exchange.cancel_order(old_sl_id, ex_sym)
                        except Exception as e:
                            print(f"[trade_mgmt] Cancel old SL warning: {e}")

                    try:
                        order_type = "STOP_MARKET" if trade_exchange == "binance" else "market"
                        new_sl_order = exchange.create_order(
                            symbol=ex_sym,
                            type=order_type,
                            side=close_side,
                            amount=runner_qty,
                            params={
                                "stopPrice": lock_sl_price,
                                "workingType": "MARK_PRICE",
                                "reduceOnly": True
                            }
                        )
                        new_sl_id2 = str(new_sl_order.get("id"))
                    except Exception as e:
                        print(f"[trade_mgmt] Place Lock SL warning: {e}")
                else:
                    print(f"[trade_mgmt] (ANALYTICAL SIGNAL) 🚀 Banker's Step 2: +3.0R reached for {symbol} trade #{trade_id}. Banking 30% profit & locking SL to +1.5R at ${format_price_dynamic(lock_sl_price)}!")

                supabase.table("trade_executions").update({
                    "qty": runner_qty,
                    "stop_loss": lock_sl_price,
                    "sl_order_id": new_sl_id2,
                    "mfe_r": round(new_mfe, 2),
                    "mae_r": round(new_mae, 2)
                }).eq("id", trade_id).execute()

                notify_scaled_exit(
                    cfg, t, "Target 2 (+3.0R Expansion)", current_price,
                    f"Banked additional 30% profit. Remaining 30% runner Stop Loss locked at +1.5R (${format_price_dynamic(lock_sl_price)})."
                )
                continue

            # Step 3: Runner Trailing behind confirmed 15m Fractal Pivots
            if (breakeven_activated and 
                qty <= (initial_qty * 0.35) and 
                curr_r >= 3.2):

                cached_df = _LTF_15M_CACHE.get(symbol)
                if cached_df is not None and len(cached_df) >= 20:
                    try:
                        pivots = detect_fractal_pivots(cached_df, window=2)
                        if side == "LONG" and pivots.get("lows"):
                            recent_low = float(pivots["lows"][-1]["price"])
                            new_trail = round_price_dynamic(recent_low - 0.2 * risk_dist)
                            if new_trail > sl:
                                print(f"[trade_mgmt] 📈 Trailing runner SL for {symbol} LONG #{trade_id} up to 15m fractal pivot: ${format_price_dynamic(new_trail)}")
                                if not is_sim:
                                    old_sl_id = t.get("sl_order_id")
                                    if old_sl_id:
                                        try:
                                            exchange.cancel_order(old_sl_id, ex_sym)
                                        except Exception:
                                            pass
                                    close_side = "sell"
                                    order_type = "STOP_MARKET" if trade_exchange == "binance" else "market"
                                    new_sl_order = exchange.create_order(
                                        symbol=ex_sym,
                                        type=order_type,
                                        side=close_side,
                                        amount=qty,
                                        params={"stopPrice": new_trail, "workingType": "MARK_PRICE", "reduceOnly": True}
                                    )
                                    new_sl_id_trail = str(new_sl_order.get("id"))
                                else:
                                    new_sl_id_trail = f"sim_trail_{int(time.time())}"

                                supabase.table("trade_executions").update({
                                    "stop_loss": new_trail,
                                    "sl_order_id": new_sl_id_trail,
                                    "mfe_r": round(new_mfe, 2),
                                    "mae_r": round(new_mae, 2)
                                }).eq("id", trade_id).execute()
                        elif side == "SHORT" and pivots.get("highs"):
                            recent_high = float(pivots["highs"][-1]["price"])
                            new_trail = round_price_dynamic(recent_high + 0.2 * risk_dist)
                            if new_trail < sl:
                                print(f"[trade_mgmt] 📉 Trailing runner SL for {symbol} SHORT #{trade_id} down to 15m fractal pivot: ${format_price_dynamic(new_trail)}")
                                if not is_sim:
                                    old_sl_id = t.get("sl_order_id")
                                    if old_sl_id:
                                        try:
                                            exchange.cancel_order(old_sl_id, ex_sym)
                                        except Exception:
                                            pass
                                    close_side = "buy"
                                    order_type = "STOP_MARKET" if trade_exchange == "binance" else "market"
                                    new_sl_order = exchange.create_order(
                                        symbol=ex_sym,
                                        type=order_type,
                                        side=close_side,
                                        amount=qty,
                                        params={"stopPrice": new_trail, "workingType": "MARK_PRICE", "reduceOnly": True}
                                    )
                                    new_sl_id_trail = str(new_sl_order.get("id"))
                                else:
                                    new_sl_id_trail = f"sim_trail_{int(time.time())}"

                                supabase.table("trade_executions").update({
                                    "stop_loss": new_trail,
                                    "sl_order_id": new_sl_id_trail,
                                    "mfe_r": round(new_mfe, 2),
                                    "mae_r": round(new_mae, 2)
                                }).eq("id", trade_id).execute()
                    except Exception as trail_err:
                        print(f"[trade_mgmt] Trailing runner error: {trail_err}")

            # --- ZOMBIE TRADE TIME-STOP ---
            bars_elapsed = 0
            if opened_at_str:
                try:
                    opened_dt = datetime.fromisoformat(opened_at_str.replace("Z", "+00:00"))
                    seconds_open = (datetime.now(timezone.utc) - opened_dt).total_seconds()
                    bars_elapsed = int(seconds_open / 900) # 15-minute bars
                except Exception:
                    bars_elapsed = 0

            max_bars = cfg.get("max_hold_bars", 20)
            if bars_elapsed >= max_bars and curr_r < 0.5 and not breakeven_activated:
                close_side = "sell" if side == "LONG" else "buy"
                if not is_sim:
                    print(f"[trade_mgmt] Time-Stop triggered for {symbol} trade #{trade_id} ({bars_elapsed} bars >= {max_bars}). Closing at Market.")
                    try:
                        exchange.cancel_all_orders(ex_sym)
                        exchange.create_market_order(ex_sym, close_side, qty, params={"reduceOnly": True})
                    except Exception as e:
                        print(f"[trade_mgmt] Time stop execution warning: {e}")
                else:
                    print(f"[trade_mgmt] (ANALYTICAL SIGNAL) Time-Stop triggered for {symbol} trade #{trade_id} ({bars_elapsed} bars >= {max_bars}). Simulating close.")

                exit_price = current_price
                pnl_usdt = round((exit_price - entry) * qty if side == "LONG" else (entry - exit_price) * qty, 2)
                pnl_r = round(curr_r, 2)

                pnl_pips = None
                if is_forex_symbol(symbol):
                    pip_sz = get_forex_pip_size(symbol)
                    pnl_pips = round((exit_price - entry) / pip_sz if side == "LONG" else (entry - exit_price) / pip_sz, 1)

                t_updated = {
                    **t,
                    "status": "TIME_STOP",
                    "exit_price": exit_price,
                    "pnl_usdt": pnl_usdt,
                    "pnl_r": pnl_r,
                    "pnl_pips": pnl_pips,
                    "mfe_r": round(new_mfe, 2),
                    "mae_r": round(new_mae, 2),
                    "closed_at": datetime.now(timezone.utc).isoformat()
                }
                supabase.table("trade_executions").update(t_updated).eq("id", trade_id).execute()
                notify_trade_closed(cfg, t_updated)
                continue

            # --- CHECK SL / TP HIT ---
            hit_sl = (current_price <= sl) if side == "LONG" else (current_price >= sl)
            hit_tp = (current_price >= tp) if side == "LONG" else (current_price <= tp)

            if hit_sl or hit_tp:
                status = "CLOSED_TP" if hit_tp else "CLOSED_SL"
                exit_price = tp if hit_tp else sl
                pnl_usdt = round((exit_price - entry) * qty if side == "LONG" else (entry - exit_price) * qty, 2)
                pnl_r = round((exit_price - entry) / risk_dist if side == "LONG" else (entry - exit_price) / risk_dist, 2)

                pnl_pips = None
                if is_forex_symbol(symbol):
                    pip_sz = get_forex_pip_size(symbol)
                    pnl_pips = round((exit_price - entry) / pip_sz if side == "LONG" else (entry - exit_price) / pip_sz, 1)

                sim_tag = "(ANALYTICAL SIGNAL) " if is_sim else ""
                outcome_label = "WIN (WOULD HAVE WON)" if hit_tp else "LOSS (WOULD HAVE LOST)"
                pip_info = f", {pnl_pips:+.1f} pips" if pnl_pips is not None else ""
                print(f"[trade_mgmt] {sim_tag}Trade #{trade_id} on {symbol} closed: {status} ({outcome_label}) at price {format_price_dynamic(exit_price)} (PnL: {pnl_usdt:+.2f} USDT{pip_info}, {pnl_r:+.2f}R)")

                if not is_sim:
                    try:
                        exchange.cancel_all_orders(ex_sym)
                    except Exception:
                        pass

                t_closed = {
                    **t,
                    "status": status,
                    "exit_price": exit_price,
                    "pnl_usdt": pnl_usdt,
                    "pnl_r": pnl_r,
                    "pnl_pips": pnl_pips,
                    "mfe_r": round(new_mfe, 2),
                    "mae_r": round(new_mae, 2),
                    "closed_at": datetime.now(timezone.utc).isoformat()
                }
                supabase.table("trade_executions").update(t_closed).eq("id", trade_id).execute()

                if status == "CLOSED_SL" and pnl_r < 0:
                    run_trade_autopsy(supabase, deepseek_client, cfg, t_closed)
                else:
                    notify_trade_closed(cfg, t_closed)
                continue

            # Regular MFE/MAE update
            supabase.table("trade_executions").update({
                "mfe_r": round(new_mfe, 2),
                "mae_r": round(new_mae, 2)
            }).eq("id", trade_id).execute()

    except Exception as exc:
        if "PGRST205" not in str(exc):
            print(f"[trade_mgmt] Error managing open positions: {exc}")


# --- STATISTICAL SELF-OPTIMIZER ---

def run_statistical_optimizer(supabase: Client, cfg: Dict[str, Any]) -> None:
    """
    Evaluates rolling strategy performance from strategy_performance_view.
    - If auto_apply_lessons == True and strategy has >= 8 closed trades with profit_factor < 0.8:
      Pauses the strategy to prevent ongoing equity drawdowns and fires Telegram alert.
    - Enforces bounded safety rails (risk_pct <= 0.02, min_score between 70 and 95).
    """
    try:
        res = supabase.table("strategy_performance_view").select("*").execute()
        perf_data = res.data or []

        active_strats = list(cfg.get("active_strategies", []))
        quarantined = list(cfg.get("quarantined_symbols", []))
        modified = False

        for row in perf_data:
            strat_name = row.get("strategy_name")
            closed = int(row.get("closed_trades", 0) or 0)
            pf = float(row.get("profit_factor", 0.0) or 0.0)
            win_rate = float(row.get("win_rate_pct", 0.0) or 0.0)

            # Auto-quarantine condition
            if closed >= 8 and pf < 0.80 and strat_name in active_strats:
                if cfg.get("auto_apply_lessons", False):
                    print(f"[optimizer] Auto-Quarantining strategy {strat_name}: PF {pf:.2f} < 0.80 over {closed} trades")
                    active_strats.remove(strat_name)
                    modified = True
                    notify_strategy_quarantined(cfg, strat_name, win_rate, pf)

        if modified:
            update_bot_config(supabase, {
                "active_strategies": active_strats
            })

    except Exception as exc:
        if "PGRST205" not in str(exc):
            print(f"[optimizer] Optimization pass notice: {exc}")


# --- MARKET & MACRO NEWS SYNCHRONIZER ---

_LAST_NEWS_SYNC_TIME = 0.0

def sync_market_and_macro_news(supabase: Client, symbols: List[str]) -> None:
    """
    Saves the latest crypto headlines and upcoming high-impact economic calendar events
    into the Supabase `market_news` table for real-time dashboard visibility.
    Throttled to run at most once every 5 minutes.
    """
    global _LAST_NEWS_SYNC_TIME
    now = time.time()
    if now - _LAST_NEWS_SYNC_TIME < 300:
        return

    try:
        records: List[Dict[str, Any]] = []

        # 1. Macro Calendar Events from ForexFactory
        macro_events = _refresh_macro_calendar()
        for ev in macro_events[:12]:
            t = ev.get("title")
            if not t:
                continue
            date_str = ev.get("date")
            records.append({
                "title": f"USD High-Impact: {t}",
                "source": "ForexFactory Calendar",
                "url": "https://www.forexfactory.com/calendar",
                "coin": "USD",
                "category": "macro",
                "sentiment": "NEUTRAL",
                "impact": "HIGH",
                "published_at": date_str if date_str else datetime.now(timezone.utc).isoformat()
            })

        # 2. Crypto Headlines for configured symbols
        for sym in symbols[:5]:
            coin = sym.replace(":USDT", "").replace("/USDT", "").replace("-USDT", "").upper()
            hl = fetch_crypto_headlines(sym)
            for item in hl:
                title = item.get("title", "").strip()
                if not title:
                    continue
                records.append({
                    "title": title,
                    "source": item.get("source", "CryptoNews"),
                    "url": item.get("url", ""),
                    "coin": coin,
                    "category": "crypto",
                    "sentiment": "NEUTRAL",
                    "impact": "MEDIUM",
                    "published_at": datetime.now(timezone.utc).isoformat()
                })

        if records:
            supabase.table("market_news").upsert(records, on_conflict="title").execute()
            _LAST_NEWS_SYNC_TIME = now
            print(f"[news_sync] Synced {len(records)} market & macro news items to database.")
    except Exception as exc:
        # Gracefully continue if table does not exist or temporary DB notice
        print(f"[news_sync] Note: market_news database sync notice: {exc}")


# --- MULTI-STRATEGY SCANNER & EXECUTION ---

_SCAN_HEARTBEAT_COUNT = 0
_AUDITED_CANDLE_KEYS: Dict[str, float] = {}

def scan_and_execute_signals(
    supabase: Client,
    binance_client: ccxt.binanceusdm,
    bybit_client: Optional[ccxt.bybit],
    deepseek_client: OpenAI,
    cfg: Dict[str, Any],
    account_info: Dict[str, float]
) -> None:
    """
    Scans watchlist symbols across active strategies, checks macro shield & funding rate / spread,
    invokes DeepSeek Chief Quantitative Risk Officer with active guardrails,
    sizes positions safely (pips for Forex, points for Crypto), and dispatches orders.
    Supports 3 routing modes: Binance Only, Bybit Only, or Dual Mode.
    """
    global _SCAN_HEARTBEAT_COUNT
    _SCAN_HEARTBEAT_COUNT += 1

    # 0. P1 FIX: Daily Drawdown Circuit Breaker
    # If cumulative daily realized PnL drops below -2.5% (or configured daily_loss_limit_pct),
    # halt all new entries until next UTC day (00:00 UTC) to preserve capital.
    daily_pnl_pct = float(account_info.get("daily_pnl_pct", 0.0) or 0.0)
    configured_daily_limit = -abs(float(cfg.get("daily_loss_limit_pct", 2.5) or 2.5))
    today_utc_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    global _DAILY_HALT_DATE

    if daily_pnl_pct <= configured_daily_limit:
        if _DAILY_HALT_DATE != today_utc_date:
            _DAILY_HALT_DATE = today_utc_date
            alert_msg = f"🛑 DAILY DRAWDOWN LIMIT HIT ({daily_pnl_pct:+.2f}% <= {configured_daily_limit:.2f}%). All new trades halted until next UTC day (00:00 UTC) to preserve capital."
            print(f"[risk] {alert_msg}")
            send_telegram_alert(cfg, alert_msg)
        if _SCAN_HEARTBEAT_COUNT % 10 == 1:
            print(f"[risk] Daily Drawdown Circuit Breaker active ({daily_pnl_pct:+.2f}%). Scanning halted for today.")
        return
    elif _DAILY_HALT_DATE and _DAILY_HALT_DATE != today_utc_date:
        # Reset halt state on new UTC day
        _DAILY_HALT_DATE = None
        print(f"[risk] New UTC day detected ({today_utc_date}). Daily Drawdown Circuit Breaker reset.")

    # 1. Blocked UTC Hours Check
    current_utc_hour = datetime.now(timezone.utc).hour
    if current_utc_hour in cfg.get("blocked_utc_hours", []):
        print(f"[scanner] Current UTC hour ({current_utc_hour}) is blocked in bot_config. Skipping scan.")
        return

    exchange_mode = str(cfg.get("exchange_mode", "binance")).lower()
    scan_targets: List[Tuple[str, str, Any]] = []

    # 1. Binance Crypto
    if exchange_mode in ("binance", "dual") and binance_client:
        symbols = cfg.get("symbols") or [
            "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT",
            "DOGE/USDT", "ADA/USDT", "SUI/USDT", "LINK/USDT", "AVAX/USDT"
        ]
        for s in symbols:
            scan_targets.append((s, "binance", binance_client))

    # 2. Bybit Forex / CFDs
    if exchange_mode in ("bybit", "dual") and bybit_client and cfg.get("enable_forex_trading", True):
        fx_symbols = cfg.get("forex_symbols") or ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "XAU/USD"]
        for s in fx_symbols:
            scan_targets.append((s, "bybit", bybit_client))

    active_strats = cfg.get("active_strategies") or [
        "SMC_Liquidity_Sweep",
        "ICT_OrderBlock_FVG",
        "Supertrend_ADX_Momentum",
        "EMA_Trend_Pullback",
        "BB_Volatility_Breakout",
        "RSI_Divergence_Reversal"
    ]
    quarantined_symbols = cfg.get("quarantined_symbols", [])
    equity = float(account_info.get("equity", 0.0) or 0.0)

    # Detect if bot is running in Zero-Balance Analytical Mode
    is_zero_balance_mode = (equity <= 0) and not cfg.get("sandbox_mode", True)
    if is_zero_balance_mode and _SCAN_HEARTBEAT_COUNT % 4 == 1:
        print(f"[scanner] Zero-Balance Analytical Mode: Scanning 15m candles & running DeepSeek QRO audits across {exchange_mode.upper()} targets. Candidate setups are paper-tracked without live margin orders.")

    # P10 FIX: Filter eligible targets and prefetch OHLCV in parallel across symbols
    eligible_targets: List[Tuple[str, str, Any, str, bool]] = []
    for symbol, exchange_name, exchange in scan_targets:
        if symbol in quarantined_symbols:
            continue

        is_fx = is_forex_symbol(symbol)
        if is_fx:
            if cfg.get("forex_weekend_shield", True):
                is_open, open_reason = is_forex_market_open()
                if not is_open:
                    if _SCAN_HEARTBEAT_COUNT % 6 == 1:
                        print(f"[scanner] Forex market closed ({open_reason}). Weekend shield active.")
                    continue

            if cfg.get("forex_rollover_shield", True):
                is_rollover, rollover_reason = is_daily_rollover_blackout()
                if is_rollover:
                    if _SCAN_HEARTBEAT_COUNT % 6 == 1:
                        print(f"[scanner] Daily NY Bank Rollover Blackout: {rollover_reason}. Skipping new Forex entries.")
                    continue

        ex_sym = resolve_exchange_symbol(exchange, symbol)
        eligible_targets.append((symbol, exchange_name, exchange, ex_sym, is_fx))

    # P10 FIX: Parallel OHLCV & Market Data Prefetching
    def _fetch_target_bundle(tgt: Tuple[str, str, Any, str, bool]) -> Tuple[str, Optional[Dict[str, Any]]]:
        sym, ex_name, ex, ex_s, fx_flag = tgt
        try:
            ohlcv_15m = ex.fetch_ohlcv(ex_s, timeframe="15m", limit=100)
            if not ohlcv_15m or len(ohlcv_15m) < 55:
                return sym, None
            ohlcv_1h_data = get_cached_ohlcv(ex, ex_s, timeframe="1h", limit=70, ttl_sec=600)
            ohlcv_4h_data = get_cached_ohlcv(ex, ex_s, timeframe="4h", limit=50, ttl_sec=1800)
            ohlcv_1d_data = get_cached_ohlcv(ex, ex_s, timeframe="1d", limit=50, ttl_sec=3600)
            oi_info = get_cached_open_interest(ex, ex_s, ttl_sec=180) if not fx_flag else {"open_interest": None, "open_interest_usd": None}
            return sym, {
                "ohlcv": ohlcv_15m,
                "ohlcv_1h": ohlcv_1h_data,
                "ohlcv_4h": ohlcv_4h_data,
                "ohlcv_1d": ohlcv_1d_data,
                "oi_info": oi_info
            }
        except Exception:
            return sym, None

    prefetched_bundles: Dict[str, Any] = {}
    if eligible_targets:
        with ThreadPoolExecutor(max_workers=min(len(eligible_targets), 6)) as prefetcher:
            futures = [prefetcher.submit(_fetch_target_bundle, t) for t in eligible_targets]
            for f in as_completed(futures):
                try:
                    s_key, b_data = f.result(timeout=10)
                    if b_data:
                        prefetched_bundles[s_key] = b_data
                except Exception:
                    pass

    for symbol, exchange_name, exchange, ex_sym, is_fx in eligible_targets:
        asset_class = "commodity" if ("XAU" in symbol or "XAG" in symbol) else ("forex" if is_fx else "crypto")

        try:
            # Check if there is already an open trade for this symbol
            existing = supabase.table("trade_executions").select("id").eq("symbol", symbol).eq("status", "OPEN").execute()
            if existing.data and len(existing.data) > 0:
                continue

            bundle = prefetched_bundles.get(symbol)
            if not bundle:
                continue

            ohlcv = bundle["ohlcv"]
            df = pd.DataFrame(ohlcv, columns=["timestamp", "open", "high", "low", "close", "volume"])
            df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
            latest_price = float(df["close"].iloc[-1])
            ind_df = calc_indicators(df)

            # Store in-memory 15m frame for cross-pair SMT and trailing stops
            _LTF_15M_CACHE[symbol] = df

            # Multi-Timeframe 1H, 4H, and 1D DataFrames (P2 FIX: True Institutional Top-Down Context)
            ohlcv_1h = bundle["ohlcv_1h"]
            df_1h = None
            if ohlcv_1h and len(ohlcv_1h) >= 20:
                df_1h = pd.DataFrame(ohlcv_1h, columns=["timestamp", "open", "high", "low", "close", "volume"])
                df_1h["timestamp"] = pd.to_datetime(df_1h["timestamp"], unit="ms")

            ohlcv_4h = bundle["ohlcv_4h"]
            df_4h = None
            if ohlcv_4h and len(ohlcv_4h) >= 20:
                df_4h = pd.DataFrame(ohlcv_4h, columns=["timestamp", "open", "high", "low", "close", "volume"])
                df_4h["timestamp"] = pd.to_datetime(df_4h["timestamp"], unit="ms")

            ohlcv_1d = bundle["ohlcv_1d"]
            df_1d = None
            if ohlcv_1d and len(ohlcv_1d) >= 15:
                df_1d = pd.DataFrame(ohlcv_1d, columns=["timestamp", "open", "high", "low", "close", "volume"])
                df_1d["timestamp"] = pd.to_datetime(df_1d["timestamp"], unit="ms")

            # P5 FIX: Open Interest
            oi_info = bundle["oi_info"]

            # P3 FIX: Currency-Specific Macro Blackout Check (e.g. GBP for GBP/USD, EUR for EUR/USD)
            macro_status = check_usd_macro_blackout(symbol=symbol)
            if macro_status.get("macro_blackout"):
                ev_title = macro_status.get("active_or_upcoming_event")
                mins = macro_status.get("minutes_to_event")
                if _SCAN_HEARTBEAT_COUNT % 6 == 1:
                    print(f"[scanner] Skipping {symbol}: Currency Macro Blackout Active ({ev_title}, {mins}m).")
                continue

            # Resolve institutional correlated partner (EUR<->GBP, Gold<->Silver, BTC<->ETH)
            corr_sym = CORRELATED_PAIR_MAP.get(symbol)
            corr_df = None
            if corr_sym:
                corr_df = _LTF_15M_CACHE.get(corr_sym)
                if corr_df is None:
                    try:
                        corr_ex_sym = resolve_exchange_symbol(exchange, corr_sym)
                        corr_ohlcv = exchange.fetch_ohlcv(corr_ex_sym, timeframe="15m", limit=30)
                        if corr_ohlcv and len(corr_ohlcv) >= 15:
                            corr_df = pd.DataFrame(corr_ohlcv, columns=["timestamp", "open", "high", "low", "close", "volume"])
                            corr_df["timestamp"] = pd.to_datetime(corr_df["timestamp"], unit="ms")
                            _LTF_15M_CACHE[corr_sym] = corr_df
                    except Exception:
                        corr_df = None

            # Calculate institutional Top-Down Market Structure across Daily, 4H, 1H, and 15m (P2 FIX)
            top_down_context = calc_top_down_structure(ind_df, df_1h=df_1h, df_4h=df_4h, df_1d=df_1d, symbol=symbol, correlated_df=corr_df)

            # Check funding rate or spread
            funding_rate = 0.0
            spread_pips = None
            if not is_fx:
                try:
                    fr_info = exchange.fetch_funding_rate(ex_sym)
                    funding_rate = float(fr_info.get("fundingRate", 0.0) or 0.0) * 100.0
                except Exception:
                    funding_rate = 0.0

                if abs(funding_rate) > cfg.get("max_funding_rate_pct", 0.05):
                    print(f"[scanner] Skipping {symbol}: Funding rate {funding_rate:.4f}% exceeds max {cfg.get('max_funding_rate_pct')}%")
                    continue
            else:
                try:
                    ticker = exchange.fetch_ticker(ex_sym)
                    ask = float(ticker.get("ask", 0.0) or 0.0)
                    bid = float(ticker.get("bid", 0.0) or 0.0)
                    if ask > 0 and bid > 0:
                        pip_sz = get_forex_pip_size(symbol)
                        spread_pips = round(abs(ask - bid) / pip_sz, 1)
                        configured_spread = float(cfg.get("forex_max_spread_pips", 3.5) or 3.5)
                        # Precious metals (Gold/Silver) naturally carry wider pip spreads than EUR/USD.
                        # Floor metals at 3.5 pips so normal tight spreads (e.g. 2.0 pips for Silver) are not choked.
                        is_metal = any(m in symbol.upper() for m in ["XAU", "XAG", "GOLD", "SILVER"])
                        effective_max_spread = max(configured_spread, 3.5) if is_metal else configured_spread

                        if spread_pips > effective_max_spread:
                            asset_type = "Metals" if is_metal else "Forex"
                            print(f"[scanner] Skipping {symbol}: {asset_type} spread {spread_pips} pips exceeds max threshold {effective_max_spread} pips (adjust in dashboard settings if desired).")
                            continue
                except Exception:
                    pass

            # Fetch news headlines
            headlines = fetch_crypto_headlines(symbol) if not is_fx else []

            # Dynamic Target Reward-to-Risk Ratio from Admin Settings (e.g. 1:2.5, 1:3.0, 1:5.0)
            target_rr = float(cfg.get("target_rr", 2.5) or 2.5)

            # Evaluate strategies with full Top-Down Daily -> 4H -> 1H -> 15m Price Action (P2 FIX)
            candidate_setups = evaluate_enabled_strategies(
                df,
                active_strats,
                ind_df=ind_df,
                df_1h=df_1h,
                df_4h=df_4h,
                df_1d=df_1d,
                top_down_context=top_down_context,
                target_rr=target_rr
            )
            if not candidate_setups:
                if _SCAN_HEARTBEAT_COUNT % 4 == 0:
                    unit_label = f"(${format_price_dynamic(latest_price)})"
                    d1_b = top_down_context.get("daily_1d", {}).get("bias", "NEUTRAL")
                    h4_b = top_down_context["htf_4h"]["bias"]
                    h1_z = top_down_context["itf_1h"]["zone"]
                    h1_d = top_down_context["itf_1h"]["range_depth_pct"]
                    print(f"[scanner] {symbol} {unit_label} [{exchange_name.upper()}] -> Top-Down checked (1D: {d1_b}, 4H: {h4_b}, 1H: {h1_z} {h1_d}%). No valid trigger on current bar. Monitoring...")
                continue

            print(f"[scanner] 🔥 {len(candidate_setups)} CANDIDATE SETUP(S) FOUND on {symbol} ({exchange_name.upper()}, Price: ${format_price_dynamic(latest_price)})!")

            for setup in candidate_setups:
                rvol = setup.get("rvol", 1.0)
                min_rvol_threshold = float(cfg.get("min_rvol", 1.0) or 1.0)
                if rvol < min_rvol_threshold:
                    print(f"[scanner] {symbol} {setup.get('strategy_name')} candidate skipped: RVOL {rvol:.2f}x < required {min_rvol_threshold:.2f}x volume threshold.")
                    continue

                side = setup.get("side")
                strat_name = setup.get("strategy_name")
                risk_pct = float(cfg.get("risk_pct", 0.01))

                # Check portfolio directional & currency-component risk lock (P9 FIX)
                if not check_correlated_exposure(supabase, symbol, side, risk_pct, cfg.get("max_directional_exposure_pct", 0.015)):
                    continue

                # Check if this exact setup has already been audited on this 15m candle
                global _AUDITED_CANDLE_KEYS
                candle_ts = int(ohlcv[-1][0]) if ohlcv else int(time.time() // 900 * 900)
                dedup_key = f"{symbol}:{strat_name}:{side}:{candle_ts}"

                now_ts = time.time()
                if len(_AUDITED_CANDLE_KEYS) > 300:
                    _AUDITED_CANDLE_KEYS = {k: v for k, v in _AUDITED_CANDLE_KEYS.items() if now_ts - v < 7200}

                if dedup_key in _AUDITED_CANDLE_KEYS:
                    continue

                # Query up to 5 active guardrail lessons for this symbol/strategy
                lessons_query = (
                    supabase.table("bot_lessons")
                    .select("prompt_guardrail_rule, weakness_detected")
                    .eq("status", "ACTIVE")
                    .or_(f"strategy_name.eq.{strat_name},strategy_name.eq.ALL")
                    .limit(5)
                    .execute()
                )
                active_lessons = [f"- {l['weakness_detected']}: {l['prompt_guardrail_rule']}" for l in (lessons_query.data or [])]
                lessons_block = "\n".join(active_lessons) if active_lessons else "No active historical failure guardrails."

                # Calculate HTF 24h trend alignment
                ema_50_val = float(ind_df["ema_50"].iloc[-1]) if "ema_50" in ind_df.columns else latest_price
                ema_20_val = float(ind_df["ema_20"].iloc[-1]) if "ema_20" in ind_df.columns else latest_price
                h24 = float(df["high"].max())
                l24 = float(df["low"].min())
                htf_status = "BULLISH_TREND_ALIGNED" if (latest_price > ema_50_val and side == "LONG") else ("BEARISH_TREND_ALIGNED" if (latest_price < ema_50_val and side == "SHORT") else "COUNTER_TREND_OR_MEAN_REVERSION")

                session_info = get_forex_session_regime() if is_fx else None

                # DeepSeek / Gemini Audit Prompt construction with Top-Down Telemetry (P2 & P5 FIX)
                daily_b = top_down_context.get("daily_benchmarks", {})
                daily_1d_info = top_down_context.get("daily_1d", {})
                asian_b = top_down_context.get("asian_range", {})
                smt_b = top_down_context.get("smt_divergence", {})

                audit_payload = {
                    "symbol": symbol,
                    "exchange": exchange_name,
                    "asset_class": asset_class,
                    "strategy_name": strat_name,
                    "proposed_direction": side,
                    "entry_price": setup["entry"],
                    "stop_loss": setup["sl"],
                    "take_profit": setup["tp"],
                    "reward_risk_ratio": setup["rr"],
                    "configured_target_rr": target_rr,
                    "setup_notes": setup["setup_notes"],
                    "relative_volume_rvol": rvol,
                    "funding_rate_pct": funding_rate,
                    "open_interest": oi_info.get("open_interest"),
                    "open_interest_value_usd": oi_info.get("open_interest_usd"),
                    "broker_spread_pips": spread_pips,
                    "forex_session_context": f"{session_info['session_name']} - {session_info['description']}" if session_info else "24/7 Continuous Crypto Market",
                    "cross_pair_smt_divergence": smt_b.get("description", "None"),
                    "asian_range_benchmarks": f"High: ${format_price_dynamic(asian_b['asian_high'])}, Low: ${format_price_dynamic(asian_b['asian_low'])}, Span: {asian_b.get('asian_range_pips', 0)} pips" if asian_b.get("is_valid_range") else "N/A",
                    "previous_day_benchmarks": f"PDH: ${format_price_dynamic(daily_b['pdh'])}, PDL: ${format_price_dynamic(daily_b['pdl'])}, Range: {daily_b.get('daily_range_pips', 0)} pips" if daily_b.get("has_benchmarks") else "N/A",
                    "daily_macro_bias": daily_1d_info.get("bias", "NEUTRAL"),
                    "daily_key_support": daily_1d_info.get("key_support"),
                    "daily_key_resistance": daily_1d_info.get("key_resistance"),
                    "top_down_4h_bias": top_down_context["htf_4h"]["bias"],
                    "top_down_1h_zone": f"{top_down_context['itf_1h']['zone']} ({top_down_context['itf_1h']['range_depth_pct']}% of range, Equilibrium: ${format_price_dynamic(top_down_context['itf_1h']['equilibrium'])})",
                    "optimal_trade_entry_fib": "YES (61.8% - 78.6% Fib Retracement)" if top_down_context["itf_1h"]["is_ote"] else "NEUTRAL",
                    "htf_regime_context": (
                        f"Top-Down Price Action: 1D Daily [{daily_1d_info.get('bias', 'NEUTRAL')}] | "
                        f"4H Macro [{top_down_context['htf_4h']['bias']}] | "
                        f"1H Dealing Zone: [{top_down_context['itf_1h']['zone']} at {top_down_context['itf_1h']['range_depth_pct']}% depth, 50% Equilibrium: ${format_price_dynamic(top_down_context['itf_1h']['equilibrium'])}] | "
                        f"24h Trend Status: {htf_status}"
                    ),
                    "latest_headlines": headlines,
                    "active_guardrail_lessons": lessons_block,
                    "macro_blackout_state": macro_status
                }

                active_prov = str(cfg.get("ai_provider", "council_3model")).strip().lower()
                gemini_rep = {}
                qwen_rep = {}
                deepseek_rep = {}
                council_scores = {}

                if active_prov in ["council_3model", "council"]:
                    candidate_setup_dict = {
                        "symbol": symbol,
                        "side": side,
                        "strategy_name": strat_name,
                        "entry": setup["entry"],
                        "sl": setup["sl"],
                        "tp": setup["tp"],
                        "rr": setup["rr"],
                        "setup_notes": setup.get("setup_notes", ""),
                        "exchange": exchange_name
                    }
                    market_snap_dict = {
                        "rvol": rvol,
                        "atr": float(ind_df["atr_14"].iloc[-1]) if "atr_14" in ind_df.columns and pd.notnull(ind_df["atr_14"].iloc[-1]) else None,
                        "funding_rate": funding_rate,
                        "open_interest": oi_info.get("open_interest"),
                        "open_interest_usd": oi_info.get("open_interest_usd"),
                        "spread_pips": spread_pips,
                        "htf_status": htf_status
                    }
                    (
                        total_score,
                        veto_triggered,
                        veto_reason,
                        rubric,
                        gemini_rep,
                        qwen_rep,
                        deepseek_rep,
                        council_scores,
                        model_used
                    ) = execute_council_audit(
                        cfg,
                        candidate_setup_dict,
                        top_down_context,
                        market_snap_dict,
                        headlines,
                        lessons_block,
                        macro_status,
                        session_info
                    )
                else:
                    print(f"[scanner] Requesting Autonomous AI Risk Audit for {symbol} {side} ({strat_name}, {exchange_name.upper()}) via {active_prov.upper()}...")
                    model_used = cfg.get("deepseek_model", "deepseek-chat")
                    try:
                        content, model_used = execute_ai_completion(
                            cfg,
                            system_prompt=SYSTEM_AUDIT_PROMPT,
                            user_prompt=f"Audit this candidate setup:\n{json.dumps(audit_payload, indent=2)}",
                            max_tokens=1000
                        )
                        raw_audit = parse_ai_json(content)
                    except Exception as ai_err:
                        print(f"[scanner] AI API audit warning: {ai_err}")
                        raw_audit = {"veto_triggered": True, "veto_reason": f"AI API communication failure ({ai_err})"}

                    total_score, veto_triggered, veto_reason, rubric = verify_and_score_audit(raw_audit)
                    deepseek_rep = raw_audit

                    # Synthesize Chartist & Quant representations so telemetry is populated across all tabs
                    gemini_rep = {
                        "htf_bias": daily_1d_info.get("bias", "NEUTRAL"),
                        "htf_regime": rubric.get("htf_regime", {}),
                        "ltf_location": rubric.get("ltf_location", {}),
                        "key_support": daily_1d_info.get("key_support", 0.0),
                        "key_resistance": daily_1d_info.get("key_resistance", 0.0),
                        "chart_veto": veto_triggered and ("sweep" in str(veto_reason).lower() or "htf" in str(veto_reason).lower()),
                        "chart_verdict": raw_audit.get("execution_notes", "Evaluated autonomously by DeepSeek Lead Auditor.")
                    }
                    qwen_rep = {
                        "momentum_volume": rubric.get("momentum_volume", {}),
                        "news_catalyst": rubric.get("news_catalyst", {}),
                        "intermarket_tide": rubric.get("intermarket_tide", {}),
                        "macro_or_funding_veto": veto_triggered and ("macro" in str(veto_reason).lower() or "funding" in str(veto_reason).lower()),
                        "quant_summary": raw_audit.get("execution_notes", "Evaluated autonomously by DeepSeek Lead Auditor.")
                    }
                    council_scores = None

                # Log to ai_audit_logs
                supabase.table("ai_audit_logs").insert({
                    "symbol": symbol,
                    "exchange": exchange_name,
                    "asset_class": asset_class,
                    "ai_model": model_used,
                    "forex_session": session_info["session_name"] if session_info else None,
                    "spread_pips": spread_pips,
                    "strategy_name": strat_name,
                    "proposed_direction": side,
                    "total_score": total_score,
                    "veto_triggered": veto_triggered,
                    "veto_reason": veto_reason,
                    "rubric_breakdown": rubric,
                    "gemini_report": gemini_rep,
                    "qwen_report": qwen_rep,
                    "deepseek_report": deepseek_rep,
                    "council_scores": council_scores,
                    "market_snapshot": {
                        "entry": setup["entry"],
                        "sl": setup["sl"],
                        "tp": setup["tp"],
                        "rvol": rvol,
                        "funding_rate": funding_rate,
                        "open_interest": oi_info.get("open_interest"),
                        "open_interest_usd": oi_info.get("open_interest_usd"),
                        "spread_pips": spread_pips
                    },
                    "news_context": headlines
                }).execute()
                _AUDITED_CANDLE_KEYS[dedup_key] = time.time()

                min_score = cfg.get("min_score", 70)
                if veto_triggered or total_score < min_score:
                    print(f"[scanner] Setup rejected for {symbol}: Score {total_score}/{min_score}, Veto: {veto_triggered} ({veto_reason})")
                    continue

                # --- POSITION SIZING ---
                size_multiplier = 1.0 if total_score >= 80 else 0.5
                effective_risk_pct = risk_pct * size_multiplier

                # P13 FIX: Equity Curve Drawdown Reducer
                drawdown_from_peak = abs(float(account_info.get("drawdown_from_peak_pct", 0.0) or 0.0))
                if drawdown_from_peak >= 10.0 and equity > 0:
                    effective_risk_pct = effective_risk_pct * 0.5
                    print(f"[risk] Equity Drawdown Reducer Active: Drawdown is {drawdown_from_peak:.1f}% from peak. Position risk halved to {effective_risk_pct*100:.2f}%.")

                nominal_equity = equity if equity > 0 else 10000.0
                entry_price = float(setup["entry"])
                sl_price = float(setup["sl"])
                tp_price = float(setup["tp"])

                if is_fx:
                    position_qty = calculate_forex_position_size(
                        equity=nominal_equity,
                        risk_pct=effective_risk_pct,
                        entry_price=entry_price,
                        sl_price=sl_price,
                        symbol=symbol,
                        max_leverage=int(cfg.get("forex_max_leverage", 30) or 30)
                    )
                else:
                    risk_usdt = nominal_equity * effective_risk_pct
                    risk_per_unit = max(abs(entry_price - sl_price), 1e-8)
                    raw_qty = risk_usdt / risk_per_unit
                    position_qty = round(raw_qty, 2 if raw_qty >= 10.0 else (4 if raw_qty >= 0.01 else 6))
                    if position_qty <= 0:
                        position_qty = 0.01

                is_simulated = is_zero_balance_mode or cfg.get("sandbox_mode", True)

                # --- ORDER DISPATCH / ANALYTICAL LOGGING (P4 FIX: GTC Resting Limit at FVG/OB) ---
                order_side = "buy" if side == "LONG" else "sell"
                opp_side = "sell" if side == "LONG" else "buy"
                exchange_order_id = "mock_order_1"
                sl_order_id = "mock_sl_1"
                tp_order_id = "mock_tp_1"

                if is_simulated:
                    mode_label = f"ANALYTICAL SIGNAL ({exchange_name.upper()} Paper Tracking)" if is_zero_balance_mode else "SANDBOX DEMO"
                    print(f"[execution] {mode_label} recorded for {symbol} {side} ({exchange_name.upper()}): Entry ${format_price_dynamic(entry_price)}, SL ${format_price_dynamic(sl_price)}, TP ${format_price_dynamic(tp_price)} (+{setup.get('rr', 2.0)}R), Score {total_score}/100")
                    exchange_order_id = f"ANALYTICS_{int(time.time())}"
                    sl_order_id = f"ANALYTICS_SL_{int(time.time())}"
                    tp_order_id = f"ANALYTICS_TP_{int(time.time())}"
                else:
                    print(f"[execution] Live {exchange_name.upper()} Order Dispatch for {side} on {symbol}: Qty {position_qty}, Score {total_score}/100")
                    try:
                        use_limit = cfg.get("use_limit_maker_entry", True) or (setup.get("entry_type") == "LIMIT")
                        if use_limit:
                            # P4 FIX: GTC resting limit order at FVG / OB midpoint instead of taker market order
                            entry_order = exchange.create_order(
                                symbol=ex_sym,
                                type="LIMIT" if exchange_name == "binance" else "limit",
                                side=order_side,
                                amount=position_qty,
                                price=entry_price,
                                params={"timeInForce": "GTC"} if exchange_name == "binance" else {"timeInForce": "GTC"}
                            )
                            exchange_order_id = str(entry_order.get("id"))
                        else:
                            entry_order = exchange.create_market_order(ex_sym, order_side, position_qty)
                            exchange_order_id = str(entry_order.get("id"))

                        # Server-Side STOP_MARKET
                        sl_order = exchange.create_order(
                            symbol=ex_sym,
                            type="STOP_MARKET" if exchange_name == "binance" else "market",
                            side=opp_side,
                            amount=position_qty,
                            params={
                                "stopPrice": sl_price,
                                "workingType": "MARK_PRICE",
                                "reduceOnly": True
                            }
                        )
                        sl_order_id = str(sl_order.get("id"))

                        # Server-Side TAKE_PROFIT_MARKET
                        tp_order = exchange.create_order(
                            symbol=ex_sym,
                            type="TAKE_PROFIT_MARKET" if exchange_name == "binance" else "market",
                            side=opp_side,
                            amount=position_qty,
                            params={
                                "stopPrice": tp_price,
                                "workingType": "MARK_PRICE",
                                "reduceOnly": True
                            }
                        )
                        tp_order_id = str(tp_order.get("id"))

                    except Exception as order_exc:
                        print(f"[execution] {exchange_name} order submission fallback: {order_exc}")
                        exchange_order_id = f"sim_{int(time.time())}"
                        sl_order_id = f"sim_sl_{int(time.time())}"
                        tp_order_id = f"sim_tp_{int(time.time())}"

                # Insert into trade_executions
                new_trade_record = {
                    "exchange_order_id": exchange_order_id,
                    "sl_order_id": sl_order_id,
                    "tp_order_id": tp_order_id,
                    "symbol": symbol,
                    "exchange": exchange_name,
                    "asset_class": asset_class,
                    "forex_session": session_info["session_name"] if session_info else None,
                    "spread_at_entry": spread_pips,
                    "strategy_name": strat_name,
                    "side": side,
                    "initial_qty": position_qty,
                    "qty": position_qty,
                    "entry_price": entry_price,
                    "stop_loss": sl_price,
                    "take_profit": tp_price,
                    "breakeven_activated": False,
                    "status": "OPEN",
                    "funding_rate_at_entry": funding_rate,
                    "entry_session_utc": current_utc_hour,
                    "entry_regime": f"RVOL {rvol:.2f}x",
                    "entry_rvol": rvol,
                    "entry_scores": {
                        "total_score": total_score,
                        "rubric": rubric,
                        "council_scores": council_scores,
                        "ai_provider": active_prov
                    },
                    "is_simulated": is_simulated,
                    "trader_notes": f"ANALYTICAL SIGNAL: Zero-Balance Paper Tracking ({exchange_name.upper()})" if is_zero_balance_mode else "",
                    "emotion_or_grade": "A-Setup"
                }
                res = supabase.table("trade_executions").insert(new_trade_record).execute()
                inserted_trade = res.data[0] if res.data else new_trade_record

                # Dispatch Telegram Notification
                notify_trade_opened(cfg, inserted_trade, {"total_score": total_score})

        except Exception as sym_err:
            print(f"[scanner] Error processing {symbol} on {exchange_name}: {sym_err}")


# --- MASTER CONTINUOUS WORKER LOOP ---

def run_master_loop():
    """Master non-blocking execution loop."""
    print("==============================================================================")
    print(" alifcrptoai - Autonomous Derivatives Trading Engine")
    print(" Author & Developer: Alifu Haji (Individual Developer)")
    print(" Target: Contabo VPS (6 vCPU, 12GB RAM) via CapRover")
    print("==============================================================================")

    # Start health HTTP listener for CapRover swarm healthchecks
    start_health_server(80)

    supabase = get_supabase_client()
    poll_seconds = int(os.getenv("POLL_INTERVAL_SECONDS", 15))

    iteration = 0
    while True:
        try:
            iteration += 1
            # 1. Fetch latest configuration from Supabase
            cfg = fetch_bot_config(supabase)
            binance_client = get_binance_client(cfg)
            bybit_client = get_bybit_client(cfg)
            deepseek = get_deepseek_client(cfg)

            # 2. Check Emergency Panic Trigger
            if cfg.get("panic_close_all", False):
                handle_panic_close_all(supabase, binance_client, bybit_client, cfg)
                time.sleep(poll_seconds)
                continue

            # 3. Synchronize Account Telemetry
            account_info = sync_account_telemetry(supabase, binance_client, bybit_client, cfg)

            # 4. Institutional Trade Management
            manage_open_positions(supabase, binance_client, bybit_client, deepseek, cfg)

            # 5. Statistical Optimizer (Run every 10 iterations)
            if iteration % 10 == 0:
                run_statistical_optimizer(supabase, cfg)

            # 6. Synchronize Market & Macro News to Database (Every ~5 mins)
            news_symbols = list(cfg.get("symbols", ["BTC/USDT", "ETH/USDT", "SOL/USDT"]))
            if cfg.get("enable_forex_trading", True) and cfg.get("forex_symbols"):
                news_symbols.extend(cfg.get("forex_symbols")[:3])
            sync_market_and_macro_news(supabase, news_symbols)

            # 7. Signal Scanner (Only if bot is ACTIVE)
            if cfg.get("is_active", False):
                scan_and_execute_signals(supabase, binance_client, bybit_client, deepseek, cfg, account_info)
            else:
                if iteration % 20 == 0:
                    print(f"[bot] Engine is in PAUSED mode (is_active = False, mode: {cfg.get('exchange_mode', 'binance').upper()}). Monitoring positions & telemetry only.")

        except Exception as loop_exc:
            print(f"[bot] Critical loop exception: {loop_exc}")

        time.sleep(poll_seconds)


if __name__ == "__main__":
    run_master_loop()
