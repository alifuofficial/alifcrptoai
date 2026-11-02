"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Cpu,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Sliders,
  AlertTriangle,
  Play,
  Pause,
  RefreshCw,
  LogOut,
  Layers,
  FileText,
  Brain,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Flame,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  LayoutDashboard,
  BarChart3,
  Search,
  ExternalLink,
  ChevronRight,
  Menu,
  X,
  User,
  Newspaper,
  Globe,
  Calendar,
  Filter,
} from "lucide-react";

// --- TYPES ---
interface BotConfig {
  id: number;
  is_active: boolean;
  sandbox_mode: boolean;
  auto_apply_lessons: boolean;
  symbols: string[];
  active_strategies: string[];
  timeframe: string;
  risk_pct: number;
  min_score: number;
  min_rvol: number;
  enable_breakeven_partial: boolean;
  max_directional_exposure_pct: number;
  max_hold_bars: number;
  use_limit_maker_entry: boolean;
  max_funding_rate_pct: number;
  telegram_notifications: boolean;
  blocked_utc_hours: number[];
  quarantined_symbols: string[];
  deepseek_model: string;
  binance_api_key_override?: string | null;
  binance_secret_override?: string | null;
  deepseek_key_override?: string | null;
  telegram_token_override?: string | null;
  telegram_chat_id_override?: string | null;
  panic_close_all: boolean;
  updated_at: string;
}

interface AccountSnapshot {
  id: number;
  equity_usdt: number;
  free_usdt: number;
  daily_pnl_usdt: number;
  daily_pnl_pct: number;
  open_positions: any[];
  created_at: string;
}

interface StrategyPerformance {
  strategy_name: string;
  closed_trades: number;
  open_trades: number;
  wins: number;
  losses: number;
  win_rate_pct: number;
  net_pnl_usdt: number;
  avg_r_multiple: number;
  profit_factor: number;
}

interface TradeExecution {
  id: number;
  exchange_order_id: string;
  sl_order_id: string;
  tp_order_id: string;
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
  entry_rvol: number;
  entry_scores?: any;
  opened_at: string;
  closed_at?: string | null;
}

interface AiAuditLog {
  id: number;
  symbol: string;
  strategy_name: string;
  proposed_direction: string;
  total_score: number;
  veto_triggered: boolean;
  veto_reason?: string | null;
  rubric_breakdown: any;
  market_snapshot: any;
  news_context: any;
  created_at: string;
}

interface BotLesson {
  id: number;
  symbol: string;
  strategy_name: string;
  weakness_detected: string;
  prompt_guardrail_rule: string;
  suggested_param_key: string;
  suggested_param_value: any;
  win_rate_impact: string;
  status: "PENDING" | "ACTIVE" | "DISMISSED";
  created_at: string;
}

interface TradeAutopsy {
  id: number;
  trade_id: number;
  symbol: string;
  strategy_name: string;
  outcome: string;
  failure_category: string;
  root_cause_analysis: string;
  recommended_rule_adjustment: string;
  created_at: string;
}

interface MarketNewsItem {
  id: number | string;
  title: string;
  source: string;
  url: string;
  coin?: string;
  category?: "crypto" | "macro" | string;
  sentiment?: "BULLISH" | "BEARISH" | "NEUTRAL" | string;
  impact?: "HIGH" | "MEDIUM" | "LOW" | string;
  published_at?: string;
  created_at?: string;
}

const ALL_STRATEGIES = [
  "SMC_Liquidity_Sweep",
  "EMA_Trend_Pullback",
  "BB_Volatility_Breakout",
  "RSI_Divergence_Reversal",
];

type NavSection = "overview" | "positions" | "strategies" | "news" | "audits" | "autopsies" | "settings";

export default function CommandCenterPage() {
  const router = useRouter();

  // Authentication State
  const [sessionChecked, setSessionChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Core Data States
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [latestSnapshot, setLatestSnapshot] = useState<AccountSnapshot | null>(null);
  const [snapshotsHistory, setSnapshotsHistory] = useState<AccountSnapshot[]>([]);
  const [perfView, setPerfView] = useState<StrategyPerformance[]>([]);
  const [openTrades, setOpenTrades] = useState<TradeExecution[]>([]);
  const [recentAudits, setRecentAudits] = useState<AiAuditLog[]>([]);
  const [lessons, setLessons] = useState<BotLesson[]>([]);
  const [autopsies, setAutopsies] = useState<TradeAutopsy[]>([]);

  // UI States
  const [activeSection, setActiveSection] = useState<NavSection>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chartTimeframe, setChartTimeframe] = useState<"24H" | "7D" | "30D" | "ALL">("7D");
  const [showPanicModal, setShowPanicModal] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  // News States
  const [newsItems, setNewsItems] = useState<MarketNewsItem[]>([]);
  const [selectedNewsCategory, setSelectedNewsCategory] = useState<string>("ALL");
  const [newsSearchQuery, setNewsSearchQuery] = useState<string>("");
  const [isSyncingNews, setIsSyncingNews] = useState<boolean>(false);

  // Settings Form State
  const [formSettings, setFormSettings] = useState<Partial<BotConfig>>({});
  const [showSecretKeys, setShowSecretKeys] = useState<{ [key: string]: boolean }>({});

  // 1. Check Authentication
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push("/login");
      } else {
        setUserEmail(session.user?.email || "Operator");
        setSessionChecked(true);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.push("/login");
      } else {
        setUserEmail(session.user?.email || "Operator");
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  // 2. Fetch Data & Subscriptions
  const fetchAllData = async () => {
    try {
      // Config
      const { data: cfgData } = await supabase.from("bot_config").select("*").eq("id", 1).maybeSingle();
      if (cfgData) {
        setConfig(cfgData);
        setFormSettings(cfgData);
      }

      // Latest Snapshot
      const { data: snapData } = await supabase
        .from("account_snapshots")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (snapData) setLatestSnapshot(snapData);

      // Snapshot History (for chart)
      const { data: histData } = await supabase
        .from("account_snapshots")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(50);
      if (histData) setSnapshotsHistory(histData);

      // Strategy Performance
      const { data: perfData } = await supabase.from("strategy_performance_view").select("*");
      if (perfData) setPerfView(perfData);

      // Open Trades
      const { data: tradeData } = await supabase
        .from("trade_executions")
        .select("*")
        .eq("status", "OPEN")
        .order("opened_at", { ascending: false });
      if (tradeData) setOpenTrades(tradeData);

      // Recent AI Audits
      const { data: auditData } = await supabase
        .from("ai_audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (auditData) setRecentAudits(auditData);

      // Lessons
      const { data: lessonData } = await supabase
        .from("bot_lessons")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (lessonData) setLessons(lessonData);

      // Autopsies
      const { data: autopsyData } = await supabase
        .from("trade_autopsies")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (autopsyData) setAutopsies(autopsyData);

      // Market & Macro News from Database
      try {
        const { data: newsData, error: newsErr } = await supabase
          .from("market_news")
          .select("*")
          .order("published_at", { ascending: false })
          .limit(50);
        if (!newsErr && newsData && newsData.length > 0) {
          setNewsItems(newsData);
        } else {
          // If table empty, fetch and sync
          fetchNewsFromApi(false);
        }
      } catch {
        fetchNewsFromApi(false);
      }
    } catch (err) {
      console.error("Data fetch error:", err);
    }
  };

  const fetchNewsFromApi = async (forceRefresh = false) => {
    try {
      setIsSyncingNews(true);
      const res = await fetch(`/api/news?refresh=${forceRefresh}&limit=50`);
      if (res.ok) {
        const json = await res.json();
        if (json.data && json.data.length > 0) {
          setNewsItems(json.data);
          if (forceRefresh) showToast("Synchronized fresh news & macro events to database");
        }
      }
    } catch (err) {
      console.warn("News sync notice:", err);
    } finally {
      setIsSyncingNews(false);
    }
  };

  const fetchMarketNewsOnly = async () => {
    try {
      const { data: newsData, error } = await supabase
        .from("market_news")
        .select("*")
        .order("published_at", { ascending: false })
        .limit(50);
      if (!error && newsData && newsData.length > 0) {
        setNewsItems(newsData);
      }
    } catch (err) {
      console.warn("Market news fetch notice:", err);
    }
  };

  useEffect(() => {
    fetchAllData();

    // Supabase Realtime Channels
    const channel = supabase
      .channel("command-center-realtime-v2")
      .on("postgres_changes", { event: "*", schema: "public", table: "bot_config" }, (payload) => {
        if (payload.new) {
          setConfig(payload.new as BotConfig);
          setFormSettings(payload.new as BotConfig);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "account_snapshots" }, (payload) => {
        if (payload.new) {
          setLatestSnapshot(payload.new as AccountSnapshot);
          setSnapshotsHistory((prev) => [...prev, payload.new as AccountSnapshot].slice(-50));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "trade_executions" }, () => {
        fetchAllData();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ai_audit_logs" }, (payload) => {
        if (payload.new) setRecentAudits((prev) => [payload.new as AiAuditLog, ...prev.slice(0, 19)]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "bot_lessons" }, () => {
        supabase
          .from("bot_lessons")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20)
          .then(({ data }) => data && setLessons(data));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "market_news" }, () => {
        fetchMarketNewsOnly();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const showToast = (msg: string) => {
    setStatusNotification(msg);
    setTimeout(() => setStatusNotification(null), 3500);
  };

  // Actions
  const toggleBotActive = async () => {
    if (!config) return;
    const newState = !config.is_active;
    setConfig({ ...config, is_active: newState });
    const { error } = await supabase.from("bot_config").update({ is_active: newState }).eq("id", 1);
    if (!error) {
      showToast(`Trading Engine ${newState ? "RUNNING" : "PAUSED"}`);
    }
  };

  const toggleSandboxMode = async () => {
    if (!config) return;
    const newSandbox = !config.sandbox_mode;
    setConfig({ ...config, sandbox_mode: newSandbox });
    const { error } = await supabase.from("bot_config").update({ sandbox_mode: newSandbox }).eq("id", 1);
    if (!error) {
      showToast(`Switched mode to ${newSandbox ? "TESTNET / SANDBOX" : "LIVE BINANCE USDM"}`);
    }
  };

  const triggerPanicCloseAll = async () => {
    setShowPanicModal(false);
    const { error } = await supabase.from("bot_config").update({ panic_close_all: true, is_active: false }).eq("id", 1);
    if (!error) {
      showToast("EMERGENCY FLATTEN DISPATCHED: Cancelling all orders & closing positions!");
    }
  };

  const toggleStrategyActive = async (stratName: string) => {
    if (!config) return;
    const current = config.active_strategies || [];
    const updated = current.includes(stratName)
      ? current.filter((s) => s !== stratName)
      : [...current, stratName];

    setConfig({ ...config, active_strategies: updated });
    await supabase.from("bot_config").update({ active_strategies: updated }).eq("id", 1);
    showToast(`Strategy '${stratName}' ${updated.includes(stratName) ? "Enabled" : "Paused"}`);
  };

  const handleLessonAction = async (lessonId: number, status: "ACTIVE" | "DISMISSED") => {
    const { error } = await supabase.from("bot_lessons").update({ status }).eq("id", lessonId);
    if (!error) {
      setLessons((prev) => prev.map((l) => (l.id === lessonId ? { ...l, status } : l)));
      showToast(`Lesson #${lessonId} marked as ${status}`);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);
    try {
      const updates = {
        risk_pct: Number(formSettings.risk_pct),
        min_score: Number(formSettings.min_score),
        min_rvol: Number(formSettings.min_rvol),
        max_directional_exposure_pct: Number(formSettings.max_directional_exposure_pct),
        max_hold_bars: Number(formSettings.max_hold_bars),
        max_funding_rate_pct: Number(formSettings.max_funding_rate_pct),
        enable_breakeven_partial: Boolean(formSettings.enable_breakeven_partial),
        use_limit_maker_entry: Boolean(formSettings.use_limit_maker_entry),
        telegram_notifications: Boolean(formSettings.telegram_notifications),
        auto_apply_lessons: Boolean(formSettings.auto_apply_lessons),
        deepseek_model: formSettings.deepseek_model || "deepseek-chat",
        symbols: formSettings.symbols || ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
        binance_api_key_override: formSettings.binance_api_key_override || null,
        binance_secret_override: formSettings.binance_secret_override || null,
        deepseek_key_override: formSettings.deepseek_key_override || null,
        telegram_token_override: formSettings.telegram_token_override || null,
        telegram_chat_id_override: formSettings.telegram_chat_id_override || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("bot_config").update(updates).eq("id", 1);
      if (!error) {
        showToast("Quantitative parameters updated successfully!");
        if (config) setConfig({ ...config, ...updates });
      } else {
        showToast(`Save error: ${error.message}`);
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Metrics
  const calculatedExposure = useMemo(() => {
    const unhedged = openTrades.filter((t) => !t.breakeven_activated);
    const exposurePct = unhedged.length * (config?.risk_pct || 0.01) * 100;
    const maxPct = (config?.max_directional_exposure_pct || 0.015) * 100;
    return { current: exposurePct.toFixed(2), max: maxPct.toFixed(1) };
  }, [openTrades, config]);

  const overallStats = useMemo(() => {
    let totalClosed = 0;
    let totalWins = 0;
    let totalNetPnl = 0;
    perfView.forEach((p) => {
      totalClosed += Number(p.closed_trades || 0);
      totalWins += Number(p.wins || 0);
      totalNetPnl += Number(p.net_pnl_usdt || 0);
    });
    const winRate = totalClosed > 0 ? ((totalWins / totalClosed) * 100).toFixed(1) : "0.0";
    return { totalClosed, totalWins, totalNetPnl, winRate };
  }, [perfView]);

  const formatTimeAgo = (dateStr?: string) => {
    if (!dateStr) return "Just now";
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return "Recently";
    }
  };

  const filteredNews = useMemo(() => {
    return newsItems.filter((item) => {
      if (selectedNewsCategory !== "ALL") {
        if (selectedNewsCategory === "MACRO") {
          if (item.category !== "macro" && item.coin !== "USD") return false;
        } else {
          if (item.coin !== selectedNewsCategory) return false;
        }
      }

      if (newsSearchQuery.trim()) {
        const q = newsSearchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchSource = item.source.toLowerCase().includes(q);
        const matchCoin = (item.coin || "").toLowerCase().includes(q);
        if (!matchTitle && !matchSource && !matchCoin) return false;
      }

      return true;
    });
  }, [newsItems, selectedNewsCategory, newsSearchQuery]);

  // Synthetic equity curve for SVG Area Chart if snapshots are few
  const chartPoints = useMemo(() => {
    if (snapshotsHistory.length >= 2) {
      return snapshotsHistory.map((s, idx) => ({
        x: idx,
        y: Number(s.equity_usdt || 10000),
        pnl: Number(s.daily_pnl_usdt || 0),
        time: new Date(s.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }));
    }
    // Baseline points if starting fresh
    const base = Number(latestSnapshot?.equity_usdt || 10000);
    return [
      { x: 0, y: base * 0.998, pnl: -20, time: "09:00" },
      { x: 1, y: base * 0.999, pnl: -10, time: "11:00" },
      { x: 2, y: base * 1.001, pnl: 10, time: "13:00" },
      { x: 3, y: base * 1.0025, pnl: 25, time: "15:00" },
      { x: 4, y: base, pnl: Number(latestSnapshot?.daily_pnl_usdt || 0), time: "Current" },
    ];
  }, [snapshotsHistory, latestSnapshot]);

  // Chart SVG Coordinates generator
  const svgPathData = useMemo(() => {
    if (chartPoints.length < 2) return { path: "", fillPath: "", min: 0, max: 0 };
    const values = chartPoints.map((p) => p.y);
    const min = Math.min(...values) * 0.999;
    const max = Math.max(...values) * 1.001;
    const range = max - min || 1;
    const width = 600;
    const height = 180;

    const points = chartPoints.map((p, i) => {
      const px = (i / (chartPoints.length - 1)) * width;
      const py = height - ((p.y - min) / range) * (height - 20) - 10;
      return `${px},${py}`;
    });

    const path = `M ${points.join(" L ")}`;
    const fillPath = `M 0,${height} L ${points.join(" L ")} L ${width},${height} Z`;

    return { path, fillPath, min, max };
  }, [chartPoints]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex font-sans antialiased">
      {/* Toast Notification */}
      {statusNotification && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-3 text-sm font-semibold text-indigo-700 shadow-elevated animate-bounce">
          <Zap className="h-4 w-4 text-indigo-600" />
          <span>{statusNotification}</span>
        </div>
      )}

      {/* EMERGENCY PANIC MODAL */}
      {showPanicModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <AlertTriangle className="h-7 w-7 animate-pulse" />
              <h3 className="text-lg font-bold text-slate-900">Emergency Panic Flatten</h3>
            </div>
            <p className="text-xs text-slate-600 mb-6 leading-relaxed">
              This will <strong>IMMEDIATELY CANCEL ALL CONDITIONAL ORDERS</strong> on Binance and execute
              <strong> MARKET CLOSE</strong> on every active futures position, setting the bot state to <strong>PAUSED</strong>.
              Are you sure you want to proceed?
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowPanicModal(false)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Cancel / Stand Down
              </button>
              <button
                onClick={triggerPanicCloseAll}
                className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-rose-600/20 hover:bg-rose-700 transition-all cursor-pointer"
              >
                CONFIRM FLATTEN ALL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SIDEBAR NAVIGATION */}
      {/* ========================================================================= */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-200 bg-white transition-all duration-300 md:static ${
          sidebarOpen ? "w-64" : "w-20"
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 shadow-sm shadow-indigo-500/20 text-white font-bold">
              <Cpu className="h-5 w-5" />
            </div>
            {sidebarOpen && (
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm text-slate-900 tracking-tight">alifcrptoai</span>
                  <span className="rounded-md bg-indigo-50 px-1.5 py-0.2 text-[9px] font-bold text-indigo-600 border border-indigo-100 uppercase">
                    PRO
                  </span>
                </div>
                <span className="text-[10px] text-slate-600 font-medium truncate">By Alifu Haji</span>
              </div>
            )}
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden md:flex rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-colors"
            title="Toggle Sidebar"
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Groups */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {/* Group 1: TRADING DESK */}
          <div>
            {sidebarOpen && (
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-2">Trading Desk</p>
            )}
            <nav className="space-y-1">
              <button
                onClick={() => setActiveSection("overview")}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                  activeSection === "overview"
                    ? "bg-indigo-50 text-indigo-700 shadow-xs border border-indigo-100"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <LayoutDashboard className="h-4 w-4 shrink-0 text-indigo-500" />
                {sidebarOpen && <span>Overview &amp; KPIs</span>}
              </button>

              <button
                onClick={() => setActiveSection("positions")}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                  activeSection === "positions"
                    ? "bg-indigo-50 text-indigo-700 shadow-xs border border-indigo-100"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Layers className="h-4 w-4 shrink-0 text-cyan-600" />
                  {sidebarOpen && <span>Live Positions</span>}
                </div>
                {sidebarOpen && openTrades.length > 0 && (
                  <span className="rounded-full bg-cyan-100 border border-cyan-200 px-2 py-0.5 text-[10px] font-bold text-cyan-800">
                    {openTrades.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveSection("strategies")}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                  activeSection === "strategies"
                    ? "bg-indigo-50 text-indigo-700 shadow-xs border border-indigo-100"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <TrendingUp className="h-4 w-4 shrink-0 text-emerald-600" />
                {sidebarOpen && <span>Strategy Analytics</span>}
              </button>
            </nav>
          </div>

          {/* Group 2: MARKET INTELLIGENCE */}
          <div>
            {sidebarOpen && (
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-2">Market Intelligence</p>
            )}
            <nav className="space-y-1">
              <button
                onClick={() => setActiveSection("news")}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                  activeSection === "news"
                    ? "bg-indigo-50 text-indigo-700 shadow-xs border border-indigo-100"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Newspaper className="h-4 w-4 shrink-0 text-blue-600" />
                  {sidebarOpen && <span>Market &amp; Macro News</span>}
                </div>
                {sidebarOpen && newsItems.length > 0 && (
                  <span className="rounded-full bg-blue-100 border border-blue-200 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                    {newsItems.length}
                  </span>
                )}
              </button>
            </nav>
          </div>

          {/* Group 3: AI INTELLIGENCE & FORENSICS */}
          <div>
            {sidebarOpen && (
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-2">AI Intelligence</p>
            )}
            <nav className="space-y-1">
              <button
                onClick={() => setActiveSection("audits")}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                  activeSection === "audits"
                    ? "bg-indigo-50 text-indigo-700 shadow-xs border border-indigo-100"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Brain className="h-4 w-4 shrink-0 text-violet-600" />
                  {sidebarOpen && <span>DeepSeek Audits</span>}
                </div>
                {sidebarOpen && (
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Live Engine Feed" />
                )}
              </button>

              <button
                onClick={() => setActiveSection("autopsies")}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                  activeSection === "autopsies"
                    ? "bg-indigo-50 text-indigo-700 shadow-xs border border-indigo-100"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-amber-500" />
                  {sidebarOpen && <span>Self-Learning</span>}
                </div>
                {sidebarOpen && lessons.filter((l) => l.status === "PENDING").length > 0 && (
                  <span className="rounded-full bg-amber-100 border border-amber-200 px-1.5 py-0.2 text-[10px] font-bold text-amber-700">
                    {lessons.filter((l) => l.status === "PENDING").length}
                  </span>
                )}
              </button>
            </nav>
          </div>

          {/* Group 3: MANAGEMENT */}
          <div>
            {sidebarOpen && (
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-2">Management</p>
            )}
            <nav className="space-y-1">
              <button
                onClick={() => setActiveSection("settings")}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                  activeSection === "settings"
                    ? "bg-indigo-50 text-indigo-700 shadow-xs border border-indigo-100"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Sliders className="h-4 w-4 shrink-0 text-slate-500" />
                {sidebarOpen && <span>Risk &amp; Settings</span>}
              </button>
            </nav>
          </div>
        </div>

        {/* Sidebar Footer: User Card */}
        <div className="border-t border-slate-100 p-3">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold">
                AH
              </div>
              {sidebarOpen && (
                <div className="flex flex-col truncate">
                  <span className="text-xs font-bold text-slate-900 truncate">Alifu Haji</span>
                  <span className="text-[10px] text-slate-600 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Realtime Active
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              className="text-slate-400 hover:text-rose-600 transition-colors p-1"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* MAIN CONTENT AREA */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* TOP COMMAND HEADER BAR */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 md:px-8 backdrop-blur-md">
          {/* Breadcrumb & Section Name */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                <span>Desk</span>
                <ChevronRight className="h-3 w-3" />
                <span className="text-indigo-600 capitalize">{activeSection}</span>
              </div>
              <h1 className="text-base font-bold text-slate-900 capitalize">
                {activeSection === "overview" && "Executive Overview & Telemetry"}
                {activeSection === "positions" && "Live Open Positions & Orders"}
                {activeSection === "strategies" && "Strategy Leaderboard & Analytics"}
                {activeSection === "news" && "Market Catalysts & Macro Intelligence Feed"}
                {activeSection === "audits" && "DeepSeek AI Risk Rubric Stream"}
                {activeSection === "autopsies" && "Autonomous Self-Improvement & Autopsies"}
                {activeSection === "settings" && "Quantitative Risk & Bot Controls"}
              </h1>
            </div>
          </div>

          {/* Quick Command Pills */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Engine Toggle */}
            <button
              onClick={toggleBotActive}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all border ${
                config?.is_active
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-xs"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              {config?.is_active ? <Play className="h-3.5 w-3.5 fill-current" /> : <Pause className="h-3.5 w-3.5 fill-current" />}
              <span className="hidden sm:inline">{config?.is_active ? "RUNNING" : "PAUSED"}</span>
            </button>

            {/* Sandbox Mode */}
            <button
              onClick={toggleSandboxMode}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all border ${
                config?.sandbox_mode
                  ? "border-sky-200 bg-sky-50 text-sky-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              <Shield className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{config?.sandbox_mode ? "TESTNET" : "LIVE BINANCE"}</span>
            </button>

            {/* Macro Shield */}
            <div className="hidden lg:flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-slate-600">Macro Shield:</span>
              <span className="text-emerald-700 font-bold">NORMAL</span>
            </div>

            {/* Net Exposure */}
            <div className="hidden xl:flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
              <Layers className="h-3.5 w-3.5 text-indigo-600" />
              <span className="text-slate-600">Risk:</span>
              <span className="font-mono font-bold text-indigo-700">
                {calculatedExposure.current}% / {calculatedExposure.max}%
              </span>
            </div>

            {/* Panic Button */}
            <button
              onClick={() => setShowPanicModal(true)}
              className="flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-600 hover:text-white transition-all shadow-xs cursor-pointer"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
              <span>PANIC CLOSE</span>
            </button>
          </div>
        </header>

        {/* MAIN BODY PER SECTION */}
        <div className="p-4 md:p-8 space-y-6">
          {/* ========================================================================= */}
          {/* SECTION 1: EXECUTIVE OVERVIEW */}
          {/* ========================================================================= */}
          {activeSection === "overview" && (
            <div className="space-y-6">
              {/* 4 TOP TELEMETRY CARDS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1: Total USDT Equity */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card transition-all hover:shadow-elevated">
                  <div className="flex items-center justify-between text-slate-600 text-xs font-semibold uppercase tracking-wider mb-2">
                    <span>Total USDT Equity</span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                      <DollarSign className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-slate-900 tracking-tight">
                    ${Number(latestSnapshot?.equity_usdt || 10000.0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="mt-2.5 flex items-center text-xs font-semibold text-emerald-600">
                    <TrendingUp className="h-3.5 w-3.5 mr-1" />
                    <span>Binance USDT-M Futures Mark</span>
                  </div>
                </div>

                {/* Card 2: Free Margin */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card transition-all hover:shadow-elevated">
                  <div className="flex items-center justify-between text-slate-600 text-xs font-semibold uppercase tracking-wider mb-2">
                    <span>Available Free Margin</span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                      <Activity className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-sky-700 tracking-tight">
                    ${Number(latestSnapshot?.free_usdt || 10000.0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="mt-3 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-sky-500 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(
                          100,
                          ((Number(latestSnapshot?.free_usdt || 10000) / Number(latestSnapshot?.equity_usdt || 10000)) * 100)
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Card 3: Intraday Realized P&L */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card transition-all hover:shadow-elevated">
                  <div className="flex items-center justify-between text-slate-600 text-xs font-semibold uppercase tracking-wider mb-2">
                    <span>Today's Realized P&L</span>
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                        (latestSnapshot?.daily_pnl_usdt || 0) >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                      }`}
                    >
                      {(latestSnapshot?.daily_pnl_usdt || 0) >= 0 ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4" />
                      )}
                    </span>
                  </div>
                  <div
                    className={`text-2xl font-extrabold font-mono tracking-tight ${
                      (latestSnapshot?.daily_pnl_usdt || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {(latestSnapshot?.daily_pnl_usdt || 0) >= 0 ? "+" : ""}
                    ${Number(latestSnapshot?.daily_pnl_usdt || 0).toFixed(2)}
                    <span className="text-xs font-bold ml-1.5 text-slate-600">
                      ({(latestSnapshot?.daily_pnl_pct || 0) >= 0 ? "+" : ""}
                      {Number(latestSnapshot?.daily_pnl_pct || 0).toFixed(2)}%)
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-600">Closed trades since 00:00 UTC</div>
                </div>

                {/* Card 4: Overall Win Rate / Active Positions */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card transition-all hover:shadow-elevated">
                  <div className="flex items-center justify-between text-slate-600 text-xs font-semibold uppercase tracking-wider mb-2">
                    <span>Win Rate / Active</span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                      <Flame className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-slate-900 tracking-tight flex items-center justify-between">
                    <span>{overallStats.winRate}%</span>
                    <span className="text-xs font-bold rounded-lg bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-indigo-700">
                      {openTrades.length} Active
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-600">
                    {overallStats.totalWins} Wins / {overallStats.totalClosed - overallStats.totalWins} Losses across all strategies
                  </div>
                </div>
              </div>

              {/* INTERACTIVE PERFORMANCE CHART CARD */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Portfolio Performance &amp; Equity Growth</h2>
                    <p className="text-xs text-slate-600">
                      Continuous capital valuation synchronized from Binance Futures account snapshots
                    </p>
                  </div>

                  <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                    {(["24H", "7D", "30D", "ALL"] as const).map((tf) => (
                      <button
                        key={tf}
                        onClick={() => setChartTimeframe(tf)}
                        className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                          chartTimeframe === tf
                            ? "bg-white text-indigo-700 shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                </div>

                {/* SVG Area Chart */}
                <div className="relative w-full h-52">
                  <svg viewBox="0 0 600 180" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="equityGradLight" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.18" />
                        <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Gradient Fill Area */}
                    {svgPathData.fillPath && <path d={svgPathData.fillPath} fill="url(#equityGradLight)" />}

                    {/* Line Stroke */}
                    {svgPathData.path && (
                      <path d={svgPathData.path} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round" />
                    )}

                    {/* Interactive Points */}
                    {chartPoints.map((p, i) => {
                      const width = 600;
                      const height = 180;
                      const range = svgPathData.max - svgPathData.min || 1;
                      const px = (i / (chartPoints.length - 1)) * width;
                      const py = height - ((p.y - svgPathData.min) / range) * (height - 20) - 10;

                      return (
                        <g key={i} className="group cursor-pointer">
                          <circle
                            cx={px}
                            cy={py}
                            r="4"
                            className="fill-white stroke-indigo-600 stroke-2 group-hover:r-6 transition-all"
                          />
                        </g>
                      );
                    })}
                  </svg>

                  {/* Horizontal Guide lines */}
                  <div className="absolute inset-x-0 top-0 flex justify-between text-[10px] text-slate-600 font-mono border-b border-slate-100 pb-1">
                    <span>High: ${svgPathData.max.toFixed(2)}</span>
                    <span>Low: ${svgPathData.min.toFixed(2)}</span>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-slate-600 border-t border-slate-100 pt-3">
                  <span>Start: {chartPoints[0]?.time}</span>
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                      <span className="h-2 w-2 rounded-full bg-indigo-600" />
                      Cumulative Equity
                    </span>
                  </div>
                  <span>Latest: {chartPoints[chartPoints.length - 1]?.time}</span>
                </div>
              </div>

              {/* QUICK DUAL PANELS: LIVE POSITIONS & LATEST AUDITS */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Panel 1: Live Positions Quick View */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-cyan-600" />
                      <h3 className="font-bold text-sm text-slate-900">Active Positions ({openTrades.length})</h3>
                    </div>
                    <button
                      onClick={() => setActiveSection("positions")}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                    >
                      View All <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>

                  {openTrades.length === 0 ? (
                    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-6 text-center text-xs text-slate-600">
                      No active positions. Multi-strategy scanner is monitoring 15m candle streams.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {openTrades.slice(0, 3).map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                t.side === "LONG"
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                  : "bg-rose-100 text-rose-800 border border-rose-200"
                              }`}
                            >
                              {t.side}
                            </span>
                            <div>
                              <div className="font-bold text-slate-900">{t.symbol}</div>
                              <div className="text-[10px] text-slate-600">{t.strategy_name}</div>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="font-mono font-bold text-slate-800">${Number(t.entry_price).toFixed(2)}</div>
                            <div className="text-[10px] text-emerald-700 font-semibold font-mono">
                              MFE: +{Number(t.mfe_r || 0).toFixed(2)}R
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Panel 2: Latest DeepSeek AI Decisions */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4 text-violet-600" />
                      <h3 className="font-bold text-sm text-slate-900">Latest AI Risk Audits</h3>
                    </div>
                    <button
                      onClick={() => setActiveSection("audits")}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                    >
                      Audit Stream <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>

                  {recentAudits.length === 0 ? (
                    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-6 text-center text-xs text-slate-600">
                      Awaiting candidate setups to trigger Chief Quantitative Risk Officer audits.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {recentAudits.slice(0, 3).map((a) => {
                        const isVetoed = a.veto_triggered || a.total_score < (config?.min_score || 75);
                        return (
                          <div
                            key={a.id}
                            className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs"
                          >
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                  isVetoed
                                    ? "bg-rose-100 text-rose-800 border border-rose-200"
                                    : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                }`}
                              >
                                {isVetoed ? "VETOED" : "PASSED"}
                              </span>
                              <div>
                                <div className="font-bold text-slate-900">
                                  {a.symbol} ({a.proposed_direction})
                                </div>
                                <div className="text-[10px] text-slate-600 truncate max-w-[180px]">
                                  {a.strategy_name}
                                </div>
                              </div>
                            </div>

                            <div className="text-right">
                              <span className="font-mono font-extrabold text-sm text-slate-900">{a.total_score}</span>
                              <span className="text-[10px] text-slate-600">/100</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* PANEL 3: BREAKING NEWS & MACRO RADAR */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <Newspaper className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-900">
                        Market Catalysts &amp; Macro Radar
                      </h3>
                      <p className="text-xs text-slate-500">
                        Live headlines and high-impact economic calendar events synced to database
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fetchNewsFromApi(true)}
                      disabled={isSyncingNews}
                      className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
                      title="Sync Latest News"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isSyncingNews ? "animate-spin text-indigo-600" : ""}`} />
                      <span>{isSyncingNews ? "Syncing..." : "Sync News"}</span>
                    </button>

                    <button
                      onClick={() => setActiveSection("news")}
                      className="flex items-center gap-1 rounded-xl bg-indigo-50 border border-indigo-100 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer"
                    >
                      <span>Full News Desk</span>
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {newsItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
                    <Newspaper className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-600">No news articles in database yet.</p>
                    <button
                      onClick={() => fetchNewsFromApi(true)}
                      className="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 cursor-pointer"
                    >
                      Fetch &amp; Sync Now
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {newsItems.slice(0, 4).map((item, idx) => (
                      <a
                        key={item.id || idx}
                        href={item.url || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex flex-col justify-between rounded-xl border border-slate-100 bg-slate-50/60 p-4 transition-all hover:border-indigo-200 hover:bg-white hover:shadow-xs"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[10px] gap-2">
                            <span
                              className={`rounded-md px-1.5 py-0.5 font-bold uppercase tracking-wider ${
                                item.coin === "BTC"
                                  ? "bg-amber-100 text-amber-800 border border-amber-200"
                                  : item.coin === "ETH"
                                  ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
                                  : item.coin === "SOL"
                                  ? "bg-teal-100 text-teal-800 border border-teal-200"
                                  : "bg-rose-100 text-rose-800 border border-rose-200"
                              }`}
                            >
                              {item.coin || "CRYPTO"}
                            </span>

                            <span
                              className={`rounded-md px-1.5 py-0.5 font-bold ${
                                item.sentiment === "BULLISH"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : item.sentiment === "BEARISH"
                                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                                  : "bg-slate-100 text-slate-600 border border-slate-200"
                              }`}
                            >
                              {item.sentiment || "NEUTRAL"}
                            </span>
                          </div>

                          <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2">
                            {item.title}
                          </h4>
                        </div>

                        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100/80 pt-2">
                          <span className="font-medium text-slate-600">{item.source}</span>
                          <span className="flex items-center gap-1 font-mono text-[10px]">
                            <Clock className="h-3 w-3 text-slate-400" />
                            {formatTimeAgo(item.published_at)}
                          </span>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION 2: LIVE OPEN POSITIONS */}
          {/* ========================================================================= */}
          {activeSection === "positions" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Layers className="h-5 w-5 text-cyan-600" />
                    <span>Institutional Positions Ledger ({openTrades.length})</span>
                  </h2>
                  <p className="text-xs text-slate-600">
                    Active server-side conditional trades protected on Binance Futures with trailing telemetry
                  </p>
                </div>
                <button
                  onClick={fetchAllData}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Refresh Orders</span>
                </button>
              </div>

              {openTrades.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-card">
                  <Layers className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                  <h4 className="text-sm font-bold text-slate-800">No Open Positions</h4>
                  <p className="text-xs text-slate-600 mt-1">
                    The autonomous bot is actively scanning 15m candles for SMC sweeps and EMA pullbacks.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-card">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="border-b border-slate-100 bg-slate-50/70 text-slate-600 uppercase font-semibold tracking-wider font-sans">
                      <tr>
                        <th className="py-3.5 px-4">Symbol / Strategy</th>
                        <th className="py-3.5 px-4 text-center">Direction</th>
                        <th className="py-3.5 px-4 text-right">Entry Price</th>
                        <th className="py-3.5 px-4 text-right">Stop Loss</th>
                        <th className="py-3.5 px-4 text-right">Take Profit</th>
                        <th className="py-3.5 px-4 text-center">Live R / MFE</th>
                        <th className="py-3.5 px-4 text-center">Protection Status</th>
                        <th className="py-3.5 px-4 text-center">Hold Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {openTrades.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-sans font-bold text-slate-900">{t.symbol}</div>
                            <div className="text-[10px] text-indigo-600 font-sans">{t.strategy_name}</div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-sans font-extrabold ${
                                t.side === "LONG"
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                  : "bg-rose-100 text-rose-800 border border-rose-200"
                              }`}
                            >
                              {t.side}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right text-slate-900 font-bold">
                            ${Number(t.entry_price).toFixed(4)}
                          </td>
                          <td className="py-3.5 px-4 text-right text-rose-600 font-bold">
                            ${Number(t.stop_loss).toFixed(4)}
                          </td>
                          <td className="py-3.5 px-4 text-right text-emerald-600 font-bold">
                            ${Number(t.take_profit).toFixed(4)}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <div className="font-bold text-slate-900">MFE: +{Number(t.mfe_r || 0).toFixed(2)}R</div>
                            <div className="text-[10px] text-slate-600">MAE: {Number(t.mae_r || 0).toFixed(2)}R</div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {t.breakeven_activated ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-sans font-bold text-emerald-800">
                                <ShieldCheck className="h-3 w-3 text-emerald-600" />
                                RISK-FREE (+1R BE LOCKED)
                              </span>
                            ) : (
                              <span className="text-slate-600 text-[10px] font-sans">Open Risk Active</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center font-sans text-xs text-slate-600">
                            <div className="flex items-center justify-center gap-1">
                              <Clock className="h-3.5 w-3.5 text-slate-400" />
                              <span>Max {config?.max_hold_bars || 20} Bars</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION 3: STRATEGY PERFORMANCE LEADERBOARD */}
          {/* ========================================================================= */}
          {activeSection === "strategies" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-emerald-600" />
                    <span>Strategy Performance Leaderboard</span>
                  </h2>
                  <p className="text-xs text-slate-600">
                    Aggregated in real-time from PostgreSQL view <code>strategy_performance_view</code>
                  </p>
                </div>
                <button
                  onClick={fetchAllData}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Refresh View</span>
                </button>
              </div>

              {/* Comparative Visualizer Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {ALL_STRATEGIES.map((name) => {
                  const row = perfView.find((p) => p.strategy_name === name);
                  const isEnabled = config?.active_strategies?.includes(name);
                  const pf = Number(row?.profit_factor || 0);

                  return (
                    <div key={name} className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-card">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-slate-900 truncate">{name}</span>
                        <span
                          className={`h-2 w-2 rounded-full ${
                            isEnabled ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
                          }`}
                        />
                      </div>
                      <div className="text-xl font-extrabold font-mono text-slate-900">
                        {Number(row?.win_rate_pct || 0).toFixed(1)}%
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
                        <span>PF: {pf.toFixed(2)}</span>
                        <span>{row?.closed_trades || 0} Trades</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Leaderboard Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-card">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50/70 text-slate-600 uppercase font-semibold tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4">Strategy Plugin</th>
                      <th className="py-3.5 px-4 text-center">Status</th>
                      <th className="py-3.5 px-4 text-center">Closed (W / L)</th>
                      <th className="py-3.5 px-4 text-center">Win Rate</th>
                      <th className="py-3.5 px-4 text-center">Profit Factor</th>
                      <th className="py-3.5 px-4 text-center">Avg R-Multiple</th>
                      <th className="py-3.5 px-4 text-right">Net P&L (USDT)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {ALL_STRATEGIES.map((stratName) => {
                      const row = perfView.find((p) => p.strategy_name === stratName) || {
                        strategy_name: stratName,
                        closed_trades: 0,
                        open_trades: 0,
                        wins: 0,
                        losses: 0,
                        win_rate_pct: 0,
                        net_pnl_usdt: 0,
                        avg_r_multiple: 0,
                        profit_factor: 0,
                      };

                      const isEnabled = config?.active_strategies?.includes(stratName);
                      const pf = Number(row.profit_factor || 0);

                      let pfBadgeColor = "text-slate-600 bg-slate-100 border-slate-200";
                      if (pf >= 1.5) pfBadgeColor = "text-emerald-800 bg-emerald-50 border-emerald-200";
                      else if (pf >= 1.0) pfBadgeColor = "text-amber-800 bg-amber-50 border-amber-200";
                      else if (row.closed_trades > 0) pfBadgeColor = "text-rose-800 bg-rose-50 border-rose-200";

                      return (
                        <tr key={stratName} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-4 font-sans font-bold text-slate-900 flex items-center gap-2">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                isEnabled ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
                              }`}
                            />
                            <span>{stratName}</span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              onClick={() => toggleStrategyActive(stratName)}
                              className={`rounded-lg px-2.5 py-1 text-[11px] font-sans font-bold border transition-all ${
                                isEnabled
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                                  : "border-slate-200 bg-slate-100 text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              {isEnabled ? "ACTIVE" : "PAUSED"}
                            </button>
                          </td>
                          <td className="py-3.5 px-4 text-center text-slate-700">
                            {row.closed_trades} ({row.wins}W / {row.losses}L)
                          </td>
                          <td className="py-3.5 px-4 text-center font-bold text-slate-900">
                            {Number(row.win_rate_pct || 0).toFixed(1)}%
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className={`rounded-md border px-2 py-0.5 font-bold ${pfBadgeColor}`}>
                              {pf.toFixed(2)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center text-slate-700">
                            {Number(row.avg_r_multiple || 0).toFixed(2)}R
                          </td>
                          <td
                            className={`py-3.5 px-4 text-right font-bold ${
                              Number(row.net_pnl_usdt || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            {Number(row.net_pnl_usdt || 0) >= 0 ? "+" : ""}
                            ${Number(row.net_pnl_usdt || 0).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION 3: MARKET & MACRO NEWS DESK */}
          {/* ========================================================================= */}
          {activeSection === "news" && (
            <div className="space-y-6">
              {/* Header Controls */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Newspaper className="h-5 w-5 text-blue-600" />
                    <span>Market Catalysts &amp; Macro Intelligence Feed</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Live crypto headlines &amp; high-impact USD economic calendar events synced to Supabase database
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search news & events..."
                      value={newsSearchQuery}
                      onChange={(e) => setNewsSearchQuery(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-hidden w-48 sm:w-60"
                    />
                    {newsSearchQuery && (
                      <button
                        onClick={() => setNewsSearchQuery("")}
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Sync News Button */}
                  <button
                    onClick={() => fetchNewsFromApi(true)}
                    disabled={isSyncingNews}
                    className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isSyncingNews ? "animate-spin" : ""}`} />
                    <span>{isSyncingNews ? "Syncing..." : "Sync Fresh News"}</span>
                  </button>
                </div>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: "ALL", label: "All News", count: newsItems.length },
                  { id: "BTC", label: "Bitcoin (BTC)", count: newsItems.filter((n) => n.coin === "BTC").length },
                  { id: "ETH", label: "Ethereum (ETH)", count: newsItems.filter((n) => n.coin === "ETH").length },
                  { id: "SOL", label: "Solana (SOL)", count: newsItems.filter((n) => n.coin === "SOL").length },
                  { id: "MACRO", label: "USD Macro Calendar", count: newsItems.filter((n) => n.category === "macro" || n.coin === "USD").length },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedNewsCategory(cat.id)}
                    className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all border cursor-pointer ${
                      selectedNewsCategory === cat.id
                        ? "border-indigo-600 bg-indigo-600 text-white shadow-xs"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <span>{cat.label}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                        selectedNewsCategory === cat.id
                          ? "bg-white/20 text-white"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {cat.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Macro High-Impact Alert Banner */}
              {newsItems.some((n) => n.category === "macro" || n.impact === "HIGH") && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-bold text-amber-900">
                        USD High-Impact Economic Releases Monitored
                      </div>
                      <p className="text-amber-800/90 leading-relaxed">
                        The autonomous engine monitors ForexFactory high-impact events (CPI, FOMC, NFP, Fed Powell). The Macro Shield automatically blocks new trade openings within 30 minutes before or 15 minutes after high-impact releases.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* News Grid Cards */}
              {filteredNews.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
                  <Newspaper className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-sm font-bold text-slate-800">No news articles found</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    No articles match your selected filter or search query. Click "Sync Fresh News" to fetch latest market updates into the database.
                  </p>
                  <button
                    onClick={() => {
                      setSelectedNewsCategory("ALL");
                      setNewsSearchQuery("");
                      fetchNewsFromApi(true);
                    }}
                    className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer"
                  >
                    Reset Filter &amp; Sync News
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredNews.map((item, idx) => {
                    const isMacro = item.category === "macro" || item.coin === "USD";
                    return (
                      <div
                        key={item.id || idx}
                        className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card hover:shadow-elevated hover:border-indigo-200 transition-all"
                      >
                        <div className="space-y-3">
                          {/* Tags row */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                  item.coin === "BTC"
                                    ? "bg-amber-100 text-amber-800 border border-amber-200"
                                    : item.coin === "ETH"
                                    ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
                                    : item.coin === "SOL"
                                    ? "bg-teal-100 text-teal-800 border border-teal-200"
                                    : "bg-rose-100 text-rose-800 border border-rose-200"
                                }`}
                              >
                                {item.coin || "CRYPTO"}
                              </span>

                              {isMacro && (
                                <span className="rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                                  HIGH IMPACT
                                </span>
                              )}
                            </div>

                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                item.sentiment === "BULLISH"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : item.sentiment === "BEARISH"
                                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                                  : "bg-slate-100 text-slate-600 border border-slate-200"
                              }`}
                            >
                              {item.sentiment || "NEUTRAL"}
                            </span>
                          </div>

                          {/* Headline */}
                          <h3 className="font-bold text-slate-900 text-sm leading-snug group-hover:text-indigo-600 transition-colors line-clamp-3">
                            {item.title}
                          </h3>
                        </div>

                        {/* Footer */}
                        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                          <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                            <span className="font-semibold text-slate-700">{item.source}</span>
                            <span>•</span>
                            <span className="font-mono text-[10px]">{formatTimeAgo(item.published_at)}</span>
                          </div>

                          {item.url && item.url !== "#" && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 hover:text-indigo-800 transition-colors"
                            >
                              <span>Read</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION 4: DEEPSEEK AI AUDIT STREAM */}
          {/* ========================================================================= */}
          {activeSection === "audits" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Brain className="h-5 w-5 text-violet-600" />
                  <span>DeepSeek AI Discrete Rubric Stream</span>
                </h2>
                <p className="text-xs text-slate-600">
                  Pre-execution Chief Quantitative Risk Officer audits with required flaw deductions and discrete scores
                </p>
              </div>

              {recentAudits.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-card text-xs text-slate-600">
                  Awaiting candidate strategy signals to initiate DeepSeek risk evaluations.
                </div>
              ) : (
                <div className="space-y-4">
                  {recentAudits.map((audit) => {
                    const isVetoed = audit.veto_triggered || audit.total_score < (config?.min_score || 75);
                    const breakdown = audit.rubric_breakdown || {};

                    return (
                      <div
                        key={audit.id}
                        className={`rounded-2xl border p-5 shadow-card transition-all ${
                          isVetoed ? "border-rose-200 bg-rose-50/20" : "border-slate-200/90 bg-white"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                          <div className="flex items-center gap-3">
                            <span
                              className={`rounded-md px-2.5 py-0.5 text-xs font-bold ${
                                audit.proposed_direction === "LONG"
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                  : "bg-rose-100 text-rose-800 border border-rose-200"
                              }`}
                            >
                              {audit.proposed_direction}
                            </span>
                            <span className="font-bold text-sm text-slate-900">{audit.symbol}</span>
                            <span className="text-xs text-indigo-600 font-semibold font-mono">
                              ({audit.strategy_name})
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            {isVetoed ? (
                              <span className="flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">
                                <XCircle className="h-3.5 w-3.5 text-rose-600" />
                                VETOED / REJECTED
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                APPROVED ({audit.total_score}/100)
                              </span>
                            )}
                            <span className="text-xs text-slate-600">
                              {new Date(audit.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>

                        {/* Veto Reason */}
                        {audit.veto_reason && (
                          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 font-medium">
                            <strong>Kill-Switch Veto Reason:</strong> {audit.veto_reason}
                          </div>
                        )}

                        {/* 5 Discrete Sub-Score Cards */}
                        <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-center">
                            <div className="text-[10px] font-bold text-slate-600 uppercase">HTF Regime</div>
                            <div className="font-mono font-extrabold text-indigo-700 text-base mt-1">
                              {breakdown.htf_regime?.score ?? 0} / 25
                            </div>
                            <div className="text-[10px] text-slate-600 truncate mt-1">
                              {breakdown.htf_regime?.flaw_or_deduction || "Aligned"}
                            </div>
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-center">
                            <div className="text-[10px] font-bold text-slate-600 uppercase">LTF Location</div>
                            <div className="font-mono font-extrabold text-indigo-700 text-base mt-1">
                              {breakdown.ltf_location?.score ?? 0} / 25
                            </div>
                            <div className="text-[10px] text-slate-600 truncate mt-1">
                              {breakdown.ltf_location?.flaw_or_deduction || "Verified"}
                            </div>
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-center">
                            <div className="text-[10px] font-bold text-slate-600 uppercase">Momentum &amp; Vol</div>
                            <div className="font-mono font-extrabold text-indigo-700 text-base mt-1">
                              {breakdown.momentum_volume?.score ?? 0} / 15
                            </div>
                            <div className="text-[10px] text-slate-600 truncate mt-1">
                              {breakdown.momentum_volume?.flaw_or_deduction || "Clean"}
                            </div>
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-center">
                            <div className="text-[10px] font-bold text-slate-600 uppercase">News Catalyst</div>
                            <div className="font-mono font-extrabold text-indigo-700 text-base mt-1">
                              {breakdown.news_catalyst?.score ?? 0} / 20
                            </div>
                            <div className="text-[10px] text-slate-600 truncate mt-1">
                              {breakdown.news_catalyst?.flaw_or_deduction || "Neutral"}
                            </div>
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-center">
                            <div className="text-[10px] font-bold text-slate-600 uppercase">Intermarket Tide</div>
                            <div className="font-mono font-extrabold text-indigo-700 text-base mt-1">
                              {breakdown.intermarket_tide?.score ?? 0} / 15
                            </div>
                            <div className="text-[10px] text-slate-600 truncate mt-1">
                              {breakdown.intermarket_tide?.flaw_or_deduction || "BTC Flow"}
                            </div>
                          </div>
                        </div>

                        {/* Evaluated News Context */}
                        {Array.isArray(audit.news_context) && audit.news_context.length > 0 && (
                          <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
                            <span className="font-bold text-slate-800">CryptoCompare News Evaluated: </span>
                            {audit.news_context.map((n: any, idx: number) => (
                              <span key={idx} className="mr-3">
                                • {n.title} ({n.published_mins_ago}m ago)
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION 5: AUTONOMOUS SELF-IMPROVEMENT & AUTOPSIES */}
          {/* ========================================================================= */}
          {activeSection === "autopsies" && (
            <div className="space-y-6">
              {/* Header Card with Auto-Apply Mode */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-card">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-amber-500" />
                    <span>Autonomous Self-Optimization Engine</span>
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                    When enabled, DeepSeek post-mortem forensic lessons automatically quarantine underperforming strategies
                    (Profit Factor &lt; 0.80) and inject verified guardrails directly into live prompt caches.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-700">
                    {config?.auto_apply_lessons ? "AUTO-APPLY MODE" : "MANUAL APPROVAL MODE"}
                  </span>
                  <button
                    onClick={async () => {
                      if (!config) return;
                      const val = !config.auto_apply_lessons;
                      setConfig({ ...config, auto_apply_lessons: val });
                      await supabase.from("bot_config").update({ auto_apply_lessons: val }).eq("id", 1);
                      showToast(`Optimization mode: ${val ? "AUTO-APPLY" : "MANUAL APPROVAL"}`);
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      config?.auto_apply_lessons ? "bg-indigo-600" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        config?.auto_apply_lessons ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Guardrails Queue */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3">
                  Discovered Guardrail Rules &amp; Weaknesses Queue ({lessons.length})
                </h4>

                {lessons.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-600 shadow-card">
                    Zero weaknesses detected. Clean historical execution observed by the forensic analyst.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {lessons.map((lesson) => (
                      <div
                        key={lesson.id}
                        className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                            <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 font-mono">
                              {lesson.strategy_name} ({lesson.symbol})
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                lesson.status === "ACTIVE"
                                  ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                                  : lesson.status === "PENDING"
                                  ? "bg-amber-50 border border-amber-200 text-amber-800"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {lesson.status}
                            </span>
                          </div>

                          <div className="text-xs font-bold text-slate-900 mb-1">
                            Weakness: <span className="text-rose-600">{lesson.weakness_detected}</span>
                          </div>
                          <div className="text-xs text-slate-700 mb-2 leading-relaxed">
                            <strong>Prompt Guardrail Rule:</strong> <em>"{lesson.prompt_guardrail_rule}"</em>
                          </div>
                          <div className="text-[11px] text-indigo-600 font-mono mb-3">
                            Suggested Param: {lesson.suggested_param_key} = {JSON.stringify(lesson.suggested_param_value)} (
                            {lesson.win_rate_impact})
                          </div>
                        </div>

                        {lesson.status === "PENDING" && (
                          <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                            <button
                              onClick={() => handleLessonAction(lesson.id, "ACTIVE")}
                              className="flex-1 rounded-xl bg-indigo-600 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition-all cursor-pointer shadow-xs"
                            >
                              Approve &amp; Inject Rule
                            </button>
                            <button
                              onClick={() => handleLessonAction(lesson.id, "DISMISSED")}
                              className="rounded-xl border border-slate-200 bg-slate-100 py-2 px-3 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                            >
                              Dismiss
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Autopsies Feed */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3">
                  Forensic Autopsies (Stopped-Out Trades)
                </h4>

                {autopsies.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-600 shadow-card">
                    No losing trade autopsies recorded yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {autopsies.map((a) => (
                      <div
                        key={a.id}
                        className="rounded-2xl border border-rose-100 bg-white p-4 shadow-card text-xs leading-relaxed"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-2">
                          <div className="flex items-center gap-2 font-bold text-slate-900">
                            <span>Trade #{a.trade_id}</span>
                            <span className="font-mono text-indigo-600">{a.symbol}</span>
                            <span className="text-slate-600">({a.strategy_name})</span>
                          </div>
                          <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                            {a.failure_category}
                          </span>
                        </div>
                        <p className="text-slate-700 mb-1.5">
                          <strong>Root Cause Analysis:</strong> {a.root_cause_analysis}
                        </p>
                        <p className="text-indigo-600 font-semibold">
                          <strong>Recommended Adjustment:</strong> {a.recommended_rule_adjustment}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION 6: QUANTITATIVE RISK & API CONTROLS */}
          {/* ========================================================================= */}
          {activeSection === "settings" && (
            <form onSubmit={handleSaveSettings} className="space-y-6 max-w-4xl">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sliders className="h-5 w-5 text-indigo-600" />
                  <span>Risk, Execution &amp; API Settings Control</span>
                </h2>
                <p className="text-xs text-slate-600">
                  Quantitative risk parameters synchronized directly with Contabo VPS Python trading worker
                </p>
              </div>

              {/* Guardrails Card */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-card space-y-6">
                <h3 className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  <span>Quantitative Risk Guardrails</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Risk Per Trade: {(Number(formSettings.risk_pct || 0.01) * 100).toFixed(2)}%
                    </label>
                    <input
                      type="range"
                      min="0.0025"
                      max="0.02"
                      step="0.0025"
                      value={formSettings.risk_pct || 0.01}
                      onChange={(e) => setFormSettings({ ...formSettings, risk_pct: parseFloat(e.target.value) })}
                      className="w-full accent-indigo-600"
                    />
                    <span className="text-[10px] text-slate-600">Range: 0.25% to 2.0%</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Min DeepSeek Score: {formSettings.min_score || 75}
                    </label>
                    <input
                      type="range"
                      min="70"
                      max="95"
                      step="1"
                      value={formSettings.min_score || 75}
                      onChange={(e) => setFormSettings({ ...formSettings, min_score: parseInt(e.target.value) })}
                      className="w-full accent-indigo-600"
                    />
                    <span className="text-[10px] text-slate-600">Range: 70 to 95 Points</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Min Relative Volume RVOL: {formSettings.min_rvol || 1.2}x
                    </label>
                    <input
                      type="range"
                      min="0.8"
                      max="2.5"
                      step="0.1"
                      value={formSettings.min_rvol || 1.2}
                      onChange={(e) => setFormSettings({ ...formSettings, min_rvol: parseFloat(e.target.value) })}
                      className="w-full accent-indigo-600"
                    />
                    <span className="text-[10px] text-slate-600">Range: 0.8x to 2.5x</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-100">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Max Directional Exposure Pct
                    </label>
                    <input
                      type="number"
                      step="0.005"
                      value={formSettings.max_directional_exposure_pct || 0.015}
                      onChange={(e) =>
                        setFormSettings({ ...formSettings, max_directional_exposure_pct: parseFloat(e.target.value) })
                      }
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-xs text-slate-900 font-mono focus:border-indigo-500 focus:bg-white focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-600">Default: 0.015 (1.5%)</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Max Hold Bars (Time-Stop)
                    </label>
                    <input
                      type="number"
                      value={formSettings.max_hold_bars || 20}
                      onChange={(e) => setFormSettings({ ...formSettings, max_hold_bars: parseInt(e.target.value) })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-xs text-slate-900 font-mono focus:border-indigo-500 focus:bg-white focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-600">15m bars before exit if &lt;0.5R</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Max Funding Rate Pct
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formSettings.max_funding_rate_pct || 0.05}
                      onChange={(e) =>
                        setFormSettings({ ...formSettings, max_funding_rate_pct: parseFloat(e.target.value) })
                      }
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 text-xs text-slate-900 font-mono focus:border-indigo-500 focus:bg-white focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-600">Filter crowded positioning</span>
                  </div>
                </div>

                {/* Feature Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formSettings.enable_breakeven_partial ?? true}
                      onChange={(e) => setFormSettings({ ...formSettings, enable_breakeven_partial: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-0"
                    />
                    <span className="text-xs font-semibold text-slate-700">+1.0R Partial &amp; BE Lock</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formSettings.use_limit_maker_entry ?? true}
                      onChange={(e) => setFormSettings({ ...formSettings, use_limit_maker_entry: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-0"
                    />
                    <span className="text-xs font-semibold text-slate-700">Limit Maker (GTX)</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formSettings.telegram_notifications ?? true}
                      onChange={(e) => setFormSettings({ ...formSettings, telegram_notifications: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-0"
                    />
                    <span className="text-xs font-semibold text-slate-700">Telegram Push Alerts</span>
                  </label>
                </div>
              </div>

              {/* Watchlist Symbols */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-card space-y-3">
                <h3 className="text-xs font-bold text-indigo-700 uppercase tracking-wider">
                  Watchlist Symbols (Binance USDT-M Futures)
                </h3>
                <input
                  type="text"
                  value={(formSettings.symbols || []).join(", ")}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      symbols: e.target.value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
                    })
                  }
                  placeholder="BTC/USDT, ETH/USDT, SOL/USDT"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 px-4 text-xs text-slate-900 font-mono focus:border-indigo-500 focus:bg-white focus:outline-none"
                />
                <span className="text-[10px] text-slate-600">Comma-separated ccxt pair identifiers.</span>
              </div>

              {/* Encrypted API Keys */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-card space-y-4">
                <h3 className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  <span>Encrypted API Key Overrides</span>
                </h3>
                <p className="text-xs text-slate-600">
                  Leave empty to fallback to container environment variables. Values entered here take immediate precedence.
                </p>

                {[
                  { key: "binance_api_key_override", label: "Binance Futures API Key" },
                  { key: "binance_secret_override", label: "Binance Futures Secret" },
                  { key: "deepseek_key_override", label: "DeepSeek AI API Key" },
                  { key: "telegram_token_override", label: "Telegram Bot Token" },
                  { key: "telegram_chat_id_override", label: "Telegram Chat ID" },
                ].map(({ key, label }) => {
                  const isVisible = showSecretKeys[key];
                  return (
                    <div key={key}>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
                      <div className="relative">
                        <input
                          type={isVisible ? "text" : "password"}
                          value={(formSettings as any)[key] || ""}
                          onChange={(e) => setFormSettings({ ...formSettings, [key]: e.target.value })}
                          placeholder="••••••••••••••••"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 px-3 pr-10 text-xs text-slate-900 font-mono focus:border-indigo-500 focus:bg-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSecretKeys({ ...showSecretKeys, [key]: !isVisible })}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Submit Button */}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSavingConfig}
                  className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-700 focus:outline-none disabled:opacity-50 transition-all cursor-pointer"
                >
                  {isSavingConfig ? "Saving Changes..." : "Save Quantitative Configuration"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
