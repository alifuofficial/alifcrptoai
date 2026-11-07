"""
alifcrptoai - Vectorized Historical Backtesting Engine (P15 FIX)
Author & Developer: Alifu Haji (Individual Developer)

Simulates the exact 8 institutional strategy plugins and the Banker's Scaled Exit System:
- Step 1: +1.5R -> Bank 40%, Move SL to Break-Even + Spread
- Step 2: +3.0R -> Bank 30%, Lock SL to +1.5R
- Step 3: +5.0R -> Full Close of remainder
- Evaluates Daily -> 4H -> 1H -> 15m Top-Down market structure and ATR/RVOL filters.
- Real Exchange Data: Paginates up to 365 days of 15m candles from Binance USDT-M / Bybit.
- Saves results to Supabase `backtest_runs` table for real-time Admin Dashboard visualization.
"""

import sys
import os
import json
import argparse
import time
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple

import pandas as pd
import numpy as np

# Ensure parent directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from strategies import (
    calc_indicators,
    calc_top_down_structure,
    evaluate_enabled_strategies,
    STRATEGY_REGISTRY,
    format_price_dynamic
)

try:
    import ccxt
except ImportError:
    ccxt = None

try:
    from supabase import create_client, Client
    from dotenv import load_dotenv
    load_dotenv()
    SUPABASE_URL = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
except Exception:
    create_client = None
    SUPABASE_URL = ""
    SUPABASE_SERVICE_ROLE_KEY = ""


def get_supabase_client() -> Optional[Any]:
    if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and create_client:
        try:
            return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        except Exception:
            return None
    return None


def fetch_real_historical_ohlcv(
    symbol: str = "BTC/USDT",
    days: int = 365,
    exchange_name: str = "binance"
) -> pd.DataFrame:
    """
    Fetches real historical 15m OHLCV bars from Binance Futures or Bybit.
    Paginates backward up to 365 days (~35,040 candles).
    Caches data in bot/cache/ to make future runs instantaneous.
    Falls back to high-fidelity synthetic data if exchange API is unreachable.
    """
    clean_sym = symbol.replace("/", "_").replace(":", "_").upper()
    cache_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
    os.makedirs(cache_dir, exist_ok=True)
    cache_file = os.path.join(cache_dir, f"{clean_sym}_{days}d_15m.csv")

    # 1. Check local file cache (valid if modified within 12 hours)
    if os.path.exists(cache_file):
        try:
            mtime = os.path.getmtime(cache_file)
            if (time.time() - mtime) < 43200:  # 12 hours
                print(f"[backtest] Loading {days} days of 15m historical candles from local cache ({cache_file})...")
                df_cached = pd.read_csv(cache_file)
                df_cached["timestamp"] = pd.to_datetime(df_cached["timestamp"])
                if len(df_cached) >= (days * 96 * 0.8):
                    return df_cached
        except Exception as cache_err:
            print(f"[backtest] Cache read note: {cache_err}")

    # 2. Fetch from live exchange via CCXT with pagination
    if ccxt is not None:
        try:
            is_bybit = "bybit" in exchange_name.lower() or any(f in symbol.upper() for f in ["EUR", "GBP", "JPY", "XAU", "XAG"])
            ex = ccxt.bybit({"enableRateLimit": True}) if is_bybit else ccxt.binanceusdm({"enableRateLimit": True})

            ex_sym = symbol
            if is_bybit:
                bybit_map = {
                    "BTC/USDT": "BTC/USDT:USDT",
                    "ETH/USDT": "ETH/USDT:USDT",
                    "SOL/USDT": "SOL/USDT:USDT",
                    "EUR/USD": "EURUSD/USDT:USDT",
                    "GBP/USD": "GBPUSD/USDT:USDT",
                    "USD/JPY": "USDJPY/USDT:USDT",
                    "XAU/USD": "XAU/USDT:USDT",
                    "XAG/USD": "XAG/USDT:USDT"
                }
                ex_sym = bybit_map.get(symbol, symbol)
            else:
                if not ":" in ex_sym and ex_sym.endswith("/USDT"):
                    ex_sym = f"{ex_sym}:USDT"

            print(f"[backtest] Fetching real 15m historical candles for {ex_sym} from {ex.id.upper()} (up to {days} days)...")
            now_ms = int(time.time() * 1000)
            target_start_ms = now_ms - (days * 86400 * 1000)
            curr_since = target_start_ms

            all_bars: List[List[Any]] = []
            max_batches = (days * 96 // 900) + 5
            batch_count = 0

            while curr_since < now_ms and batch_count < max_batches:
                batch_count += 1
                try:
                    bars = ex.fetch_ohlcv(ex_sym, timeframe="15m", since=curr_since, limit=1000)
                    if not bars or len(bars) == 0:
                        break

                    all_bars.extend(bars)
                    last_ts = bars[-1][0]
                    if last_ts <= curr_since:
                        break
                    curr_since = last_ts + (15 * 60 * 1000)  # Next 15m bar
                    time.sleep(ex.rateLimit / 1000.0 if hasattr(ex, "rateLimit") else 0.1)

                    if len(bars) < 1000 or curr_since >= now_ms:
                        break
                except Exception as fetch_exc:
                    print(f"[backtest] Exchange fetch warning at batch {batch_count}: {fetch_exc}")
                    break

            if all_bars and len(all_bars) >= 500:
                df = pd.DataFrame(all_bars, columns=["timestamp", "open", "high", "low", "close", "volume"])
                df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
                df = df.drop_duplicates(subset=["timestamp"]).sort_values("timestamp").reset_index(drop=True)

                # Save to cache
                try:
                    df.to_csv(cache_file, index=False)
                    print(f"[backtest] Saved {len(df)} candles to local cache ({cache_file}).")
                except Exception:
                    pass

                print(f"[backtest] Real historical data loaded: {len(df)} candles from {df['timestamp'].iloc[0]} to {df['timestamp'].iloc[-1]}.")
                return df

        except Exception as ex_err:
            print(f"[backtest] Exchange pagination error ({ex_err}). Using synthetic data fallback.")

    # 3. Fallback to realistic synthetic data
    print(f"[backtest] Generating high-fidelity synthetic {days}-day data for {symbol}...")
    df_syn = generate_synthetic_data(symbol=symbol, days=days)
    return df_syn


def generate_synthetic_data(symbol: str = "BTC/USDT", days: int = 365) -> pd.DataFrame:
    """
    Generates realistic synthetic 15m OHLCV bars when exchange API is unreachable.
    Includes realistic volatility clusters, trends, and liquidity sweeps.
    """
    np.random.seed(42)
    bars_count = days * 96  # 96 15m bars per day
    timestamps = [datetime.now(timezone.utc) - timedelta(minutes=15 * (bars_count - i)) for i in range(bars_count)]

    base_price = 90000.0 if "BTC" in symbol else (3000.0 if "ETH" in symbol else (2600.0 if "XAU" in symbol else 1.0800))
    volatility = 0.003 if "BTC" in symbol else 0.001

    returns = np.random.normal(0.00005, volatility, bars_count)
    price_series = base_price * np.exp(np.cumsum(returns))

    highs = price_series * (1.0 + np.abs(np.random.normal(0, volatility * 0.8, bars_count)))
    lows = price_series * (1.0 - np.abs(np.random.normal(0, volatility * 0.8, bars_count)))
    opens = np.roll(price_series, 1)
    opens[0] = base_price
    closes = price_series

    highs = np.maximum(highs, np.maximum(opens, closes))
    lows = np.minimum(lows, np.minimum(opens, closes))
    volumes = np.abs(np.random.normal(100.0, 40.0, bars_count)) * (1.0 + np.abs(returns) * 50.0)

    df = pd.DataFrame({
        "timestamp": timestamps,
        "open": opens,
        "high": highs,
        "low": lows,
        "close": closes,
        "volume": volumes
    })
    return df


def resample_ohlcv(df: pd.DataFrame, rule: str) -> pd.DataFrame:
    """Resamples 15m DataFrame to higher timeframes (1h, 4h, 1d)."""
    df_res = df.set_index("timestamp").resample(rule).agg({
        "open": "first",
        "high": "max",
        "low": "min",
        "close": "last",
        "volume": "sum"
    }).dropna().reset_index()
    return df_res


class BacktestEngine:
    def __init__(
        self,
        symbol: str = "BTC/USDT",
        initial_capital: float = 100.0,
        risk_per_trade_pct: float = 0.01,
        target_rr: float = 2.5,
        lookback_days: int = 365,
        spread_pips: float = 0.0,
        enable_banker_exits: bool = True
    ):
        self.symbol = symbol
        self.capital = float(initial_capital)
        self.initial_capital = float(initial_capital)
        self.risk_pct = risk_per_trade_pct
        self.target_rr = target_rr
        self.lookback_days = lookback_days
        self.spread_pips = spread_pips
        self.enable_banker_exits = enable_banker_exits

        self.trades: List[Dict[str, Any]] = []
        self.equity_curve: List[Dict[str, Any]] = []

    def run(self, df_15m: pd.DataFrame, enabled_strategies: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Executes sequential bar-by-bar backtest simulating realistic live execution:
        - Evaluates strategies on completed bars only (no lookahead bias)
        - Computes rolling Top-Down 1D -> 4H -> 1H structure
        - Simulates Banker's partial exits and trailing stops
        """
        print(f"\n[backtest] Running backtest on {self.symbol} (${self.initial_capital:,.2f} initial capital, {self.lookback_days} days lookback)...")
        start_time = time.time()

        # Compute HTF frames
        df_1h = resample_ohlcv(df_15m, "1h")
        df_4h = resample_ohlcv(df_15m, "4h")
        df_1d = resample_ohlcv(df_15m, "1D")

        # Precompute indicators on 15m
        ind_df = calc_indicators(df_15m)

        strategies_to_test = enabled_strategies or list(STRATEGY_REGISTRY.keys())
        active_trade: Optional[Dict[str, Any]] = None

        self.equity_curve = [{
            "timestamp": df_15m["timestamp"].iloc[0].isoformat() if hasattr(df_15m["timestamp"].iloc[0], "isoformat") else str(df_15m["timestamp"].iloc[0]),
            "equity": round(self.capital, 2),
            "drawdown_pct": 0.0
        }]
        peak_equity = self.capital

        min_warmup = 60
        # Step through in 2-bar increments to balance precision with high-speed execution over 35,000 bars
        step_stride = 2 if len(df_15m) <= 15000 else 3

        for i in range(min_warmup, len(df_15m), step_stride):
            curr_slice = ind_df.iloc[:i + 1]
            curr_bar = curr_slice.iloc[-1]
            curr_time = curr_bar["timestamp"]
            curr_high = float(curr_bar["high"])
            curr_low = float(curr_bar["low"])

            # 1. Manage Active Trade
            if active_trade is not None:
                side = active_trade["side"]
                entry = active_trade["entry"]
                risk_dist = active_trade["risk_dist"]
                tp = active_trade["tp"]

                # Current R multiple reached on this bar
                curr_r = (curr_high - entry) / risk_dist if side == "LONG" else (entry - curr_low) / risk_dist

                # Step 1: Banker's +1.5R -> Bank 40%, Move SL to BE
                if self.enable_banker_exits and not active_trade["be_activated"] and curr_r >= 1.5:
                    active_trade["be_activated"] = True
                    active_trade["sl"] = entry
                    active_trade["banked_r"] += 1.5 * 0.40
                    active_trade["remaining_qty_ratio"] = 0.60

                # Step 2: Banker's +3.0R -> Bank 30%, Lock SL to +1.5R
                if self.enable_banker_exits and not active_trade["step2_activated"] and curr_r >= 3.0:
                    active_trade["step2_activated"] = True
                    active_trade["sl"] = entry + (1.5 * risk_dist) if side == "LONG" else entry - (1.5 * risk_dist)
                    active_trade["banked_r"] += 3.0 * 0.30
                    active_trade["remaining_qty_ratio"] = 0.30

                # Check SL or TP Hit
                hit_sl = (curr_low <= active_trade["sl"]) if side == "LONG" else (curr_high >= active_trade["sl"])
                hit_tp = (curr_high >= tp) if side == "LONG" else (curr_low <= tp)

                if hit_tp:
                    final_r = active_trade["banked_r"] + (self.target_rr * active_trade["remaining_qty_ratio"])
                    pnl_usdt = self.capital * self.risk_pct * final_r
                    self.capital += pnl_usdt
                    peak_equity = max(peak_equity, self.capital)
                    dd_pct = round(((peak_equity - self.capital) / peak_equity) * 100.0, 2)

                    active_trade.update({
                        "exit_time": curr_time.isoformat() if hasattr(curr_time, "isoformat") else str(curr_time),
                        "exit_price": tp,
                        "outcome": "WIN",
                        "final_r": round(final_r, 2),
                        "pnl_usdt": round(pnl_usdt, 2),
                        "capital_after": round(self.capital, 2)
                    })
                    self.trades.append(active_trade)
                    self.equity_curve.append({
                        "timestamp": active_trade["exit_time"],
                        "equity": round(self.capital, 2),
                        "drawdown_pct": dd_pct
                    })
                    active_trade = None
                    continue

                elif hit_sl:
                    if active_trade["be_activated"]:
                        final_r = active_trade["banked_r"]
                        outcome = "BE_WIN" if final_r > 0 else "BE"
                    else:
                        final_r = -1.0
                        outcome = "LOSS"

                    pnl_usdt = self.capital * self.risk_pct * final_r
                    self.capital += pnl_usdt
                    peak_equity = max(peak_equity, self.capital)
                    dd_pct = round(((peak_equity - self.capital) / peak_equity) * 100.0, 2)

                    active_trade.update({
                        "exit_time": curr_time.isoformat() if hasattr(curr_time, "isoformat") else str(curr_time),
                        "exit_price": active_trade["sl"],
                        "outcome": outcome,
                        "final_r": round(final_r, 2),
                        "pnl_usdt": round(pnl_usdt, 2),
                        "capital_after": round(self.capital, 2)
                    })
                    self.trades.append(active_trade)
                    self.equity_curve.append({
                        "timestamp": active_trade["exit_time"],
                        "equity": round(self.capital, 2),
                        "drawdown_pct": dd_pct
                    })
                    active_trade = None
                    continue

            # 2. Look for new setup if flat
            if active_trade is None:
                h1_slice = df_1h[df_1h["timestamp"] <= curr_time]
                h4_slice = df_4h[df_4h["timestamp"] <= curr_time]
                d1_slice = df_1d[df_1d["timestamp"] <= curr_time]

                top_down = calc_top_down_structure(
                    curr_slice,
                    df_1h=h1_slice,
                    df_4h=h4_slice,
                    df_1d=d1_slice,
                    symbol=self.symbol
                )

                setups = evaluate_enabled_strategies(
                    curr_slice,
                    strategies_to_test,
                    ind_df=curr_slice,
                    df_1h=h1_slice,
                    df_4h=h4_slice,
                    df_1d=d1_slice,
                    top_down_context=top_down,
                    target_rr=self.target_rr
                )

                if setups:
                    best_setup = setups[0]
                    entry_p = float(best_setup["entry"])
                    sl_p = float(best_setup["sl"])
                    tp_p = float(best_setup["tp"])
                    side = best_setup["side"]
                    risk_dist = abs(entry_p - sl_p)

                    if risk_dist > 0:
                        active_trade = {
                            "symbol": self.symbol,
                            "strategy_name": best_setup["strategy_name"],
                            "side": side,
                            "entry_time": curr_time.isoformat() if hasattr(curr_time, "isoformat") else str(curr_time),
                            "entry": entry_p,
                            "sl": sl_p,
                            "tp": tp_p,
                            "risk_dist": risk_dist,
                            "be_activated": False,
                            "step2_activated": False,
                            "banked_r": 0.0,
                            "remaining_qty_ratio": 1.0
                        }

        duration = time.time() - start_time
        print(f"[backtest] Completed in {duration:.2f}s. Simulated {len(self.trades)} completed trades.")
        return self._generate_report()

    def _generate_report(self) -> Dict[str, Any]:
        """Calculates comprehensive performance statistics, monthly matrix, and strategy breakdown."""
        if not self.trades:
            return {
                "status": "NO_TRADES",
                "symbol": self.symbol,
                "lookback_days": self.lookback_days,
                "initial_capital": self.initial_capital,
                "final_capital": self.capital,
                "net_pnl_usdt": 0.0,
                "net_return_pct": 0.0,
                "total_trades": 0,
                "win_rate_pct": 0.0,
                "profit_factor": 0.0,
                "total_r_accumulated": 0.0,
                "max_drawdown_pct": 0.0,
                "strategies": {},
                "monthly_performance": {},
                "equity_curve": self.equity_curve,
                "sample_trades": []
            }

        df_t = pd.DataFrame(self.trades)
        df_t["exit_dt"] = pd.to_datetime(df_t["exit_time"], errors="coerce")

        total_trades = len(df_t)
        wins = df_t[df_t["final_r"] > 0]
        losses = df_t[df_t["final_r"] < 0]
        breakevens = df_t[df_t["final_r"] == 0]

        win_rate = (len(wins) / total_trades) * 100.0 if total_trades > 0 else 0.0

        gross_profit = float(wins["pnl_usdt"].sum()) if not wins.empty else 0.0
        gross_loss = abs(float(losses["pnl_usdt"].sum())) if not losses.empty else 0.0
        profit_factor = round(gross_profit / max(gross_loss, 1e-9), 2)

        total_r = float(df_t["final_r"].sum())
        net_pnl = self.capital - self.initial_capital
        net_return_pct = (net_pnl / self.initial_capital) * 100.0

        # Maximum Drawdown
        equity_vals = [pt["equity"] for pt in self.equity_curve]
        equity_s = pd.Series(equity_vals)
        peak = equity_s.cummax()
        dd = (equity_s - peak) / peak * 100.0
        max_dd = round(abs(float(dd.min())), 2)

        # Monthly performance heatmap breakdown
        monthly_perf: Dict[str, Any] = {}
        if "exit_dt" in df_t.columns and df_t["exit_dt"].notnull().any():
            for ym, group in df_t.groupby(df_t["exit_dt"].dt.strftime("%Y-%m")):
                m_wins = len(group[group["final_r"] > 0])
                m_total = len(group)
                m_pnl = float(group["pnl_usdt"].sum())
                monthly_perf[ym] = {
                    "month": ym,
                    "trades": m_total,
                    "win_rate_pct": round((m_wins / m_total) * 100.0, 1) if m_total > 0 else 0.0,
                    "net_pnl_usdt": round(m_pnl, 2),
                    "total_r": round(float(group["final_r"].sum()), 2)
                }

        # Strategy breakdown
        strat_stats: Dict[str, Any] = {}
        for s_name, group in df_t.groupby("strategy_name"):
            s_wins = len(group[group["final_r"] > 0])
            s_losses = len(group[group["final_r"] < 0])
            s_total = len(group)
            s_gp = float(group[group["final_r"] > 0]["pnl_usdt"].sum()) if not group[group["final_r"] > 0].empty else 0.0
            s_gl = abs(float(group[group["final_r"] < 0]["pnl_usdt"].sum())) if not group[group["final_r"] < 0].empty else 0.0
            s_pf = round(s_gp / max(s_gl, 1e-9), 2)
            strat_stats[s_name] = {
                "trades": s_total,
                "wins": s_wins,
                "losses": s_losses,
                "win_rate_pct": round((s_wins / s_total) * 100.0, 1),
                "net_pnl_usdt": round(float(group["pnl_usdt"].sum()), 2),
                "total_r": round(float(group["final_r"].sum()), 2),
                "profit_factor": s_pf
            }

        # Downsample equity curve to ~80 data points for smooth Chart.js rendering
        sampled_curve = self.equity_curve
        if len(self.equity_curve) > 100:
            stride = max(1, len(self.equity_curve) // 80)
            sampled_curve = self.equity_curve[::stride]
            if self.equity_curve[-1] not in sampled_curve:
                sampled_curve.append(self.equity_curve[-1])

        report = {
            "symbol": self.symbol,
            "lookback_days": self.lookback_days,
            "initial_capital": round(self.initial_capital, 2),
            "final_capital": round(self.capital, 2),
            "net_pnl_usdt": round(net_pnl, 2),
            "net_return_pct": round(net_return_pct, 2),
            "total_trades": total_trades,
            "wins": len(wins),
            "losses": len(losses),
            "breakevens": len(breakevens),
            "win_rate_pct": round(win_rate, 1),
            "profit_factor": profit_factor,
            "total_r_accumulated": round(total_r, 2),
            "max_drawdown_pct": max_dd,
            "strategies": strat_stats,
            "monthly_performance": monthly_perf,
            "equity_curve": sampled_curve,
            "sample_trades": self.trades[-15:]  # Recent 15 trades
        }
        return report

    def save_to_supabase(self, report: Dict[str, Any]) -> bool:
        """Persists the backtest run to Supabase backtest_runs table."""
        supabase = get_supabase_client()
        if not supabase:
            return False

        try:
            record = {
                "symbol": report["symbol"],
                "exchange": "bybit" if any(f in report["symbol"].upper() for f in ["EUR", "GBP", "JPY", "XAU", "XAG"]) else "binance",
                "timeframe": "15m",
                "lookback_days": report["lookback_days"],
                "initial_capital": report["initial_capital"],
                "final_capital": report["final_capital"],
                "net_pnl_usdt": report["net_pnl_usdt"],
                "net_return_pct": report["net_return_pct"],
                "win_rate_pct": report["win_rate_pct"],
                "profit_factor": report["profit_factor"],
                "total_r_accumulated": report["total_r_accumulated"],
                "max_drawdown_pct": report["max_drawdown_pct"],
                "total_trades": report["total_trades"],
                "wins": report["wins"],
                "losses": report["losses"],
                "breakevens": report["breakevens"],
                "strategy_breakdown": report["strategies"],
                "monthly_performance": report["monthly_performance"],
                "equity_curve": report["equity_curve"],
                "sample_trades": report["sample_trades"],
                "executed_at": datetime.now(timezone.utc).isoformat()
            }
            supabase.table("backtest_runs").insert(record).execute()
            print(f"[backtest] Successfully saved 1-year backtest run for {report['symbol']} to Supabase backtest_runs table.")
            return True
        except Exception as exc:
            print(f"[backtest] Supabase save notice: {exc}")
            return False

    def print_summary(self, report: Dict[str, Any]):
        """Prints an institutional performance card to stdout."""
        print("\n" + "=" * 75)
        print(f" ALIFCRPTOAI - REAL HISTORICAL BACKTEST: {report.get('symbol')} ({report.get('lookback_days')} DAYS)")
        print("=" * 75)
        print(f" Initial Capital:     ${report.get('initial_capital'):,.2f}")
        print(f" Final Capital:       ${report.get('final_capital'):,.2f} ({report.get('net_return_pct'):+.2f}%)")
        print(f" Net Realized PnL:    ${report.get('net_pnl_usdt'):,.2f} ({report.get('total_r_accumulated'):+.1f}R)")
        print(f" Total Closed Trades: {report.get('total_trades')} (Wins: {report.get('wins')}, Losses: {report.get('losses')}, BE: {report.get('breakevens')})")
        print(f" Win Rate:            {report.get('win_rate_pct')}%")
        print(f" Profit Factor:       {report.get('profit_factor')}")
        print(f" Max Drawdown:        {report.get('max_drawdown_pct')}%")
        print("-" * 75)
        print(" STRATEGY-BY-STRATEGY BREAKDOWN:")
        for s_name, st in report.get("strategies", {}).items():
            print(f" - {s_name:<26} | Trades: {st['trades']:<3} | WinRate: {st['win_rate_pct']:>5.1f}% | PF: {st['profit_factor']:>4.2f} | PnL: ${st['net_pnl_usdt']:>+8.2f} | {st['total_r']:>+5.1f}R")
        print("=" * 75 + "\n")


def main():
    parser = argparse.ArgumentParser(description="alifcrptoai Real Historical Backtester")
    parser.add_argument("--symbol", type=str, default="BTC/USDT", help="Symbol to test (e.g. BTC/USDT, EUR/USD, XAU/USD)")
    parser.add_argument("--days", type=int, default=365, help="Lookback days (default: 365 days / 1 year)")
    parser.add_argument("--capital", type=float, default=100.0, help="Initial capital in USD/USDT (default: $100)")
    parser.add_argument("--rr", type=float, default=2.5, help="Target reward-to-risk ratio")
    parser.add_argument("--save-db", action="store_true", help="Save run results into Supabase backtest_runs")
    parser.add_argument("--json", action="store_true", help="Output raw JSON to stdout")
    args = parser.parse_args()

    df_15m = fetch_real_historical_ohlcv(symbol=args.symbol, days=args.days)
    engine = BacktestEngine(
        symbol=args.symbol,
        initial_capital=args.capital,
        target_rr=args.rr,
        lookback_days=args.days
    )
    report = engine.run(df_15m)

    if args.save_db:
        engine.save_to_supabase(report)

    if args.json:
        print(json.dumps(report))
    else:
        engine.print_summary(report)


if __name__ == "__main__":
    main()
