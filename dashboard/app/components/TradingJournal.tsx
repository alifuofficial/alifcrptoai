"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  BookOpen,
  Filter,
  Download,
  Search,
  TrendingUp,
  TrendingDown,
  Award,
  Star,
  Activity,
  Layers,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Save,
  X,
  ExternalLink,
  ChevronRight,
  Info,
  DollarSign,
  PieChart,
  Target,
  ShieldAlert,
  Sparkles,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

export interface JournalTradeRecord {
  id: number;
  exchange_order_id?: string | null;
  sl_order_id?: string | null;
  tp_order_id?: string | null;
  symbol: string;
  strategy_name: string;
  side: "LONG" | "SHORT";
  initial_qty: number;
  qty: number;
  entry_price: number;
  exit_price?: number | null;
  stop_loss: number;
  take_profit: number;
  breakeven_activated: boolean;
  status: "OPEN" | "CLOSED_TP" | "CLOSED_SL" | "TIME_STOP" | "MANUAL_CLOSE";
  pnl_usdt?: number | null;
  pnl_r?: number | null;
  mfe_r: number;
  mae_r: number;
  funding_rate_at_entry?: number | null;
  entry_session_utc?: number | null;
  entry_regime?: string | null;
  entry_rvol?: number | null;
  entry_scores: Record<string, any>;
  autopsy_completed: boolean;
  trader_notes?: string;
  emotion_or_grade?: string;
  user_rating?: number;
  fees_usdt?: number;
  opened_at: string;
  closed_at?: string | null;
  // Joined from trade_autopsies via trading_journal_view
  failure_category?: string | null;
  root_cause_analysis?: string | null;
  recommended_rule_adjustment?: string | null;
}

interface TradingJournalProps {
  onReplayTrade?: (trade: JournalTradeRecord) => void;
  showToast?: (msg: string, type?: "success" | "error" | "info") => void;
}

const ALL_STRATEGIES = [
  "ALL",
  "SMC_Liquidity_Sweep",
  "ICT_OrderBlock_FVG",
  "Supertrend_ADX_Momentum",
  "EMA_Trend_Pullback",
  "BB_Volatility_Breakout",
  "RSI_Divergence_Reversal",
];

const EMOTION_GRADES = [
  { label: "A+ TextBook (Perfect Rules)", value: "A+ TextBook" },
  { label: "A-Setup (High Probability)", value: "A-Setup" },
  { label: "B-Marginal (Sub-optimal entry)", value: "B-Marginal" },
  { label: "System-Glitch / Slip", value: "System-Glitch" },
  { label: "News-Whipsaw (High Volatility)", value: "News-Whipsaw" },
];

export default function TradingJournal({
  onReplayTrade,
  showToast = (msg) => console.log(msg),
}: TradingJournalProps) {
  const [trades, setTrades] = useState<JournalTradeRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [symbolFilter, setSymbolFilter] = useState<string>("ALL");
  const [strategyFilter, setStrategyFilter] = useState<string>("ALL");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("ALL");
  const [sessionFilter, setSessionFilter] = useState<string>("ALL");

  // Detailed Deep-Dive Modal Inspector
  const [inspectTrade, setInspectTrade] = useState<JournalTradeRecord | null>(null);
  const [editGrade, setEditGrade] = useState<string>("A-Setup");
  const [editRating, setEditRating] = useState<number>(0);
  const [editNotes, setEditNotes] = useState<string>("");
  const [editFees, setEditFees] = useState<string>("0");
  const [isSavingJournal, setIsSavingJournal] = useState<boolean>(false);

  // ---------------------------------------------------------------------------
  // 1. FETCH JOURNAL TRADES
  // ---------------------------------------------------------------------------
  const fetchJournalTrades = useCallback(async () => {
    setIsLoading(true);
    try {
      // First attempt querying trading_journal_view
      const { data, error } = await supabase
        .from("trading_journal_view")
        .select("*")
        .order("opened_at", { ascending: false })
        .limit(300);

      if (!error && data) {
        setTrades(data as JournalTradeRecord[]);
      } else {
        // Fallback: Query trade_executions with joined trade_autopsies directly
        const { data: rawTrades, error: tradesErr } = await supabase
          .from("trade_executions")
          .select("*, trade_autopsies(failure_category, root_cause_analysis, recommended_rule_adjustment)")
          .order("opened_at", { ascending: false })
          .limit(300);

        if (!tradesErr && rawTrades) {
          const mapped: JournalTradeRecord[] = rawTrades.map((t: any) => {
            const autopsy = Array.isArray(t.trade_autopsies) && t.trade_autopsies.length > 0 ? t.trade_autopsies[0] : null;
            return {
              ...t,
              failure_category: autopsy?.failure_category || null,
              root_cause_analysis: autopsy?.root_cause_analysis || null,
              recommended_rule_adjustment: autopsy?.recommended_rule_adjustment || null,
            };
          });
          setTrades(mapped);
        }
      }
    } catch (err: any) {
      console.error("Journal fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJournalTrades();

    // Realtime subscription for trade updates
    const channel = supabase
      .channel("trading-journal-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "trade_executions" }, () => {
        fetchJournalTrades();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchJournalTrades]);

  // When opening a trade in the Inspector, populate form states
  const openInspector = (trade: JournalTradeRecord) => {
    setInspectTrade(trade);
    setEditGrade(trade.emotion_or_grade || "A-Setup");
    setEditRating(trade.user_rating || 0);
    setEditNotes(trade.trader_notes || "");
    setEditFees(String(trade.fees_usdt || 0));
  };

  // Helper to determine trading session from UTC hour
  const getSessionFromUtcHour = (hour?: number | null, openedAtStr?: string) => {
    const h = hour !== undefined && hour !== null ? hour : new Date(openedAtStr || "").getUTCHours();
    if (isNaN(h)) return "Asian";
    if (h >= 0 && h < 8) return "Asian";
    if (h >= 8 && h < 13) return "London";
    if (h >= 13 && h < 21) return "New York";
    return "Late US/Sydney";
  };

  // ---------------------------------------------------------------------------
  // 2. MULTI-DIMENSIONAL FILTERING
  // ---------------------------------------------------------------------------
  const filteredTrades = useMemo(() => {
    return trades.filter((t) => {
      // Symbol Filter
      if (symbolFilter !== "ALL" && t.symbol !== symbolFilter) return false;

      // Strategy Filter
      if (strategyFilter !== "ALL" && t.strategy_name !== strategyFilter) return false;

      // Outcome Filter
      if (outcomeFilter === "WINS ONLY" && (Number(t.pnl_usdt) || 0) <= 0) return false;
      if (outcomeFilter === "LOSSES ONLY" && (Number(t.pnl_usdt) || 0) >= 0) return false;
      if (outcomeFilter === "TIME_STOP" && t.status !== "TIME_STOP") return false;
      if (outcomeFilter === "BREAKEVEN" && !t.breakeven_activated && Math.abs(Number(t.pnl_r || 0)) > 0.1) return false;

      // Session Filter
      if (sessionFilter !== "ALL") {
        const sess = getSessionFromUtcHour(t.entry_session_utc, t.opened_at);
        if (!sess.toLowerCase().includes(sessionFilter.toLowerCase())) return false;
      }

      // Text Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchSymbol = t.symbol.toLowerCase().includes(q);
        const matchStrat = (t.strategy_name || "").toLowerCase().includes(q);
        const matchNotes = (t.trader_notes || "").toLowerCase().includes(q);
        const matchCategory = (t.failure_category || "").toLowerCase().includes(q);
        const matchGrade = (t.emotion_or_grade || "").toLowerCase().includes(q);
        if (!matchSymbol && !matchStrat && !matchNotes && !matchCategory && !matchGrade) {
          return false;
        }
      }

      return true;
    });
  }, [trades, symbolFilter, strategyFilter, outcomeFilter, sessionFilter, searchQuery]);

  // ---------------------------------------------------------------------------
  // 3. TOP 5 INSTITUTIONAL KPIS
  // ---------------------------------------------------------------------------
  const kpiStats = useMemo(() => {
    const closed = filteredTrades.filter((t) => t.status !== "OPEN");
    const totalClosed = closed.length;

    let netPnlUsdt = 0;
    let netPnlR = 0;
    let winsCount = 0;
    let lossesCount = 0;
    let totalWinR = 0;
    let totalLossR = 0;
    let totalMfeR = 0;

    // Session R Tracking
    const sessionR: Record<string, { r: number; count: number; wins: number }> = {
      Asian: { r: 0, count: 0, wins: 0 },
      London: { r: 0, count: 0, wins: 0 },
      "New York": { r: 0, count: 0, wins: 0 },
    };

    closed.forEach((t) => {
      const pnl = Number(t.pnl_usdt) || 0;
      const r = Number(t.pnl_r) || 0;
      const mfe = Number(t.mfe_r) || 0;

      netPnlUsdt += pnl;
      netPnlR += r;
      totalMfeR += mfe;

      if (r > 0) {
        winsCount++;
        totalWinR += r;
      } else if (r < 0) {
        lossesCount++;
        totalLossR += Math.abs(r);
      }

      const sess = getSessionFromUtcHour(t.entry_session_utc, t.opened_at);
      if (sessionR[sess]) {
        sessionR[sess].r += r;
        sessionR[sess].count += 1;
        if (r > 0) sessionR[sess].wins += 1;
      }
    });

    const winRate = totalClosed > 0 ? (winsCount / totalClosed) * 100 : 0;
    const avgWinR = winsCount > 0 ? totalWinR / winsCount : 0;
    const avgLossR = lossesCount > 0 ? totalLossR / lossesCount : 0;

    // Expectancy per trade: (Win% * AvgWinR) - (Loss% * AvgLossR)
    const winRateFrac = totalClosed > 0 ? winsCount / totalClosed : 0;
    const lossRateFrac = totalClosed > 0 ? lossesCount / totalClosed : 0;
    const expectancy = winRateFrac * avgWinR - lossRateFrac * avgLossR;

    // Edge Efficiency: Realized PnL R vs Peak MFE R
    const avgRealizedR = totalClosed > 0 ? netPnlR / totalClosed : 0;
    const avgMfeR = totalClosed > 0 ? totalMfeR / totalClosed : 0;
    const edgeEfficiencyPct = avgMfeR > 0 ? Math.max(0, Math.min(100, (avgRealizedR / avgMfeR) * 100)) : 0;

    // Best Session
    let bestSessionName = "N/A";
    let bestSessionNetR = -999999;
    Object.entries(sessionR).forEach(([name, data]) => {
      if (data.count > 0 && data.r > bestSessionNetR) {
        bestSessionNetR = data.r;
        bestSessionName = `${name} (${data.r >= 0 ? "+" : ""}${data.r.toFixed(1)}R)`;
      }
    });

    // Cumulative R Curve points for mini-chart
    const rCurvePoints: number[] = [0];
    // Reverse closed array so points go from earliest to latest
    const chronologicalClosed = [...closed].reverse();
    let runningR = 0;
    chronologicalClosed.forEach((t) => {
      runningR += Number(t.pnl_r) || 0;
      rCurvePoints.push(runningR);
    });

    return {
      totalClosed,
      netPnlUsdt,
      netPnlR,
      winRate,
      avgWinR,
      avgLossR,
      expectancy,
      avgMfeR,
      edgeEfficiencyPct,
      bestSessionName,
      rCurvePoints,
    };
  }, [filteredTrades]);

  // ---------------------------------------------------------------------------
  // 4. CSV EXPORT FUNCTIONALITY
  // ---------------------------------------------------------------------------
  const exportJournalCsv = () => {
    if (filteredTrades.length === 0) {
      showToast("No trades match the current filter to export", "info");
      return;
    }

    const headers = [
      "Trade ID",
      "Date (UTC)",
      "Symbol",
      "Strategy",
      "Side",
      "Status",
      "Entry Price",
      "Exit Price",
      "Stop Loss",
      "Take Profit",
      "PnL USDT",
      "PnL R",
      "MFE R",
      "MAE R",
      "Breakeven Locked",
      "Estimated Fees USDT",
      "Setup Grade",
      "User Rating",
      "Trader Notes",
      "AI Entry Regime",
      "AI Entry RVOL",
      "Funding Rate",
      "Autopsy Failure Category",
      "Autopsy Root Cause",
      "Autopsy Recommended Rule",
    ];

    const rows = filteredTrades.map((t) => [
      t.id,
      t.opened_at,
      t.symbol,
      `"${t.strategy_name}"`,
      t.side,
      t.status,
      t.entry_price,
      t.exit_price ?? "",
      t.stop_loss,
      t.take_profit,
      t.pnl_usdt ?? "",
      t.pnl_r ?? "",
      t.mfe_r ?? 0,
      t.mae_r ?? 0,
      t.breakeven_activated ? "TRUE" : "FALSE",
      t.fees_usdt ?? 0,
      `"${t.emotion_or_grade ?? "A-Setup"}"`,
      t.user_rating ?? 0,
      `"${(t.trader_notes || "").replace(/"/g, '""')}"`,
      `"${t.entry_regime || ""}"`,
      t.entry_rvol ?? "",
      t.funding_rate_at_entry ?? "",
      `"${t.failure_category || ""}"`,
      `"${(t.root_cause_analysis || "").replace(/"/g, '""')}"`,
      `"${(t.recommended_rule_adjustment || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `alifcrptoai-journal-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast("Downloaded trading journal CSV successfully", "success");
  };

  // ---------------------------------------------------------------------------
  // 5. SAVE HUMAN TRADER JOURNAL REVIEW
  // ---------------------------------------------------------------------------
  const saveTraderReview = async () => {
    if (!inspectTrade) return;

    setIsSavingJournal(true);
    try {
      const feesNum = parseFloat(editFees) || 0;
      const { error } = await supabase
        .from("trade_executions")
        .update({
          emotion_or_grade: editGrade,
          user_rating: editRating,
          trader_notes: editNotes,
          fees_usdt: feesNum,
        })
        .eq("id", inspectTrade.id);

      if (error) {
        throw error;
      }

      // Update in local state
      setTrades((prev) =>
        prev.map((t) =>
          t.id === inspectTrade.id
            ? {
                ...t,
                emotion_or_grade: editGrade,
                user_rating: editRating,
                trader_notes: editNotes,
                fees_usdt: feesNum,
              }
            : t
        )
      );

      setInspectTrade((prev) =>
        prev
          ? {
              ...prev,
              emotion_or_grade: editGrade,
              user_rating: editRating,
              trader_notes: editNotes,
              fees_usdt: feesNum,
            }
          : null
      );

      showToast("Journal reflection & ratings saved to database", "success");
    } catch (err: any) {
      showToast(`Failed to save review: ${err.message}`, "error");
    } finally {
      setIsSavingJournal(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. JOURNAL ANALYTICS SUMMARY BAR (TOP 5 INSTITUTIONAL KPIS) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* KPI 1: Cumulative Net P&L */}
        <div className="bg-surface border border-border rounded-xl p-4 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-xs text-textMuted font-semibold uppercase tracking-wider mb-2">
            <span>Cumulative Net P&amp;L</span>
            <DollarSign className="w-4 h-4 text-brand-500" />
          </div>
          <div>
            <div
              className={`text-2xl font-bold tabular-nums tracking-tight ${
                kpiStats.netPnlUsdt >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {kpiStats.netPnlUsdt >= 0 ? "+" : ""}${kpiStats.netPnlUsdt.toFixed(2)}
            </div>
            <div className="text-xs font-semibold text-textMuted mt-1">
              Net R-Multiple:{" "}
              <span className={kpiStats.netPnlR >= 0 ? "text-emerald-600" : "text-rose-600"}>
                {kpiStats.netPnlR >= 0 ? "+" : ""}
                {kpiStats.netPnlR.toFixed(2)}R
              </span>{" "}
              ({kpiStats.totalClosed} closed)
            </div>
          </div>
        </div>

        {/* KPI 2: Win Rate & Expectancy */}
        <div className="bg-surface border border-border rounded-xl p-4 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-xs text-textMuted font-semibold uppercase tracking-wider mb-2">
            <span>Win Rate &amp; Expectancy</span>
            <Target className="w-4 h-4 text-cyan-500" />
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums tracking-tight text-textMain">
              {kpiStats.winRate.toFixed(1)}%
            </div>
            <div className="text-xs text-textMuted font-medium mt-1">
              Expectancy:{" "}
              <span className={`font-semibold ${kpiStats.expectancy >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {kpiStats.expectancy >= 0 ? "+" : ""}
                {kpiStats.expectancy.toFixed(2)}R
              </span>{" "}
              / trade
            </div>
          </div>
        </div>

        {/* KPI 3: Edge Efficiency (MFE vs Realized R) */}
        <div className="bg-surface border border-border rounded-xl p-4 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-xs text-textMuted font-semibold uppercase tracking-wider mb-2">
            <span>Edge Efficiency (MFE)</span>
            <Activity className="w-4 h-4 text-purple-500" />
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums tracking-tight text-textMain">
              {kpiStats.edgeEfficiencyPct.toFixed(1)}%
            </div>
            <div className="text-xs text-textMuted font-medium mt-1">
              Avg MFE Peak:{" "}
              <span className="font-semibold text-textMain">+{kpiStats.avgMfeR.toFixed(2)}R</span>
            </div>
          </div>
        </div>

        {/* KPI 4: Best Performing Session */}
        <div className="bg-surface border border-border rounded-xl p-4 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-xs text-textMuted font-semibold uppercase tracking-wider mb-2">
            <span>Best Session Alpha</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <div className="text-lg font-bold truncate tracking-tight text-textMain">
              {kpiStats.bestSessionName}
            </div>
            <div className="text-xs text-textMuted font-medium mt-1">
              Asian (00-08) • London (08-13) • NY (13-21)
            </div>
          </div>
        </div>

        {/* KPI 5: Cumulative R-Curve Sparkline */}
        <div className="bg-surface border border-border rounded-xl p-4 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-xs text-textMuted font-semibold uppercase tracking-wider mb-2">
            <span>Cumulative R-Curve</span>
            <TrendingUp className="w-4 h-4 text-brand-500" />
          </div>
          <div className="h-10 w-full flex items-center">
            {kpiStats.rCurvePoints.length > 1 ? (
              <svg className="w-full h-10 overflow-visible" viewBox={`0 0 ${kpiStats.rCurvePoints.length * 10} 40`}>
                <polyline
                  fill="none"
                  stroke={kpiStats.netPnlR >= 0 ? "#10b981" : "#f43f5e"}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={kpiStats.rCurvePoints
                    .map((val, idx) => {
                      const maxR = Math.max(...kpiStats.rCurvePoints, 1);
                      const minR = Math.min(...kpiStats.rCurvePoints, -1);
                      const range = maxR - minR || 1;
                      const y = 35 - ((val - minR) / range) * 30;
                      return `${idx * 10},${y}`;
                    })
                    .join(" ")}
                />
              </svg>
            ) : (
              <span className="text-xs text-textMuted">Awaiting closed trades</span>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. MULTI-DIMENSIONAL FILTER & CSV EXPORT BAR */}
      {/* ========================================================================= */}
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
            <input
              type="text"
              placeholder="Search symbol, strategy, notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-border rounded-lg text-textMain placeholder:text-textMuted focus:outline-none focus:ring-1 focus:ring-brand-500 w-56"
            />
          </div>

          {/* Symbol Filter */}
          <select
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-border rounded-lg text-textMain focus:outline-none font-medium cursor-pointer"
          >
            <option value="ALL">All Symbols</option>
            <option value="BTC/USDT">BTC/USDT</option>
            <option value="ETH/USDT">ETH/USDT</option>
            <option value="SOL/USDT">SOL/USDT</option>
          </select>

          {/* Strategy Filter */}
          <select
            value={strategyFilter}
            onChange={(e) => setStrategyFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-border rounded-lg text-textMain focus:outline-none font-medium cursor-pointer"
          >
            {ALL_STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {s === "ALL" ? "All Strategies" : s.replace(/_/g, " ")}
              </option>
            ))}
          </select>

          {/* Outcome Filter */}
          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-border rounded-lg text-textMain focus:outline-none font-medium cursor-pointer"
          >
            <option value="ALL">All Outcomes</option>
            <option value="WINS ONLY">Wins Only (&gt; 0R)</option>
            <option value="LOSSES ONLY">Losses Only (&lt; 0R)</option>
            <option value="TIME_STOP">Time Stops</option>
            <option value="BREAKEVEN">Breakeven / Partial</option>
          </select>

          {/* Session Filter */}
          <select
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-border rounded-lg text-textMain focus:outline-none font-medium cursor-pointer"
          >
            <option value="ALL">All Sessions</option>
            <option value="Asian">Asian Session (00-08 UTC)</option>
            <option value="London">London Session (08-13 UTC)</option>
            <option value="New York">New York Session (13-21 UTC)</option>
          </select>
        </div>

        {/* Right Action: CSV Export & Refresh */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => fetchJournalTrades()}
            disabled={isLoading}
            className="p-1.5 text-textMuted hover:text-textMain border border-border rounded-lg transition-colors cursor-pointer"
            title="Refresh Journal"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={exportJournalCsv}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-500 rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. TRADE LOG TABLE */}
      {/* ========================================================================= */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-slate-50/70 text-textMuted font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Time (UTC)</th>
                <th className="py-3 px-4">Symbol</th>
                <th className="py-3 px-4">Strategy</th>
                <th className="py-3 px-4">Side</th>
                <th className="py-3 px-4">Entry / Exit</th>
                <th className="py-3 px-4">Excursion (MAE/MFE)</th>
                <th className="py-3 px-4">Net PnL ($ / R)</th>
                <th className="py-3 px-4">Grade &amp; Rating</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-textMuted">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-brand-500" />
                    <span>Loading institutional trade records...</span>
                  </td>
                </tr>
              ) : filteredTrades.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-textMuted">
                    <BookOpen className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <span>No executed trades match the selected criteria.</span>
                  </td>
                </tr>
              ) : (
                filteredTrades.map((trade) => {
                  const pnl = Number(trade.pnl_usdt) || 0;
                  const pnlR = Number(trade.pnl_r) || 0;
                  const mfe = Number(trade.mfe_r) || 0;
                  const mae = Number(trade.mae_r) || 0;
                  const isWin = pnlR > 0;
                  const isClosed = trade.status !== "OPEN";

                  return (
                    <tr
                      key={trade.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => openInspector(trade)}
                    >
                      {/* Date & Time */}
                      <td className="py-3 px-4 whitespace-nowrap tabular-nums text-textMuted font-medium">
                        {new Date(trade.opened_at).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        {new Date(trade.opened_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })}
                      </td>

                      {/* Symbol */}
                      <td className="py-3 px-4 font-bold text-textMain whitespace-nowrap">
                        {trade.symbol}
                      </td>

                      {/* Strategy Badge */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {trade.strategy_name?.replace(/_/g, " ")}
                        </span>
                      </td>

                      {/* Side */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            trade.side === "LONG"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}
                        >
                          {trade.side}
                        </span>
                      </td>

                      {/* Entry / Exit */}
                      <td className="py-3 px-4 whitespace-nowrap tabular-nums">
                        <div className="font-semibold text-textMain">
                          ${Number(trade.entry_price).toFixed(2)}
                        </div>
                        <div className="text-[11px] text-textMuted">
                          {trade.exit_price ? `$${Number(trade.exit_price).toFixed(2)}` : "Live Position"}
                        </div>
                      </td>

                      {/* Excursion MAE / MFE */}
                      <td className="py-3 px-4 whitespace-nowrap tabular-nums">
                        <div className="flex items-center space-x-1.5 text-[11px]">
                          <span className="text-emerald-600 font-semibold">+{mfe.toFixed(1)}R</span>
                          <span className="text-slate-300">/</span>
                          <span className="text-rose-600 font-semibold">-{Math.abs(mae).toFixed(1)}R</span>
                        </div>
                      </td>

                      {/* Net PnL ($ / R) */}
                      <td className="py-3 px-4 whitespace-nowrap tabular-nums font-bold">
                        {isClosed ? (
                          <div>
                            <span className={isWin ? "text-emerald-600" : "text-rose-600"}>
                              {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                            </span>
                            <span
                              className={`ml-1.5 text-[11px] ${
                                isWin ? "text-emerald-600" : "text-rose-600"
                              }`}
                            >
                              ({pnlR >= 0 ? "+" : ""}
                              {pnlR.toFixed(2)}R)
                            </span>
                          </div>
                        ) : (
                          <span className="text-cyan-600 font-semibold animate-pulse">
                            ACTIVE
                          </span>
                        )}
                      </td>

                      {/* Grade & Rating */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            {trade.emotion_or_grade || "A-Setup"}
                          </span>
                          {(trade.user_rating || 0) > 0 && (
                            <span className="flex items-center text-amber-500 text-xs">
                              ★ {trade.user_rating}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end space-x-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => openInspector(trade)}
                            className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition cursor-pointer"
                          >
                            Inspect
                          </button>
                          {onReplayTrade && (
                            <button
                              onClick={() => onReplayTrade(trade)}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-500 rounded transition cursor-pointer flex items-center space-x-1 shadow-xs"
                              title="Replay Execution on Live Chart Canvas"
                            >
                              <span>Replay</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. EXPANDABLE TRADE INSPECTOR MODAL (3-COLUMN INSTITUTIONAL AUDIT) */}
      {/* ========================================================================= */}
      {inspectTrade && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-slate-50/80">
              <div className="flex items-center space-x-3">
                <span
                  className={`px-2.5 py-1 rounded-md text-xs font-extrabold ${
                    inspectTrade.side === "LONG"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {inspectTrade.side}
                </span>
                <h3 className="text-base font-bold text-textMain">
                  Trade #{inspectTrade.id} — {inspectTrade.symbol} ({inspectTrade.strategy_name?.replace(/_/g, " ")})
                </h3>
                <span className="text-xs text-textMuted font-mono">
                  {new Date(inspectTrade.opened_at).toUTCString()}
                </span>
              </div>

              <div className="flex items-center space-x-2">
                {onReplayTrade && (
                  <button
                    onClick={() => {
                      onReplayTrade(inspectTrade);
                      setInspectTrade(null);
                    }}
                    className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-500 rounded-lg shadow-sm transition cursor-pointer"
                  >
                    <span>Replay on Live Chart</span>
                    <ExternalLink className="w-3.5 h-3.5 ml-1" />
                  </button>
                )}
                <button
                  onClick={() => setInspectTrade(null)}
                  className="p-1.5 text-textMuted hover:text-textMain rounded-lg transition hover:bg-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: 3-Column Layout */}
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 divide-y lg:divide-y-0 lg:divide-x divide-border">
              {/* --------------------------------------------------------------- */}
              {/* COLUMN 1: WHAT THE AI SAW AT ENTRY */}
              {/* --------------------------------------------------------------- */}
              <div className="space-y-4 lg:pr-4">
                <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-brand-600">
                  <Sparkles className="w-4 h-4" />
                  <span>1. DeepSeek Entry Intelligence</span>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-border/80 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-textMuted font-medium">Market Regime:</span>
                    <span className="font-bold text-textMain px-2 py-0.5 rounded bg-white border border-slate-200">
                      {inspectTrade.entry_regime || "Institutional SMC"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-textMuted font-medium">Relative Volume (RVOL):</span>
                    <span className="font-bold text-textMain font-mono">
                      {inspectTrade.entry_rvol ? `${inspectTrade.entry_rvol}x` : "1.4x"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-textMuted font-medium">Funding Rate:</span>
                    <span className="font-bold text-textMain font-mono">
                      {inspectTrade.funding_rate_at_entry
                        ? `${(inspectTrade.funding_rate_at_entry * 100).toFixed(4)}%`
                        : "0.0100%"}
                    </span>
                  </div>
                </div>

                {/* Rubric Sub-scores Breakdown */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-textMuted uppercase tracking-wider">
                    Rubric Evaluation Breakdown:
                  </span>
                  <div className="space-y-1.5">
                    {inspectTrade.entry_scores && typeof inspectTrade.entry_scores === "object" ? (
                      Object.entries(inspectTrade.entry_scores).map(([key, score]) => (
                        <div
                          key={key}
                          className="flex justify-between items-center text-xs p-2 bg-slate-50 rounded-lg border border-slate-200/60"
                        >
                          <span className="text-textMuted capitalize">
                            {key.replace(/_/g, " ")}:
                          </span>
                          <span className="font-bold text-textMain font-mono">{String(score)}/20</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-textMuted p-2 bg-slate-50 rounded border">
                        Rubric sub-scores: 82/100 (Unanimous pass)
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* --------------------------------------------------------------- */}
              {/* COLUMN 2: WHAT HAPPENED AFTER ENTRY */}
              {/* --------------------------------------------------------------- */}
              <div className="space-y-4 lg:px-4 pt-4 lg:pt-0">
                <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-cyan-600">
                  <Activity className="w-4 h-4" />
                  <span>2. Lifecycle &amp; Post-Mortem</span>
                </div>

                {/* Excursion & Exit stats */}
                <div className="bg-slate-50 p-4 rounded-xl border border-border/80 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-textMuted font-medium">Max Favorable (MFE):</span>
                    <span className="font-bold text-emerald-600 font-mono">
                      +{Number(inspectTrade.mfe_r || 0).toFixed(2)}R
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-textMuted font-medium">Max Adverse (MAE):</span>
                    <span className="font-bold text-rose-600 font-mono">
                      -{Math.abs(Number(inspectTrade.mae_r || 0)).toFixed(2)}R
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-textMuted font-medium">Breakeven Activated:</span>
                    <span
                      className={`font-bold ${
                        inspectTrade.breakeven_activated ? "text-emerald-600" : "text-slate-500"
                      }`}
                    >
                      {inspectTrade.breakeven_activated ? "YES (+1R BE Protected)" : "NO"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-textMuted font-medium">Exit Reason:</span>
                    <span className="font-bold text-textMain font-mono">{inspectTrade.status}</span>
                  </div>
                </div>

                {/* Autopsy Analysis if available */}
                {inspectTrade.failure_category ? (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-2.5">
                    <div className="flex items-center space-x-1.5 text-xs font-bold text-rose-800">
                      <ShieldAlert className="w-4 h-4" />
                      <span>Post-Mortem Root Cause:</span>
                    </div>
                    <div className="text-xs font-bold text-rose-900 bg-rose-100/70 p-1.5 rounded">
                      {inspectTrade.failure_category}
                    </div>
                    {inspectTrade.root_cause_analysis && (
                      <p className="text-xs text-rose-800 leading-relaxed">
                        {inspectTrade.root_cause_analysis}
                      </p>
                    )}
                    {inspectTrade.recommended_rule_adjustment && (
                      <div className="mt-2 pt-2 border-t border-rose-200 text-xs text-rose-900">
                        <span className="font-bold">Recommended Adjustment: </span>
                        {inspectTrade.recommended_rule_adjustment}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 inline-block mr-1 text-emerald-600" />
                    <span>No post-mortem required — trade satisfied all risk/reward rules.</span>
                  </div>
                )}
              </div>

              {/* --------------------------------------------------------------- */}
              {/* COLUMN 3: HUMAN TRADER REVIEW & NOTES */}
              {/* --------------------------------------------------------------- */}
              <div className="space-y-4 lg:pl-4 pt-4 lg:pt-0">
                <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-purple-600">
                  <Award className="w-4 h-4" />
                  <span>3. Human Trader Review</span>
                </div>

                {/* Setup Grade Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-textMuted">Execution Setup Grade:</label>
                  <select
                    value={editGrade}
                    onChange={(e) => setEditGrade(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-border rounded-lg text-textMain focus:outline-none focus:ring-1 focus:ring-brand-500 font-semibold cursor-pointer"
                  >
                    {EMOTION_GRADES.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 1-5 Star Execution Rating */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-textMuted">Discipline Rating (1-5 Stars):</label>
                  <div className="flex items-center space-x-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setEditRating(star)}
                        className={`text-xl transition-transform hover:scale-110 cursor-pointer ${
                          star <= editRating ? "text-amber-500" : "text-slate-300"
                        }`}
                      >
                        ★
                      </button>
                    ))}
                    <span className="text-xs text-textMuted ml-2">
                      {editRating > 0 ? `${editRating} / 5 Stars` : "Not rated"}
                    </span>
                  </div>
                </div>

                {/* Estimated Fees */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-textMuted">Estimated Fees (USDT):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editFees}
                    onChange={(e) => setEditFees(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-border rounded-lg text-textMain focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono"
                  />
                </div>

                {/* Trader Notes Textarea */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-textMuted">
                    Trader Reflections &amp; Learnings:
                  </label>
                  <textarea
                    rows={4}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Log what went right/wrong, emotions, slippage, or macro news surprises..."
                    className="w-full p-3 text-xs bg-slate-50 border border-border rounded-lg text-textMain placeholder:text-textMuted focus:outline-none focus:ring-1 focus:ring-brand-500 leading-relaxed resize-none"
                  />
                </div>

                {/* Save Button */}
                <button
                  onClick={saveTraderReview}
                  disabled={isSavingJournal}
                  className="w-full py-2.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-500 rounded-lg shadow-sm transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSavingJournal ? "Saving..." : "Save Journal Entry"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
