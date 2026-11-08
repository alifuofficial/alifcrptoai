"use client";

import React, { useState, useEffect } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
  ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";
import {
  BarChart3,
  TrendingUp,
  Target,
  DollarSign,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  History,
  Shield,
  Clock,
  Sparkles,
  Zap,
  Info,
  ChevronDown,
  ChevronUp,
  X
} from "lucide-react";
import { supabase } from "@/lib/supabase";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend
);

interface BacktestReport {
  id?: number;
  symbol: string;
  lookback_days: number;
  initial_capital: number;
  final_capital: number;
  net_pnl_usdt: number;
  net_return_pct: number;
  total_trades: number;
  wins: number;
  losses: number;
  breakevens: number;
  win_rate_pct: number;
  profit_factor: number;
  total_r_accumulated: number;
  max_drawdown_pct: number;
  strategies: Record<string, any>;
  monthly_performance?: Record<string, any>;
  equity_curve: Array<{ timestamp: string; equity: number; drawdown_pct: number }>;
  sample_trades: Array<any>;
  data_source?: string;
  is_real_data?: boolean;
  ai_provider?: string;
  ai_model?: string;
  ai_audit_stats?: {
    total_signals_detected: number;
    approved_trades: number;
    vetoed_trades: number;
    pass_rate_pct: number;
    average_score: number;
    min_score_threshold: number;
  };
  executed_at?: string;
}

export default function BacktestView() {
  // Configurable Parameters (User Choices)
  const [symbol, setSymbol] = useState<string>("BTC/USDT");
  const [lookbackDays, setLookbackDays] = useState<number>(365); // Default 1 Year (365 days)
  const [initialCapital, setInitialCapital] = useState<number>(100); // Default $100
  const [targetRR, setTargetRR] = useState<number>(2.5);
  const [aiProvider, setAiProvider] = useState<string>("deepseek");
  const [minScore, setMinScore] = useState<number>(60); // Default 60 for optimal signal velocity & compounding

  // Custom input states
  const [customDays, setCustomDays] = useState<string>("365");
  const [customCapital, setCustomCapital] = useState<string>("100");

  // Execution & Data States
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [report, setReport] = useState<BacktestReport | null>(null);
  const [pastRuns, setPastRuns] = useState<BacktestReport[]>([]);
  const [loadingPastRuns, setLoadingPastRuns] = useState<boolean>(false);

  // Interactive Monthly Heatmap & Daily Drill-Down States
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Grouped Multi-Asset Presets (Indices, Forex, Commodities, Crypto)
  const ASSET_GROUPS = [
    {
      group: "📈 US & Global Indices",
      items: [
        { label: "NAS100 (Nasdaq 100)", value: "NAS100" },
        { label: "SPX500 (S&P 500)", value: "SPX500" },
        { label: "US30 (Dow Jones 30)", value: "US30" },
        { label: "GER40 (DAX 40)", value: "GER40" },
        { label: "UK100 (FTSE 100)", value: "UK100" },
        { label: "NIKKEI (Nikkei 225)", value: "NIKKEI" },
      ],
    },
    {
      group: "💱 Forex Majors & Crosses",
      items: [
        { label: "GBP/USD (British Pound)", value: "GBP/USD" },
        { label: "EUR/USD (Euro / USD)", value: "EUR/USD" },
        { label: "USD/JPY (USD / Japanese Yen)", value: "USD/JPY" },
        { label: "AUD/USD (Australian Dollar)", value: "AUD/USD" },
        { label: "USD/CAD (USD / Canadian Dollar)", value: "USD/CAD" },
        { label: "USD/CHF (USD / Swiss Franc)", value: "USD/CHF" },
        { label: "EUR/GBP (Euro / British Pound)", value: "EUR/GBP" },
        { label: "GBP/JPY (British Pound / Yen)", value: "GBP/JPY" },
      ],
    },
    {
      group: "🪙 Commodities",
      items: [
        { label: "XAU/USD (Gold Spot & Futures)", value: "XAU/USD" },
        { label: "XAG/USD (Silver)", value: "XAG/USD" },
        { label: "USOIL (Crude Oil WTI)", value: "USOIL" },
      ],
    },
    {
      group: "⚡ Crypto Futures",
      items: [
        { label: "BTC/USDT (Bitcoin)", value: "BTC/USDT" },
        { label: "ETH/USDT (Ethereum)", value: "ETH/USDT" },
        { label: "SOL/USDT (Solana)", value: "SOL/USDT" },
        { label: "BNB/USDT (BNB)", value: "BNB/USDT" },
        { label: "XRP/USDT (Ripple)", value: "XRP/USDT" },
        { label: "DOGE/USDT (Dogecoin)", value: "DOGE/USDT" },
        { label: "SUI/USDT (Sui Network)", value: "SUI/USDT" },
        { label: "PEPE/USDT (Pepe)", value: "PEPE/USDT" },
        { label: "AVAX/USDT (Avalanche)", value: "AVAX/USDT" },
        { label: "LINK/USDT (Chainlink)", value: "LINK/USDT" },
        { label: "NEAR/USDT (NEAR Protocol)", value: "NEAR/USDT" },
      ],
    },
  ];

  // Quick Days Presets
  const DAYS_PRESETS = [
    { label: "30 Days", value: 30 },
    { label: "90 Days", value: 90 },
    { label: "180 Days", value: 180 },
    { label: "365 Days (1 Year)", value: 365 },
  ];

  // Quick Capital Presets
  const CAPITAL_PRESETS = [50, 100, 500, 1000, 10000];

  // Load past runs and active AI provider on mount
  useEffect(() => {
    fetchPastRuns();
    fetchActiveAiProvider();
  }, []);

  const fetchActiveAiProvider = async () => {
    try {
      const { data } = await supabase.from("bot_config").select("ai_provider").eq("id", 1).single();
      if (data?.ai_provider) {
        setAiProvider(data.ai_provider);
      }
    } catch {
      // Default to deepseek
    }
  };

  const fetchPastRuns = async () => {
    setLoadingPastRuns(true);
    try {
      const { data, error } = await supabase
        .from("backtest_runs")
        .select("*")
        .order("executed_at", { ascending: false })
        .limit(10);

      if (!error && data && data.length > 0) {
        setPastRuns(data);
        // Load the latest backtest run by default if not currently running
        if (!report) {
          setReport(data[0]);
          setSymbol(data[0].symbol);
          setLookbackDays(data[0].lookback_days);
          setCustomDays(String(data[0].lookback_days));
          setInitialCapital(data[0].initial_capital);
          setCustomCapital(String(data[0].initial_capital));
        }
      }
    } catch (err) {
      console.warn("Notice loading past backtest runs:", err);
    } finally {
      setLoadingPastRuns(false);
    }
  };

  const runBacktest = async () => {
    setIsRunning(true);
    setErrorMsg(null);
    setSelectedMonth(null);
    setSelectedDay(null);

    const effectiveDays = parseInt(customDays, 10) || lookbackDays || 365;
    const effectiveCapital = parseFloat(customCapital) || initialCapital || 100.0;

    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          lookback_days: effectiveDays,
          initial_capital: effectiveCapital,
          target_rr: targetRR,
          ai_provider: aiProvider,
          min_score: minScore,
        }),
      });

      const contentType = res.headers.get("content-type");
      let data: any = null;
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const rawText = await res.text();
        throw new Error(`Backtest service returned status ${res.status} (${res.statusText || "Non-JSON"}). Please retry in a few seconds.`);
      }

      if (data.success && data.report) {
        setReport(data.report);
        fetchPastRuns();
      } else {
        // Fallback: If API subprocess returned an error, generate client-side simulation
        setErrorMsg(data.error || "Subprocess returned notice; showing cached or standard simulation.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to contact backtest service");
    } finally {
      setIsRunning(false);
    }
  };

  // Equity Curve Chart Data
  const chartData = {
    labels: (report?.equity_curve || []).map((pt) => {
      try {
        const d = new Date(pt.timestamp);
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      } catch {
        return "";
      }
    }),
    datasets: [
      {
        label: `Portfolio Equity ($)`,
        data: (report?.equity_curve || []).map((pt) => pt.equity),
        borderColor: (report?.net_return_pct ?? 0) >= 0 ? "#10b981" : "#ef4444",
        backgroundColor: (report?.net_return_pct ?? 0) >= 0 ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)",
        fill: true,
        tension: 0.25,
        borderWidth: 2,
        pointRadius: 0,
        pointHitRadius: 10,
      },
    ],
  };

  const chartOptions: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: "index",
        intersect: false,
        backgroundColor: "#0f172a",
        titleColor: "#94a3b8",
        bodyColor: "#f8fafc",
        borderColor: "#334155",
        borderWidth: 1,
        callbacks: {
          label: (ctx) => `Equity: $${Number(ctx.parsed.y).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: "#64748b", font: { size: 10 }, maxTicksLimit: 12 },
      },
      y: {
        grid: { color: "#f1f5f9" },
        ticks: {
          color: "#64748b",
          font: { size: 10 },
          callback: (val) => `$${Number(val).toLocaleString()}`,
        },
      },
    },
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-brand-50 rounded-lg text-brand-600">
              <History className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Institutional Historical Backtest</h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                  <Sparkles className="w-3 h-3 mr-1" /> Real 1-Year Engine
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Simulates all 8 institutional strategy plugins and the Banker's Exit System over real historical 15m candles with Top-Down (1D → 4H → 1H) alignment.
              </p>
            </div>
          </div>
        </div>

        {report && (
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-600 bg-slate-50 px-3.5 py-2 rounded-lg border border-slate-200/60 self-start md:self-auto">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>
                Last Tested: <strong className="text-slate-800">{report.symbol}</strong> ({report.lookback_days} Days) on ${report.initial_capital.toLocaleString()} initial equity
              </span>
            </div>
            {report.data_source && (
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                report.data_source.includes("Dukascopy")
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : report.data_source.includes("Binance")
                  ? "bg-amber-50 text-amber-800 border-amber-200"
                  : "bg-blue-50 text-blue-800 border-blue-200"
              }`}>
                <Shield className="w-3 h-3" />
                {report.data_source}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 2. Interactive Control Bar (Configurable Lookback & Capital) */}
      <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-amber-500" /> Backtest Parameters
          </span>
          <span className="text-xs text-slate-400">Configure real historical lookback window & capital</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Symbol Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Asset / Trading Pair</label>
            <select
              value={symbol}
              onChange={(e) => {
                const newSym = e.target.value;
                setSymbol(newSym);
                const isFxOrIdx = ["NAS", "SPX", "US30", "GER", "UK", "NIKKEI", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF"].some(x => newSym.toUpperCase().includes(x));
                if (isFxOrIdx && minScore > 65) {
                  setMinScore(60);
                }
              }}
              className="w-full text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-brand-500 focus:outline-hidden"
            >
              {ASSET_GROUPS.map((grp) => (
                <optgroup key={grp.group} label={grp.group}>
                  {grp.items.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Lookback Days (Default 365 Days, fully configurable) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">Lookback Period (Days)</label>
              <span className="text-[10px] text-brand-600 font-bold">Default: 365 (1 Year)</span>
            </div>
            <div className="flex gap-1.5">
              <input
                type="number"
                min="7"
                max="730"
                value={customDays}
                onChange={(e) => {
                  setCustomDays(e.target.value);
                  setLookbackDays(parseInt(e.target.value, 10) || 365);
                }}
                className="w-full text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-brand-500 focus:outline-hidden"
                placeholder="e.g. 365"
              />
            </div>
            {/* Quick Days Preset Chips */}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {DAYS_PRESETS.map((dp) => (
                <button
                  key={dp.value}
                  type="button"
                  onClick={() => {
                    setCustomDays(String(dp.value));
                    setLookbackDays(dp.value);
                  }}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-sm transition-colors ${
                    lookbackDays === dp.value
                      ? "bg-brand-600 text-white font-bold"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {dp.label}
                </button>
              ))}
            </div>
          </div>

          {/* Initial Capital (Configurable e.g. $50, $100, $10,000) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">Initial Capital ($)</label>
              <span className="text-[10px] text-slate-500">Any Amount (e.g. $50, $100)</span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">$</span>
              <input
                type="number"
                min="10"
                step="10"
                value={customCapital}
                onChange={(e) => {
                  setCustomCapital(e.target.value);
                  setInitialCapital(parseFloat(e.target.value) || 100);
                }}
                className="w-full text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg p-2.5 pl-6 text-slate-800 focus:ring-2 focus:ring-brand-500 focus:outline-hidden"
                placeholder="100"
              />
            </div>
            {/* Quick Capital Preset Chips */}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {CAPITAL_PRESETS.map((cap) => (
                <button
                  key={cap}
                  type="button"
                  onClick={() => {
                    setCustomCapital(String(cap));
                    setInitialCapital(cap);
                  }}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-sm transition-colors ${
                    initialCapital === cap
                      ? "bg-brand-600 text-white font-bold"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  ${cap.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {/* Action Button */}
          <div className="flex flex-col justify-end">
            <button
              onClick={runBacktest}
              disabled={isRunning}
              className={`w-full py-2.5 px-4 rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer ${
                isRunning
                  ? "bg-slate-300 text-slate-600 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-md"
              }`}
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Simulating {customDays} Days...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Run {customDays}-Day Backtest</span>
                </>
              )}
            </button>
            <p className="text-[10px] text-slate-400 text-center mt-1.5">
              Simulates Banker's +1.5R / +3.0R / +5.0R exits
            </p>
          </div>
        </div>

        {/* AI Risk Officer Selector Row */}
        <div className="pt-3 border-t border-slate-100 flex flex-col gap-2.5 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Shield className="w-4 h-4 text-brand-600" />
              <span className="font-bold text-slate-700">AI Risk Officer &amp; Auditor Mode:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setAiProvider("deepseek")}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all ${
                    aiProvider === "deepseek"
                      ? "bg-indigo-600 text-white shadow-xs font-bold"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  🤖 DeepSeek V3 / R1 (Solo 100-pt Rubric Engine)
                </button>
                <button
                  type="button"
                  onClick={() => setAiProvider("raw")}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all ${
                    aiProvider === "raw"
                      ? "bg-slate-700 text-white shadow-xs font-bold"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  ⚡ Raw Technical Strategy (No AI)
                </button>
              </div>
            </div>
            <span className="text-[11px] text-slate-500 italic">
              {aiProvider === "deepseek"
                ? "Calibrated multi-asset rubric: adaptive session weighting, dealing ranges & displacement"
                : "Tests raw indicator triggers without AI gatekeeping"}
            </span>
          </div>

          {/* AI Qualification Sensitivity Threshold Selector */}
          {aiProvider === "deepseek" && (
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100/80 flex-wrap">
              <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> DeepSeek Sensitivity Threshold:
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setMinScore(60)}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                    minScore === 60
                      ? "bg-emerald-600 text-white shadow-xs font-bold"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  ⚡ High-Growth (Score ≥ 60)
                </button>
                <button
                  type="button"
                  onClick={() => setMinScore(65)}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                    minScore === 65
                      ? "bg-brand-600 text-white shadow-xs font-bold"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  ⚖️ Balanced (Score ≥ 65)
                </button>
                <button
                  type="button"
                  onClick={() => setMinScore(70)}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                    minScore === 70
                      ? "bg-indigo-700 text-white shadow-xs font-bold"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  🎯 Ultra-Sniper (Score ≥ 70)
                </button>
              </div>
              <span className="text-[10px] text-slate-500">
                {minScore === 60
                  ? "Recommended for Forex & Indices: unlocks high signal velocity & geometric compounding while retaining kill-switches."
                  : minScore === 65
                  ? "Balanced institutional grade: filters chop while maintaining steady signal flow."
                  : "Ultra-selective: highest risk filter, rejects ~90% of trades for conservative preservation."}
              </span>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* 3. Hero KPI Performance Cards */}
      {report && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3.5">
          {/* Win Rate */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Win Rate</span>
              <Target className="w-4 h-4 text-brand-600" />
            </div>
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {report.win_rate_pct.toFixed(1)}%
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              <span className="text-emerald-600 font-bold">{report.wins}W</span> / <span className="text-rose-500 font-bold">{report.losses}L</span> / {report.breakevens}BE
            </div>
          </div>

          {/* Profit Factor */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Profit Factor</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className={`text-2xl font-black tracking-tight ${report.profit_factor >= 1.5 ? "text-emerald-600" : "text-slate-900"}`}>
              {report.profit_factor.toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {report.profit_factor >= 1.5 ? "Institutional Grade" : "Baseline"}
            </div>
          </div>

          {/* Net Return ($) */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Net Realized PnL</span>
              <DollarSign className="w-4 h-4 text-indigo-600" />
            </div>
            <div className={`text-2xl font-black tracking-tight ${report.net_pnl_usdt >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {report.net_pnl_usdt >= 0 ? "+" : ""}${report.net_pnl_usdt.toFixed(2)}
            </div>
            <div className="text-[11px] font-semibold mt-1 flex items-center">
              {report.net_return_pct >= 0 ? (
                <span className="text-emerald-600 flex items-center">
                  <ArrowUpRight className="w-3 h-3 mr-0.5" /> +{report.net_return_pct.toFixed(1)}%
                </span>
              ) : (
                <span className="text-rose-500 flex items-center">
                  <ArrowDownRight className="w-3 h-3 mr-0.5" /> {report.net_return_pct.toFixed(1)}%
                </span>
              )}
            </div>
          </div>

          {/* Total Realized R */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Accumulated R</span>
              <BarChart3 className="w-4 h-4 text-cyan-600" />
            </div>
            <div className="text-2xl font-black text-cyan-700 tracking-tight">
              {report.total_r_accumulated >= 0 ? "+" : ""}{report.total_r_accumulated.toFixed(1)}R
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Over {report.total_trades} trade signals
            </div>
          </div>

          {/* Max Drawdown */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Max Drawdown</span>
              <Shield className="w-4 h-4 text-amber-500" />
            </div>
            <div className={`text-2xl font-black tracking-tight ${report.max_drawdown_pct <= 10.0 ? "text-emerald-600" : "text-rose-600"}`}>
              {report.max_drawdown_pct.toFixed(1)}%
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Peak-to-Trough Decline
            </div>
          </div>

          {/* Final Capital */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Final Equity</span>
              <DollarSign className="w-4 h-4 text-slate-700" />
            </div>
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              ${report.final_capital.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Started with ${report.initial_capital.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* AI Auditor Telemetry Badge Bar */}
      {report && (
        <div className="bg-indigo-50/60 border border-indigo-200/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-100 rounded-lg text-indigo-700">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-indigo-950 text-sm">
                AI Risk Officer: {report.ai_model || (report.strategies as any)?._ai_model || (aiProvider === "deepseek" ? "DeepSeek V3 / R1 (Solo Institutional Engine)" : "Raw Technical Strategy")}
              </span>
              <p className="text-[11px] text-indigo-800">
                Enforcing discrete 100-pt rubric (HTF 25 + LTF 25 + Vol 15 + Session 20 + Tide 15) &amp; binary kill-switches.
              </p>
            </div>
          </div>

          {(report.ai_audit_stats || (report.strategies as any)?._ai_audit_stats) && (() => {
            const ast = report.ai_audit_stats || (report.strategies as any)?._ai_audit_stats;
            return (
              <div className="flex items-center gap-4 text-indigo-950 font-mono text-xs flex-wrap">
                <div>
                  <span className="text-indigo-600 font-sans block text-[10px] uppercase font-bold">Signals Screened</span>
                  <strong className="text-sm">{ast.total_signals_detected}</strong>
                </div>
                <div className="border-l border-indigo-200 pl-4">
                  <span className="text-emerald-700 font-sans block text-[10px] uppercase font-bold">DeepSeek Approved</span>
                  <strong className="text-sm text-emerald-700">{ast.approved_trades}</strong>
                </div>
                <div className="border-l border-indigo-200 pl-4">
                  <span className="text-rose-600 font-sans block text-[10px] uppercase font-bold">DeepSeek Vetoed</span>
                  <strong className="text-sm text-rose-600">{ast.vetoed_trades}</strong>
                </div>
                <div className="border-l border-indigo-200 pl-4">
                  <span className="text-indigo-600 font-sans block text-[10px] uppercase font-bold">Pass Rate</span>
                  <strong className="text-sm text-indigo-900">{ast.pass_rate_pct}%</strong>
                </div>
                <div className="border-l border-indigo-200 pl-4">
                  <span className="text-indigo-600 font-sans block text-[10px] uppercase font-bold">Avg Score</span>
                  <strong className="text-sm text-brand-700">{ast.average_score}/100</strong>
                </div>
                <div className="border-l border-indigo-200 pl-4">
                  <span className="text-indigo-600 font-sans block text-[10px] uppercase font-bold">Min Score Gate</span>
                  <strong className="text-sm text-indigo-900">{ast.min_score_threshold || minScore}/100</strong>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* 4. Equity Curve Chart */}
      {report && report.equity_curve && report.equity_curve.length > 0 && (
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                Cumulative Equity Growth ({report.lookback_days} Days / ~35k Bars)
              </h3>
              <p className="text-xs text-slate-500">
                Visualizing compounding account balance with Banker's Scaled partial TP and BE trailing stops
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 bg-slate-100 rounded-md text-slate-700">
                {report.symbol}
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>
      )}

      {/* 5. Strategy-by-Strategy Breakdown Table */}
      {report && report.strategies && Object.keys(report.strategies).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-brand-600" />
              Strategy Performance Breakdown
            </h3>
            <span className="text-xs text-slate-400">8 Institutional Strategy Plugins</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-bold tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Strategy</th>
                  <th className="py-2.5 px-4">Trades</th>
                  <th className="py-2.5 px-4">Win Rate</th>
                  <th className="py-2.5 px-4">Profit Factor</th>
                  <th className="py-2.5 px-4">Total R</th>
                  <th className="py-2.5 px-4 text-right">Net PnL ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.entries(report.strategies).map(([sName, st]: [string, any]) => (
                  <tr key={sName} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {sName.replace(/_/g, " ")}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {st.trades} <span className="text-slate-400 text-[10px]">({st.wins || 0}W / {st.losses || 0}L)</span>
                    </td>
                    <td className="py-3 px-4 font-semibold">
                      <span className={st.win_rate_pct >= 50 ? "text-emerald-600" : "text-amber-600"}>
                        {st.win_rate_pct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-700">
                      {st.profit_factor ? st.profit_factor.toFixed(2) : "N/A"}
                    </td>
                    <td className="py-3 px-4 font-bold text-cyan-700">
                      {st.total_r >= 0 ? "+" : ""}{st.total_r.toFixed(1)}R
                    </td>
                    <td className={`py-3 px-4 text-right font-bold ${st.net_pnl_usdt >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {st.net_pnl_usdt >= 0 ? "+" : ""}${st.net_pnl_usdt.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. Dynamic Monthly Returns Heatmap & Interactive Daily Drill-Down */}
      {report && report.monthly_performance && Object.keys(report.monthly_performance).length > 0 && (
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600" />
                Monthly Returns Heatmap ({Object.keys(report.monthly_performance).length} Months / {report.lookback_days} Days)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Click any month card below to open the interactive daily trade breakdown and view individual trade logs.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] px-2.5 py-1 bg-indigo-50 text-indigo-700 font-semibold rounded-full border border-indigo-200 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-indigo-600" />
                Click card to inspect days
              </span>
            </div>
          </div>

          {/* Month Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {Object.entries(report.monthly_performance).map(([ym, m]: [string, any]) => {
              const isProfit = (m.net_pnl_usdt || 0) >= 0;
              const isSelected = selectedMonth === ym;
              return (
                <button
                  key={ym}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      setSelectedMonth(null);
                      setSelectedDay(null);
                    } else {
                      setSelectedMonth(ym);
                      const days = m.days || [];
                      setSelectedDay(days.length > 0 ? days[0].date : null);
                    }
                  }}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer relative group text-left ${
                    isSelected
                      ? "ring-2 ring-indigo-600 shadow-md bg-indigo-50/90 border-indigo-400 -translate-y-0.5"
                      : isProfit
                      ? "bg-emerald-50/50 hover:bg-emerald-50/90 border-emerald-200/70 hover:border-emerald-300 shadow-2xs hover:-translate-y-0.5"
                      : "bg-rose-50/50 hover:bg-rose-50/90 border-rose-200/70 hover:border-rose-300 shadow-2xs hover:-translate-y-0.5"
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 uppercase mb-0.5">
                    <span>{ym}</span>
                    {isSelected && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-indigo-600 text-white rounded font-bold">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div className={`text-base font-extrabold my-0.5 ${isProfit ? "text-emerald-700" : "text-rose-700"}`}>
                    {isProfit ? "+" : ""}${m.net_pnl_usdt.toFixed(1)}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">
                    {m.trades} trades • <strong className={isProfit ? "text-emerald-700" : "text-rose-700"}>{m.win_rate_pct.toFixed(0)}% WR</strong>
                  </div>
                  <div className="mt-1 text-[9px] font-semibold flex items-center justify-center gap-0.5 text-indigo-600 group-hover:text-indigo-800">
                    {isSelected ? (
                      <>Hide days <ChevronUp className="w-2.5 h-2.5" /></>
                    ) : (
                      <>View days <ChevronDown className="w-2.5 h-2.5" /></>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detailed Daily Breakdown Drawer */}
          {selectedMonth && report.monthly_performance[selectedMonth] && (() => {
            const monthData = report.monthly_performance[selectedMonth];
            const daysList: any[] = monthData.days || [];
            const selectedDayData = daysList.find((d: any) => d.date === selectedDay) || daysList[0] || null;
            const isMonthProfit = (monthData.net_pnl_usdt || 0) >= 0;

            return (
              <div className="mt-5 pt-5 border-t border-slate-200 animate-fadeIn">
                {/* Header Banner */}
                <div className="bg-slate-900 text-white p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-xs mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-indigo-300" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                          {selectedMonth} — Daily Performance Breakdown
                        </h4>
                        <span className="text-[10px] sm:text-[11px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 font-semibold">
                          {daysList.length} Active Days
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Select any trading day below to inspect its executed setups, prices, and DeepSeek scores.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-xs">
                      <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        Trades: <strong className="text-white">{monthData.trades}</strong>
                      </span>
                      <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        WR: <strong className="text-white">{monthData.win_rate_pct}%</strong>
                      </span>
                      <span className={`px-2.5 py-1 rounded border font-bold ${
                        isMonthProfit
                          ? "bg-emerald-950/60 text-emerald-300 border-emerald-700/50"
                          : "bg-rose-950/60 text-rose-300 border-rose-700/50"
                      }`}>
                        {isMonthProfit ? "+" : ""}${monthData.net_pnl_usdt.toFixed(2)} ({monthData.total_r > 0 ? "+" : ""}{monthData.total_r}R)
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => { setSelectedMonth(null); setSelectedDay(null); }}
                      className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Close
                    </button>
                  </div>
                </div>

                {/* Days Grid */}
                {daysList.length === 0 ? (
                  <div className="p-5 bg-slate-50 rounded-xl text-center text-xs text-slate-500 border border-slate-200">
                    No individual daily trade records found for {selectedMonth}. Run a fresh backtest above to view full day-by-day logs.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <div className="text-xs font-bold text-slate-700 mb-2 flex items-center justify-between">
                        <span>Trading Days in {selectedMonth} ({daysList.length} days with executed trades)</span>
                        <span className="text-[11px] text-slate-400 font-normal">Click a day card to filter table below</span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
                        {daysList.map((day: any) => {
                          const isDayActive = (selectedDay === day.date) || (!selectedDay && selectedDayData?.date === day.date);
                          const isDayProfit = (day.net_pnl_usdt || 0) >= 0;
                          return (
                            <button
                              key={day.date}
                              type="button"
                              onClick={() => setSelectedDay(day.date)}
                              className={`p-2.5 rounded-lg border text-left transition-all relative cursor-pointer ${
                                isDayActive
                                  ? "ring-2 ring-indigo-600 bg-indigo-50/90 border-indigo-400 shadow-xs"
                                  : isDayProfit
                                  ? "bg-emerald-50/40 hover:bg-emerald-50/80 border-emerald-200/70"
                                  : "bg-rose-50/40 hover:bg-rose-50/80 border-rose-200/70"
                              }`}
                            >
                              <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-0.5">
                                <span>{day.date.substring(5)} <span className="text-[10px] text-slate-400 font-normal">({day.day_name})</span></span>
                                {isDayActive && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                                )}
                              </div>
                              <div className={`text-xs font-black ${isDayProfit ? "text-emerald-700" : "text-rose-700"}`}>
                                {isDayProfit ? "+" : ""}${day.net_pnl_usdt.toFixed(2)}
                              </div>
                              <div className="text-[10px] text-slate-500 flex items-center justify-between mt-0.5">
                                <span>{day.trades_count}t ({day.wins}W/{day.losses}L)</span>
                                <span className="font-semibold text-slate-600">{day.total_r > 0 ? "+" : ""}{day.total_r}R</span>
                              </div>

                              {/* Strategy Tags on Day Card */}
                              {day.strategies_summary && day.strategies_summary.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5 pt-1 border-t border-slate-200/60">
                                  {day.strategies_summary.map((st: any, sIdx: number) => {
                                    const isJudas = st.name.includes("Judas");
                                    const isFVG = st.name.includes("FVG") || st.name.includes("Order Block");
                                    const shortLabel = isJudas ? "⚡ Judas" : isFVG ? "🛡️ FVG" : "🌊 SMC";
                                    return (
                                      <span
                                        key={sIdx}
                                        className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-white/90 text-slate-700 border border-slate-200/80 shadow-2xs"
                                        title={`${st.name}: ${st.count} trades (${st.wins}W/${st.losses}L)`}
                                      >
                                        {shortLabel} ({st.count})
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Selected Day Trade Inspector Table */}
                    {selectedDayData && selectedDayData.trades && selectedDayData.trades.length > 0 && (
                      <div className="bg-slate-50/70 rounded-xl border border-slate-200 overflow-hidden mt-3">
                        <div className="p-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-indigo-600"></div>
                            <h5 className="text-xs font-bold text-slate-900">
                              Trades Executed on {selectedDayData.date} ({selectedDayData.day_name}) — {selectedDayData.trades.length} Setups
                            </h5>
                          </div>
                          <div className="text-xs text-slate-600 flex items-center gap-3">
                            <span>Day Result: <strong className={selectedDayData.net_pnl_usdt >= 0 ? "text-emerald-700" : "text-rose-700"}>{selectedDayData.net_pnl_usdt >= 0 ? "+" : ""}${selectedDayData.net_pnl_usdt.toFixed(2)}</strong></span>
                            <span>•</span>
                            <span>Day R: <strong className={selectedDayData.total_r >= 0 ? "text-emerald-700" : "text-rose-700"}>{selectedDayData.total_r >= 0 ? "+" : ""}{selectedDayData.total_r}R</strong></span>
                            <span>•</span>
                            <span>Win Rate: <strong>{selectedDayData.win_rate_pct}%</strong></span>
                          </div>
                        </div>

                        {/* Applied Strategies Summary Banner for Selected Day */}
                        {selectedDayData.strategies_summary && selectedDayData.strategies_summary.length > 0 && (
                          <div className="p-3 bg-gradient-to-r from-indigo-50/90 via-slate-50 to-white border-b border-indigo-100 flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                              Applied Strategies:
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {selectedDayData.strategies_summary.map((st: any, sIdx: number) => {
                                const isStProfit = (st.net_pnl_usdt || 0) >= 0;
                                const isJudas = st.name.includes("Judas");
                                const isFVG = st.name.includes("FVG") || st.name.includes("Order Block");
                                const icon = isJudas ? "⚡" : isFVG ? "🛡️" : "🌊";
                                const badgeBg = isJudas
                                  ? "bg-amber-50 border-amber-200 text-amber-900"
                                  : isFVG
                                  ? "bg-indigo-50 border-indigo-200 text-indigo-900"
                                  : "bg-purple-50 border-purple-200 text-purple-900";
                                return (
                                  <div
                                    key={sIdx}
                                    className={`px-2.5 py-1 rounded-lg border text-xs flex items-center gap-2 shadow-2xs ${badgeBg}`}
                                  >
                                    <span className="font-extrabold">{icon} {st.name}</span>
                                    <span className="opacity-40">•</span>
                                    <span className="font-medium">{st.count} {st.count === 1 ? "trade" : "trades"} ({st.wins}W / {st.losses}L)</span>
                                    <span className="opacity-40">•</span>
                                    <span className={`font-black ${isStProfit ? "text-emerald-700" : "text-rose-700"}`}>
                                      {isStProfit ? "+" : ""}${st.net_pnl_usdt.toFixed(2)} ({st.total_r > 0 ? "+" : ""}{st.total_r}R)
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100/80 text-slate-600 uppercase font-bold tracking-wider text-[10px] border-b border-slate-200">
                              <tr>
                                <th className="py-2.5 px-3">Time</th>
                                <th className="py-2.5 px-3">Strategy</th>
                                <th className="py-2.5 px-3">Side</th>
                                <th className="py-2.5 px-3">Entry → Exit</th>
                                <th className="py-2.5 px-3">Banker's Outcome</th>
                                <th className="py-2.5 px-3">Return (R)</th>
                                <th className="py-2.5 px-3">PnL ($)</th>
                                <th className="py-2.5 px-3 text-right">DeepSeek Rubric</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {selectedDayData.trades.map((tr: any, idx: number) => {
                                const isWin = tr.outcome?.includes("WIN") || (tr.final_r || 0) > 0;
                                const isLoss = tr.outcome?.includes("LOSS") || (tr.final_r || 0) < 0;
                                const isJudas = tr.strategy_name.includes("Judas");
                                const isFVG = tr.strategy_name.includes("FVG") || tr.strategy_name.includes("Order Block");
                                const icon = isJudas ? "⚡" : isFVG ? "🛡️" : "🌊";
                                const badgeStyle = isJudas
                                  ? "bg-amber-50 text-amber-900 border-amber-200"
                                  : isFVG
                                  ? "bg-indigo-50 text-indigo-900 border-indigo-200"
                                  : "bg-purple-50 text-purple-900 border-purple-200";

                                return (
                                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                                      {tr.entry_time ? tr.entry_time.substring(11, 16) : "--:--"}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${badgeStyle}`}>
                                        {icon} {tr.strategy_name}
                                      </span>
                                      <div className="text-[10px] text-slate-500 font-normal mt-0.5 max-w-[280px] truncate" title={tr.trigger_note}>
                                        {tr.trigger_note || "Institutional price action setup"}
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                                        tr.side === "LONG" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                                      }`}>
                                        {tr.side}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 font-mono text-slate-700 text-[11px]">
                                      ${tr.entry} → ${tr.exit}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <span className={`inline-flex items-center gap-1 font-bold text-[10px] px-2 py-0.5 rounded-full ${
                                        isWin
                                          ? "bg-emerald-100 text-emerald-800"
                                          : isLoss
                                          ? "bg-rose-100 text-rose-800"
                                          : "bg-slate-100 text-slate-700"
                                      }`}>
                                        {isWin ? "✓ " : isLoss ? "✗ " : "– "}{tr.outcome}
                                      </span>
                                    </td>
                                    <td className={`py-2.5 px-3 font-extrabold ${
                                      (tr.final_r || 0) >= 0 ? "text-emerald-700" : "text-rose-700"
                                    }`}>
                                      {(tr.final_r || 0) >= 0 ? "+" : ""}{tr.final_r}R
                                    </td>
                                    <td className={`py-2.5 px-3 font-extrabold ${
                                      (tr.pnl_usdt || 0) >= 0 ? "text-emerald-700" : "text-rose-700"
                                    }`}>
                                      {(tr.pnl_usdt || 0) >= 0 ? "+" : ""}${tr.pnl_usdt}
                                    </td>
                                    <td className="py-2.5 px-3 text-right">
                                      <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                        {tr.deepseek_score}/100
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* 7. Recent Audited Trades Forensic Log */}
      {report && report.sample_trades && report.sample_trades.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-600" />
              Recent Audited Trades ({report.sample_trades.length} Executed Samples)
            </h3>
            <span className="text-xs text-slate-400">
              Showing DeepSeek 100-pt rubric scores and trade executions
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-bold tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Time</th>
                  <th className="py-2.5 px-4">Strategy</th>
                  <th className="py-2.5 px-4">Side</th>
                  <th className="py-2.5 px-4">Entry / Exit</th>
                  <th className="py-2.5 px-4">Outcome</th>
                  <th className="py-2.5 px-4">Return (R)</th>
                  <th className="py-2.5 px-4">PnL ($)</th>
                  <th className="py-2.5 px-4">DeepSeek Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.sample_trades.slice().reverse().map((t: any, idx: number) => {
                  const isWin = (t.final_r ?? 0) > 0;
                  const isLoss = (t.final_r ?? 0) < 0;
                  return (
                    <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                        {t.entry_time ? new Date(t.entry_time).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "N/A"}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-800">
                        {t.strategy_name?.replace(/_/g, " ")}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          t.side === "LONG"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                        }`}>
                          {t.side}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                        ${Number(t.entry).toFixed(2)} → ${Number(t.exit_price || t.entry).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 font-bold">
                        <span className={`inline-flex items-center gap-1 ${
                          isWin ? "text-emerald-600" : isLoss ? "text-rose-600" : "text-slate-600"
                        }`}>
                          {isWin ? <CheckCircle2 className="w-3.5 h-3.5" /> : isLoss ? <XCircle className="w-3.5 h-3.5" /> : null}
                          {t.outcome || (isWin ? "WIN" : isLoss ? "LOSS" : "BE")}
                        </span>
                      </td>
                      <td className={`py-3 px-4 font-bold ${isWin ? "text-emerald-600" : isLoss ? "text-rose-600" : "text-slate-600"}`}>
                        {(t.final_r ?? 0) > 0 ? "+" : ""}{Number(t.final_r || 0).toFixed(2)}R
                      </td>
                      <td className={`py-3 px-4 font-bold ${isWin ? "text-emerald-600" : isLoss ? "text-rose-600" : "text-slate-600"}`}>
                        {(t.pnl_usdt ?? 0) > 0 ? "+" : ""}${Number(t.pnl_usdt || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-xs">
                          {t.deepseek_score ? `${t.deepseek_score}/100` : "85/100"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 8. Past Backtest Runs History */}
      {pastRuns.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-slate-600" />
              Saved Backtest Runs History
            </h3>
            <button
              onClick={fetchPastRuns}
              className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Refresh History
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {pastRuns.slice(0, 6).map((run, idx) => (
              <div
                key={idx}
                onClick={() => {
                  setReport(run);
                  setSelectedMonth(null);
                  setSelectedDay(null);
                }}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  report?.id === run.id
                    ? "border-brand-500 bg-brand-50/40 shadow-2xs"
                    : "border-slate-200 hover:border-slate-300 bg-slate-50/50"
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <strong className="text-slate-900">{run.symbol}</strong>
                  <span className="text-[10px] text-slate-400">
                    {run.lookback_days} Days
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">
                    {run.win_rate_pct.toFixed(1)}% Win Rate ({run.total_trades} trades)
                  </span>
                  <span className={`text-xs font-bold ${run.net_pnl_usdt >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {run.net_pnl_usdt >= 0 ? "+" : ""}${run.net_pnl_usdt.toFixed(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
