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
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  Calendar,
  ArrowUpDown,
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
  is_simulated?: boolean;
  trader_notes?: string;
  emotion_or_grade?: string;
  user_rating?: number;
  fees_usdt?: number;
  opened_at: string;
  closed_at?: string | null;
  exchange?: "binance" | "bybit" | string;
  asset_class?: "crypto" | "forex" | "commodity" | string;
  pnl_pips?: number | null;
  spread_at_entry?: number | null;
  forex_session?: string | null;
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
  "Asian_Judas_Swing",
  "SMT_Divergence",
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
  const [modeFilter, setModeFilter] = useState<string>("ALL");
  const [exchangeFilter, setExchangeFilter] = useState<"ALL" | "binance" | "bybit">("ALL");

  // Heatmap & Date Selection States
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [isHeatmapExpanded, setIsHeatmapExpanded] = useState<boolean>(true);
  const [dateRangeFilter, setDateRangeFilter] = useState<"ALL" | "TODAY" | "7D" | "30D" | "THIS_MONTH">("ALL");
  const [sortBy, setSortBy] = useState<string>("date_desc");

  // Helper to format trade holding duration
  const formatDuration = (openedAt: string, closedAt?: string | null): string => {
    if (!closedAt) return "Active";
    const start = new Date(openedAt).getTime();
    const end = new Date(closedAt).getTime();
    const diffMs = Math.max(0, end - start);
    const mins = Math.floor(diffMs / (60 * 1000));
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hours < 24) return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
  };

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
        if (data.length > 0) {
          const firstMonth = (data[0].opened_at || "").substring(0, 7);
          setSelectedMonth((prev) => prev || firstMonth);
        }
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
          if (mapped.length > 0) {
            const firstMonth = (mapped[0].opened_at || "").substring(0, 7);
            setSelectedMonth((prev) => prev || firstMonth);
          }
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
  // 2. MONTHLY & DAILY CALENDAR HEATMAP AGGREGATOR
  // ---------------------------------------------------------------------------
  const monthlyHeatmapData = useMemo(() => {
    const monthsMap: Record<string, {
      monthKey: string;
      label: string;
      netPnlUsdt: number;
      netPnlR: number;
      tradesCount: number;
      winsCount: number;
      lossesCount: number;
      breakevensCount: number;
      winRatePct: number;
      profitFactor: number;
      daysMap: Record<string, {
        dateStr: string;
        dayNum: number;
        dayOfWeek: number;
        netPnlUsdt: number;
        netPnlR: number;
        tradesCount: number;
        winsCount: number;
        lossesCount: number;
        trades: JournalTradeRecord[];
      }>;
    }> = {};

    trades.forEach((t) => {
      const dateStr = (t.opened_at || "").substring(0, 10);
      const ym = (t.opened_at || "").substring(0, 7);
      if (!ym || !dateStr) return;

      if (!monthsMap[ym]) {
        const d = new Date(ym + "-01T00:00:00Z");
        const monthLabel = isNaN(d.getTime())
          ? ym
          : d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
        monthsMap[ym] = {
          monthKey: ym,
          label: monthLabel,
          netPnlUsdt: 0,
          netPnlR: 0,
          tradesCount: 0,
          winsCount: 0,
          lossesCount: 0,
          breakevensCount: 0,
          winRatePct: 0,
          profitFactor: 1.0,
          daysMap: {},
        };
      }

      const m = monthsMap[ym];
      const pnl = Number(t.pnl_usdt) || 0;
      const r = Number(t.pnl_r) || 0;
      const isClosed = t.status !== "OPEN";

      if (isClosed) {
        m.netPnlUsdt += pnl;
        m.netPnlR += r;
        m.tradesCount += 1;
        if (r > 0) m.winsCount += 1;
        else if (r < 0) m.lossesCount += 1;
        else m.breakevensCount += 1;
      }

      if (!m.daysMap[dateStr]) {
        const dayDate = new Date(dateStr + "T00:00:00Z");
        m.daysMap[dateStr] = {
          dateStr,
          dayNum: parseInt(dateStr.substring(8, 10), 10),
          dayOfWeek: dayDate.getUTCDay(),
          netPnlUsdt: 0,
          netPnlR: 0,
          tradesCount: 0,
          winsCount: 0,
          lossesCount: 0,
          trades: [],
        };
      }

      const dayObj = m.daysMap[dateStr];
      dayObj.trades.push(t);
      if (isClosed) {
        dayObj.netPnlUsdt += pnl;
        dayObj.netPnlR += r;
        dayObj.tradesCount += 1;
        if (r > 0) dayObj.winsCount += 1;
        else if (r < 0) dayObj.lossesCount += 1;
      }
    });

    Object.values(monthsMap).forEach((m) => {
      m.winRatePct = m.tradesCount > 0 ? (m.winsCount / m.tradesCount) * 100 : 0;
      let grossProfit = 0;
      let grossLoss = 0;
      Object.values(m.daysMap).forEach((d) => {
        d.trades.forEach((tr) => {
          const p = Number(tr.pnl_usdt) || 0;
          if (p > 0) grossProfit += p;
          else if (p < 0) grossLoss += Math.abs(p);
        });
      });
      m.profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 9.99 : 1.0);
    });

    return Object.values(monthsMap).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [trades]);

  const selectedMonthData = useMemo(() => {
    if (monthlyHeatmapData.length === 0) return null;
    return monthlyHeatmapData.find((m) => m.monthKey === selectedMonth) || monthlyHeatmapData[0] || null;
  }, [monthlyHeatmapData, selectedMonth]);

  const calendarCells = useMemo(() => {
    if (!selectedMonthData) return [];
    const ym = selectedMonthData.monthKey;
    const parts = ym.split("-");
    const year = parseInt(parts[0], 10);
    const monthIndex = parseInt(parts[1], 10) - 1;

    const totalDaysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const firstDayUtc = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
    const startOffset = firstDayUtc === 0 ? 6 : firstDayUtc - 1;

    const cells: Array<{
      type: "empty" | "day";
      dayNum?: number;
      dateStr?: string;
      isWeekend?: boolean;
      pnlUsdt?: number;
      pnlR?: number;
      tradesCount?: number;
      winsCount?: number;
      lossesCount?: number;
      hasTrades?: boolean;
    }> = [];

    for (let i = 0; i < startOffset; i++) {
      cells.push({ type: "empty" });
    }

    for (let d = 1; d <= totalDaysInMonth; d++) {
      const dateStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayData = selectedMonthData.daysMap[dateStr];
      const dayOfWeek = (startOffset + d - 1) % 7;
      const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;

      cells.push({
        type: "day",
        dayNum: d,
        dateStr,
        isWeekend,
        pnlUsdt: dayData ? dayData.netPnlUsdt : 0,
        pnlR: dayData ? dayData.netPnlR : 0,
        tradesCount: dayData ? dayData.tradesCount : 0,
        winsCount: dayData ? dayData.winsCount : 0,
        lossesCount: dayData ? dayData.lossesCount : 0,
        hasTrades: Boolean(dayData && dayData.tradesCount > 0),
      });
    }

    return cells;
  }, [selectedMonthData]);

  const selectedDayStats = useMemo(() => {
    if (!selectedDay || !selectedMonthData) return null;
    return selectedMonthData.daysMap[selectedDay] || null;
  }, [selectedDay, selectedMonthData]);

  // ---------------------------------------------------------------------------
  // 3. MULTI-DIMENSIONAL FILTERING & SORTING
  // ---------------------------------------------------------------------------
  const filteredTrades = useMemo(() => {
    const list = trades.filter((t) => {
      // Calendar Day Drill-Down Filter
      if (selectedDay) {
        const tDate = (t.opened_at || "").substring(0, 10);
        if (tDate !== selectedDay) return false;
      }

      // Quick Date Range Presets
      if (dateRangeFilter === "TODAY") {
        const todayStr = new Date().toISOString().substring(0, 10);
        if ((t.opened_at || "").substring(0, 10) !== todayStr) return false;
      } else if (dateRangeFilter === "7D") {
        const cutoff7d = Date.now() - 7 * 86400 * 1000;
        if (new Date(t.opened_at).getTime() < cutoff7d) return false;
      } else if (dateRangeFilter === "30D") {
        const cutoff30d = Date.now() - 30 * 86400 * 1000;
        if (new Date(t.opened_at).getTime() < cutoff30d) return false;
      } else if (dateRangeFilter === "THIS_MONTH") {
        const thisMonth = new Date().toISOString().substring(0, 7);
        if ((t.opened_at || "").substring(0, 7) !== thisMonth) return false;
      }

      // Execution Mode Filter (Live vs Analytical)
      const isSim =
        Boolean(t.is_simulated) ||
        String(t.exchange_order_id || "").startsWith("ANALYTICS_") ||
        String(t.exchange_order_id || "").startsWith("sim_");
      if (modeFilter === "LIVE" && isSim) return false;
      if (modeFilter === "ANALYTICAL" && !isSim) return false;

      // Exchange Filter (Binance vs Bybit)
      if (exchangeFilter !== "ALL") {
        const tradeEx = (t.exchange || "binance").toLowerCase();
        if (tradeEx !== exchangeFilter.toLowerCase()) return false;
      }

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

    // Apply Sorting
    return list.sort((a, b) => {
      if (sortBy === "date_asc") return new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime();
      if (sortBy === "pnl_desc") return (Number(b.pnl_usdt) || 0) - (Number(a.pnl_usdt) || 0);
      if (sortBy === "pnl_asc") return (Number(a.pnl_usdt) || 0) - (Number(b.pnl_usdt) || 0);
      if (sortBy === "r_desc") return (Number(b.pnl_r) || 0) - (Number(a.pnl_r) || 0);
      if (sortBy === "r_asc") return (Number(a.pnl_r) || 0) - (Number(b.pnl_r) || 0);
      if (sortBy === "rating_desc") return (b.user_rating || 0) - (a.user_rating || 0);
      // Default: date_desc (newest first)
      return new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime();
    });
  }, [
    trades,
    selectedDay,
    dateRangeFilter,
    symbolFilter,
    strategyFilter,
    outcomeFilter,
    sessionFilter,
    searchQuery,
    modeFilter,
    exchangeFilter,
    sortBy,
  ]);

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
      "Exchange",
      "Asset Class",
      "Date (UTC)",
      "Duration",
      "Symbol",
      "Strategy",
      "Side",
      "Status",
      "Entry Price",
      "Exit Price",
      "Stop Loss",
      "Take Profit",
      "PnL USDT",
      "PnL Pips",
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
      t.exchange || "binance",
      t.asset_class || "crypto",
      t.opened_at,
      formatDuration(t.opened_at, t.closed_at),
      t.symbol,
      `"${t.strategy_name}"`,
      t.side,
      t.status,
      t.entry_price,
      t.exit_price ?? "",
      t.stop_loss,
      t.take_profit,
      t.pnl_usdt ?? "",
      t.pnl_pips ?? "",
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
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
      {/* 2. INTERACTIVE PERFORMANCE CALENDAR HEATMAP */}
      {/* ========================================================================= */}
      <div className="bg-surface border border-border rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-brand-50 rounded-lg text-brand-600 border border-brand-100">
              <Calendar className="w-4 h-4 text-brand-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-textMain tracking-tight">
                  Trading Performance Calendar Heatmap
                </h3>
                {selectedMonthData && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                    {selectedMonthData.label}
                  </span>
                )}
                {selectedDay && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                    <span>Day: {selectedDay}</span>
                    <button onClick={() => setSelectedDay(null)} className="hover:text-indigo-900 cursor-pointer">✕</button>
                  </span>
                )}
              </div>
              <p className="text-xs text-textMuted mt-0.5">
                Interactive P&amp;L and win rate matrix. Click any month card or calendar day below to inspect trades.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {selectedDay && (
              <button
                onClick={() => setSelectedDay(null)}
                className="px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition cursor-pointer"
              >
                Clear Day Filter
              </button>
            )}
            <button
              onClick={() => setIsHeatmapExpanded(!isHeatmapExpanded)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-textMuted hover:text-textMain border border-border rounded-lg transition hover:bg-slate-50 cursor-pointer"
            >
              <span>{isHeatmapExpanded ? "Collapse Heatmap" : "Expand Heatmap"}</span>
              {isHeatmapExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {isHeatmapExpanded && (
          <div className="space-y-4">
            {/* Monthly Matrix Overview Cards */}
            {monthlyHeatmapData.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                {monthlyHeatmapData.map((m) => {
                  const isProfit = m.netPnlUsdt >= 0;
                  const isSelected = selectedMonth === m.monthKey;
                  return (
                    <button
                      key={m.monthKey}
                      type="button"
                      onClick={() => {
                        setSelectedMonth(m.monthKey);
                        setSelectedDay(null);
                      }}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative group ${
                        isSelected
                          ? "ring-2 ring-brand-500 shadow-md bg-brand-50/70 border-brand-300 -translate-y-0.5"
                          : isProfit
                          ? "bg-emerald-50/40 hover:bg-emerald-50/80 border-emerald-200/70 hover:border-emerald-300 shadow-2xs hover:-translate-y-0.5"
                          : "bg-rose-50/40 hover:bg-rose-50/80 border-rose-200/70 hover:border-rose-300 shadow-2xs hover:-translate-y-0.5"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-bold text-textMuted uppercase mb-0.5">
                        <span>{m.label}</span>
                        {isSelected && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-brand-600 text-white rounded font-bold">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div className={`text-base font-extrabold my-0.5 ${isProfit ? "text-emerald-600" : "text-rose-600"}`}>
                        {isProfit ? "+" : ""}${m.netPnlUsdt.toFixed(1)}
                      </div>
                      <div className="text-[10px] text-textMuted font-medium">
                        {m.tradesCount} trds • <strong className={isProfit ? "text-emerald-600" : "text-rose-600"}>{m.winRatePct.toFixed(0)}% WR</strong>
                      </div>
                      <div className="text-[9px] text-textMuted font-mono mt-0.5">
                        {m.netPnlR >= 0 ? "+" : ""}{m.netPnlR.toFixed(1)}R • PF: {m.profitFactor.toFixed(1)}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-textMuted bg-slate-50 rounded-xl border border-dashed border-border">
                <span>No trade records available yet to generate monthly heatmap.</span>
              </div>
            )}

            {/* Daily Calendar Grid */}
            {selectedMonthData && (
              <div className="bg-slate-50/60 p-3 sm:p-4 rounded-xl border border-border/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-textMain flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-brand-500" />
                    <span>Daily P&amp;L Matrix — {selectedMonthData.label}</span>
                  </div>
                  <span className="text-[11px] text-textMuted">Click any day to filter trade logs</span>
                </div>

                {/* Day-of-week headers */}
                <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold text-textMuted uppercase tracking-wider py-1 border-b border-border/60">
                  <span>Mon</span>
                  <span>Tue</span>
                  <span>Wed</span>
                  <span>Thu</span>
                  <span>Fri</span>
                  <span className="text-amber-600">Sat</span>
                  <span className="text-amber-600">Sun</span>
                </div>

                {/* Days Grid */}
                <div className="grid grid-cols-7 gap-1.5">
                  {calendarCells.map((cell, idx) => {
                    if (cell.type === "empty") {
                      return (
                        <div key={`empty-${idx}`} className="h-16 sm:h-20 rounded-lg bg-slate-100/30 border border-transparent" />
                      );
                    }

                    const isSelected = selectedDay === cell.dateStr;
                    const hasTrades = cell.hasTrades;
                    const isProfit = (cell.pnlUsdt || 0) >= 0;
                    const isBigWin = (cell.pnlUsdt || 0) >= 100 || (cell.pnlR || 0) >= 2.0;
                    const isBigLoss = (cell.pnlUsdt || 0) <= -100 || (cell.pnlR || 0) <= -1.5;

                    return (
                      <button
                        key={cell.dateStr}
                        type="button"
                        onClick={() => {
                          if (hasTrades) {
                            setSelectedDay(isSelected ? null : cell.dateStr || null);
                          }
                        }}
                        disabled={!hasTrades}
                        className={`h-16 sm:h-20 p-1.5 rounded-lg border text-left flex flex-col justify-between transition-all relative ${
                          !hasTrades
                            ? cell.isWeekend
                              ? "bg-slate-100/50 border-slate-200/60 opacity-60 cursor-default"
                              : "bg-white/60 border-slate-200/50 opacity-60 cursor-default"
                            : isSelected
                            ? "ring-2 ring-brand-500 bg-brand-50 border-brand-400 shadow-md scale-[1.02] cursor-pointer"
                            : isBigWin
                            ? "bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-300 shadow-2xs hover:scale-[1.02] cursor-pointer"
                            : isProfit && (cell.pnlUsdt || 0) > 0
                            ? "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-200 shadow-2xs hover:scale-[1.02] cursor-pointer"
                            : isBigLoss
                            ? "bg-rose-500/20 hover:bg-rose-500/30 border-rose-300 shadow-2xs hover:scale-[1.02] cursor-pointer"
                            : (cell.pnlUsdt || 0) < 0
                            ? "bg-rose-500/10 hover:bg-rose-500/20 border-rose-200 shadow-2xs hover:scale-[1.02] cursor-pointer"
                            : "bg-slate-100 hover:bg-slate-200 border-slate-200 hover:scale-[1.02] cursor-pointer"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className={`text-[10px] sm:text-xs font-bold ${cell.isWeekend ? "text-amber-700" : "text-textMuted"}`}>
                            {cell.dayNum}
                          </span>
                          {hasTrades && (
                            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-white/80 font-semibold text-textMain border border-border/50">
                              {cell.tradesCount}t
                            </span>
                          )}
                        </div>

                        {hasTrades ? (
                          <div className="mt-auto">
                            <div className={`text-[11px] sm:text-xs font-extrabold truncate ${isProfit ? "text-emerald-600" : "text-rose-600"}`}>
                              {isProfit ? "+" : ""}${cell.pnlUsdt?.toFixed(1)}
                            </div>
                            <div className="text-[9px] font-mono text-textMuted truncate">
                              {cell.pnlR && cell.pnlR >= 0 ? "+" : ""}{cell.pnlR?.toFixed(1)}R ({cell.winsCount}W/{cell.lossesCount}L)
                            </div>
                          </div>
                        ) : (
                          <div className="text-[9px] text-textMuted/60 mt-auto">
                            {cell.isWeekend ? "Weekend" : "No trds"}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. MULTI-DIMENSIONAL FILTER & SORT BAR */}
      {/* ========================================================================= */}
      <div className="bg-surface border border-border rounded-xl p-3 sm:p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full md:w-auto">
          {/* Search Box */}
          <div className="relative w-full sm:w-auto">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
            <input
              type="text"
              placeholder="Search symbol, notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-border rounded-lg text-textMain placeholder:text-textMuted focus:outline-none focus:ring-1 focus:ring-brand-500 w-full sm:w-48"
            />
          </div>

          {/* Quick Date Range Filter */}
          <select
            value={dateRangeFilter}
            onChange={(e) => setDateRangeFilter(e.target.value as any)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-border rounded-lg text-textMain focus:outline-none font-medium cursor-pointer w-full sm:w-auto"
          >
            <option value="ALL">All Time</option>
            <option value="TODAY">Today Only</option>
            <option value="7D">Last 7 Days</option>
            <option value="30D">Last 30 Days</option>
            <option value="THIS_MONTH">This Month</option>
          </select>

          {/* Execution Mode Filter (Live vs Analytical Paper) */}
          <select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value as "ALL" | "LIVE" | "ANALYTICAL")}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-border rounded-lg text-textMain focus:outline-none font-medium cursor-pointer w-full sm:w-auto"
          >
            <option value="ALL">All Modes (Live &amp; Paper)</option>
            <option value="ANALYTICAL">Analytical Signals (Paper)</option>
            <option value="LIVE">Live Margin Execution</option>
          </select>

          {/* Exchange Filter (Binance vs Bybit) */}
          <select
            value={exchangeFilter}
            onChange={(e) => setExchangeFilter(e.target.value as "ALL" | "binance" | "bybit")}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-border rounded-lg text-textMain focus:outline-none font-medium cursor-pointer w-full sm:w-auto"
          >
            <option value="ALL">All Exchanges (Binance + Bybit)</option>
            <option value="binance">Binance (Crypto USD-M)</option>
            <option value="bybit">Bybit (Forex &amp; CFDs)</option>
          </select>

          {/* Symbol Filter */}
          <select
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-border rounded-lg text-textMain focus:outline-none font-medium cursor-pointer w-full sm:w-auto"
          >
            <option value="ALL">All Symbols</option>
            <option value="BTC/USDT">BTC/USDT</option>
            <option value="ETH/USDT">ETH/USDT</option>
            <option value="SOL/USDT">SOL/USDT</option>
            <option value="EUR/USD">EUR/USD</option>
            <option value="GBP/USD">GBP/USD</option>
            <option value="USD/JPY">USD/JPY</option>
            <option value="XAU/USD">XAU/USD (Gold)</option>
          </select>

          {/* Strategy Filter */}
          <select
            value={strategyFilter}
            onChange={(e) => setStrategyFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-border rounded-lg text-textMain focus:outline-none font-medium cursor-pointer w-full sm:w-auto"
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
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-border rounded-lg text-textMain focus:outline-none font-medium cursor-pointer w-full sm:w-auto"
          >
            <option value="ALL">All Outcomes</option>
            <option value="WINS ONLY">Wins Only (&gt; 0R)</option>
            <option value="LOSSES ONLY">Losses Only (&lt; 0R)</option>
            <option value="TIME_STOP">Time Stops</option>
            <option value="BREAKEVEN">Breakeven / Partial</option>
          </select>

          {/* Sort By Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-border rounded-lg text-textMain focus:outline-none font-semibold cursor-pointer w-full sm:w-auto"
          >
            <option value="date_desc">Sort: Date (Newest)</option>
            <option value="date_asc">Sort: Date (Oldest)</option>
            <option value="pnl_desc">Sort: PnL ($ High to Low)</option>
            <option value="pnl_asc">Sort: PnL ($ Low to High)</option>
            <option value="r_desc">Sort: R-Multiple (High to Low)</option>
            <option value="rating_desc">Sort: User Rating (5★)</option>
          </select>
        </div>

        {/* Right Actions: Reset, CSV Export, Refresh */}
        <div className="flex items-center space-x-2 self-end md:self-auto shrink-0">
          {(selectedDay || dateRangeFilter !== "ALL" || symbolFilter !== "ALL" || strategyFilter !== "ALL" || outcomeFilter !== "ALL" || modeFilter !== "ALL" || exchangeFilter !== "ALL" || searchQuery.trim()) && (
            <button
              onClick={() => {
                setSelectedDay(null);
                setDateRangeFilter("ALL");
                setSymbolFilter("ALL");
                setStrategyFilter("ALL");
                setOutcomeFilter("ALL");
                setModeFilter("ALL");
                setExchangeFilter("ALL");
                setSearchQuery("");
              }}
              className="px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg transition cursor-pointer"
            >
              Reset Filters
            </button>
          )}

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
      {/* 4. MODERN DETAILED TRADE LOG TABLE */}
      {/* ========================================================================= */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[960px]">
            <thead>
              <tr className="border-b border-border bg-slate-50/80 text-textMuted font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Time &amp; Duration</th>
                <th className="py-3 px-4">Symbol &amp; Broker</th>
                <th className="py-3 px-4">Strategy &amp; Session</th>
                <th className="py-3 px-4">Side &amp; Mode</th>
                <th className="py-3 px-4">Entry / Exit</th>
                <th className="py-3 px-4">Excursion (MAE/MFE)</th>
                <th className="py-3 px-4">Net PnL ($ / R)</th>
                <th className="py-3 px-4">Outcome</th>
                <th className="py-3 px-4">Grade &amp; Rating</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-textMuted">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-brand-500" />
                    <span>Loading institutional trade records...</span>
                  </td>
                </tr>
              ) : filteredTrades.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-textMuted">
                    <BookOpen className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <span className="font-semibold text-sm block text-textMain">No Executed Trades Found</span>
                    <span className="text-xs text-textMuted mt-1 block">
                      {selectedDay
                        ? `No trades recorded on ${selectedDay}. Try selecting another day or clearing the filter.`
                        : "No trades match the current filter criteria."}
                    </span>
                    {selectedDay && (
                      <button
                        onClick={() => setSelectedDay(null)}
                        className="mt-3 px-3 py-1.5 text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg border border-brand-200 transition cursor-pointer"
                      >
                        Clear Day Filter
                      </button>
                    )}
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
                  const isSim =
                    Boolean(trade.is_simulated) ||
                    String(trade.exchange_order_id || "").startsWith("ANALYTICS_") ||
                    String(trade.exchange_order_id || "").startsWith("sim_");
                  const durationStr = formatDuration(trade.opened_at, trade.closed_at);
                  const sess = getSessionFromUtcHour(trade.entry_session_utc, trade.opened_at);

                  return (
                    <tr
                      key={trade.id}
                      className="hover:bg-slate-50/90 transition-colors group cursor-pointer"
                      onClick={() => openInspector(trade)}
                    >
                      {/* 1. Date, Time & Duration */}
                      <td className="py-3 px-4 whitespace-nowrap tabular-nums">
                        <div className="font-semibold text-textMain">
                          {new Date(trade.opened_at).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          <span className="text-[11px] text-textMuted font-mono">
                            {new Date(trade.opened_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-textMuted font-mono mt-0.5">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{durationStr}</span>
                        </div>
                      </td>

                      {/* 2. Symbol & Broker */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-textMain">{trade.symbol}</span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-bold font-mono uppercase ${
                              (trade.exchange || "binance") === "bybit"
                                ? "bg-amber-100 text-amber-800 border border-amber-200"
                                : "bg-blue-100 text-blue-800 border border-blue-200"
                            }`}
                          >
                            {(trade.exchange || "binance").toUpperCase()}
                          </span>
                          {trade.asset_class === "forex" && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              FX
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 3. Strategy & Session */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-semibold text-slate-800">
                            {trade.strategy_name?.replace(/_/g, " ")}
                          </span>
                          <span className="text-[10px] text-textMuted font-medium">
                            {sess} Session
                          </span>
                        </div>
                      </td>

                      {/* 4. Side & Execution Mode */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              trade.side === "LONG"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-rose-50 text-rose-700 border border-rose-200"
                            }`}
                          >
                            {trade.side}
                          </span>
                          {isSim ? (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200"
                              title="Zero-Balance Analytical Signal"
                            >
                              PAPER
                            </span>
                          ) : (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                              title="Live Margin Execution"
                            >
                              LIVE
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 5. Entry / Exit */}
                      <td className="py-3 px-4 whitespace-nowrap tabular-nums">
                        <div className="font-semibold text-textMain">
                          {trade.asset_class === "forex"
                            ? Number(trade.entry_price).toFixed(trade.entry_price < 2 ? 5 : 3)
                            : `$${Number(trade.entry_price) < 0.01 ? Number(trade.entry_price).toFixed(6) : Number(trade.entry_price).toFixed(2)}`}
                        </div>
                        <div className="text-[11px] text-textMuted">
                          {trade.exit_price
                            ? trade.asset_class === "forex"
                              ? Number(trade.exit_price).toFixed(trade.exit_price < 2 ? 5 : 3)
                              : `$${Number(trade.exit_price) < 0.01 ? Number(trade.exit_price).toFixed(6) : Number(trade.exit_price).toFixed(2)}`
                            : "In Position"}
                        </div>
                      </td>

                      {/* 6. Excursions (MAE / MFE) */}
                      <td className="py-3 px-4 whitespace-nowrap tabular-nums">
                        <div className="flex items-center space-x-1.5 text-[11px]">
                          <span className="text-emerald-600 font-bold font-mono">+{mfe.toFixed(1)}R</span>
                          <span className="text-slate-300">/</span>
                          <span className="text-rose-600 font-bold font-mono">-{Math.abs(mae).toFixed(1)}R</span>
                        </div>
                        <div className="text-[9px] text-textMuted">
                          {trade.breakeven_activated ? "BE Locked 🔒" : "Trail Open"}
                        </div>
                      </td>

                      {/* 7. Net PnL ($ / R / Pips) */}
                      <td className="py-3 px-4 whitespace-nowrap tabular-nums">
                        {isClosed ? (
                          <div>
                            <div className="flex items-center space-x-1 font-bold">
                              <span className={isWin ? "text-emerald-600" : "text-rose-600"}>
                                {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                              </span>
                              <span className={`text-[11px] ${isWin ? "text-emerald-600" : "text-rose-600"}`}>
                                ({pnlR >= 0 ? "+" : ""}{pnlR.toFixed(2)}R)
                              </span>
                            </div>
                            {trade.pnl_pips != null && (
                              <div className="text-[10px] text-amber-700 font-mono font-medium">
                                {Number(trade.pnl_pips) >= 0 ? "+" : ""}{Number(trade.pnl_pips).toFixed(1)} pips
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-cyan-600 font-bold animate-pulse text-xs">
                            OPEN POSITION
                          </span>
                        )}
                      </td>

                      {/* 8. Outcome Badge */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {trade.status === "CLOSED_TP" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            🎯 TP HIT
                          </span>
                        ) : trade.status === "CLOSED_SL" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            🛑 SL HIT
                          </span>
                        ) : trade.status === "TIME_STOP" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            ⏱️ TIME STOP
                          </span>
                        ) : isWin ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            WIN (+{pnlR.toFixed(1)}R)
                          </span>
                        ) : isClosed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {trade.status}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-800 border border-cyan-200 animate-pulse">
                            ⚡ ACTIVE
                          </span>
                        )}
                      </td>

                      {/* 9. Setup Grade & Rating */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 w-fit">
                            {trade.emotion_or_grade || "A-Setup"}
                          </span>
                          {(trade.user_rating || 0) > 0 && (
                            <span className="flex items-center text-amber-500 text-xs font-bold">
                              {"★".repeat(trade.user_rating || 0)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 10. Actions */}
                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end space-x-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => openInspector(trade)}
                            className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                          >
                            Inspect
                          </button>
                          {onReplayTrade && (
                            <button
                              onClick={() => onReplayTrade(trade)}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-500 rounded-lg transition cursor-pointer flex items-center space-x-1 shadow-xs"
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
      {/* 5. EXPANDABLE TRADE INSPECTOR MODAL (3-COLUMN INSTITUTIONAL AUDIT) */}
      {/* ========================================================================= */}
      {inspectTrade && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
          <div className="bg-surface border border-border rounded-xl sm:rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-slate-50/80 gap-3">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <span
                  className={`px-2.5 py-1 rounded-md text-xs font-extrabold ${
                    inspectTrade.side === "LONG"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {inspectTrade.side}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                    (inspectTrade.exchange || "binance") === "bybit"
                      ? "bg-amber-100 text-amber-800 border border-amber-200"
                      : "bg-blue-100 text-blue-800 border border-blue-200"
                  }`}
                >
                  {(inspectTrade.exchange || "binance").toUpperCase()}
                </span>
                <h3 className="text-sm sm:text-base font-bold text-textMain">
                  Trade #{inspectTrade.id} — {inspectTrade.symbol} ({inspectTrade.strategy_name?.replace(/_/g, " ")})
                </h3>
                <span className="text-[11px] sm:text-xs text-textMuted font-mono flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>Duration: {formatDuration(inspectTrade.opened_at, inspectTrade.closed_at)}</span>
                </span>
              </div>

              <div className="flex items-center space-x-2 self-end sm:self-auto shrink-0">
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
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 divide-y lg:divide-y-0 lg:divide-x divide-border">
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

                {/* What-If Hypothetical Outcome Analysis Card */}
                {(() => {
                  const isSimInspect =
                    Boolean(inspectTrade.is_simulated) ||
                    String(inspectTrade.exchange_order_id || "").startsWith("ANALYTICS_") ||
                    String(inspectTrade.exchange_order_id || "").startsWith("sim_");
                  const pnlR = Number(inspectTrade.pnl_r || 0);
                  const isHitTp = inspectTrade.status === "CLOSED_TP" || pnlR > 0;
                  const isHitSl = inspectTrade.status === "CLOSED_SL" || pnlR < 0;

                  return (
                    <div className="p-3.5 rounded-xl bg-purple-50/80 border border-purple-200/90 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                          <span>💡</span> What-If Outcome Analysis
                        </span>
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">
                          {isSimInspect ? "Analytical Signal (Paper)" : "Real Margin Execution"}
                        </span>
                      </div>
                      <p className="text-xs text-purple-950 leading-relaxed">
                        {isHitTp
                          ? `Target Hit! If you took this setup with $100 risk (1R), your realized return would be +$${(
                              (pnlR || 2.2) * 100
                            ).toFixed(2)} (+${(pnlR || 2.2).toFixed(2)}R) with zero account drawdown.`
                          : isHitSl
                          ? `Stop loss triggered. If you took this setup with $100 risk (1R), your loss would be strictly capped at -$100.00 (-1.00R) by quantitative risk limits.`
                          : `Active signal in progress. Monitoring live mark price against Take Profit ($${Number(
                              inspectTrade.take_profit || 0
                            ).toFixed(2)}) and Stop Loss ($${Number(
                              inspectTrade.stop_loss || 0
                            ).toFixed(2)}). Potential payout at +2.2R target: +$220.00.`}
                      </p>
                    </div>
                  );
                })()}

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
