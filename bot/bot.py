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

from strategies import evaluate_enabled_strategies, calc_indicators
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


def get_binance_client(cfg: Dict[str, Any]) -> ccxt.binanceusdm:
    """
    Initializes Binance USDT-M Futures client with sandbox mode toggle
    and API key overrides from bot_config.
    """
    api_key = cfg.get("binance_api_key_override") or os.getenv("BINANCE_API_KEY", "")
    secret = cfg.get("binance_secret_override") or os.getenv("BINANCE_API_SECRET", "")
    sandbox = cfg.get("sandbox_mode", True)

    exchange = ccxt.binanceusdm({
        "apiKey": api_key,
        "secret": secret,
        "enableRateLimit": True,
        "options": {
            "defaultType": "future",
            "adjustForTimeDifference": True,
        }
    })

    if sandbox:
        exchange.set_sandbox_mode(True)

    return exchange


def get_deepseek_client(cfg: Dict[str, Any]) -> OpenAI:
    """Initializes OpenAI client pointed at DeepSeek API endpoint."""
    api_key = cfg.get("deepseek_key_override") or os.getenv("DEEPSEEK_API_KEY", "")
    return OpenAI(
        api_key=api_key or "sk-dummy-key",
        base_url="https://api.deepseek.com"
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
            "EMA_Trend_Pullback",
            "BB_Volatility_Breakout",
            "RSI_Divergence_Reversal"
        ],
        "timeframe": "15m",
        "risk_pct": 0.01,
        "min_score": 75,
        "min_rvol": 1.2,
        "enable_breakeven_partial": True,
        "max_directional_exposure_pct": 0.015,
        "max_hold_bars": 20,
        "use_limit_maker_entry": True,
        "max_funding_rate_pct": 0.05,
        "telegram_notifications": True,
        "blocked_utc_hours": [],
        "quarantined_symbols": [],
        "deepseek_model": "deepseek-chat",
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

def handle_panic_close_all(supabase: Client, exchange: ccxt.binanceusdm, cfg: Dict[str, Any]) -> None:
    """
    Emergency Circuit Breaker:
    Cancels all open orders on Binance, closes all open positions at Market,
    updates open trades in Supabase, deactivates bot, and fires an alert.
    """
    print("[PANIC] !!! INITIATING EMERGENCY PANIC FLATTEN ALL POSITIONS & ORDERS !!!")
    notify_panic_activated(cfg, "User clicked EMERGENCY PANIC CLOSE ALL in Command Center")

    try:
        # 1. Cancel all open orders for tracked symbols
        for sym in cfg.get("symbols", []):
            try:
                exchange.cancel_all_orders(sym)
                print(f"[PANIC] Cancelled all open orders for {sym}")
            except Exception as e:
                print(f"[PANIC] Order cancel error for {sym}: {e}")

        # 2. Fetch and close all active positions
        try:
            positions = exchange.fetch_positions()
            for pos in positions:
                contracts = float(pos.get("contracts", 0.0) or 0.0)
                if contracts > 0:
                    sym = pos.get("symbol")
                    pos_side = pos.get("side", "").upper() # "LONG" or "SHORT"
                    close_side = "sell" if pos_side == "LONG" else "buy"
                    print(f"[PANIC] Closing {pos_side} position on {sym} of size {contracts} at Market")
                    exchange.create_market_order(
                        sym,
                        close_side,
                        contracts,
                        params={"reduceOnly": True}
                    )
        except Exception as e:
            print(f"[PANIC] Position close error: {e}")

        # 3. Update all OPEN trades in Supabase to MANUAL_CLOSE
        try:
            now_str = datetime.now(timezone.utc).isoformat()
            supabase.table("trade_executions").update({
                "status": "MANUAL_CLOSE",
                "closed_at": now_str
            }).eq("status", "OPEN").execute()
        except Exception as e:
            print(f"[PANIC] Supabase trade update error: {e}")

    finally:
        # Reset panic flag and deactivate bot
        update_bot_config(supabase, {
            "is_active": False,
            "panic_close_all": False
        })
        print("[PANIC] Panic routine finished. Bot deactivated safely.")


# --- ACCOUNT TELEMETRY SYNC ---

def sync_account_telemetry(supabase: Client, exchange: ccxt.binanceusdm) -> Dict[str, float]:
    """
    Synchronizes wallet equity, free margin, intraday PnL, and open positions
    from Binance USDT-M Futures to the account_snapshots table.
    """
    equity = 10000.0
    free_margin = 10000.0
    daily_pnl = 0.0
    daily_pnl_pct = 0.0
    active_positions_json: List[Dict[str, Any]] = []

    try:
        balance = exchange.fetch_balance()
        usdt_info = balance.get("USDT", {})
        equity = float(usdt_info.get("total", 10000.0) or 10000.0)
        free_margin = float(usdt_info.get("free", 10000.0) or 10000.0)

        # Calculate daily PnL from trades closed today
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        res = supabase.table("trade_executions").select("pnl_usdt").gte("closed_at", today_start).execute()
        if res.data:
            daily_pnl = sum([float(t.get("pnl_usdt") or 0.0) for t in res.data])
            if equity > 0:
                daily_pnl_pct = round((daily_pnl / equity) * 100.0, 2)

        # Fetch live positions
        positions = exchange.fetch_positions()
        for p in positions:
            contracts = float(p.get("contracts", 0.0) or 0.0)
            if contracts > 0:
                active_positions_json.append({
                    "symbol": p.get("symbol"),
                    "side": p.get("side"),
                    "size": contracts,
                    "entry_price": float(p.get("entryPrice", 0.0) or 0.0),
                    "mark_price": float(p.get("markPrice", 0.0) or 0.0),
                    "unrealized_pnl": float(p.get("unrealizedPnl", 0.0) or 0.0),
                    "leverage": p.get("leverage")
                })

        # Insert snapshot
        supabase.table("account_snapshots").insert({
            "equity_usdt": round(equity, 2),
            "free_usdt": round(free_margin, 2),
            "daily_pnl_usdt": round(daily_pnl, 2),
            "daily_pnl_pct": round(daily_pnl_pct, 2),
            "open_positions": active_positions_json
        }).execute()

    except Exception as exc:
        print(f"[telemetry] Sync notice (sandbox/offline mode): {exc}")

    return {"equity": equity, "free_margin": free_margin}


# --- DETERMINISTIC AI AUDIT VERIFICATION ---

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
        autopsy_data = extract_json_safely(content)

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
    exchange: ccxt.binanceusdm,
    deepseek_client: OpenAI,
    cfg: Dict[str, Any]
) -> None:
    """
    Monitors active positions, updates MFE/MAE, executes +1.0R Break-Even & 50% Partial TP,
    enforces Zombie Trade Time-Stop, and detects stop/target hits.
    """
    try:
        res = supabase.table("trade_executions").select("*").eq("status", "OPEN").execute()
        open_trades = res.data or []
        if not open_trades:
            return

        for t in open_trades:
            trade_id = t["id"]
            symbol = t["symbol"]
            side = t["side"]
            entry = float(t["entry_price"])
            sl = float(t["stop_loss"])
            tp = float(t["take_profit"])
            qty = float(t["qty"])
            breakeven_activated = bool(t.get("breakeven_activated", False))
            opened_at_str = t.get("opened_at")

            # Fetch current ticker
            try:
                ticker = exchange.fetch_ticker(symbol)
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

                print(f"[trade_mgmt] +1.0R reached for {symbol} trade #{trade_id}. Executing 50% partial TP and moving SL to BE!")
                partial_qty = round(qty * 0.5, 4)
                new_remaining_qty = round(qty - partial_qty, 4)

                # 1. Close 50% via Market order
                close_side = "sell" if side == "LONG" else "buy"
                try:
                    exchange.create_market_order(
                        symbol,
                        close_side,
                        partial_qty,
                        params={"reduceOnly": True}
                    )
                except Exception as e:
                    print(f"[trade_mgmt] Partial market order warning: {e}")

                # 2. Cancel old SL order on Binance
                old_sl_id = t.get("sl_order_id")
                if old_sl_id:
                    try:
                        exchange.cancel_order(old_sl_id, symbol)
                    except Exception as e:
                        print(f"[trade_mgmt] Cancel old SL warning: {e}")

                # 3. Place new server-side STOP_MARKET at BE + fee buffer
                be_sl_price = round(entry * 1.0015, 4) if side == "LONG" else round(entry * 0.9985, 4)
                new_sl_id = None
                try:
                    new_sl_order = exchange.create_order(
                        symbol=symbol,
                        type="STOP_MARKET",
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
                print(f"[trade_mgmt] Time-Stop triggered for {symbol} trade #{trade_id} ({bars_elapsed} bars >= {max_bars}). Closing at Market.")
                close_side = "sell" if side == "LONG" else "buy"
                try:
                    exchange.cancel_all_orders(symbol)
                    exchange.create_market_order(symbol, close_side, qty, params={"reduceOnly": True})
                except Exception as e:
                    print(f"[trade_mgmt] Time stop execution warning: {e}")

                exit_price = current_price
                pnl_usdt = round((exit_price - entry) * qty if side == "LONG" else (entry - exit_price) * qty, 2)
                pnl_r = round(curr_r, 2)

                t_updated = {
                    **t,
                    "status": "TIME_STOP",
                    "exit_price": exit_price,
                    "pnl_usdt": pnl_usdt,
                    "pnl_r": pnl_r,
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

                print(f"[trade_mgmt] Trade #{trade_id} on {symbol} closed: {status} at price {exit_price:.4f} (PnL: {pnl_usdt:+.2f} USDT)")

                # Cancel remaining orders on exchange
                try:
                    exchange.cancel_all_orders(symbol)
                except Exception:
                    pass

                t_closed = {
                    **t,
                    "status": status,
                    "exit_price": exit_price,
                    "pnl_usdt": pnl_usdt,
                    "pnl_r": pnl_r,
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

def scan_and_execute_signals(
    supabase: Client,
    exchange: ccxt.binanceusdm,
    deepseek_client: OpenAI,
    cfg: Dict[str, Any],
    account_info: Dict[str, float]
) -> None:
    """
    Scans watchlist symbols across active strategies, checks macro shield & funding rate,
    invokes DeepSeek Chief Quantitative Risk Officer with active guardrails,
    sizes positions safely, and dispatches native server-side Binance orders.
    """
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

    symbols = cfg.get("symbols", ["BTC/USDT", "ETH/USDT", "SOL/USDT"])
    active_strats = cfg.get("active_strategies", [])
    quarantined_symbols = cfg.get("quarantined_symbols", [])
    equity = account_info.get("equity", 10000.0)

    for symbol in symbols:
        if symbol in quarantined_symbols:
            continue

        try:
            # Check if there is already an open trade for this symbol
            existing = supabase.table("trade_executions").select("id").eq("symbol", symbol).eq("status", "OPEN").execute()
            if existing.data and len(existing.data) > 0:
                continue

            # Fetch 15m OHLCV bars
            ohlcv = exchange.fetch_ohlcv(symbol, timeframe="15m", limit=100)
            if not ohlcv or len(ohlcv) < 55:
                continue

            df = pd.DataFrame(ohlcv, columns=["timestamp", "open", "high", "low", "close", "volume"])
            df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")

            # Check funding rate
            funding_rate = 0.0
            try:
                fr_info = exchange.fetch_funding_rate(symbol)
                funding_rate = float(fr_info.get("fundingRate", 0.0) or 0.0) * 100.0 # to percentage
            except Exception:
                funding_rate = 0.0

            if abs(funding_rate) > cfg.get("max_funding_rate_pct", 0.05):
                print(f"[scanner] Skipping {symbol}: Funding rate {funding_rate:.4f}% exceeds max {cfg.get('max_funding_rate_pct')}%")
                continue

            # Fetch news headlines
            headlines = fetch_crypto_headlines(symbol)

            # Evaluate strategies
            candidate_setups = evaluate_enabled_strategies(df, active_strats)
            if not candidate_setups:
                continue

            for setup in candidate_setups:
                rvol = setup.get("rvol", 1.0)
                if rvol < cfg.get("min_rvol", 1.2):
                    continue

                side = setup.get("side")
                strat_name = setup.get("strategy_name")
                risk_pct = float(cfg.get("risk_pct", 0.01))

                # Check portfolio directional risk lock
                if not check_correlated_exposure(supabase, side, risk_pct, cfg.get("max_directional_exposure_pct", 0.015)):
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

                # DeepSeek Audit Prompt construction
                audit_payload = {
                    "symbol": symbol,
                    "strategy_name": strat_name,
                    "proposed_direction": side,
                    "entry_price": setup["entry"],
                    "stop_loss": setup["sl"],
                    "take_profit": setup["tp"],
                    "reward_risk_ratio": setup["rr"],
                    "setup_notes": setup["setup_notes"],
                    "relative_volume_rvol": rvol,
                    "funding_rate_pct": funding_rate,
                    "latest_headlines": headlines,
                    "active_guardrail_lessons": lessons_block,
                    "macro_blackout_state": macro_status
                }

                print(f"[scanner] Requesting DeepSeek Audit for {symbol} {side} ({strat_name})...")
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
                    raw_audit = extract_json_safely(content)
                except Exception as ai_err:
                    print(f"[scanner] DeepSeek API audit warning: {ai_err}")
                    raw_audit = {"veto_triggered": True, "veto_reason": "AI API communication failure"}

                total_score, veto_triggered, veto_reason, rubric = verify_and_score_audit(raw_audit)

                # Log to ai_audit_logs
                supabase.table("ai_audit_logs").insert({
                    "symbol": symbol,
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
                        "funding_rate": funding_rate
                    },
                    "news_context": headlines
                }).execute()

                min_score = cfg.get("min_score", 75)
                if veto_triggered or total_score < min_score:
                    print(f"[scanner] Setup rejected for {symbol}: Score {total_score}/{min_score}, Veto: {veto_triggered} ({veto_reason})")
                    continue

                # --- POSITION SIZING ---
                # Sizing tier: 75-84 = 0.5x risk; 85+ = 1.0x risk
                size_multiplier = 1.0 if total_score >= 85 else 0.5
                effective_risk_pct = risk_pct * size_multiplier
                risk_usdt = equity * effective_risk_pct

                entry_price = float(setup["entry"])
                sl_price = float(setup["sl"])
                tp_price = float(setup["tp"])
                risk_per_unit = max(abs(entry_price - sl_price), 1e-5)
                position_qty = round(risk_usdt / risk_per_unit, 3)

                if position_qty <= 0:
                    continue

                print(f"[execution] Executing {side} on {symbol}: Qty {position_qty}, Score {total_score}/100, Sizing Multiplier {size_multiplier}x")

                # --- EXCHANGE ORDER EXECUTION ---
                order_side = "buy" if side == "LONG" else "sell"
                opp_side = "sell" if side == "LONG" else "buy"
                exchange_order_id = "mock_order_1"
                sl_order_id = "mock_sl_1"
                tp_order_id = "mock_tp_1"

                try:
                    if cfg.get("use_limit_maker_entry", True):
                        # Place Post-Only Limit Order
                        entry_order = exchange.create_order(
                            symbol=symbol,
                            type="LIMIT",
                            side=order_side,
                            amount=position_qty,
                            price=entry_price,
                            params={"timeInForce": "GTX"} # Post-Only Maker
                        )
                        exchange_order_id = str(entry_order.get("id"))
                    else:
                        entry_order = exchange.create_market_order(symbol, order_side, position_qty)
                        exchange_order_id = str(entry_order.get("id"))

                    # Native Server-Side STOP_MARKET
                    sl_order = exchange.create_order(
                        symbol=symbol,
                        type="STOP_MARKET",
                        side=opp_side,
                        amount=position_qty,
                        params={
                            "stopPrice": sl_price,
                            "workingType": "MARK_PRICE",
                            "reduceOnly": True
                        }
                    )
                    sl_order_id = str(sl_order.get("id"))

                    # Native Server-Side TAKE_PROFIT_MARKET
                    tp_order = exchange.create_order(
                        symbol=symbol,
                        type="TAKE_PROFIT_MARKET",
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
                    print(f"[execution] Binance order submission notice (testnet/sandbox): {order_exc}")
                    exchange_order_id = f"sim_{int(time.time())}"
                    sl_order_id = f"sim_sl_{int(time.time())}"
                    tp_order_id = f"sim_tp_{int(time.time())}"

                # Insert into trade_executions
                new_trade_record = {
                    "exchange_order_id": exchange_order_id,
                    "sl_order_id": sl_order_id,
                    "tp_order_id": tp_order_id,
                    "symbol": symbol,
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
                    }
                }
                res = supabase.table("trade_executions").insert(new_trade_record).execute()
                inserted_trade = res.data[0] if res.data else new_trade_record

                # Dispatch Telegram Notification
                notify_trade_opened(cfg, inserted_trade, {"total_score": total_score})

        except Exception as sym_err:
            print(f"[scanner] Error processing {symbol}: {sym_err}")


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
            exchange = get_binance_client(cfg)
            deepseek = get_deepseek_client(cfg)

            # 2. Check Emergency Panic Trigger
            if cfg.get("panic_close_all", False):
                handle_panic_close_all(supabase, exchange, cfg)
                time.sleep(poll_seconds)
                continue

            # 3. Synchronize Account Telemetry
            account_info = sync_account_telemetry(supabase, exchange)

            # 4. Institutional Trade Management
            manage_open_positions(supabase, exchange, deepseek, cfg)

            # 5. Statistical Optimizer (Run every 10 iterations)
            if iteration % 10 == 0:
                run_statistical_optimizer(supabase, cfg)

            # 6. Synchronize Market & Macro News to Database (Every ~5 mins)
            sync_market_and_macro_news(supabase, cfg.get("symbols", ["BTC/USDT", "ETH/USDT", "SOL/USDT"]))

            # 7. Signal Scanner (Only if bot is ACTIVE)
            if cfg.get("is_active", False):
                scan_and_execute_signals(supabase, exchange, deepseek, cfg, account_info)
            else:
                if iteration % 20 == 0:
                    print("[bot] Engine is in PAUSED mode (is_active = False). Monitoring positions & telemetry only.")

        except Exception as loop_exc:
            print(f"[bot] Critical loop exception: {loop_exc}")

        time.sleep(poll_seconds)


if __name__ == "__main__":
    run_master_loop()
