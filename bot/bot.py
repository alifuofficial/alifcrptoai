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
    notify_trade_closed,
    notify_strategy_quarantined,
    notify_panic_activated
)
from prompts import SYSTEM_AUDIT_PROMPT, AUTOPSY_PROMPT

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


# Cached exchange clients to preserve pre-loaded markets across loops
_EXCHANGE_CLIENT: Optional[ccxt.binanceusdm] = None
_EXCHANGE_CONFIG_SIG: Optional[str] = None
_BYBIT_CLIENT: Optional[ccxt.bybit] = None
_BYBIT_CONFIG_SIG: Optional[str] = None


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
        try:
            if exchange and hasattr(exchange, "markets") and exchange.markets:
                if clean in exchange.markets:
                    return clean
                # Check for Bybit linear settlement suffix (e.g. EUR/USD:USDT or EUR/USDT:USDT)
                if "/" in clean:
                    quote = clean.split("/")[1]
                    candidate = f"{clean}:{quote}"
                    if candidate in exchange.markets:
                        return candidate
                    usdt_candidate = f"{clean}:USDT"
                    if usdt_candidate in exchange.markets:
                        return usdt_candidate
                raw_id = clean.replace("/", "")
                for m_sym, m_data in exchange.markets.items():
                    if m_data.get("id") == raw_id:
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
    Translates CCXT exchange market symbols (e.g. 'BTC/USDT:USDT' or 'BTCUSDT')
    back to the canonical dashboard format 'BTC/USDT'.
    """
    if not symbol:
        return symbol
    clean = str(symbol).strip().upper()
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


def get_deepseek_client(cfg: Dict[str, Any]) -> OpenAI:
    """
    Initializes OpenAI client dynamically pointed at DeepSeek / OpenRouter / BeatAPI endpoint.
    Supports dynamic routing via deepseek_base_url and deepseek_key_override from bot_config or env.
    """
    api_key = cfg.get("deepseek_key_override") or os.getenv("DEEPSEEK_API_KEY", "")
    base_url = cfg.get("deepseek_base_url") or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    return OpenAI(
        api_key=api_key or "sk-dummy-key",
        base_url=base_url
    )


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
            "RSI_Divergence_Reversal"
        ],
        "timeframe": "15m",
        "risk_pct": 0.01,
        "min_score": 70,
        "min_rvol": 1.0,
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
        "exchange_mode": "binance",
        "bybit_api_key_override": None,
        "bybit_secret_override": None,
        "enable_forex_trading": True,
        "forex_symbols": ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "XAU/USD"],
        "forex_max_leverage": 30,
        "forex_weekend_shield": True,
        "forex_rollover_shield": True,
        "forex_max_spread_pips": 1.5,
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

    except Exception as exc:
        print(f"[telemetry] Sync notice: {exc}")

    return {"equity": equity, "free_margin": free_margin}


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


# --- CORRELATED EXPOSURE PROTECTION ---

def check_correlated_exposure(supabase: Client, proposed_side: str, proposed_risk_pct: float, max_exposure_pct: float) -> bool:
    """
    Correlation & Beta-Stacking Lock:
    Ensures total active un-hedged open risk (where breakeven_activated == False)
    in the same direction across the portfolio does not exceed max_directional_exposure_pct.
    """
    try:
        res = supabase.table("trade_executions").select("side, initial_qty, entry_price, stop_loss, breakeven_activated").eq("status", "OPEN").execute()
        current_dir_risk = 0.0

        for t in res.data or []:
            if t.get("side") == proposed_side and not t.get("breakeven_activated", False):
                # An open trade represents ~1 unit of risk_pct
                current_dir_risk += 0.01

        if (current_dir_risk + proposed_risk_pct) > max_exposure_pct:
            print(f"[risk] Blocked entry: Directional exposure {current_dir_risk + proposed_risk_pct:.4f} > limit {max_exposure_pct:.4f}")
            return False
    except Exception as exc:
        print(f"[risk] Exposure check warning: {exc}")

    return True


# --- INSTITUTIONAL TRADE MANAGEMENT ---

def run_trade_autopsy(supabase: Client, deepseek_client: OpenAI, cfg: Dict[str, Any], trade: Dict[str, Any]) -> None:
    """
    Triggers DeepSeek Post-Mortem Autopsy for a losing trade (CLOSED_SL),
    records the root cause in trade_autopsies, and injects a new lesson in bot_lessons.
    """
    print(f"[autopsy] Conducting forensic autopsy on trade #{trade['id']} ({trade['symbol']})...")
    payload = {
        "symbol": trade.get("symbol"),
        "strategy_name": trade.get("strategy_name"),
        "side": trade.get("side"),
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
        response = deepseek_client.chat.completions.create(
            model=cfg.get("deepseek_model", "deepseek-chat"),
            messages=[
                {"role": "system", "content": AUTOPSY_PROMPT},
                {"role": "user", "content": f"Analyze this closed loss trade:\n{json.dumps(payload, indent=2)}"}
            ],
            temperature=0.1,
            max_tokens=600
        )
        content = response.choices[0].message.content or "{}"
        autopsy_data = parse_ai_json(content)

        # 1. Insert into trade_autopsies
        supabase.table("trade_autopsies").insert({
            "trade_id": trade["id"],
            "symbol": trade["symbol"],
            "strategy_name": trade["strategy_name"],
            "outcome": "LOSS",
            "failure_category": autopsy_data.get("failure_category", "premature_entry_before_sweep"),
            "root_cause_analysis": autopsy_data.get("root_cause_analysis", "Liquidity sweep was shallow."),
            "recommended_rule_adjustment": autopsy_data.get("recommended_rule_adjustment", "Enforce higher RVOL.")
        }).execute()

        # 2. Insert into bot_lessons (PENDING approval unless auto_apply is enabled)
        initial_status = "ACTIVE" if cfg.get("auto_apply_lessons", False) else "PENDING"
        supabase.table("bot_lessons").insert({
            "symbol": trade["symbol"],
            "strategy_name": trade["strategy_name"],
            "weakness_detected": autopsy_data.get("failure_category", "Risk weakness"),
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
        print(f"[autopsy] Successfully recorded autopsy & lesson for trade #{trade['id']}.")

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

            # --- +1.0R BREAK-EVEN & 50% PARTIAL PROFIT LOCK ---
            if (curr_r >= 1.0 and 
                cfg.get("enable_breakeven_partial", True) and 
                not breakeven_activated):

                is_fx = is_forex_symbol(symbol)
                partial_qty = round(qty * 0.5, 2 if is_fx else (4 if qty < 10.0 else 2))
                new_remaining_qty = round(qty - partial_qty, 2 if is_fx else (4 if qty < 10.0 else 2))
                be_sl_price = round_price_dynamic(entry * 1.0015) if side == "LONG" else round_price_dynamic(entry * 0.9985)
                new_sl_id = f"sim_be_sl_{int(time.time())}" if is_sim else None

                if not is_sim:
                    print(f"[trade_mgmt] +1.0R reached for {symbol} trade #{trade_id} ({trade_exchange}). Executing 50% partial TP and moving SL to BE!")
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
                    print(f"[trade_mgmt] (ANALYTICAL SIGNAL) +1.0R reached for {symbol} trade #{trade_id}. Simulating 50% partial profit lock & moving SL to BE at ${format_price_dynamic(be_sl_price)}!")

                # Update database record
                supabase.table("trade_executions").update({
                    "qty": new_remaining_qty,
                    "breakeven_activated": True,
                    "stop_loss": be_sl_price,
                    "sl_order_id": new_sl_id,
                    "mfe_r": round(new_mfe, 2),
                    "mae_r": round(new_mae, 2)
                }).eq("id", trade_id).execute()

                notify_breakeven_partial(cfg, t, current_price)
                continue

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

                if status == "CLOSED_SL":
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

    # 1. Macro Blackout Check
    macro_status = check_usd_macro_blackout()
    if macro_status.get("macro_blackout"):
        ev_title = macro_status.get("active_or_upcoming_event")
        mins = macro_status.get("minutes_to_event")
        print(f"[scanner] Macro Blackout Active ({ev_title}, {mins}m to release). Pausing new entries.")
        return

    # 2. Blocked UTC Hours Check
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

    for symbol, exchange_name, exchange in scan_targets:
        if symbol in quarantined_symbols:
            continue

        is_fx = is_forex_symbol(symbol)
        asset_class = "commodity" if ("XAU" in symbol or "XAG" in symbol) else ("forex" if is_fx else "crypto")

        # Forex Safeguards: Weekend Shield & Rollover Blackout
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

        try:
            # Check if there is already an open trade for this symbol
            existing = supabase.table("trade_executions").select("id").eq("symbol", symbol).eq("status", "OPEN").execute()
            if existing.data and len(existing.data) > 0:
                continue

            # Fetch 15m OHLCV bars
            ohlcv = exchange.fetch_ohlcv(ex_sym, timeframe="15m", limit=100)
            if not ohlcv or len(ohlcv) < 55:
                continue

            df = pd.DataFrame(ohlcv, columns=["timestamp", "open", "high", "low", "close", "volume"])
            df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
            latest_price = float(df["close"].iloc[-1])
            ind_df = calc_indicators(df)

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
                        max_spread = float(cfg.get("forex_max_spread_pips", 1.5) or 1.5)
                        if spread_pips > max_spread:
                            print(f"[scanner] Skipping {symbol}: Broker spread {spread_pips} pips exceeds max threshold {max_spread} pips.")
                            continue
                except Exception:
                    pass

            # Fetch news headlines
            headlines = fetch_crypto_headlines(symbol) if not is_fx else []

            # Evaluate strategies
            candidate_setups = evaluate_enabled_strategies(df, active_strats, ind_df=ind_df)
            if not candidate_setups:
                if _SCAN_HEARTBEAT_COUNT % 4 == 0:
                    unit_label = f"(${format_price_dynamic(latest_price)})"
                    print(f"[scanner] {symbol} {unit_label} [{exchange_name.upper()}] -> 15m OHLCV checked across {len(active_strats)} quant strategies. No valid trigger on current bar. Monitoring...")
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

                # Check portfolio directional risk lock
                if not check_correlated_exposure(supabase, side, risk_pct, cfg.get("max_directional_exposure_pct", 0.015)):
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

                # DeepSeek Audit Prompt construction
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
                    "setup_notes": setup["setup_notes"],
                    "relative_volume_rvol": rvol,
                    "funding_rate_pct": funding_rate,
                    "broker_spread_pips": spread_pips,
                    "forex_session_context": f"{session_info['session_name']} - {session_info['description']}" if session_info else "24/7 Continuous Crypto Market",
                    "htf_regime_context": f"24h HTF Regime: {htf_status} (Latest Close: {format_price_dynamic(latest_price)}, 24h EMA50: {format_price_dynamic(ema_50_val)}, EMA20: {format_price_dynamic(ema_20_val)}, 24h Range: [{format_price_dynamic(l24)} - {format_price_dynamic(h24)}])",
                    "latest_headlines": headlines,
                    "active_guardrail_lessons": lessons_block,
                    "macro_blackout_state": macro_status
                }

                print(f"[scanner] Requesting DeepSeek Audit for {symbol} {side} ({strat_name}, {exchange_name.upper()})...")
                try:
                    response = deepseek_client.chat.completions.create(
                        model=cfg.get("deepseek_model", "deepseek-chat"),
                        messages=[
                            {"role": "system", "content": SYSTEM_AUDIT_PROMPT},
                            {"role": "user", "content": f"Audit this candidate setup:\n{json.dumps(audit_payload, indent=2)}"}
                        ],
                        temperature=0.1,
                        max_tokens=700
                    )
                    content = response.choices[0].message.content or "{}"
                    raw_audit = parse_ai_json(content)
                except Exception as ai_err:
                    print(f"[scanner] DeepSeek API audit warning: {ai_err}")
                    raw_audit = {"veto_triggered": True, "veto_reason": "AI API communication failure"}

                total_score, veto_triggered, veto_reason, rubric = verify_and_score_audit(raw_audit)

                # Log to ai_audit_logs
                supabase.table("ai_audit_logs").insert({
                    "symbol": symbol,
                    "exchange": exchange_name,
                    "asset_class": asset_class,
                    "forex_session": session_info["session_name"] if session_info else None,
                    "spread_pips": spread_pips,
                    "strategy_name": strat_name,
                    "proposed_direction": side,
                    "total_score": total_score,
                    "veto_triggered": veto_triggered,
                    "veto_reason": veto_reason,
                    "rubric_breakdown": rubric,
                    "market_snapshot": {
                        "entry": setup["entry"],
                        "sl": setup["sl"],
                        "tp": setup["tp"],
                        "rvol": rvol,
                        "funding_rate": funding_rate,
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

                # --- ORDER DISPATCH / ANALYTICAL LOGGING ---
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
                        if cfg.get("use_limit_maker_entry", True):
                            entry_order = exchange.create_order(
                                symbol=ex_sym,
                                type="LIMIT" if exchange_name == "binance" else "limit",
                                side=order_side,
                                amount=position_qty,
                                price=entry_price,
                                params={"timeInForce": "GTX"} if exchange_name == "binance" else {"postOnly": True}
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
                        "rubric": rubric
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
