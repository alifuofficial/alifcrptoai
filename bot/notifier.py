"""
alifcrptoai - Telegram Push & Heartbeat Telemetry Module
Author & Developer: Alifu Haji (Individual Developer)

Dispatches structured, institutional notifications for:
- Trade Openings & Risk Allocations
- +1.0R Break-Even & 50% Partial TP Locks
- Trade Closures & Post-Mortem Autopsy Diagnoses
- Strategy Auto-Quarantining & Self-Optimization
- Emergency Panic Switches & Critical Error Alerts
"""

import os
import requests
from typing import Dict, Any, Optional


def send_telegram_alert(
    cfg: Dict[str, Any],
    title: str,
    message: str,
    level: str = "INFO"
) -> bool:
    """
    Sends formatted HTML notification via Telegram Bot API.
    Honors config overrides first, falling back to environment variables.
    """
    # Check if telegram notifications are enabled
    if not cfg.get("telegram_notifications", True):
        return False

    token = cfg.get("telegram_token_override") or os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = cfg.get("telegram_chat_id_override") or os.getenv("TELEGRAM_CHAT_ID")

    if not token or not chat_id:
        return False

    # Emoji badge per level
    badges = {
        "INFO": "ℹ️",
        "TRADE_OPEN": "🚀",
        "BREAKEVEN": "🛡️",
        "CLOSE_WIN": "🎯",
        "CLOSE_LOSS": "⚠️",
        "AUTOPSY": "🔬",
        "QUARANTINE": "🛑",
        "PANIC": "🚨",
        "ERROR": "❌"
    }
    badge = badges.get(level, "📊")

    text = f"<b>{badge} [alifcrptoai] {title}</b>\n\n{message}\n\n<i>System: Contabo 6vCPU/12GB | Developed by Alifu Haji</i>"

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True
    }

    try:
        res = requests.post(url, json=payload, timeout=6)
        return res.status_code == 200
    except Exception as exc:
        print(f"[notifier] Warning: Telegram notification failed: {exc}")
        return False


def get_portfolio_performance_stats(supabase_client: Any) -> Dict[str, Any]:
    """
    Computes overall win rate and performance metrics from trade_executions.
    """
    if not supabase_client:
        return {
            "total_closed": 0,
            "wins": 0,
            "losses": 0,
            "breakevens": 0,
            "win_rate_pct": 0.0,
            "total_pnl_usdt": 0.0,
            "total_pnl_r": 0.0,
            "profit_factor": 0.0
        }
    try:
        res = supabase_client.table("trade_executions").select("status, pnl_usdt, pnl_r").in_(
            "status", ["CLOSED_TP", "CLOSED_SL", "TIME_STOP", "MANUAL_CLOSE"]
        ).execute()
        trades = res.data or []
        total_closed = len(trades)
        if total_closed == 0:
            return {
                "total_closed": 0,
                "wins": 0,
                "losses": 0,
                "breakevens": 0,
                "win_rate_pct": 0.0,
                "total_pnl_usdt": 0.0,
                "total_pnl_r": 0.0,
                "profit_factor": 0.0
            }

        wins = sum(1 for t in trades if float(t.get("pnl_usdt") or 0.0) > 0)
        losses = sum(1 for t in trades if float(t.get("pnl_usdt") or 0.0) < 0)
        breakevens = sum(1 for t in trades if float(t.get("pnl_usdt") or 0.0) == 0)
        win_rate_pct = round((wins / total_closed) * 100.0, 1)
        total_pnl_usdt = round(sum(float(t.get("pnl_usdt") or 0.0) for t in trades), 2)
        total_pnl_r = round(sum(float(t.get("pnl_r") or 0.0) for t in trades), 2)
        gross_wins = sum(float(t.get("pnl_usdt") or 0.0) for t in trades if float(t.get("pnl_usdt") or 0.0) > 0)
        gross_losses = abs(sum(float(t.get("pnl_usdt") or 0.0) for t in trades if float(t.get("pnl_usdt") or 0.0) < 0))
        pf = round(gross_wins / gross_losses, 2) if gross_losses > 0 else (99.0 if gross_wins > 0 else 0.0)

        return {
            "total_closed": total_closed,
            "wins": wins,
            "losses": losses,
            "breakevens": breakevens,
            "win_rate_pct": win_rate_pct,
            "total_pnl_usdt": total_pnl_usdt,
            "total_pnl_r": total_pnl_r,
            "profit_factor": pf
        }
    except Exception as e:
        print(f"[notifier] Error computing portfolio stats: {e}")
        return {
            "total_closed": 0,
            "wins": 0,
            "losses": 0,
            "breakevens": 0,
            "win_rate_pct": 0.0,
            "total_pnl_usdt": 0.0,
            "total_pnl_r": 0.0,
            "profit_factor": 0.0
        }


def notify_trade_opened(
    cfg: Dict[str, Any], 
    trade: Dict[str, Any], 
    score_info: Dict[str, Any],
    stats: Optional[Dict[str, Any]] = None,
    mode_info: Optional[Dict[str, Any]] = None
) -> None:
    """Dispatches Trade Opened notification with full quantitative context and win rate."""
    symbol = trade.get("symbol")
    side = trade.get("side")
    entry = trade.get("entry_price")
    sl = trade.get("stop_loss")
    tp = trade.get("take_profit")
    qty = trade.get("qty")
    strat = trade.get("strategy_name")
    score = score_info.get("total_score", "N/A")
    model_name = score_info.get("model_used", "AI Auditor")

    # Win rate line
    wr_text = f"<b>{stats['win_rate_pct']:.1f}%</b> ({stats['wins']}W / {stats['losses']}L / {stats['breakevens']}BE)" if stats and stats.get("total_closed", 0) > 0 else "<b>Awaiting first closed trade</b>"

    # Execution Mode line
    is_sim = trade.get("is_simulated", False) or (mode_info and mode_info.get("is_zero_balance"))
    if is_sim:
        virt_equity = float(mode_info.get("virtual_equity", 1000.0) if mode_info else 1000.0)
        mode_line = (
            f"⚡ <b>Mode:</b> <code>Zero-Balance Simulated</code> (Virtual Capital: ${virt_equity:,.2f})\n"
            f"<i>(Acting like you have balance. Depositing funds to Binance/Bybit auto-triggers live trades.)</i>"
        )
    else:
        real_eq = float(mode_info.get("real_equity", 0.0) if mode_info else 0.0)
        mode_line = f"🟢 <b>Mode:</b> <code>Live Margin Execution</code> (Real Balance: ${real_eq:,.2f})"

    msg = (
        f"<b>Action:</b> NEW {side} EXECUTION\n"
        f"<b>Symbol:</b> <code>{symbol}</code>\n"
        f"<b>Strategy:</b> <code>{strat}</code>\n"
        f"<b>Entry Price:</b> <code>{entry:.4f}</code>\n"
        f"<b>Stop Loss:</b> <code>{sl:.4f}</code>\n"
        f"<b>Take Profit:</b> <code>{tp:.4f}</code>\n"
        f"<b>Position Qty:</b> <code>{qty}</code>\n"
        f"<b>Audit / Engine:</b> <b>{score}/100</b> (<i>{model_name}</i>)\n"
        f"{mode_line}\n\n"
        f"📊 <b>Portfolio Win Rate:</b> {wr_text}"
    )
    send_telegram_alert(cfg, f"POSITION OPENED: {symbol} ({side})", msg, level="TRADE_OPEN")


def notify_breakeven_partial(
    cfg: Dict[str, Any], 
    trade: Dict[str, Any], 
    current_price: float,
    stats: Optional[Dict[str, Any]] = None
) -> None:
    """Dispatches notification when +1.0R is reached, 50% TP closed, and SL moved to BE."""
    symbol = trade.get("symbol")
    side = trade.get("side")
    entry = trade.get("entry_price")
    wr_info = f"\n📊 <b>Portfolio Win Rate:</b> <b>{stats['win_rate_pct']:.1f}%</b> ({stats['wins']}W / {stats['losses']}L)" if stats and stats.get("total_closed", 0) > 0 else ""

    msg = (
        f"<b>Asset:</b> <code>{symbol}</code> ({side})\n"
        f"<b>Trigger:</b> +1.0R Milestone Reached\n"
        f"<b>Action Executed:</b>\n"
        f"  • <b>50% Partial Profit:</b> Market order closed\n"
        f"  • <b>Remaining 50%:</b> Stop Loss shifted to <code>{entry:.4f}</code> (Break-Even + Fee Buffer)\n"
        f"<b>Status:</b> <b>RISK-FREE TRADE LOCKED</b>{wr_info}"
    )
    send_telegram_alert(cfg, f"BREAK-EVEN & PARTIAL PROFIT LOCKED: {symbol}", msg, level="BREAKEVEN")


def notify_scaled_exit(
    cfg: Dict[str, Any],
    trade: Dict[str, Any],
    step_name: str,
    current_price: float,
    notes: str,
    stats: Optional[Dict[str, Any]] = None
) -> None:
    """Dispatches notification when an institutional Banker's Scaled Target or Trailing Stop triggers."""
    symbol = trade.get("symbol")
    side = trade.get("side")
    wr_info = f"\n📊 <b>Portfolio Win Rate:</b> <b>{stats['win_rate_pct']:.1f}%</b> ({stats['wins']}W / {stats['losses']}L)" if stats and stats.get("total_closed", 0) > 0 else ""
    msg = (
        f"<b>Asset:</b> <code>{symbol}</code> ({side})\n"
        f"<b>Milestone:</b> <b>{step_name}</b>\n"
        f"<b>Current Price:</b> <code>{current_price}</code>\n"
        f"<b>Execution Detail:</b> {notes}\n"
        f"<b>Status:</b> <b>INSTITUTIONAL PROFIT SECURED</b>{wr_info}"
    )
    send_telegram_alert(cfg, f"BANKER'S SCALE EXIT: {symbol} ({step_name})", msg, level="BREAKEVEN")


def notify_trade_closed(
    cfg: Dict[str, Any], 
    trade: Dict[str, Any], 
    autopsy: Optional[Dict[str, Any]] = None,
    stats: Optional[Dict[str, Any]] = None
) -> None:
    """Dispatches trade closure notification with forensic autopsy and live winning rate."""
    symbol = trade.get("symbol")
    status = trade.get("status")
    pnl_usdt = trade.get("pnl_usdt", 0.0)
    pnl_r = trade.get("pnl_r", 0.0)
    mfe = trade.get("mfe_r", 0.0)
    mae = trade.get("mae_r", 0.0)

    is_win = pnl_usdt > 0
    level = "CLOSE_WIN" if is_win else "CLOSE_LOSS"
    verdict = "WIN" if is_win else "LOSS"

    is_sim = trade.get("is_simulated", False) or str(trade.get("exchange_order_id", "")).startswith("ZERO_BAL_") or str(trade.get("exchange_order_id", "")).startswith("ANALYTICS_") or str(trade.get("exchange_order_id", "")).startswith("sim_")
    exec_mode_badge = "⚡ Zero-Balance Simulated Mode" if is_sim else "🟢 Live Exchange Margin"

    wr_card = ""
    if stats and stats.get("total_closed", 0) > 0:
        wr_card = (
            f"\n\n🏆 <b>PORTFOLIO WINNING RATE:</b> <b>{stats['win_rate_pct']:.1f}%</b> ({stats['wins']}W / {stats['losses']}L / {stats['breakevens']}BE)\n"
            f"💰 <b>Cumulative Net PnL:</b> <code>{stats['total_pnl_usdt']:+.2f} USDT</code> (<code>{stats['total_pnl_r']:+.2f}R</code>)\n"
            f"📈 <b>Profit Factor:</b> <code>{stats['profit_factor']:.2f}</code> | <b>Closed Trades:</b> <code>{stats['total_closed']}</code>\n"
            f"💼 <b>Execution Category:</b> <code>{exec_mode_badge}</code>"
        )

    msg = (
        f"<b>Symbol:</b> <code>{symbol}</code>\n"
        f"<b>Result:</b> <b>{verdict} ({status})</b>\n"
        f"<b>Trade PnL:</b> <code>{pnl_usdt:+.2f} USDT</code> ({pnl_r:+.2f}R)\n"
        f"<b>MFE (Max Favorable):</b> <code>{mfe:.2f}R</code>\n"
        f"<b>MAE (Max Adverse):</b> <code>{mae:.2f}R</code>"
        f"{wr_card}"
    )

    if autopsy:
        cat = autopsy.get("failure_category", "Unknown")
        analysis = autopsy.get("root_cause_analysis", "")
        rule = autopsy.get("prompt_guardrail_rule", "")
        msg += (
            f"\n🔬 <b>POST-MORTEM FORENSIC AUTOPSY</b>\n"
            f"<b>Category:</b> <code>{cat}</code>\n"
            f"<b>Root Cause:</b> {analysis}\n"
            f"<b>Auto-Guardrail Injected:</b> <i>{rule}</i>"
        )

    send_telegram_alert(cfg, f"TRADE CLOSED: {symbol} ({verdict})", msg, level=level)


def notify_strategy_quarantined(cfg: Dict[str, Any], strategy_name: str, win_rate: float, pf: float) -> None:
    """Dispatches alert when statistical self-optimizer pauses an underperforming strategy."""
    msg = (
        f"<b>Strategy:</b> <code>{strategy_name}</code>\n"
        f"<b>Condition:</b> Profit Factor {pf:.2f} &lt; 0.80 over &gt;= 8 sample trades\n"
        f"<b>Win Rate:</b> <code>{win_rate:.1f}%</code>\n"
        f"<b>Action:</b> Automatically paused in active strategies to safeguard portfolio equity.\n"
        f"<b>Resolution:</b> Requires user review in Command Center or lesson parameter tuning."
    )
    send_telegram_alert(cfg, f"STRATEGY AUTO-QUARANTINED: {strategy_name}", msg, level="QUARANTINE")


def notify_panic_activated(cfg: Dict[str, Any], reason: str = "User Emergency Panic Switch Triggered") -> None:
    """Dispatches emergency panic alert."""
    msg = (
        f"<b>Event:</b> EMERGENCY FLATTEN ACTIVATED\n"
        f"<b>Trigger Reason:</b> {reason}\n"
        f"<b>Actions Executed:</b>\n"
        f"  1. All Binance open conditional & limit orders cancelled.\n"
        f"  2. All active open futures positions closed at Market.\n"
        f"  3. Bot state set to PAUSED (is_active = False).\n"
        f"<b>Current Status:</b> 100% USDT Cash Margin."
    )
    send_telegram_alert(cfg, "EMERGENCY PANIC CLOSE ALL EXECUTED", msg, level="PANIC")
