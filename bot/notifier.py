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


def notify_trade_opened(cfg: Dict[str, Any], trade: Dict[str, Any], score_info: Dict[str, Any]) -> None:
    """Dispatches Trade Opened notification with full quantitative context."""
    symbol = trade.get("symbol")
    side = trade.get("side")
    entry = trade.get("entry_price")
    sl = trade.get("stop_loss")
    tp = trade.get("take_profit")
    qty = trade.get("qty")
    strat = trade.get("strategy_name")
    score = score_info.get("total_score", "N/A")

    msg = (
        f"<b>Action:</b> NEW {side} EXECUTION\n"
        f"<b>Symbol:</b> <code>{symbol}</code>\n"
        f"<b>Strategy:</b> <code>{strat}</code>\n"
        f"<b>Entry Price:</b> <code>{entry:.4f}</code>\n"
        f"<b>Stop Loss:</b> <code>{sl:.4f}</code>\n"
        f"<b>Take Profit:</b> <code>{tp:.4f}</code>\n"
        f"<b>Position Qty:</b> <code>{qty}</code>\n"
        f"<b>DeepSeek Audit Score:</b> <b>{score}/100</b>\n"
        f"<b>Native Orders:</b> Server-side STOP_MARKET & TAKE_PROFIT active on Binance."
    )
    send_telegram_alert(cfg, f"POSITION OPENED: {symbol} ({side})", msg, level="TRADE_OPEN")


def notify_breakeven_partial(cfg: Dict[str, Any], trade: Dict[str, Any], current_price: float) -> None:
    """Dispatches notification when +1.0R is reached, 50% TP closed, and SL moved to BE."""
    symbol = trade.get("symbol")
    side = trade.get("side")
    entry = trade.get("entry_price")

    msg = (
        f"<b>Asset:</b> <code>{symbol}</code> ({side})\n"
        f"<b>Trigger:</b> +1.0R Milestone Reached\n"
        f"<b>Action Executed:</b>\n"
        f"  • <b>50% Partial Profit:</b> Market order closed\n"
        f"  • <b>Remaining 50%:</b> Stop Loss shifted to <code>{entry:.4f}</code> (Break-Even + Fee Buffer)\n"
        f"<b>Status:</b> <b>RISK-FREE TRADE LOCKED</b>"
    )
    send_telegram_alert(cfg, f"BREAK-EVEN & PARTIAL PROFIT LOCKED: {symbol}", msg, level="BREAKEVEN")


def notify_trade_closed(cfg: Dict[str, Any], trade: Dict[str, Any], autopsy: Optional[Dict[str, Any]] = None) -> None:
    """Dispatches trade closure notification, appending forensic autopsy if loss."""
    symbol = trade.get("symbol")
    status = trade.get("status")
    pnl_usdt = trade.get("pnl_usdt", 0.0)
    pnl_r = trade.get("pnl_r", 0.0)
    mfe = trade.get("mfe_r", 0.0)
    mae = trade.get("mae_r", 0.0)

    is_win = pnl_usdt > 0
    level = "CLOSE_WIN" if is_win else "CLOSE_LOSS"
    verdict = "WIN" if is_win else "LOSS"

    msg = (
        f"<b>Symbol:</b> <code>{symbol}</code>\n"
        f"<b>Result:</b> <b>{verdict} ({status})</b>\n"
        f"<b>Net PnL:</b> <code>{pnl_usdt:+.2f} USDT</code> ({pnl_r:+.2f}R)\n"
        f"<b>MFE (Max Favorable):</b> <code>{mfe:.2f}R</code>\n"
        f"<b>MAE (Max Adverse):</b> <code>{mae:.2f}R</code>\n"
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
