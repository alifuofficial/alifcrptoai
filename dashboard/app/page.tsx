"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
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

// Register Chart.js core components
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
import {
  Activity,
  LayoutDashboard,
  Layers,
  TrendingUp,
  Newspaper,
  Cpu,
  BrainCircuit,
  SlidersHorizontal,
  LogOut,
  ChevronRight,
  PauseCircle,
  PlayCircle,
  Radio,
  ShieldCheck,
  ShieldAlert,
  Gauge,
  AlertOctagon,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  RefreshCw,
  ArrowRight,
  Clock,
  Menu,
  X,
  Search,
  Sliders,
  Eye,
  EyeOff,
  ExternalLink,
  Radar,
  AlertTriangle,
  Zap,
  Shield,
  CheckCircle2,
  XCircle,
  Loader2,
  Send,
  Server,
  Wifi,
  WifiOff,
  Check,
  BookOpen,
  LineChart,
  Globe,
  PanelLeftClose,
  PanelLeftOpen,
  History,
} from "lucide-react";

import LiveTradeChart from "./components/LiveTradeChart";
import TradingJournal from "./components/TradingJournal";
import BacktestView from "./components/BacktestView";

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
  target_rr?: number;
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
  deepseek_base_url?: string | null;
  binance_api_key_override?: string | null;
  binance_secret_override?: string | null;
  bybit_api_key_override?: string | null;
  bybit_secret_override?: string | null;
  exchange_mode?: "binance" | "bybit" | "dual";
  enable_forex_trading?: boolean;
  forex_symbols?: string[];
  forex_max_leverage?: number;
  forex_weekend_shield?: boolean;
  forex_rollover_shield?: boolean;
  forex_max_spread_pips?: number;
  panic_close_target?: "ALL" | "CRYPTO" | "FOREX";
  ai_provider?: "council_3model" | "deepseek" | "gemini" | "auto" | "technical";
  gemini_api_key_override?: string | null;
  gemini_model?: string;
  qwen_api_key_override?: string | null;
  qwen_base_url?: string;
  qwen_model?: string;
  openai_api_key_override?: string | null;
  openai_model?: string;
  openai_base_url?: string;
  grok_api_key_override?: string | null;
  grok_model?: string;
  grok_base_url?: string;
  council_chartist_provider?: "openai" | "gemini";
  council_quant_provider?: "grok" | "qwen";
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
  exchange?: "binance" | "bybit";
  asset_class?: "crypto" | "forex" | "commodity";
  forex_session?: string | null;
  pnl_pips?: number | null;
  spread_at_entry?: number | null;
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
  is_simulated?: boolean;
  opened_at: string;
  closed_at?: string | null;
}

interface AiAuditLog {
  id: number;
  symbol: string;
  exchange?: string;
  asset_class?: string;
  forex_session?: string | null;
  spread_pips?: number | null;
  spread_at_entry?: number | null;
  ai_model?: string | null;
  strategy_name: string;
  proposed_direction: string;
  total_score: number;
  veto_triggered: boolean;
  veto_reason?: string | null;
  rubric_breakdown: any;
  gemini_report?: any;
  qwen_report?: any;
  deepseek_report?: any;
  council_scores?: any;
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

interface StrategyInfo {
  id: string;
  label: string;
  regime: string;
}

const ALL_STRATEGIES: StrategyInfo[] = [
  { id: "SMC_Liquidity_Sweep", label: "SMC Liquidity Sweep", regime: "Institutional Liquidity" },
  { id: "ICT_OrderBlock_FVG", label: "ICT Order Block + FVG (smartmoneyconcepts)", regime: "Institutional SMC" },
  { id: "Supertrend_ADX_Momentum", label: "Supertrend + ADX (pandas-ta-classic)", regime: "Strong Trend" },
  { id: "EMA_Trend_Pullback", label: "EMA Trend Pullback", regime: "Trend Following" },
  { id: "BB_Volatility_Breakout", label: "BB Volatility Breakout", regime: "Volatility Compression" },
  { id: "RSI_Divergence_Reversal", label: "RSI Divergence Reversal", regime: "Mean Reversion" },
  { id: "Asian_Judas_Swing", label: "Asian Range Judas Swing", regime: "London Open Manipulation" },
  { id: "SMT_Divergence", label: "SMT Divergence (Cross-Pair)", regime: "Intermarket Accumulation" },
];

type NavSection =
  | "chart"
  | "journal"
  | "strategies"
  | "backtest"
  | "autopsies"
  | "settings"
  | "overview"
  | "positions"
  | "news"
  | "audits";

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
  const [closedTrades, setClosedTrades] = useState<TradeExecution[]>([]);
  const [focusedTrade, setFocusedTrade] = useState<any | null>(null);
  const [recentAudits, setRecentAudits] = useState<AiAuditLog[]>([]);
  const [lessons, setLessons] = useState<BotLesson[]>([]);
  const [autopsies, setAutopsies] = useState<TradeAutopsy[]>([]);

  // UI States
  const [activeSection, setActiveSection] = useState<NavSection>("overview");
  const [chartTimeframe, setChartTimeframe] = useState<"24H" | "7D" | "30D" | "ALL">("ALL");
  const [showPanicModal, setShowPanicModal] = useState(false);
  const [panicTarget, setPanicTarget] = useState<"ALL" | "CRYPTO" | "FOREX">("ALL");
  const [selectedExchangeFilter, setSelectedExchangeFilter] = useState<"ALL" | "binance" | "bybit">("ALL");
  const [auditExchangeFilter, setAuditExchangeFilter] = useState<"ALL" | "binance" | "bybit">("ALL");
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showStandbyAiProviders, setShowStandbyAiProviders] = useState(false);

  // Restore sidebar collapsed preference from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("alifcrptoai_sidebar_collapsed");
      if (saved !== null) {
        setSidebarCollapsed(saved === "true");
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("alifcrptoai_sidebar_collapsed", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Keyboard shortcut Ctrl+\ or Ctrl+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "\\" || e.key.toLowerCase() === "b")) {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  const [toastNotification, setToastNotification] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  // World Session Clock Realtime Telemetry
  const [utcClockStr, setUtcClockStr] = useState<string>("");
  const [liveForexSession, setLiveForexSession] = useState<{
    name: string;
    isKillzone: boolean;
    badgeClass: string;
    description: string;
  }>({
    name: "CHECKING",
    isKillzone: false,
    badgeClass: "bg-slate-100 text-slate-600",
    description: "Determining active market hours...",
  });

  useEffect(() => {
    const updateSessionClock = () => {
      const now = new Date();
      const h = String(now.getUTCHours()).padStart(2, "0");
      const m = String(now.getUTCMinutes()).padStart(2, "0");
      const s = String(now.getUTCSeconds()).padStart(2, "0");
      setUtcClockStr(`${h}:${m}:${s}`);

      const day = now.getUTCDay();
      const hour = now.getUTCHours();

      // Weekend schedule: Friday 21:00 UTC to Sunday 22:00 UTC
      if (day === 6 || (day === 5 && hour >= 21) || (day === 0 && hour < 22)) {
        setLiveForexSession({
          name: "WEEKEND CLOSED",
          isKillzone: false,
          badgeClass: "bg-rose-100 text-rose-800 border-rose-200",
          description: "Forex market closed for the weekend (Opens Sun 22:00 UTC)",
        });
      } else if (hour >= 7 && hour < 11) {
        setLiveForexSession({
          name: "LONDON KILLZONE",
          isKillzone: true,
          badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300",
          description: "London Open (07:00-11:00 UTC): Prime Asian Range Liquidity Sweeps & Displacement",
        });
      } else if (hour >= 12 && hour < 16) {
        setLiveForexSession({
          name: "NY OVERLAP",
          isKillzone: true,
          badgeClass: "bg-blue-100 text-blue-800 border-blue-300",
          description: "London + NY Overlap (12:00-16:00 UTC): Peak institutional volume & displacement",
        });
      } else if (hour >= 0 && hour < 7) {
        setLiveForexSession({
          name: "ASIAN SESSION",
          isKillzone: false,
          badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
          description: "Asian Session (00:00-07:00 UTC): Range-bound consolidation",
        });
      } else if (hour >= 16 && hour < 21) {
        setLiveForexSession({
          name: "NY AFTERNOON",
          isKillzone: false,
          badgeClass: "bg-indigo-100 text-indigo-800 border-indigo-200",
          description: "New York Afternoon (16:00-21:00 UTC): London closed, momentum slowing",
        });
      } else {
        setLiveForexSession({
          name: "ROLLOVER RESET",
          isKillzone: false,
          badgeClass: "bg-purple-100 text-purple-800 border-purple-200",
          description: "Daily Bank Rollover: Wide broker spreads, defensive posture",
        });
      }
    };

    updateSessionClock();
    const timer = setInterval(updateSessionClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // API Health Diagnostics State
  const [apiHealth, setApiHealth] = useState<{
    binance: { status: "idle" | "testing" | "success" | "error"; message?: string; latency?: number };
    bybit: { status: "idle" | "testing" | "success" | "error"; message?: string; latency?: number };
    deepseek: { status: "idle" | "testing" | "success" | "error"; message?: string; latency?: number };
    gemini: { status: "idle" | "testing" | "success" | "error"; message?: string; latency?: number };
    qwen: { status: "idle" | "testing" | "success" | "error"; message?: string; latency?: number };
    openai: { status: "idle" | "testing" | "success" | "error"; message?: string; latency?: number };
    grok: { status: "idle" | "testing" | "success" | "error"; message?: string; latency?: number };
    telegram: { status: "idle" | "testing" | "success" | "error"; message?: string; latency?: number };
    database: { status: "idle" | "testing" | "success" | "error"; message?: string; latency?: number };
  }>({
    binance: { status: "idle" },
    bybit: { status: "idle" },
    deepseek: { status: "idle" },
    gemini: { status: "idle" },
    qwen: { status: "idle" },
    openai: { status: "idle" },
    grok: { status: "idle" },
    telegram: { status: "idle" },
    database: { status: "idle" },
  });
  const [isTestingAll, setIsTestingAll] = useState(false);

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
      // Config: Fetch from Supabase, or auto-seed row 1 via /api/config if missing
      try {
        const { data: cfgData } = await supabase.from("bot_config").select("*").eq("id", 1).maybeSingle();
        if (cfgData) {
          setConfig(cfgData);
          setFormSettings(cfgData);
        } else {
          const res = await fetch("/api/config");
          const json = await res.json();
          if (json.data) {
            setConfig(json.data);
            setFormSettings(json.data);
          }
        }
      } catch (cfgErr) {
        console.warn("Config load notice:", cfgErr);
      }

      // Latest Snapshot
      const { data: snapData } = await supabase
        .from("account_snapshots")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (snapData) setLatestSnapshot(snapData);

      // Snapshot History from Database based on active timeframe
      await fetchSnapshotsByTimeframe(chartTimeframe);

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

      // Closed Trades for Historical Candle Markers & Replay
      const { data: closedData } = await supabase
        .from("trade_executions")
        .select("*")
        .neq("status", "OPEN")
        .order("closed_at", { ascending: false })
        .limit(50);
      if (closedData) setClosedTrades(closedData);

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

  const fetchSnapshotsByTimeframe = async (tf: "24H" | "7D" | "30D" | "ALL") => {
    try {
      let query = supabase
        .from("account_snapshots")
        .select("*")
        .order("created_at", { ascending: true });

      const now = new Date();
      if (tf === "24H") {
        const t24 = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        query = query.gte("created_at", t24);
      } else if (tf === "7D") {
        const t7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte("created_at", t7);
      } else if (tf === "30D") {
        const t30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte("created_at", t30);
      }

      const { data, error } = await query.limit(500);
      if (!error && data) {
        if (data.length > 0) {
          setSnapshotsHistory(data);
          setLatestSnapshot(data[data.length - 1]);
        } else if (tf === "ALL") {
          // If completely empty database, record the initial real baseline snapshot directly
          const initialEquity = 0.0;
          const { data: seeded } = await supabase
            .from("account_snapshots")
            .insert({
              equity_usdt: initialEquity,
              free_usdt: initialEquity,
              daily_pnl_usdt: 0.0,
              daily_pnl_pct: 0.0,
              open_positions: [],
            })
            .select()
            .single();
          if (seeded) {
            setSnapshotsHistory([seeded]);
            setLatestSnapshot(seeded);
          }
        } else {
          setSnapshotsHistory([]);
        }
      }
    } catch (err) {
      console.warn("Snapshots fetch notice:", err);
    }
  };

  const recordSnapshotNow = async () => {
    try {
      showToast("Querying live balance from Binance Futures...", "info");
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: "binance",
          params: {
            binance: {
              apiKey: formSettings.binance_api_key_override,
              secret: formSettings.binance_secret_override,
              sandbox: config?.sandbox_mode,
            },
          },
        }),
      });
      const data = await res.json();
      let liveEquity = 0.0;
      let liveFree = 0.0;

      if (data.success && data.details) {
        liveEquity = Number(data.details.totalWalletBalance || 0.0);
        liveFree = Number(data.details.availableBalance || 0.0);
      } else {
        liveEquity = Number(latestSnapshot?.equity_usdt ?? 0.0);
        liveFree = Number(latestSnapshot?.free_usdt ?? 0.0);
      }

      const pnl = Number(latestSnapshot?.daily_pnl_usdt ?? 0.0);
      const pnlPct = Number(latestSnapshot?.daily_pnl_pct ?? 0.0);

      // Optimistically update local dashboard state immediately
      const optimisticSnap = {
        id: Date.now(),
        equity_usdt: liveEquity,
        free_usdt: liveFree,
        daily_pnl_usdt: pnl,
        daily_pnl_pct: pnlPct,
        open_positions: openTrades || [],
        created_at: new Date().toISOString(),
      };
      setLatestSnapshot(optimisticSnap);
      setSnapshotsHistory((prev) => [...prev, optimisticSnap]);

      const { data: savedSnap, error } = await supabase
        .from("account_snapshots")
        .insert({
          equity_usdt: liveEquity,
          free_usdt: liveFree,
          daily_pnl_usdt: pnl,
          daily_pnl_pct: pnlPct,
          open_positions: openTrades || [],
        })
        .select()
        .single();

      if (!error && savedSnap) {
        setSnapshotsHistory((prev) => [...prev.filter((s) => s.id !== optimisticSnap.id), savedSnap]);
        setLatestSnapshot(savedSnap);
        showToast(`Synchronized live mark: $${liveEquity.toFixed(2)} USDT`, "success");
      } else if (error) {
        if (error.message?.includes("account_snapshots") || error.code === "PGRST204" || error.code === "42P01") {
          showToast(`Mark updated ($${liveEquity.toFixed(2)}), but Supabase table 'account_snapshots' is missing. Please run schema.sql in Supabase SQL editor.`, "info");
        } else {
          showToast(`Snapshot error: ${error.message}`, "error");
        }
      }
    } catch (err: any) {
      showToast(`Snapshot error: ${err.message}`, "error");
    }
  };

  useEffect(() => {
    fetchAllData();

    // Supabase Realtime Channels
    const channel = supabase
      .channel("command-center-realtime-fintech")
      .on("postgres_changes", { event: "*", schema: "public", table: "bot_config" }, (payload) => {
        if (payload.new) {
          setConfig(payload.new as BotConfig);
          setFormSettings(payload.new as BotConfig);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "account_snapshots" }, (payload) => {
        if (payload.new) {
          setLatestSnapshot(payload.new as AccountSnapshot);
          setSnapshotsHistory((prev) => [...prev, payload.new as AccountSnapshot]);
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

  useEffect(() => {
    fetchSnapshotsByTimeframe(chartTimeframe);
  }, [chartTimeframe]);

  const showToast = (msg: string, type: "success" | "error" | "info" = "info") => {
    setToastNotification({ message: msg, type });
    setTimeout(() => setToastNotification(null), 4500);
  };

  const testSingleApi = async (service: "binance" | "bybit" | "deepseek" | "gemini" | "qwen" | "openai" | "grok" | "telegram" | "database") => {
    setApiHealth((prev) => ({
      ...prev,
      [service]: { status: "testing", message: "Connecting & verifying endpoint..." },
    }));

    try {
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service,
          params: {
            binance: {
              apiKey: formSettings.binance_api_key_override,
              secret: formSettings.binance_secret_override,
              sandbox: config?.sandbox_mode,
            },
            bybit: {
              apiKey: formSettings.bybit_api_key_override,
              secret: formSettings.bybit_secret_override,
              sandbox: config?.sandbox_mode,
            },
            deepseek: {
              baseUrl: formSettings.deepseek_base_url,
              apiKey: formSettings.deepseek_key_override,
              model: formSettings.deepseek_model,
            },
            gemini: {
              apiKey: formSettings.gemini_api_key_override,
              model: formSettings.gemini_model || "gemini-3.5-flash",
            },
            qwen: {
              baseUrl: formSettings.qwen_base_url,
              apiKey: formSettings.qwen_api_key_override,
              model: formSettings.qwen_model || "qwen3.7-flash",
            },
            openai: {
              apiKey: formSettings.openai_api_key_override,
              baseUrl: formSettings.openai_base_url || "https://api.openai.com/v1",
              model: formSettings.openai_model || "gpt-4o-mini",
            },
            grok: {
              apiKey: formSettings.grok_api_key_override,
              baseUrl: formSettings.grok_base_url || "https://api.x.ai/v1",
              model: formSettings.grok_model || "grok-beta",
            },
            telegram: {
              token: formSettings.telegram_token_override,
              chatId: formSettings.telegram_chat_id_override,
              sendTestMessage: true,
            },
          },
        }),
      });

      const data = await res.json();
      if (data.success) {
        setApiHealth((prev) => ({
          ...prev,
          [service]: { status: "success", message: data.message, latency: data.latencyMs },
        }));
        showToast(data.message || `${service.toUpperCase()} connected successfully!`, "success");
      } else {
        setApiHealth((prev) => ({
          ...prev,
          [service]: { status: "error", message: data.message, latency: data.latencyMs },
        }));
        showToast(data.message || `${service.toUpperCase()} connection failed!`, "error");
      }
    } catch (err: any) {
      setApiHealth((prev) => ({
        ...prev,
        [service]: { status: "error", message: err.message },
      }));
      showToast(`Diagnostic failed: ${err.message}`, "error");
    }
  };

  const testAllApis = async () => {
    setIsTestingAll(true);
    setApiHealth({
      binance: { status: "testing", message: "Testing Binance gateway..." },
      bybit: { status: "testing", message: "Testing Bybit V5 gateway..." },
      deepseek: { status: "testing", message: "Testing AI model..." },
      gemini: { status: "testing", message: "Testing Google Gemini..." },
      qwen: { status: "testing", message: "Testing Qwen Quant..." },
      openai: { status: "testing", message: "Testing OpenAI Chartist..." },
      grok: { status: "testing", message: "Testing Grok Quant..." },
      telegram: { status: "testing", message: "Testing alerts..." },
      database: { status: "testing", message: "Testing ledger..." },
    });

    try {
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: "all",
          params: {
            binance: {
              apiKey: formSettings.binance_api_key_override,
              secret: formSettings.binance_secret_override,
              sandbox: config?.sandbox_mode,
            },
            bybit: {
              apiKey: formSettings.bybit_api_key_override,
              secret: formSettings.bybit_secret_override,
              sandbox: config?.sandbox_mode,
            },
            deepseek: {
              baseUrl: formSettings.deepseek_base_url,
              apiKey: formSettings.deepseek_key_override,
              model: formSettings.deepseek_model,
            },
            gemini: {
              apiKey: formSettings.gemini_api_key_override,
              model: formSettings.gemini_model || "gemini-3.5-flash",
            },
            qwen: {
              baseUrl: formSettings.qwen_base_url,
              apiKey: formSettings.qwen_api_key_override,
              model: formSettings.qwen_model || "qwen3.7-flash",
            },
            openai: {
              apiKey: formSettings.openai_api_key_override,
              baseUrl: formSettings.openai_base_url || "https://api.openai.com/v1",
              model: formSettings.openai_model || "gpt-4o-mini",
            },
            grok: {
              apiKey: formSettings.grok_api_key_override,
              baseUrl: formSettings.grok_base_url || "https://api.x.ai/v1",
              model: formSettings.grok_model || "grok-beta",
            },
            telegram: {
              token: formSettings.telegram_token_override,
              chatId: formSettings.telegram_chat_id_override,
              sendTestMessage: true,
            },
          },
        }),
      });

      const data = await res.json();
      if (data.results) {
        const b = data.results.binance;
        const by = data.results.bybit;
        const d = data.results.deepseek;
        const g = data.results.gemini;
        const q = data.results.qwen;
        const oai = data.results.openai;
        const grk = data.results.grok;
        const t = data.results.telegram;
        const db = data.results.database;

        setApiHealth({
          binance: { status: b?.success ? "success" : "error", message: b?.message, latency: b?.latencyMs },
          bybit: { status: by?.success ? "success" : "error", message: by?.message, latency: by?.latencyMs },
          deepseek: { status: d?.success ? "success" : "error", message: d?.message, latency: d?.latencyMs },
          gemini: { status: g?.success ? "success" : "error", message: g?.message, latency: g?.latencyMs },
          qwen: { status: q?.success ? "success" : "error", message: q?.message, latency: q?.latencyMs },
          openai: { status: oai?.success ? "success" : "error", message: oai?.message, latency: oai?.latencyMs },
          grok: { status: grk?.success ? "success" : "error", message: grk?.message, latency: grk?.latencyMs },
          telegram: { status: t?.success ? "success" : "error", message: t?.message, latency: t?.latencyMs },
          database: { status: db?.success ? "success" : "error", message: db?.message, latency: db?.latencyMs },
        });

        if (data.success) {
          showToast("All multi-asset trading APIs & services operational!", "success");
        } else {
          const failedServices = [
            !b?.success && "Binance",
            !by?.success && "Bybit",
            !d?.success && "AI Model",
            !t?.success && "Telegram",
            !db?.success && "Database",
          ].filter(Boolean).join(", ");
          showToast(`Issues detected on: ${failedServices}. Check credentials.`, "error");
        }
      }
    } catch (err: any) {
      showToast(`Diagnostic suite error: ${err.message}`, "error");
    } finally {
      setIsTestingAll(false);
    }
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
      showToast(`Switched mode to ${newSandbox ? "TESTNET / DEMO" : "LIVE BINANCE USDM"}`);
    }
  };

  const triggerPanicCloseAll = async (target: "ALL" | "CRYPTO" | "FOREX" = panicTarget) => {
    setShowPanicModal(false);
    const { error } = await supabase.from("bot_config").update({
      panic_close_all: true,
      panic_close_target: target,
      is_active: false,
    }).eq("id", 1);
    if (!error) {
      showToast(`EMERGENCY FLATTEN DISPATCHED (${target}): Orders cancelled & positions closed!`, "success");
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

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingConfig(true);
    try {
      const updates = {
        risk_pct: Number(formSettings.risk_pct),
        target_rr: Number(formSettings.target_rr ?? 2.5),
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
        deepseek_base_url: formSettings.deepseek_base_url || "https://api.deepseek.com",
        symbols: formSettings.symbols || ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
        binance_api_key_override: formSettings.binance_api_key_override?.trim() || null,
        binance_secret_override: formSettings.binance_secret_override?.trim() || null,
        bybit_api_key_override: formSettings.bybit_api_key_override?.trim() || null,
        bybit_secret_override: formSettings.bybit_secret_override?.trim() || null,
        exchange_mode: formSettings.exchange_mode || "binance",
        enable_forex_trading: Boolean(formSettings.enable_forex_trading ?? true),
        forex_symbols: formSettings.forex_symbols || ["EUR/USD", "GBP/USD", "USD/JPY"],
        forex_max_leverage: Number(formSettings.forex_max_leverage ?? 20),
        forex_weekend_shield: Boolean(formSettings.forex_weekend_shield ?? true),
        forex_rollover_shield: Boolean(formSettings.forex_rollover_shield ?? true),
        forex_max_spread_pips: Number(formSettings.forex_max_spread_pips ?? 3.5),
        ai_provider: formSettings.ai_provider || "council_3model",
        gemini_api_key_override: formSettings.gemini_api_key_override?.trim() || null,
        gemini_model: formSettings.gemini_model || "gemini-3.5-flash",
        qwen_api_key_override: formSettings.qwen_api_key_override?.trim() || null,
        qwen_base_url: formSettings.qwen_base_url || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        qwen_model: formSettings.qwen_model || "qwen3.7-flash",
        openai_api_key_override: formSettings.openai_api_key_override?.trim() || null,
        openai_model: formSettings.openai_model || "gpt-4o-mini",
        openai_base_url: formSettings.openai_base_url || "https://api.openai.com/v1",
        grok_api_key_override: formSettings.grok_api_key_override?.trim() || null,
        grok_model: formSettings.grok_model || "grok-beta",
        grok_base_url: formSettings.grok_base_url || "https://api.x.ai/v1",
        council_chartist_provider: formSettings.council_chartist_provider || "openai",
        council_quant_provider: formSettings.council_quant_provider || "grok",
        deepseek_key_override: formSettings.deepseek_key_override?.trim() || null,
        telegram_token_override: formSettings.telegram_token_override?.trim() || null,
        telegram_chat_id_override: formSettings.telegram_chat_id_override?.trim() || null,
      };

      // 1. Commit via server-side /api/config (guarantees upsert on row 1 and avoids client RLS silent drops)
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setConfig(json.data);
        setFormSettings(json.data);
        showToast("Configuration & API keys successfully committed to database!", "success");
      } else {
        // Fallback: client Supabase upsert
        const { data: upsertData, error: upsertErr } = await supabase
          .from("bot_config")
          .upsert({ id: 1, ...updates, updated_at: new Date().toISOString() }, { onConflict: "id" })
          .select()
          .single();

        if (!upsertErr && upsertData) {
          setConfig(upsertData);
          setFormSettings(upsertData);
          showToast("Settings saved to database successfully!", "success");
        } else {
          const errDetail = json.error || upsertErr?.message || "Unknown error";
          showToast(`Database save failed: ${errDetail}`, "error");
        }
      }
    } catch (err: any) {
      showToast(`Save error: ${err.message}`, "error");
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
        const matchTitle = item.title?.toLowerCase().includes(q);
        const matchSource = item.source?.toLowerCase().includes(q);
        const matchCoin = (item.coin || "").toLowerCase().includes(q);
        if (!matchTitle && !matchSource && !matchCoin) return false;
      }

      return true;
    });
  }, [newsItems, selectedNewsCategory, newsSearchQuery]);

  // Real Chart.js Dataset mapped from PostgreSQL account_snapshots database ledger
  const chartJsData = useMemo(() => {
    let points: { label: string; value: number; pnl: number; dateStr: string }[] = [];

    if (snapshotsHistory.length > 0) {
      points = snapshotsHistory.map((s) => {
        const d = new Date(s.created_at);
        const label =
          chartTimeframe === "24H"
            ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        return {
          label,
          value: Number(s.equity_usdt ?? 0.0),
          pnl: Number(s.daily_pnl_usdt ?? 0.0),
          dateStr: s.created_at,
        };
      });

      if (points.length === 1) {
        const p0 = points[0];
        const prevTime = new Date(new Date(p0.dateStr).getTime() - 60 * 60 * 1000);
        const prevLabel =
          chartTimeframe === "24H"
            ? prevTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : `${prevTime.toLocaleDateString([], { month: "short", day: "numeric" })} ${prevTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        points = [
          { label: prevLabel, value: p0.value, pnl: 0, dateStr: prevTime.toISOString() },
          p0,
        ];
      }
    } else {
      const base = Number(latestSnapshot?.equity_usdt ?? 0.0);
      const now = new Date();
      const past = new Date(now.getTime() - 60 * 60 * 1000);
      points = [
        {
          label: past.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          value: base,
          pnl: 0,
          dateStr: past.toISOString(),
        },
        {
          label: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          value: base,
          pnl: Number(latestSnapshot?.daily_pnl_usdt ?? 0.0),
          dateStr: now.toISOString(),
        },
      ];
    }

    return {
      labels: points.map((p) => p.label),
      datasets: [
        {
          label: "Equity (USDT)",
          data: points.map((p) => p.value),
          borderColor: "#2563eb",
          backgroundColor: (context: any) => {
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            if (!chartArea) return "rgba(37, 99, 235, 0.1)";
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, "rgba(37, 99, 235, 0.22)");
            gradient.addColorStop(1, "rgba(37, 99, 235, 0.0)");
            return gradient;
          },
          borderWidth: 2,
          pointRadius: points.length > 60 ? 0 : 3,
          pointHoverRadius: 6,
          pointBackgroundColor: "#ffffff",
          pointBorderColor: "#2563eb",
          pointBorderWidth: 2,
          pointHoverBackgroundColor: "#2563eb",
          pointHoverBorderColor: "#ffffff",
          pointHoverBorderWidth: 2,
          fill: true,
          tension: 0.35,
        },
      ],
      points,
    };
  }, [snapshotsHistory, latestSnapshot, chartTimeframe]);

  const chartStats = useMemo(() => {
    const values = chartJsData.points.map((p) => p.value);
    if (!values.length) {
      const base = Number(latestSnapshot?.equity_usdt ?? 0.0);
      return { min: base, max: base, start: "N/A", end: "Current", count: 0 };
    }
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      start: chartJsData.points[0]?.label || "N/A",
      end: chartJsData.points[chartJsData.points.length - 1]?.label || "Current",
      count: chartJsData.points.length,
    };
  }, [chartJsData, latestSnapshot]);

  const chartOptions: ChartOptions<"line"> = useMemo(() => {
    const values = chartJsData.points.map((p) => p.value);
    const minVal = values.length ? Math.min(...values) : 0;
    const maxVal = values.length ? Math.max(...values) : 0;
    const diff = maxVal - minVal;
    const padding = diff === 0 ? (maxVal === 0 ? 10 : maxVal * 0.15) : Math.max(diff * 0.15, 2);

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 400,
        easing: "easeOutQuart",
      },
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          enabled: true,
          backgroundColor: "#0f172a",
          titleColor: "#94a3b8",
          titleFont: { size: 11, family: "Inter, sans-serif" },
          bodyColor: "#ffffff",
          bodyFont: { size: 12, weight: "bold", family: "Inter, sans-serif" },
          borderColor: "#334155",
          borderWidth: 1,
          padding: 10,
          boxPadding: 4,
          usePointStyle: true,
          callbacks: {
            label: (context) => {
              const val = Number(context.parsed.y || 0);
              return ` Equity: $${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            },
            afterLabel: (context) => {
              const p = chartJsData.points[context.dataIndex];
              if (p && p.pnl !== undefined) {
                const sign = p.pnl >= 0 ? "+" : "";
                return ` Realized P&L: ${sign}$${p.pnl.toFixed(2)}`;
              }
              return "";
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: true,
            color: "#f1f5f9",
          },
          ticks: {
            color: "#64748b",
            font: { size: 10, family: "Inter, sans-serif" },
            maxTicksLimit: 8,
            maxRotation: 0,
          },
          border: {
            display: false,
          },
        },
        y: {
          min: Math.floor(minVal - padding),
          max: Math.ceil(maxVal + padding),
          grid: {
            display: true,
            color: "#f1f5f9",
          },
          ticks: {
            color: "#64748b",
            font: { size: 10, family: "Inter, sans-serif" },
            callback: (value) => `$${Number(value).toLocaleString()}`,
          },
          border: {
            display: false,
          },
        },
      },
    };
  }, [chartJsData]);

  if (!sessionChecked) {
    return (
      <div className="bg-background text-textMain h-screen flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 bg-brand-900 rounded-lg flex items-center justify-center shadow-md animate-pulse">
          <Activity className="text-white w-6 h-6" />
        </div>
        <div className="flex items-center gap-2 text-xs text-textMuted font-mono">
          <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
          <span>Verifying encrypted session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background text-textMain font-sans antialiased h-screen flex overflow-hidden selection:bg-brand-100 selection:text-brand-900">
      {/* Upgraded Toast Notification */}
      {toastNotification && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-2.5 rounded-lg border px-4 py-3 text-xs font-semibold shadow-lg transition-all animate-in fade-in slide-in-from-top-2 duration-200 max-w-md ${
            toastNotification.type === "success"
              ? "border-emerald-500 bg-emerald-50 text-emerald-800 shadow-emerald-500/10"
              : toastNotification.type === "error"
              ? "border-rose-500 bg-rose-50 text-rose-800 shadow-rose-500/10"
              : "border-brand-500 bg-surface text-brand-800 shadow-brand-500/10"
          }`}
        >
          {toastNotification.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          ) : toastNotification.type === "error" ? (
            <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
          ) : (
            <Zap className="h-4 w-4 text-brand-600 shrink-0" />
          )}
          <span className="leading-snug">{toastNotification.message}</span>
        </div>
      )}

      {/* EMERGENCY PANIC MODAL */}
      {showPanicModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-lg border border-rose-200 bg-surface p-6 shadow-xl">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <AlertOctagon className="h-6 w-6 animate-pulse" />
              <h3 className="text-base font-bold text-textMain">Emergency Circuit Breaker Flatten</h3>
            </div>
            <p className="text-xs text-textMuted mb-4 leading-relaxed">
              Select the asset class and exchange target to immediately cancel all conditional orders and close open positions at Market:
            </p>

            <div className="space-y-2 mb-5">
              {[
                { id: "ALL", label: "Flatten ALL Positions (Binance + Bybit)", desc: "Emergency shutdown across all crypto, forex & metals" },
                { id: "CRYPTO", label: "Flatten Crypto Only (Binance USD-M)", desc: "Leaves Forex positions untouched" },
                { id: "FOREX", label: "Flatten Forex Only (Bybit UTA V5)", desc: "Derisks Forex before weekend, leaves Crypto running" },
              ].map((opt) => (
                <label
                  key={opt.id}
                  onClick={() => setPanicTarget(opt.id as any)}
                  className={`flex items-start gap-3 p-2.5 rounded-md border text-xs cursor-pointer transition-all ${
                    panicTarget === opt.id
                      ? "border-rose-500 bg-rose-50/70 text-rose-900 font-semibold"
                      : "border-border bg-slate-50 text-textMain hover:bg-slate-100"
                  }`}
                >
                  <input
                    type="radio"
                    name="panicTarget"
                    checked={panicTarget === opt.id}
                    onChange={() => setPanicTarget(opt.id as any)}
                    className="mt-0.5 accent-rose-600"
                  />
                  <div>
                    <span className="block">{opt.label}</span>
                    <span className="text-[10px] text-textMuted font-normal block">{opt.desc}</span>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowPanicModal(false)}
                className="rounded-md border border-border bg-surface px-4 py-2 text-xs font-semibold text-textMain hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel / Stand Down
              </button>
              <button
                onClick={() => triggerPanicCloseAll(panicTarget)}
                className="rounded-md bg-rose-600 px-5 py-2 text-xs font-bold text-white hover:bg-rose-700 transition-all cursor-pointer"
              >
                CONFIRM FLATTEN ({panicTarget})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Drawer Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden transition-opacity duration-300"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ========================================================================= */}
      {/* SIDEBAR (Responsive Sliding Drawer on Mobile / Collapsible on Desktop) */}
      {/* ========================================================================= */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-surface border-r border-border flex flex-col h-full shrink-0 shadow-2xl lg:shadow-none transition-all duration-300 ease-in-out lg:static ${
          sidebarCollapsed ? "lg:w-20 w-72" : "lg:w-64 w-72"
        } ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo & Collapse Header */}
        <div className={`h-16 flex items-center border-b border-border transition-all duration-200 ${
          sidebarCollapsed ? "justify-center px-2" : "justify-between px-4 sm:px-5"
        }`}>
          <div className="flex items-center overflow-hidden">
            <div className="w-8 h-8 bg-brand-900 rounded flex items-center justify-center shrink-0 shadow-2xs">
              <Activity className="text-white w-5 h-5" />
            </div>
            {!sidebarCollapsed && (
              <div className="ml-3 transition-opacity duration-200 whitespace-nowrap overflow-hidden">
                <h1 className="font-bold text-sm tracking-wide leading-tight">alifcrptoai</h1>
                <span className="text-[10px] text-textMuted font-medium uppercase tracking-wider">By Alifu Haji</span>
              </div>
            )}
          </div>

          {/* Desktop Toggle Button */}
          <button
            onClick={toggleSidebar}
            className={`hidden lg:flex p-1.5 text-textMuted hover:text-textMain hover:bg-slate-100 rounded-md transition-colors cursor-pointer ${
              sidebarCollapsed ? "mt-0" : ""
            }`}
            title={sidebarCollapsed ? "Expand Sidebar (Ctrl+\\)" : "Collapse Sidebar (Ctrl+\\)"}
            aria-label="Toggle Sidebar"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4 text-slate-600" />
            ) : (
              <PanelLeftClose className="w-4 h-4 text-slate-600" />
            )}
          </button>

          {/* Mobile Close Button */}
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-1.5 text-textMuted hover:text-textMain rounded-lg lg:hidden hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close Navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {/* Section 1: Trading Desk */}
          <div>
            {!sidebarCollapsed ? (
              <p className="px-3 text-[10px] font-bold text-textMuted uppercase tracking-wider mb-2">Trading Desk</p>
            ) : (
              <div className="my-1.5 border-t border-border/40 mx-2" />
            )}

            {/* 1. Overview & KPIs (Default Home Dashboard) */}
            <button
              onClick={() => {
                setActiveSection("overview");
                setMobileMenuOpen(false);
              }}
              title="Overview & KPIs"
              className={`flex w-full items-center rounded-md text-sm font-medium transition-colors cursor-pointer ${
                sidebarCollapsed ? "justify-center p-2.5" : "px-3 py-2"
              } ${
                activeSection === "overview"
                  ? "bg-brand-50 text-brand-600 font-semibold shadow-2xs"
                  : "text-textMuted hover:text-textMain hover:bg-slate-50"
              }`}
            >
              <LayoutDashboard className={`w-4 h-4 text-slate-700 shrink-0 ${!sidebarCollapsed ? "mr-3" : ""}`} />
              {!sidebarCollapsed && <span>Overview &amp; KPIs</span>}
            </button>

            {/* 2. Live Execution Chart */}
            <button
              onClick={() => {
                setActiveSection("chart");
                setMobileMenuOpen(false);
              }}
              title="Live Execution Chart"
              className={`flex w-full items-center rounded-md text-sm font-medium transition-colors cursor-pointer mt-1 relative ${
                sidebarCollapsed ? "justify-center p-2.5" : "justify-between px-3 py-2"
              } ${
                activeSection === "chart"
                  ? "bg-brand-50 text-brand-600 font-semibold shadow-2xs"
                  : "text-textMuted hover:text-textMain hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center">
                <LineChart className={`w-4 h-4 text-cyan-600 shrink-0 ${!sidebarCollapsed ? "mr-3" : ""}`} />
                {!sidebarCollapsed && <span>Live Execution Chart</span>}
              </div>
              {openTrades.length > 0 && (
                sidebarCollapsed ? (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
                ) : (
                  <span className="bg-cyan-100 text-cyan-800 text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                    {openTrades.length} Active
                  </span>
                )
              )}
            </button>

            {/* 3. Live Positions */}
            <button
              onClick={() => {
                setActiveSection("positions");
                setMobileMenuOpen(false);
              }}
              title="Live Positions"
              className={`flex w-full items-center rounded-md text-sm font-medium transition-colors cursor-pointer mt-1 relative ${
                sidebarCollapsed ? "justify-center p-2.5" : "justify-between px-3 py-2"
              } ${
                activeSection === "positions"
                  ? "bg-brand-50 text-brand-600 font-semibold shadow-2xs"
                  : "text-textMuted hover:text-textMain hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center">
                <Layers className={`w-4 h-4 text-brand-500 shrink-0 ${!sidebarCollapsed ? "mr-3" : ""}`} />
                {!sidebarCollapsed && <span>Live Positions</span>}
              </div>
              {openTrades.length > 0 && (
                sidebarCollapsed ? (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand-500 rounded-full" />
                ) : (
                  <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-sm">
                    {openTrades.length}
                  </span>
                )
              )}
            </button>

            {/* 4. Trading Journal */}
            <button
              onClick={() => {
                setActiveSection("journal");
                setMobileMenuOpen(false);
              }}
              title="Trading Journal"
              className={`flex w-full items-center rounded-md text-sm font-medium transition-colors cursor-pointer mt-1 ${
                sidebarCollapsed ? "justify-center p-2.5" : "px-3 py-2"
              } ${
                activeSection === "journal"
                  ? "bg-brand-50 text-brand-600 font-semibold shadow-2xs"
                  : "text-textMuted hover:text-textMain hover:bg-slate-50"
              }`}
            >
              <BookOpen className={`w-4 h-4 text-purple-600 shrink-0 ${!sidebarCollapsed ? "mr-3" : ""}`} />
              {!sidebarCollapsed && <span>Trading Journal</span>}
            </button>

            {/* 5. Strategy Analytics */}
            <button
              onClick={() => {
                setActiveSection("strategies");
                setMobileMenuOpen(false);
              }}
              title="Strategy Analytics"
              className={`flex w-full items-center rounded-md text-sm font-medium transition-colors cursor-pointer mt-1 ${
                sidebarCollapsed ? "justify-center p-2.5" : "px-3 py-2"
              } ${
                activeSection === "strategies"
                  ? "bg-brand-50 text-brand-600 font-semibold shadow-2xs"
                  : "text-textMuted hover:text-textMain hover:bg-slate-50"
              }`}
            >
              <TrendingUp className={`w-4 h-4 text-brand-600 shrink-0 ${!sidebarCollapsed ? "mr-3" : ""}`} />
              {!sidebarCollapsed && <span>Strategy Analytics</span>}
            </button>

            {/* 6. Backtest Lab */}
            <button
              onClick={() => {
                setActiveSection("backtest");
                setMobileMenuOpen(false);
              }}
              title="1-Year Historical Backtest Lab"
              className={`flex w-full items-center rounded-md text-sm font-medium transition-colors cursor-pointer mt-1 ${
                sidebarCollapsed ? "justify-center p-2.5" : "px-3 py-2"
              } ${
                activeSection === "backtest"
                  ? "bg-brand-50 text-brand-600 font-semibold shadow-2xs"
                  : "text-textMuted hover:text-textMain hover:bg-slate-50"
              }`}
            >
              <History className={`w-4 h-4 text-emerald-600 shrink-0 ${!sidebarCollapsed ? "mr-3" : ""}`} />
              {!sidebarCollapsed && <span>Backtest Lab</span>}
            </button>
          </div>

          {/* Section 2: Market Intelligence */}
          <div>
            {!sidebarCollapsed ? (
              <p className="px-3 text-[10px] font-bold text-textMuted uppercase tracking-wider mb-2">Market Intelligence</p>
            ) : (
              <div className="my-2 border-t border-border/40 mx-2" />
            )}
            <button
              onClick={() => {
                setActiveSection("news");
                setMobileMenuOpen(false);
              }}
              title="Market & Macro News"
              className={`flex w-full items-center rounded-md text-sm font-medium transition-colors cursor-pointer relative ${
                sidebarCollapsed ? "justify-center p-2.5" : "justify-between px-3 py-2"
              } ${
                activeSection === "news"
                  ? "bg-brand-50 text-brand-600 font-semibold shadow-2xs"
                  : "text-textMuted hover:text-textMain hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center">
                <Newspaper className={`w-4 h-4 text-indigo-600 shrink-0 ${!sidebarCollapsed ? "mr-3" : ""}`} />
                {!sidebarCollapsed && <span>Market &amp; Macro News</span>}
              </div>
              {newsItems.length > 0 && (
                sidebarCollapsed ? (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                ) : (
                  <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-sm">
                    {newsItems.length}
                  </span>
                )
              )}
            </button>
          </div>

          {/* Section 3: AI Intelligence */}
          <div>
            {!sidebarCollapsed ? (
              <p className="px-3 text-[10px] font-bold text-textMuted uppercase tracking-wider mb-2">AI Intelligence</p>
            ) : (
              <div className="my-2 border-t border-border/40 mx-2" />
            )}
            <button
              onClick={() => {
                setActiveSection("audits");
                setMobileMenuOpen(false);
              }}
              title="AI Risk Audits"
              className={`flex w-full items-center rounded-md text-sm font-medium transition-colors cursor-pointer relative ${
                sidebarCollapsed ? "justify-center p-2.5" : "justify-between px-3 py-2"
              } ${
                activeSection === "audits"
                  ? "bg-brand-50 text-brand-600 font-semibold shadow-2xs"
                  : "text-textMuted hover:text-textMain hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center">
                <Cpu className={`w-4 h-4 text-blue-600 shrink-0 ${!sidebarCollapsed ? "mr-3" : ""}`} />
                {!sidebarCollapsed && <span>DeepSeek Audits</span>}
              </div>
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0" />
            </button>

            <button
              onClick={() => {
                setActiveSection("autopsies");
                setMobileMenuOpen(false);
              }}
              title="Self-Learning Engine"
              className={`flex w-full items-center rounded-md text-sm font-medium transition-colors cursor-pointer mt-1 relative ${
                sidebarCollapsed ? "justify-center p-2.5" : "justify-between px-3 py-2"
              } ${
                activeSection === "autopsies"
                  ? "bg-brand-50 text-brand-600 font-semibold shadow-2xs"
                  : "text-textMuted hover:text-textMain hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center">
                <BrainCircuit className={`w-4 h-4 text-emerald-600 shrink-0 ${!sidebarCollapsed ? "mr-3" : ""}`} />
                {!sidebarCollapsed && <span>Self-Learning</span>}
              </div>
              {lessons.filter((l) => l.status === "PENDING").length > 0 && (
                sidebarCollapsed ? (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full" />
                ) : (
                  <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded-sm">
                    {lessons.filter((l) => l.status === "PENDING").length}
                  </span>
                )
              )}
            </button>
          </div>

          {/* Section 4: Management */}
          <div>
            {!sidebarCollapsed ? (
              <p className="px-3 text-[10px] font-bold text-textMuted uppercase tracking-wider mb-2">Management</p>
            ) : (
              <div className="my-2 border-t border-border/40 mx-2" />
            )}
            <button
              onClick={() => {
                setActiveSection("settings");
                setMobileMenuOpen(false);
              }}
              title="Risk & Settings"
              className={`flex w-full items-center rounded-md text-sm font-medium transition-colors cursor-pointer ${
                sidebarCollapsed ? "justify-center p-2.5" : "px-3 py-2"
              } ${
                activeSection === "settings"
                  ? "bg-brand-50 text-brand-600 font-semibold shadow-2xs"
                  : "text-textMuted hover:text-textMain hover:bg-slate-50"
              }`}
            >
              <SlidersHorizontal className={`w-4 h-4 text-slate-700 shrink-0 ${!sidebarCollapsed ? "mr-3" : ""}`} />
              {!sidebarCollapsed && <span>Risk &amp; Settings</span>}
            </button>
          </div>
        </nav>

        {/* User Profile */}
        <div className="p-3 border-t border-border">
          <div className={`flex items-center ${sidebarCollapsed ? "flex-col gap-2 justify-center" : "justify-between"}`}>
            <div className="flex items-center overflow-hidden" title="Alifu Haji • Operator">
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-700 shrink-0 shadow-2xs">
                AH
              </div>
              {!sidebarCollapsed && (
                <div className="ml-3 transition-opacity duration-200 whitespace-nowrap overflow-hidden">
                  <p className="text-sm font-semibold leading-tight">Alifu Haji</p>
                  <p className="text-[10px] text-emerald-600 font-medium flex items-center mt-0.5">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1.5"></span> Realtime Active
                  </p>
                </div>
              )}
            </div>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                supabase.auth.signOut().then(() => router.push("/login"));
              }}
              className="text-textMuted hover:text-textMain p-1.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4 text-slate-500 hover:text-rose-600" />
            </button>
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* MAIN CONTENT */}
      {/* ========================================================================= */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* TOP HEADER */}
        <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-3 sm:px-6 shrink-0">
          <div className="flex items-center space-x-2 text-sm text-textMuted min-w-0">
            {/* Mobile Hamburger Toggle Button */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-1.5 -ml-1 mr-1 text-textMuted hover:text-textMain rounded-lg lg:hidden hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
              aria-label="Open Navigation"
            >
              <Menu className="w-5 h-5 text-slate-700" />
            </button>

            {/* Desktop Expand Button when Sidebar is Collapsed */}
            {sidebarCollapsed && (
              <button
                onClick={toggleSidebar}
                className="hidden lg:flex p-1.5 -ml-2 mr-2 text-textMuted hover:text-textMain hover:bg-slate-100 rounded-md transition-colors cursor-pointer shrink-0"
                title="Expand Sidebar (Ctrl+\)"
              >
                <PanelLeftOpen className="w-4 h-4 text-slate-700" />
              </button>
            )}

            <span className="hidden sm:inline">DESK</span>
            <ChevronRight className="w-3 h-3 hidden sm:inline" />
            <span className="font-semibold text-textMain capitalize truncate text-xs sm:text-sm">
              {activeSection === "chart" && "Live Execution Chart & Positions"}
              {activeSection === "journal" && "Trading Journal & Analytics"}
              {activeSection === "overview" && "Executive Telemetry & Balance"}
              {activeSection === "positions" && "Live Positions"}
              {activeSection === "strategies" && "Strategy Leaderboard"}
              {activeSection === "backtest" && "Institutional Backtest Lab"}
              {activeSection === "news" && "Market & Macro News"}
              {activeSection === "audits" && "DeepSeek Audits"}
              {activeSection === "autopsies" && "AI Self-Learning & Autopsies"}
              {activeSection === "settings" && "Risk & Settings"}
            </span>
          </div>

          {/* Status Toggles & Panic Button */}
          <div className="flex items-center space-x-1.5 sm:space-x-3 text-xs font-medium shrink-0">
            {/* World Session Clock Widget */}
            <div
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 border border-border bg-slate-50/90 rounded-md text-xs font-mono shadow-2xs"
              title={liveForexSession.description}
            >
              <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="font-semibold text-textMain tabular-nums">{utcClockStr || "00:00:00"} UTC</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${liveForexSession.badgeClass}`}>
                {liveForexSession.name}
              </span>
            </div>

            {/* Exchange Operating Mode Indicator */}
            <div className={`hidden sm:flex items-center px-2 sm:px-2.5 py-1.5 rounded-md border text-xs font-semibold ${
              config?.exchange_mode === "dual"
                ? "bg-purple-50 border-purple-200 text-purple-700"
                : config?.exchange_mode === "bybit"
                ? "bg-amber-50 border-amber-200 text-amber-700"
                : "bg-blue-50 border-blue-200 text-blue-700"
            }`}>
              <Layers className="w-3.5 h-3.5 mr-1.5 shrink-0" />
              <span>{config?.exchange_mode === "dual" ? "DUAL (CRYPTO + FX)" : config?.exchange_mode === "bybit" ? "BYBIT (FOREX)" : "BINANCE (CRYPTO)"}</span>
            </div>

            {/* AI Provider Indicator */}
            <div className={`hidden md:flex items-center px-2 sm:px-2.5 py-1.5 rounded-md border text-xs font-semibold ${
              config?.ai_provider === "technical"
                ? "bg-amber-50 border-amber-300 text-amber-800 shadow-2xs"
                : (config?.ai_provider || "council_3model") === "council_3model"
                ? "bg-purple-50 border-purple-200 text-purple-700"
                : config?.ai_provider === "gemini"
                ? "bg-blue-50 border-blue-200 text-blue-700"
                : config?.ai_provider === "auto"
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-indigo-50 border-indigo-200 text-indigo-700"
            }`}>
              <Cpu className="w-3.5 h-3.5 mr-1.5 shrink-0" />
              <span>{
                config?.ai_provider === "technical"
                  ? "⚡ RAW TECHNICAL"
                  : (config?.ai_provider || "council_3model") === "council_3model"
                  ? "🏛️ 3-MODEL COUNCIL"
                  : config?.ai_provider === "gemini"
                  ? "GEMINI (FREE)"
                  : config?.ai_provider === "auto"
                  ? "HYBRID (DS+GEMINI)"
                  : "DEEPSEEK"
              }</span>
            </div>

            <button
              onClick={toggleBotActive}
              className={`flex items-center px-2 sm:px-2.5 py-1.5 rounded-md border transition-colors cursor-pointer text-xs ${
                config?.is_active
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-amber-50 border-amber-200 text-amber-700"
              }`}
            >
              {config?.is_active ? (
                <PlayCircle className="w-3.5 h-3.5 sm:mr-1.5" />
              ) : (
                <PauseCircle className="w-3.5 h-3.5 sm:mr-1.5" />
              )}
              <span className="hidden sm:inline">{config?.is_active ? "RUNNING" : "PAUSED"}</span>
            </button>

            <button
              onClick={toggleSandboxMode}
              className={`flex items-center px-2 sm:px-2.5 py-1.5 rounded-md border transition-colors cursor-pointer text-xs ${
                config?.sandbox_mode
                  ? "bg-blue-50 border-blue-200 text-blue-700"
                  : "bg-rose-50 border-rose-200 text-rose-700"
              }`}
            >
              <Radio className="w-3.5 h-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">{config?.sandbox_mode ? "TESTNET / DEMO" : "LIVE BINANCE"}</span>
              <span className="sm:hidden">{config?.sandbox_mode ? "DEMO" : "LIVE"}</span>
            </button>

            <div className="hidden lg:flex items-center px-2.5 py-1.5 border border-border text-textMain rounded-md">
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5 text-emerald-500" /> NORMAL
            </div>

            <div className="hidden xl:flex items-center px-2.5 py-1.5 border border-border text-textMain rounded-md tabular-nums">
              <Gauge className="w-3.5 h-3.5 mr-1.5 text-brand-500" /> {calculatedExposure.current}% / {calculatedExposure.max}%
            </div>

            <button
              onClick={() => setShowPanicModal(true)}
              className="flex items-center px-2 sm:px-3 py-1.5 border border-rose-600 text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer text-xs font-bold"
            >
              <AlertOctagon className="w-3.5 h-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">PANIC CLOSE</span>
              <span className="sm:hidden">PANIC</span>
            </button>
          </div>
        </header>

        {/* SCROLLABLE DASHBOARD AREA */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 lg:p-6 space-y-4 sm:space-y-6">
          {/* ========================================================================= */}
          {/* TAB 1: EXECUTIVE OVERVIEW */}
          {/* ========================================================================= */}
          {activeSection === "overview" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-semibold tracking-tight">Executive Overview &amp; Telemetry</h2>
              </div>

              {/* Zero-Balance Analytical Mode Banner */}
              {Number(latestSnapshot?.equity_usdt ?? 0) <= 0 && !config?.sandbox_mode && (
                <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-purple-50 border border-purple-200/80 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-start sm:items-center space-x-3">
                    <div className="p-2.5 bg-purple-600 text-white rounded-lg shrink-0 mt-0.5 sm:mt-0 shadow-xs">
                      <BrainCircuit className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full border border-purple-200">
                          Analytical Mode Active
                        </span>
                        <span className="text-xs font-bold text-purple-900">
                          Binance Balance: $0.00
                        </span>
                      </div>
                      <p className="text-xs text-purple-800 mt-1 leading-relaxed">
                        Continuous 15m candlestick scanning and DeepSeek AI Risk Audits are actively running. Candidate setups are tracked in paper mode with exact Entry, SL, and TP (+2.2R) targets so you never miss an edge while funding your account.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveSection("audits")}
                    className="shrink-0 px-3.5 py-1.5 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors cursor-pointer shadow-xs"
                  >
                    View AI Audits &rarr;
                  </button>
                </div>
              )}

              {/* KPI CARDS GRID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {/* Card 1 */}
                <div className="bg-surface border border-border rounded-lg p-5 flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-[11px] font-bold text-textMuted uppercase tracking-wider">
                      Total USDT Equity
                    </span>
                    <DollarSign className="w-4 h-4 text-slate-300" />
                  </div>
                  <div>
                    <div className="text-3xl font-bold tabular-nums tracking-tight">
                      ${Number(latestSnapshot?.equity_usdt ?? 0.0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <div className="flex items-center text-xs text-brand-600 font-medium mt-2">
                      <TrendingUp className="w-3.5 h-3.5 mr-1" /> Binance USDT-M Futures Mark
                    </div>
                  </div>
                </div>

                {/* Card 2 */}
                <div className="bg-surface border border-border rounded-lg p-5 flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-[11px] font-bold text-textMuted uppercase tracking-wider">
                      Available Free Margin
                    </span>
                    <Activity className="w-4 h-4 text-slate-300" />
                  </div>
                  <div>
                    <div className="text-3xl font-bold tabular-nums tracking-tight">
                      ${Number(latestSnapshot?.free_usdt ?? 0.0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3">
                      <div
                        className="bg-brand-500 h-1.5 rounded-full transition-all duration-500"
                        style={{
                          width: `${
                            Number(latestSnapshot?.equity_usdt ?? 0) > 0
                              ? Math.min(
                                  100,
                                  ((Number(latestSnapshot?.free_usdt ?? 0) /
                                    Number(latestSnapshot?.equity_usdt ?? 1)) *
                                    100)
                                )
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Card 3 */}
                <div className="bg-surface border border-border rounded-lg p-5 flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-[11px] font-bold text-textMuted uppercase tracking-wider">
                      Today's Realized P&amp;L
                    </span>
                    {(latestSnapshot?.daily_pnl_usdt || 0) >= 0 ? (
                      <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4 text-rose-500" />
                    )}
                  </div>
                  <div>
                    <div
                      className={`text-3xl font-bold tabular-nums tracking-tight ${
                        (latestSnapshot?.daily_pnl_usdt || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {(latestSnapshot?.daily_pnl_usdt || 0) >= 0 ? "+" : ""}$
                      {Number(latestSnapshot?.daily_pnl_usdt || 0).toFixed(2)}
                    </div>
                    <div className="text-xs text-textMuted mt-2 font-medium">Closed trades since 00:00 UTC</div>
                  </div>
                </div>

                {/* Card 4 */}
                <div className="bg-surface border border-border rounded-lg p-5 flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-[11px] font-bold text-textMuted uppercase tracking-wider">
                      Win Rate / Active
                    </span>
                    <Target className="w-4 h-4 text-slate-300" />
                  </div>
                  <div>
                    <div className="text-3xl font-bold tabular-nums tracking-tight">{overallStats.winRate}%</div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-textMuted font-medium">
                        {overallStats.totalWins} Wins / {overallStats.totalClosed - overallStats.totalWins} Losses
                      </span>
                      <span className="bg-brand-50 text-brand-600 text-[10px] font-bold px-2 py-0.5 rounded border border-brand-100">
                        {openTrades.length} Active
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* CHART SECTION */}
              <div className="bg-surface border border-border rounded-lg p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-textMain">Portfolio Performance &amp; Equity Growth</h3>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-brand-50 text-brand-600 border border-brand-100">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse"></span>
                        Live Ledger
                      </span>
                    </div>
                    <p className="text-xs text-textMuted mt-1">
                      Continuous capital valuation synchronized from Binance Futures account snapshots
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={recordSnapshotNow}
                      title="Record an instant balance snapshot to database"
                      className="px-2.5 py-1 text-xs font-medium rounded border border-border bg-surface hover:bg-slate-50 text-textMuted hover:text-textMain flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3 text-brand-500" />
                      <span>Sync Mark</span>
                    </button>
                    <div className="flex bg-slate-100 p-1 rounded-md">
                      {(["24H", "7D", "30D", "ALL"] as const).map((tf) => (
                        <button
                          key={tf}
                          onClick={() => setChartTimeframe(tf)}
                          className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                            chartTimeframe === tf
                              ? "bg-surface text-textMain shadow-xs border border-border font-semibold"
                              : "text-textMuted hover:text-textMain"
                          }`}
                        >
                          {tf}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* High / Low Bounds Header */}
                <div className="flex justify-between items-center text-[11px] font-medium text-textMuted border-b border-border pb-2.5 mb-3">
                  <span className="flex items-center gap-1.5">
                    <span>High:</span>
                    <span className="text-textMain font-bold tabular-nums">
                      ${chartStats.max.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span>Low:</span>
                    <span className="text-textMain font-bold tabular-nums">
                      ${chartStats.min.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </span>
                </div>

                {/* Chart.js Canvas Container */}
                <div className="relative w-full h-72">
                  <Line data={chartJsData} options={chartOptions} />
                </div>

                {/* Labels Bottom */}
                <div className="flex flex-wrap items-center justify-between text-[11px] font-medium text-textMuted border-t border-border pt-3 mt-2">
                  <span>Start: {chartStats.start}</span>
                  <span className="flex items-center text-brand-600 font-semibold gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-brand-500"></span>
                    <span>Cumulative Equity</span>
                    <span className="bg-brand-50 text-brand-700 text-[10px] font-mono px-1.5 py-0.2 rounded border border-brand-100 ml-1">
                      {chartStats.count} Points
                    </span>
                  </span>
                  <span>Latest: {chartStats.end}</span>
                </div>
              </div>

              {/* MIDDLE SECTION (2 Columns) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Active Positions */}
                <div className="bg-surface border border-border rounded-lg flex flex-col">
                  <div className="px-5 py-4 border-b border-border flex justify-between items-center">
                    <h3 className="text-sm font-semibold flex items-center">
                      <Layers className="w-4 h-4 mr-2 text-brand-500" /> Active Positions ({openTrades.length})
                    </h3>
                    <button
                      onClick={() => setActiveSection("positions")}
                      className="text-xs font-medium text-brand-600 hover:text-brand-700 flex items-center cursor-pointer"
                    >
                      View All <ChevronRight className="w-3 h-3 ml-0.5" />
                    </button>
                  </div>
                  {openTrades.length === 0 ? (
                    <div className="flex-1 p-5 flex items-center justify-center bg-slate-50/50 m-4 border border-dashed border-slate-200 rounded text-center">
                      <p className="text-xs text-textMuted max-w-sm">
                        No active positions. Multi-strategy scanner is monitoring 15m candle streams.
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 space-y-2">
                      {openTrades.slice(0, 3).map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between p-3 rounded border border-border bg-slate-50/50 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center space-x-3">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                t.side === "LONG"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-rose-50 text-rose-700 border-rose-200"
                              }`}
                            >
                              {t.side}
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-textMain">{t.symbol}</p>
                              <p className="text-[10px] text-textMuted">{t.strategy_name}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-semibold tabular-nums">${Number(t.entry_price).toFixed(2)}</p>
                            <p className="text-[10px] text-emerald-600 font-medium tabular-nums">
                              MFE: +{Number(t.mfe_r || 0).toFixed(2)}R
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Risk Audits */}
                <div className="bg-surface border border-border rounded-lg flex flex-col">
                  <div className="px-5 py-4 border-b border-border flex justify-between items-center">
                    <h3 className="text-sm font-semibold flex items-center">
                      <ShieldAlert className="w-4 h-4 mr-2 text-brand-500" /> Latest AI Risk Audits
                    </h3>
                    <button
                      onClick={() => setActiveSection("audits")}
                      className="text-xs font-medium text-brand-600 hover:text-brand-700 flex items-center cursor-pointer"
                    >
                      Audit Stream <ChevronRight className="w-3 h-3 ml-0.5" />
                    </button>
                  </div>
                  {recentAudits.length === 0 ? (
                    <div className="flex-1 p-5 flex items-center justify-center bg-slate-50/50 m-4 border border-dashed border-slate-200 rounded text-center">
                      <p className="text-xs text-textMuted max-w-sm">
                        Awaiting candidate setups to trigger Chief Quantitative Risk Officer audits.
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 space-y-2">
                      {recentAudits.slice(0, 3).map((a) => {
                        const isVetoed = a.veto_triggered || a.total_score < (config?.min_score || 65);
                        return (
                          <div
                            key={a.id}
                            className="flex items-center justify-between p-3 rounded border border-border bg-slate-50/50 hover:bg-slate-50 transition-colors"
                          >
                            <div className="flex items-center space-x-3">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                  isVetoed
                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                }`}
                              >
                                {isVetoed ? "VETOED" : "PASSED"}
                              </span>
                              <div>
                                <p className="text-xs font-semibold text-textMain">
                                  {a.symbol} ({a.proposed_direction})
                                </p>
                                <p className="text-[10px] text-textMuted truncate max-w-[200px]">{a.strategy_name}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-bold tabular-nums text-textMain">{a.total_score}</span>
                              <span className="text-[10px] text-textMuted">/100</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* BOTTOM SECTION (Market Catalysts & Macro Radar) */}
              <div className="bg-surface border border-border rounded-lg">
                <div className="px-5 py-4 border-b border-border flex justify-between items-center">
                  <h3 className="text-sm font-semibold flex items-center">
                    <Radar className="w-4 h-4 mr-2 text-brand-500" /> Market Catalysts &amp; Macro Radar
                  </h3>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => fetchNewsFromApi(true)}
                      disabled={isSyncingNews}
                      className="flex items-center px-3 py-1.5 text-xs font-medium border border-border text-textMain hover:bg-slate-50 rounded transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 mr-1.5 ${isSyncingNews ? "animate-spin text-brand-600" : ""}`} />
                      <span>{isSyncingNews ? "Syncing..." : "Sync News"}</span>
                    </button>
                    <button
                      onClick={() => setActiveSection("news")}
                      className="flex items-center px-3 py-1.5 text-xs font-medium bg-brand-50 text-brand-600 border border-brand-100 hover:bg-brand-100 rounded transition-colors cursor-pointer"
                    >
                      <span>Full News Desk</span>
                      <ArrowRight className="w-3 h-3 ml-1.5" />
                    </button>
                  </div>
                </div>

                {/* News List */}
                <div className="divide-y divide-border">
                  {newsItems.length === 0 ? (
                    <div className="p-8 text-center text-xs text-textMuted">
                      No news synced yet. Click &quot;Sync News&quot; above to populate the database.
                    </div>
                  ) : (
                    newsItems.slice(0, 5).map((item, idx) => {
                      const sentiment = (item.sentiment || "NEUTRAL").toUpperCase();
                      const isBull = sentiment === "BULLISH";
                      const isBear = sentiment === "BEARISH";
                      const coin = item.coin || (item.category === "macro" ? "USD" : "CRYPTO");

                      return (
                        <div
                          key={item.id || idx}
                          className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center space-x-4 min-w-0 mr-4">
                            <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                              {coin}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-textMain truncate">{item.title}</p>
                              <p className="text-[11px] text-textMuted mt-0.5">{item.source}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-6 shrink-0">
                            <div
                              className={`flex items-center text-[11px] font-medium ${
                                isBull ? "text-emerald-600" : isBear ? "text-rose-600" : "text-slate-500"
                              }`}
                            >
                              <div
                                className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                                  isBull ? "bg-emerald-500" : isBear ? "bg-rose-500" : "bg-slate-400"
                                }`}
                              />
                              <span>{sentiment}</span>
                            </div>
                            <span className="text-[11px] text-textMuted flex items-center w-20 justify-end">
                              <Clock className="w-3 h-3 mr-1" />
                              {formatTimeAgo(item.published_at)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Spacer for bottom padding */}
              <div className="h-4"></div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 1: LIVE EXECUTION CHART & POSITIONS */}
          {/* ========================================================================= */}
          {(activeSection === "chart" || activeSection === "positions") && (
            <div className="space-y-6">
              {/* Dual-Mode Live Execution Chart with Historical Entry/Exit Markers */}
              <LiveTradeChart
                openTrades={openTrades}
                closedTrades={closedTrades}
                focusedTrade={focusedTrade}
                onClearFocus={() => setFocusedTrade(null)}
                availableSymbols={config?.symbols || ["BTC/USDT", "ETH/USDT", "SOL/USDT"]}
              />

              {/* Positions Table Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Institutional Positions Ledger</h2>
                  <p className="text-xs text-textMuted mt-0.5">
                    Active server-side conditional trades protected across Binance Futures and Bybit UTA with trailing telemetry
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Exchange Filter Pills */}
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-md text-[11px]">
                    <button
                      type="button"
                      onClick={() => setSelectedExchangeFilter("ALL")}
                      className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                        selectedExchangeFilter === "ALL" ? "bg-white text-textMain shadow-2xs font-semibold" : "text-textMuted hover:text-textMain"
                      }`}
                    >
                      All ({openTrades.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedExchangeFilter("binance")}
                      className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                        selectedExchangeFilter === "binance" ? "bg-white text-brand-700 shadow-2xs font-semibold" : "text-textMuted hover:text-textMain"
                      }`}
                    >
                      Binance ({openTrades.filter((t) => !t.exchange || t.exchange === "binance").length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedExchangeFilter("bybit")}
                      className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                        selectedExchangeFilter === "bybit" ? "bg-white text-amber-700 shadow-2xs font-semibold" : "text-textMuted hover:text-textMain"
                      }`}
                    >
                      Bybit FX ({openTrades.filter((t) => t.exchange === "bybit").length})
                    </button>
                  </div>
                  <button
                    onClick={fetchAllData}
                    className="flex items-center px-3 py-1.5 text-xs font-medium border border-border text-textMain hover:bg-slate-50 rounded transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh Orders
                  </button>
                </div>
              </div>

              {openTrades.length === 0 ? (
                <div className="bg-surface border border-border rounded-lg p-12 text-center">
                  <Layers className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                  <h4 className="text-sm font-semibold text-textMain">No Open Positions</h4>
                  <p className="text-xs text-textMuted mt-1">
                    The autonomous bot is actively scanning 15m candles across Binance &amp; Bybit for institutional setups.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto bg-surface border border-border rounded-lg">
                  <table className="w-full text-left text-xs min-w-[750px]">
                    <thead className="border-b border-border bg-slate-50 text-textMuted uppercase font-semibold text-[10px] tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Symbol / Strategy</th>
                        <th className="py-3 px-4 text-center">Exchange / Asset</th>
                        <th className="py-3 px-4 text-center">Direction</th>
                        <th className="py-3 px-4 text-right">Entry Price</th>
                        <th className="py-3 px-4 text-right">Stop Loss</th>
                        <th className="py-3 px-4 text-right">Take Profit</th>
                        <th className="py-3 px-4 text-center">Live R / MFE</th>
                        <th className="py-3 px-4 text-center">Protection Status</th>
                        <th className="py-3 px-4 text-center">Hold Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {openTrades
                        .filter((t) => selectedExchangeFilter === "ALL" || (t.exchange || "binance") === selectedExchangeFilter)
                        .map((t) => {
                        const isSim =
                          Boolean(t.is_simulated) ||
                          String(t.exchange_order_id || "").startsWith("ANALYTICS_") ||
                          String(t.exchange_order_id || "").startsWith("sim_");
                        const isFx = t.asset_class === "forex" || t.asset_class === "commodity";

                        return (
                        <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-semibold text-textMain">{t.symbol}</span>
                              {isSim ? (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-50 text-purple-700 border border-purple-200"
                                  title="Zero-Balance Analytical Signal (Paper Tracking)"
                                >
                                  ANALYTICAL
                                </span>
                              ) : (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  title="Live Margin Execution"
                                >
                                  LIVE
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-brand-600">{t.strategy_name}</div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <div className="inline-flex flex-col items-center gap-0.5">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                                t.exchange === "bybit" ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-blue-100 text-blue-800 border border-blue-200"
                              }`}>
                                {t.exchange === "bybit" ? "BYBIT UTA" : "BINANCE"}
                              </span>
                              <span className="text-[9px] text-textMuted uppercase font-semibold">
                                {t.asset_class || (isFx ? "FOREX" : "CRYPTO")}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] font-bold border ${
                                t.side === "LONG"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-rose-50 text-rose-700 border-rose-200"
                              }`}
                            >
                              {t.side}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right text-textMain font-semibold tabular-nums">
                            ${Number(t.entry_price).toFixed(isFx ? 4 : (Number(t.entry_price) < 1 ? 6 : 4))}
                          </td>
                          <td className="py-3.5 px-4 text-right text-rose-600 font-semibold tabular-nums">
                            ${Number(t.stop_loss).toFixed(isFx ? 4 : (Number(t.stop_loss) < 1 ? 6 : 4))}
                          </td>
                          <td className="py-3.5 px-4 text-right text-emerald-600 font-semibold tabular-nums">
                            ${Number(t.take_profit).toFixed(isFx ? 4 : (Number(t.take_profit) < 1 ? 6 : 4))}
                          </td>
                          <td className="py-3.5 px-4 text-center tabular-nums">
                            <div className="font-semibold text-textMain">MFE: +{Number(t.mfe_r || 0).toFixed(2)}R</div>
                            <div className="text-[10px] text-textMuted">MAE: {Number(t.mae_r || 0).toFixed(2)}R</div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {t.breakeven_activated ? (
                              <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                <ShieldCheck className="h-3 w-3 text-emerald-600" />
                                RISK-FREE (+1R BE)
                              </span>
                            ) : (
                              <span className="text-textMuted text-[10px]">Open Risk Active</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center text-xs text-textMuted">
                            <div className="flex items-center justify-center gap-1">
                              <Clock className="h-3.5 w-3.5 text-slate-400" />
                              <span>Max {config?.max_hold_bars || 20} Bars</span>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Live AI Audits Stream inside Tab 1 */}
              <div className="space-y-3 pt-4 border-t border-border/70">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Cpu className="w-4 h-4 text-blue-600" />
                    <h3 className="text-sm font-bold text-textMain">Live AI Decision Stream (DeepSeek Conviction Audits)</h3>
                  </div>
                  <span className="text-xs text-textMuted">Latest {recentAudits.length} evaluations</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {recentAudits.slice(0, 6).map((audit) => (
                    <div
                      key={audit.id}
                      className="bg-surface border border-border rounded-lg p-3 space-y-2 text-xs shadow-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-textMain">{audit.symbol}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            audit.proposed_direction === "LONG"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-rose-50 text-rose-700 border-rose-200"
                          }`}
                        >
                          {audit.proposed_direction}
                        </span>
                      </div>
                      <div className="text-[11px] text-textMuted truncate">{audit.strategy_name}</div>
                      <div className="flex items-center justify-between pt-1 border-t border-border/50">
                        <span className="text-[11px] font-semibold">
                          Score:{" "}
                          <span className={audit.veto_triggered ? "text-rose-600" : "text-emerald-600"}>
                            {audit.total_score}/100
                          </span>
                        </span>
                        <span className="text-[10px] text-textMuted">
                          {new Date(audit.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: TRADING JOURNAL & ANALYTICS */}
          {/* ========================================================================= */}
          {activeSection === "journal" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Institutional Trading Journal &amp; Analytics</h2>
                  <p className="text-xs text-textMuted mt-0.5">
                    Multi-dimensional post-mortem ledger, expectancy calculations, MFE/MAE excursion metrics, and human review
                  </p>
                </div>
              </div>

              <TradingJournal
                onReplayTrade={(trade) => {
                  setFocusedTrade(trade);
                  setActiveSection("chart");
                  showToast(`Focusing trade #${trade.id} on Live Execution Canvas`, "info");
                }}
                showToast={showToast}
              />
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: STRATEGY PERFORMANCE LEADERBOARD */}
          {/* ========================================================================= */}
          {activeSection === "strategies" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Strategy Performance Leaderboard</h2>
                  <p className="text-xs text-textMuted mt-0.5">
                    Aggregated in real-time from PostgreSQL view <code>strategy_performance_view</code>
                  </p>
                </div>
                <button
                  onClick={fetchAllData}
                  className="flex items-center px-3 py-1.5 text-xs font-medium border border-border text-textMain hover:bg-slate-50 rounded transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh View
                </button>
              </div>

              {/* 6 Strategy Cards Summary Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                {ALL_STRATEGIES.map((strat) => {
                  const row = perfView.find((p) => p.strategy_name === strat.id);
                  const isEnabled = config?.active_strategies?.includes(strat.id);
                  const pf = Number(row?.profit_factor || 0);

                  return (
                    <div key={strat.id} className="bg-surface border border-border rounded-lg p-3.5 flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-textMain truncate" title={strat.label}>
                          {strat.label}
                        </span>
                        <span className={`h-2 w-2 rounded-full shrink-0 ${isEnabled ? "bg-emerald-500" : "bg-slate-300"}`} />
                      </div>
                      <span className="text-[10px] text-brand-600 font-medium truncate mb-2">{strat.regime}</span>
                      <div className="text-xl font-bold tabular-nums text-textMain">
                        {Number(row?.win_rate_pct || 0).toFixed(1)}%
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-textMuted tabular-nums">
                        <span>PF: {pf.toFixed(2)}</span>
                        <span>{row?.closed_trades || 0} Trades</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Leaderboard Table */}
              <div className="overflow-x-auto bg-surface border border-border rounded-lg">
                <table className="w-full text-left text-xs min-w-[720px]">
                  <thead className="border-b border-border bg-slate-50 text-textMuted uppercase font-semibold text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Strategy Plugin</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Closed (W / L)</th>
                      <th className="py-3 px-4 text-center">Win Rate</th>
                      <th className="py-3 px-4 text-center">Profit Factor</th>
                      <th className="py-3 px-4 text-center">Avg R-Multiple</th>
                      <th className="py-3 px-4 text-right">Net P&amp;L (USDT)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border tabular-nums">
                    {ALL_STRATEGIES.map((strat) => {
                      const stratName = strat.id;
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
                      if (pf >= 1.5) pfBadgeColor = "text-emerald-700 bg-emerald-50 border-emerald-200";
                      else if (pf >= 1.0) pfBadgeColor = "text-amber-700 bg-amber-50 border-amber-200";
                      else if (row.closed_trades > 0) pfBadgeColor = "text-rose-700 bg-rose-50 border-rose-200";

                      return (
                        <tr key={stratName} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3.5 px-4 font-semibold text-textMain">
                            <div className="flex items-center gap-2.5">
                              <span className={`h-2 w-2 rounded-full shrink-0 ${isEnabled ? "bg-emerald-500" : "bg-slate-300"}`} />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-textMain">{strat.label}</div>
                                <div className="text-[10px] text-textMuted flex items-center gap-1.5 font-mono">
                                  <span>{stratName}</span>
                                  <span>•</span>
                                  <span className="text-brand-600 font-sans">{strat.regime}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              onClick={() => toggleStrategyActive(stratName)}
                              className={`rounded px-2.5 py-1 text-[11px] font-semibold border transition-all cursor-pointer ${
                                isEnabled
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                  : "border-slate-200 bg-slate-100 text-slate-600 hover:text-textMain"
                              }`}
                            >
                              {isEnabled ? "ACTIVE" : "PAUSED"}
                            </button>
                          </td>
                          <td className="py-3.5 px-4 text-center text-textMuted">
                            {row.closed_trades} ({row.wins}W / {row.losses}L)
                          </td>
                          <td className="py-3.5 px-4 text-center font-semibold text-textMain">
                            {Number(row.win_rate_pct || 0).toFixed(1)}%
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className={`rounded border px-2 py-0.5 font-bold text-[10px] ${pfBadgeColor}`}>
                              {pf.toFixed(2)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center text-textMuted">
                            {Number(row.avg_r_multiple || 0).toFixed(2)}R
                          </td>
                          <td
                            className={`py-3.5 px-4 text-right font-bold ${
                              Number(row.net_pnl_usdt || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            {Number(row.net_pnl_usdt || 0) >= 0 ? "+" : ""}$
                            {Number(row.net_pnl_usdt || 0).toFixed(2)}
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
          {/* TAB: INSTITUTIONAL BACKTEST LAB (1-YEAR REAL HISTORICAL) */}
          {/* ========================================================================= */}
          {activeSection === "backtest" && (
            <BacktestView />
          )}

          {/* ========================================================================= */}
          {/* TAB 4: MARKET & MACRO NEWS DESK */}
          {/* ========================================================================= */}
          {activeSection === "news" && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface border border-border rounded-lg p-5">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                    <Newspaper className="h-5 w-5 text-brand-500" />
                    <span>Market Catalysts &amp; Macro Intelligence Feed</span>
                  </h2>
                  <p className="text-xs text-textMuted mt-0.5">
                    Live crypto headlines &amp; high-impact USD economic calendar events synced to database
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search news & events..."
                      value={newsSearchQuery}
                      onChange={(e) => setNewsSearchQuery(e.target.value)}
                      className="rounded-md border border-border bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-textMain placeholder-slate-400 focus:bg-white focus:border-brand-500 focus:outline-hidden w-48 sm:w-60"
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

                  <button
                    onClick={() => fetchNewsFromApi(true)}
                    disabled={isSyncingNews}
                    className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isSyncingNews ? "animate-spin" : ""}`} />
                    <span>{isSyncingNews ? "Syncing..." : "Sync Fresh News"}</span>
                  </button>
                </div>
              </div>

              {/* Category Pills */}
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: "ALL", label: "All News", count: newsItems.length },
                  { id: "BTC", label: "Bitcoin (BTC)", count: newsItems.filter((n) => n.coin === "BTC").length },
                  { id: "ETH", label: "Ethereum (ETH)", count: newsItems.filter((n) => n.coin === "ETH").length },
                  { id: "SOL", label: "Solana (SOL)", count: newsItems.filter((n) => n.coin === "SOL").length },
                  {
                    id: "MACRO",
                    label: "USD Macro Calendar",
                    count: newsItems.filter((n) => n.category === "macro" || n.coin === "USD").length,
                  },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedNewsCategory(cat.id)}
                    className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-all border cursor-pointer ${
                      selectedNewsCategory === cat.id
                        ? "border-brand-600 bg-brand-50 text-brand-600"
                        : "border-border bg-surface text-textMuted hover:bg-slate-50 hover:text-textMain"
                    }`}
                  >
                    <span>{cat.label}</span>
                    <span
                      className={`rounded px-1.5 py-0.2 text-[10px] tabular-nums font-bold ${
                        selectedNewsCategory === cat.id ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {cat.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* News Grid */}
              {filteredNews.length === 0 ? (
                <div className="bg-surface border border-dashed border-border rounded-lg p-12 text-center">
                  <Newspaper className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-textMain">No news articles found</h3>
                  <p className="text-xs text-textMuted mt-1 max-w-sm mx-auto">
                    No articles match your selected filter. Click &quot;Sync Fresh News&quot; to fetch latest updates into the database.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredNews.map((item, idx) => {
                    const sentiment = (item.sentiment || "NEUTRAL").toUpperCase();
                    const isBull = sentiment === "BULLISH";
                    const isBear = sentiment === "BEARISH";
                    const coin = item.coin || (item.category === "macro" ? "USD" : "CRYPTO");

                    return (
                      <div
                        key={item.id || idx}
                        className="bg-surface border border-border rounded-lg p-4 flex flex-col justify-between hover:border-brand-500/50 transition-all"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-200">
                              {coin}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                isBull
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : isBear
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : "bg-slate-100 text-slate-600 border-slate-200"
                              }`}
                            >
                              {sentiment}
                            </span>
                          </div>

                          <h3 className="font-medium text-textMain text-xs leading-snug line-clamp-3">
                            {item.title}
                          </h3>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[11px] text-textMuted">
                          <span>{item.source}</span>
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatTimeAgo(item.published_at)}
                            </span>
                            {item.url && item.url !== "#" && (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand-600 hover:text-brand-800 flex items-center"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 5: DEEPSEEK AI AUDIT STREAM */}
          {/* ========================================================================= */}
          {activeSection === "audits" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-brand-500" />
                  <span>DeepSeek AI Discrete Rubric Stream</span>
                </h2>
                <p className="text-xs text-textMuted mt-0.5">
                  Pre-execution Chief Quantitative Risk Officer audits with required flaw deductions and discrete scores
                </p>
              </div>

              {/* Zero Balance Analytical Scanner Banner */}
              {Number(latestSnapshot?.equity_usdt ?? 0) <= 0 && !config?.sandbox_mode && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center space-x-2.5">
                    <BrainCircuit className="w-4 h-4 text-purple-600 animate-pulse shrink-0" />
                    <span className="text-purple-900 font-medium leading-relaxed">
                      Zero-Balance Analytical Mode: DeepSeek Chief Risk Officer is actively evaluating candidate setups in real time. Passed signals are recorded in paper execution mode with exact Entry, SL, and TP targets.
                    </span>
                  </div>
                  <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-200/80 text-purple-900 border border-purple-300">
                    SCANNING LIVE
                  </span>
                </div>
              )}

              {/* Exchange Filter Tabs for Audits */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-border rounded-lg p-3">
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setAuditExchangeFilter("ALL")}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                      auditExchangeFilter === "ALL" ? "bg-white text-textMain shadow-xs" : "text-textMuted hover:text-textMain"
                    }`}
                  >
                    All Audits ({recentAudits.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuditExchangeFilter("binance")}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                      auditExchangeFilter === "binance" ? "bg-white text-blue-700 shadow-xs" : "text-textMuted hover:text-textMain"
                    }`}
                  >
                    Binance Crypto ({recentAudits.filter((a) => (a.exchange || "binance") === "binance").length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuditExchangeFilter("bybit")}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                      auditExchangeFilter === "bybit" ? "bg-white text-amber-700 shadow-xs" : "text-textMuted hover:text-textMain"
                    }`}
                  >
                    Bybit Forex / CFDs ({recentAudits.filter((a) => a.exchange === "bybit").length})
                  </button>
                </div>
                <span className="text-[11px] text-textMuted font-mono">
                  Showing: {recentAudits.filter((a) => {
                    if (auditExchangeFilter === "binance") return (a.exchange || "binance") === "binance";
                    if (auditExchangeFilter === "bybit") return a.exchange === "bybit";
                    return true;
                  }).length} records
                </span>
              </div>

              {recentAudits.length === 0 ? (
                <div className="bg-surface border border-border rounded-lg p-12 text-center text-xs text-textMuted">
                  Awaiting candidate strategy signals to initiate DeepSeek risk evaluations.
                </div>
              ) : recentAudits.filter((a) => {
                if (auditExchangeFilter === "binance") return (a.exchange || "binance") === "binance";
                if (auditExchangeFilter === "bybit") return a.exchange === "bybit";
                return true;
              }).length === 0 ? (
                <div className="bg-surface border border-border rounded-lg p-12 text-center text-xs text-textMuted">
                  No audits found for the selected exchange ({auditExchangeFilter.toUpperCase()}).
                </div>
              ) : (
                <div className="space-y-4">
                  {recentAudits
                    .filter((a) => {
                      if (auditExchangeFilter === "binance") return (a.exchange || "binance") === "binance";
                      if (auditExchangeFilter === "bybit") return a.exchange === "bybit";
                      return true;
                    })
                    .map((audit) => {
                    const isVetoed = audit.veto_triggered || audit.total_score < (config?.min_score || 65);
                    const breakdown = audit.rubric_breakdown || {};

                    return (
                      <div
                        key={audit.id}
                        className={`bg-surface border rounded-lg p-5 transition-all ${
                          isVetoed ? "border-rose-200" : "border-border"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`rounded px-2.5 py-0.5 text-xs font-bold border ${
                                audit.proposed_direction === "LONG"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-rose-50 text-rose-700 border-rose-200"
                              }`}
                            >
                              {audit.proposed_direction}
                            </span>
                            <span className="font-semibold text-sm text-textMain">{audit.symbol}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                              (audit.exchange || "binance") === "bybit"
                                ? "bg-amber-100 text-amber-800 border border-amber-200"
                                : "bg-blue-100 text-blue-800 border border-blue-200"
                            }`}>
                              {(audit.exchange || "binance").toUpperCase()}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                              {audit.asset_class === "forex" ? "FOREX" : audit.asset_class === "commodity" ? "COMMODITY" : "CRYPTO"}
                            </span>
                            {audit.forex_session && (
                              <span className="text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded font-mono border border-amber-200">
                                {audit.forex_session}
                              </span>
                            )}
                            {audit.spread_at_entry != null && (
                              <span className="text-[10px] text-slate-500 font-mono">
                                Spread: {Number(audit.spread_at_entry).toFixed(1)} pips
                              </span>
                            )}
                            {audit.ai_model && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                                audit.ai_model.includes("gemini")
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : "bg-indigo-50 text-indigo-700 border-indigo-200"
                              }`}>
                                {audit.ai_model}
                              </span>
                            )}
                            <span className="text-xs text-brand-600 font-mono">({audit.strategy_name})</span>
                          </div>

                          <div className="flex items-center gap-3">
                            {isVetoed ? (
                              <span className="flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700">
                                <XCircle className="h-3.5 w-3.5 text-rose-600" />
                                VETOED / REJECTED
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                APPROVED ({audit.total_score}/100)
                              </span>
                            )}
                            <span className="text-xs text-textMuted">
                              {new Date(audit.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>

                        {audit.veto_reason && (
                          <div className="mt-3 rounded border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 font-medium">
                            <strong>Kill-Switch Veto Reason:</strong> {audit.veto_reason}
                          </div>
                        )}

                        {audit.council_scores && (audit.council_scores.gemini !== undefined || audit.council_scores.chartist !== undefined) ? (
                          <div className="mt-4 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                              {/* Pillar 1: Gemini Chartist */}
                              <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3.5 space-y-2">
                                <div className="flex items-center justify-between border-b border-blue-200/60 pb-1.5">
                                  <span className="font-bold text-blue-900 flex items-center gap-1.5">
                                    <span>📊</span> 1. Gemini Chartist
                                  </span>
                                  <span className="font-mono font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded text-xs">
                                    {(audit.council_scores.chartist ?? audit.council_scores.gemini ?? 0)} / 40 pts
                                  </span>
                                </div>
                                <div className="space-y-1 text-[11px] text-blue-950">
                                  <div className="flex justify-between">
                                    <span className="text-blue-700 font-medium">HTF Structure:</span>
                                    <span className="font-mono font-bold">{audit.gemini_report?.htf_regime?.score ?? 0}/20</span>
                                  </div>
                                  {audit.gemini_report?.htf_regime?.flaw_or_deduction && (
                                    <p className="text-[10px] text-blue-800 italic">{audit.gemini_report.htf_regime.flaw_or_deduction}</p>
                                  )}
                                  <div className="flex justify-between pt-1">
                                    <span className="text-blue-700 font-medium">LTF Location:</span>
                                    <span className="font-mono font-bold">{audit.gemini_report?.ltf_location?.score ?? 0}/20</span>
                                  </div>
                                  {audit.gemini_report?.ltf_location?.flaw_or_deduction && (
                                    <p className="text-[10px] text-blue-800 italic">{audit.gemini_report.ltf_location.flaw_or_deduction}</p>
                                  )}
                                  {audit.gemini_report?.chart_verdict && (
                                    <p className="text-[10px] text-blue-900 font-medium pt-1 border-t border-blue-100">{audit.gemini_report.chart_verdict}</p>
                                  )}
                                </div>
                              </div>

                              {/* Pillar 2: Qwen Quant & Macro */}
                              <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3.5 space-y-2">
                                <div className="flex items-center justify-between border-b border-amber-200/60 pb-1.5">
                                  <span className="font-bold text-amber-900 flex items-center gap-1.5">
                                    <span>⚡</span> 2. Qwen Quant &amp; Macro
                                  </span>
                                  <span className="font-mono font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded text-xs">
                                    {(audit.council_scores.quant ?? audit.council_scores.qwen ?? 0)} / 30 pts
                                  </span>
                                </div>
                                <div className="space-y-1 text-[11px] text-amber-950">
                                  <div className="flex justify-between">
                                    <span className="text-amber-700 font-medium">Momentum &amp; RVOL:</span>
                                    <span className="font-mono font-bold">{audit.qwen_report?.momentum_volume?.score ?? 0}/10</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-amber-700 font-medium">USD Macro Blackout:</span>
                                    <span className="font-mono font-bold">{audit.qwen_report?.news_catalyst?.score ?? 0}/10</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-amber-700 font-medium">Intermarket (BTC/DXY):</span>
                                    <span className="font-mono font-bold">{audit.qwen_report?.intermarket_tide?.score ?? 0}/10</span>
                                  </div>
                                  {audit.qwen_report?.quant_summary && (
                                    <p className="text-[10px] text-amber-900 font-medium pt-1 border-t border-amber-100">{audit.qwen_report.quant_summary}</p>
                                  )}
                                </div>
                              </div>

                              {/* Pillar 3: DeepSeek Chief Risk Officer */}
                              <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3.5 space-y-2">
                                <div className="flex items-center justify-between border-b border-indigo-200/60 pb-1.5">
                                  <span className="font-bold text-indigo-900 flex items-center gap-1.5">
                                    <span>🛡️</span> 3. DeepSeek CRO Judge
                                  </span>
                                  <span className="font-mono font-bold text-indigo-700 bg-indigo-100/80 px-2 py-0.5 rounded text-xs">
                                    {audit.council_scores.deepseek ?? 0} / 30 pts
                                  </span>
                                </div>
                                <div className="space-y-1 text-[11px] text-indigo-950">
                                  <div className="flex justify-between">
                                    <span className="text-indigo-700 font-medium">Risk &amp; Execution Audit:</span>
                                    <span className="font-mono font-bold">{audit.deepseek_report?.risk_audit?.score ?? 0}/30</span>
                                  </div>
                                  {audit.deepseek_report?.risk_audit?.flaw_or_deduction && (
                                    <p className="text-[10px] text-indigo-800 italic">{audit.deepseek_report.risk_audit.flaw_or_deduction}</p>
                                  )}
                                  {audit.deepseek_report?.debate && (
                                    <div className="pt-1.5 space-y-1 border-t border-indigo-100 text-[10px]">
                                      <div className="text-rose-700">
                                        <strong className="font-semibold">🐻 Devil&apos;s Advocate:</strong> {audit.deepseek_report.debate.bearish_devils_advocate}
                                      </div>
                                      <div className="text-emerald-700">
                                        <strong className="font-semibold">🐂 Defense:</strong> {audit.deepseek_report.debate.bullish_defense}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-4 space-y-3">
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                              <div className="rounded border border-border bg-slate-50/70 p-3 text-center">
                                <div className="text-[10px] font-bold text-textMuted uppercase">HTF Regime</div>
                                <div className="font-bold text-brand-600 text-base mt-1 tabular-nums">
                                  {breakdown.htf_regime?.score ?? 0} / 25
                                </div>
                                <div className="text-[10px] text-textMuted truncate mt-1">
                                  {breakdown.htf_regime?.flaw_or_deduction || "Aligned"}
                                </div>
                              </div>

                              <div className="rounded border border-border bg-slate-50/70 p-3 text-center">
                                <div className="text-[10px] font-bold text-textMuted uppercase">LTF Location</div>
                                <div className="font-bold text-brand-600 text-base mt-1 tabular-nums">
                                  {breakdown.ltf_location?.score ?? 0} / 25
                                </div>
                                <div className="text-[10px] text-textMuted truncate mt-1">
                                  {breakdown.ltf_location?.flaw_or_deduction || "Verified"}
                                </div>
                              </div>

                              <div className="rounded border border-border bg-slate-50/70 p-3 text-center">
                                <div className="text-[10px] font-bold text-textMuted uppercase">Momentum &amp; Vol</div>
                                <div className="font-bold text-brand-600 text-base mt-1 tabular-nums">
                                  {breakdown.momentum_volume?.score ?? 0} / 15
                                </div>
                                <div className="text-[10px] text-textMuted truncate mt-1">
                                  {breakdown.momentum_volume?.flaw_or_deduction || "Clean"}
                                </div>
                              </div>

                              <div className="rounded border border-border bg-slate-50/70 p-3 text-center">
                                <div className="text-[10px] font-bold text-textMuted uppercase">News Catalyst</div>
                                <div className="font-bold text-brand-600 text-base mt-1 tabular-nums">
                                  {breakdown.news_catalyst?.score ?? 0} / 20
                                </div>
                                <div className="text-[10px] text-textMuted truncate mt-1">
                                  {breakdown.news_catalyst?.flaw_or_deduction || "Neutral"}
                                </div>
                              </div>

                              <div className="rounded border border-border bg-slate-50/70 p-3 text-center">
                                <div className="text-[10px] font-bold text-textMuted uppercase">Intermarket Tide</div>
                                <div className="font-bold text-brand-600 text-base mt-1 tabular-nums">
                                  {breakdown.intermarket_tide?.score ?? 0} / 15
                                </div>
                                <div className="text-[10px] text-textMuted truncate mt-1">
                                  {breakdown.intermarket_tide?.flaw_or_deduction || "BTC Flow"}
                                </div>
                              </div>
                            </div>

                            {/* Solo DeepSeek Debate & Notes */}
                            {audit.deepseek_report?.debate && (
                              <div className="p-3 rounded-lg border border-indigo-200 bg-indigo-50/40 text-xs space-y-1">
                                {audit.deepseek_report.debate.bearish_devils_advocate && (
                                  <div className="text-rose-700">
                                    <strong className="font-semibold">🐻 Devil&apos;s Advocate:</strong> {audit.deepseek_report.debate.bearish_devils_advocate}
                                  </div>
                                )}
                                {audit.deepseek_report.debate.bullish_defense && (
                                  <div className="text-emerald-700">
                                    <strong className="font-semibold">🐂 Defense:</strong> {audit.deepseek_report.debate.bullish_defense}
                                  </div>
                                )}
                              </div>
                            )}
                            {audit.deepseek_report?.execution_notes && (
                              <p className="text-[11px] text-indigo-900 font-medium italic">
                                📝 {audit.deepseek_report.execution_notes}
                              </p>
                            )}
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
          {/* TAB 6: AUTONOMOUS SELF-IMPROVEMENT & AUTOPSIES */}
          {/* ========================================================================= */}
          {activeSection === "autopsies" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 bg-surface border border-border rounded-lg p-6">
                <div>
                  <h3 className="text-base font-semibold text-textMain flex items-center gap-2">
                    <BrainCircuit className="h-5 w-5 text-brand-500" />
                    <span>Autonomous Self-Optimization Engine</span>
                  </h3>
                  <p className="text-xs text-textMuted mt-1 max-w-2xl leading-relaxed">
                    When enabled, DeepSeek post-mortem forensic lessons automatically quarantine underperforming strategies
                    (Profit Factor &lt; 0.80) and inject verified guardrails directly into live prompt caches.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-textMain">
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
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                      config?.auto_apply_lessons ? "bg-brand-600" : "bg-slate-300"
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
                <h4 className="text-xs font-bold uppercase tracking-wider text-textMuted mb-3">
                  Discovered Guardrail Rules &amp; Weaknesses Queue ({lessons.length})
                </h4>

                {lessons.length === 0 ? (
                  <div className="bg-surface border border-border rounded-lg p-12 text-center text-xs text-textMuted">
                    Zero weaknesses detected. Clean historical execution observed by the forensic analyst.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {lessons.map((lesson) => (
                      <div
                        key={lesson.id}
                        className="bg-surface border border-border rounded-lg p-5 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between border-b border-border pb-2 mb-3">
                            <span className="rounded border border-brand-100 bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-600 font-mono">
                              {lesson.strategy_name} ({lesson.symbol})
                            </span>
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                                lesson.status === "ACTIVE"
                                  ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                                  : lesson.status === "PENDING"
                                  ? "bg-amber-50 border border-amber-200 text-amber-700"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {lesson.status}
                            </span>
                          </div>

                          <div className="text-xs font-semibold text-textMain mb-1">
                            Weakness: <span className="text-rose-600">{lesson.weakness_detected}</span>
                          </div>
                          <div className="text-xs text-textMuted mb-2 leading-relaxed">
                            <strong>Prompt Guardrail Rule:</strong> <em>&quot;{lesson.prompt_guardrail_rule}&quot;</em>
                          </div>
                          <div className="text-[11px] text-brand-600 font-mono mb-3">
                            Suggested Param: {lesson.suggested_param_key} = {JSON.stringify(lesson.suggested_param_value)} (
                            {lesson.win_rate_impact})
                          </div>
                        </div>

                        {lesson.status === "PENDING" && (
                          <div className="flex items-center gap-2 pt-3 border-t border-border">
                            <button
                              onClick={() => handleLessonAction(lesson.id, "ACTIVE")}
                              className="flex-1 rounded-md bg-brand-600 py-2 text-xs font-bold text-white hover:bg-brand-700 transition-all cursor-pointer"
                            >
                              Approve &amp; Inject Rule
                            </button>
                            <button
                              onClick={() => handleLessonAction(lesson.id, "DISMISSED")}
                              className="rounded-md border border-border bg-slate-50 py-2 px-3 text-xs font-medium text-textMuted hover:text-textMain transition-colors cursor-pointer"
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
                <h4 className="text-xs font-bold uppercase tracking-wider text-textMuted mb-3">
                  Forensic Autopsies (Stopped-Out Trades)
                </h4>

                {autopsies.length === 0 ? (
                  <div className="bg-surface border border-border rounded-lg p-12 text-center text-xs text-textMuted">
                    No losing trade autopsies recorded yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {autopsies.map((a) => (
                      <div
                        key={a.id}
                        className="bg-surface border border-rose-200 rounded-lg p-4 text-xs leading-relaxed"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 mb-2">
                          <div className="flex items-center gap-2 font-semibold text-textMain">
                            <span>Trade #{a.trade_id}</span>
                            <span className="font-mono text-brand-600">{a.symbol}</span>
                            <span className="text-textMuted">({a.strategy_name})</span>
                          </div>
                          <span className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                            {a.failure_category}
                          </span>
                        </div>
                        <p className="text-textMain mb-1.5">
                          <strong>Root Cause Analysis:</strong> {a.root_cause_analysis}
                        </p>
                        <p className="text-brand-600 font-semibold">
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
          {/* TAB 7: QUANTITATIVE RISK & BOT SETTINGS */}
          {/* ========================================================================= */}
          {activeSection === "settings" && (
            <form onSubmit={handleSaveSettings} className="space-y-6 max-w-4xl">
              <div>
                <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                  <SlidersHorizontal className="h-5 w-5 text-brand-500" />
                  <span>Risk, Execution &amp; Multi-Exchange Settings Control</span>
                </h2>
                <p className="text-xs text-textMuted mt-0.5">
                  Quantitative risk parameters synchronized directly with Contabo VPS Python trading worker
                </p>
              </div>

              {/* EXCHANGE OPERATING MODE SELECTOR */}
              <div className="bg-surface border border-border rounded-lg p-6 space-y-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-border">
                  <div>
                    <h3 className="text-sm font-semibold text-textMain flex items-center gap-2">
                      <Layers className="h-4 w-4 text-brand-500" />
                      <span>Exchange Operating Mode</span>
                    </h3>
                    <p className="text-xs text-textMuted mt-0.5">
                      Select target market execution engine: Binance USD-M Futures, Bybit Forex / CFDs, or Dual Mode
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-md uppercase font-mono ${
                    (formSettings.exchange_mode || "binance") === "dual"
                      ? "bg-purple-100 text-purple-800 border border-purple-200"
                      : (formSettings.exchange_mode || "binance") === "bybit"
                      ? "bg-amber-100 text-amber-800 border border-amber-200"
                      : "bg-blue-100 text-blue-800 border border-blue-200"
                  }`}>
                    Active: {(formSettings.exchange_mode || "binance").toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { mode: "binance", title: "Binance Only (Crypto)", desc: "Scans USDT-M Perpetuals 24/7/365 with server-side limit maker orders.", badge: "Crypto" },
                    { mode: "bybit", title: "Bybit Only (Forex/CFDs)", desc: "Scans Currencies & Gold 24/5 on Unified Trading Account (V5 API).", badge: "Forex & Gold" },
                    { mode: "dual", title: "Dual Engine (Simultaneous)", desc: "Autonomous scanning across both Binance Crypto & Bybit Forex concurrently.", badge: "All Markets" },
                  ].map((item) => {
                    const isSelected = (formSettings.exchange_mode || "binance") === item.mode;
                    return (
                      <button
                        key={item.mode}
                        type="button"
                        onClick={() => setFormSettings({ ...formSettings, exchange_mode: item.mode as any })}
                        className={`p-4 rounded-lg border text-left transition-all cursor-pointer ${
                          isSelected
                            ? "bg-brand-50/70 border-brand-500 shadow-xs ring-1 ring-brand-500/30"
                            : "bg-surface border-border hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`text-xs font-bold ${isSelected ? "text-brand-700" : "text-textMain"}`}>
                            {item.title}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                            isSelected ? "bg-brand-100 text-brand-800" : "bg-slate-100 text-slate-600"
                          }`}>
                            {item.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-textMuted leading-snug">{item.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* API CONNECTIVITY & LIVE HEALTH MATRIX */}
              <div className="bg-surface border border-border rounded-lg p-6 space-y-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-textMain flex items-center gap-2">
                        <Wifi className="h-4 w-4 text-brand-500" />
                        <span>API Connectivity &amp; Live Health Diagnostics</span>
                      </h3>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-700 font-mono">
                        Real-time Probe
                      </span>
                    </div>
                    <p className="text-xs text-textMuted mt-0.5">
                      Verify authentication, ping latency, and operational health for Binance Futures, AI models, and Telegram alerts
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={testAllApis}
                    disabled={isTestingAll}
                    className="px-3.5 py-1.5 rounded-md border border-brand-500 bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer self-start sm:self-auto disabled:opacity-60 shadow-2xs"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isTestingAll ? "animate-spin text-brand-600" : ""}`} />
                    <span>{isTestingAll ? "Testing All APIs..." : "Test All Connections"}</span>
                  </button>
                </div>

                {/* 4 Health Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Service 1: Binance */}
                  <div className="p-4 rounded-md border border-border bg-slate-50/60 flex flex-col justify-between space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 font-bold text-xs">
                          BN
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-textMain">Binance USD-M Futures</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                                config?.sandbox_mode ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {config?.sandbox_mode ? "Sandbox / Testnet" : "Live Binance"}
                            </span>
                          </div>
                          <p className="text-[11px] text-textMuted mt-0.5 font-mono">
                            {apiHealth.binance.latency ? `⚡ ${apiHealth.binance.latency}ms latency` : "Endpoint: fapi.binance.com"}
                          </p>
                        </div>
                      </div>

                      {/* Status Badge */}
                      {apiHealth.binance.status === "testing" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          <Loader2 className="h-3 w-3 animate-spin" /> Testing
                        </span>
                      ) : apiHealth.binance.status === "success" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" /> Connected
                        </span>
                      ) : apiHealth.binance.status === "error" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          <XCircle className="h-3 w-3" /> Failed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          Not Tested
                        </span>
                      )}
                    </div>

                    {apiHealth.binance.message && (
                      <p
                        className={`text-[11px] leading-relaxed p-2 rounded border ${
                          apiHealth.binance.status === "success"
                            ? "bg-emerald-50/50 border-emerald-100 text-emerald-900"
                            : apiHealth.binance.status === "error"
                            ? "bg-rose-50/50 border-rose-100 text-rose-900"
                            : "bg-slate-100/50 border-slate-200 text-slate-600"
                        }`}
                      >
                        {apiHealth.binance.message}
                      </p>
                    )}

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => testSingleApi("binance")}
                        disabled={apiHealth.binance.status === "testing"}
                        className="px-3 py-1 text-xs font-semibold rounded border border-border bg-surface hover:bg-slate-100 text-textMain flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {apiHealth.binance.status === "testing" && (
                          <Loader2 className="h-3 w-3 animate-spin text-brand-600" />
                        )}
                        <span>Test Binance API</span>
                      </button>
                    </div>
                  </div>

                  {/* Service: Bybit V5 Unified (Forex / CFDs) */}
                  <div className="p-4 rounded-md border border-border bg-slate-50/60 flex flex-col justify-between space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-md bg-amber-600/10 border border-amber-600/20 flex items-center justify-center text-amber-700 font-bold text-xs">
                          BY
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-textMain">Bybit UTA (Forex / CFDs)</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                                config?.sandbox_mode ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {config?.sandbox_mode ? "Testnet UTA" : "Live Bybit V5"}
                            </span>
                          </div>
                          <p className="text-[11px] text-textMuted mt-0.5 font-mono">
                            {apiHealth.bybit.latency ? `⚡ ${apiHealth.bybit.latency}ms latency` : "Unified Trading Account V5"}
                          </p>
                        </div>
                      </div>

                      {/* Status Badge */}
                      {apiHealth.bybit.status === "testing" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          <Loader2 className="h-3 w-3 animate-spin" /> Testing
                        </span>
                      ) : apiHealth.bybit.status === "success" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" /> Connected
                        </span>
                      ) : apiHealth.bybit.status === "error" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          <XCircle className="h-3 w-3" /> Failed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          Not Tested
                        </span>
                      )}
                    </div>

                    {apiHealth.bybit.message && (
                      <p
                        className={`text-[11px] leading-relaxed p-2 rounded border ${
                          apiHealth.bybit.status === "success"
                            ? "bg-emerald-50/50 border-emerald-100 text-emerald-900"
                            : apiHealth.bybit.status === "error"
                            ? "bg-rose-50/50 border-rose-100 text-rose-900"
                            : "bg-slate-100/50 border-slate-200 text-slate-600"
                        }`}
                      >
                        {apiHealth.bybit.message}
                      </p>
                    )}

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => testSingleApi("bybit")}
                        disabled={apiHealth.bybit.status === "testing"}
                        className="px-3 py-1 text-xs font-semibold rounded border border-border bg-surface hover:bg-slate-100 text-textMain flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {apiHealth.bybit.status === "testing" && (
                          <Loader2 className="h-3 w-3 animate-spin text-brand-600" />
                        )}
                        <span>Test Bybit V5 API</span>
                      </button>
                    </div>
                  </div>

                  {/* Service 2: DeepSeek AI */}
                  <div className="p-4 rounded-md border border-border bg-slate-50/60 flex flex-col justify-between space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-md bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 font-bold text-xs">
                          AI
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-textMain">DeepSeek / AI Auditor</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-indigo-50 text-indigo-700 border border-indigo-100">
                              {formSettings.deepseek_model || "deepseek-chat"}
                            </span>
                          </div>
                          <p
                            className="text-[11px] text-textMuted mt-0.5 font-mono truncate max-w-[200px]"
                            title={formSettings.deepseek_base_url || "https://api.deepseek.com"}
                          >
                            {apiHealth.deepseek.latency
                              ? `⚡ ${apiHealth.deepseek.latency}ms latency`
                              : (formSettings.deepseek_base_url || "https://api.deepseek.com").replace("https://", "")}
                          </p>
                        </div>
                      </div>

                      {/* Status Badge */}
                      {apiHealth.deepseek.status === "testing" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          <Loader2 className="h-3 w-3 animate-spin" /> Testing
                        </span>
                      ) : apiHealth.deepseek.status === "success" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" /> Connected
                        </span>
                      ) : apiHealth.deepseek.status === "error" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          <XCircle className="h-3 w-3" /> Failed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          Not Tested
                        </span>
                      )}
                    </div>

                    {apiHealth.deepseek.message && (
                      <p
                        className={`text-[11px] leading-relaxed p-2 rounded border ${
                          apiHealth.deepseek.status === "success"
                            ? "bg-emerald-50/50 border-emerald-100 text-emerald-900"
                            : apiHealth.deepseek.status === "error"
                            ? "bg-rose-50/50 border-rose-100 text-rose-900"
                            : "bg-slate-100/50 border-slate-200 text-slate-600"
                        }`}
                      >
                        {apiHealth.deepseek.message}
                      </p>
                    )}

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => testSingleApi("deepseek")}
                        disabled={apiHealth.deepseek.status === "testing"}
                        className="px-3 py-1 text-xs font-semibold rounded border border-border bg-surface hover:bg-slate-100 text-textMain flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {apiHealth.deepseek.status === "testing" && (
                          <Loader2 className="h-3 w-3 animate-spin text-brand-600" />
                        )}
                        <span>Test AI Endpoint</span>
                      </button>
                    </div>
                  </div>

                  {/* Service 3: Telegram */}
                  <div className="p-4 rounded-md border border-border bg-slate-50/60 flex flex-col justify-between space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-md bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-600 font-bold text-xs">
                          TG
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-textMain">Telegram Push Alerts</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                                formSettings.telegram_notifications ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {formSettings.telegram_notifications ? "Alerts Active" : "Alerts Muted"}
                            </span>
                          </div>
                          <p className="text-[11px] text-textMuted mt-0.5 font-mono">
                            {apiHealth.telegram.latency
                              ? `⚡ ${apiHealth.telegram.latency}ms latency`
                              : formSettings.telegram_chat_id_override
                              ? `Chat: ${formSettings.telegram_chat_id_override}`
                              : "No Chat ID set"}
                          </p>
                        </div>
                      </div>

                      {/* Status Badge */}
                      {apiHealth.telegram.status === "testing" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          <Loader2 className="h-3 w-3 animate-spin" /> Testing
                        </span>
                      ) : apiHealth.telegram.status === "success" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" /> Connected
                        </span>
                      ) : apiHealth.telegram.status === "error" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          <XCircle className="h-3 w-3" /> Failed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          Not Tested
                        </span>
                      )}
                    </div>

                    {apiHealth.telegram.message && (
                      <p
                        className={`text-[11px] leading-relaxed p-2 rounded border ${
                          apiHealth.telegram.status === "success"
                            ? "bg-emerald-50/50 border-emerald-100 text-emerald-900"
                            : apiHealth.telegram.status === "error"
                            ? "bg-rose-50/50 border-rose-100 text-rose-900"
                            : "bg-slate-100/50 border-slate-200 text-slate-600"
                        }`}
                      >
                        {apiHealth.telegram.message}
                      </p>
                    )}

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => testSingleApi("telegram")}
                        disabled={apiHealth.telegram.status === "testing"}
                        className="px-3 py-1 text-xs font-semibold rounded border border-border bg-surface hover:bg-slate-100 text-textMain flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {apiHealth.telegram.status === "testing" && (
                          <Loader2 className="h-3 w-3 animate-spin text-brand-600" />
                        )}
                        <Send className="h-3 w-3 text-sky-600" />
                        <span>Send Test Alert</span>
                      </button>
                    </div>
                  </div>

                  {/* Service 4: PostgreSQL Database */}
                  <div className="p-4 rounded-md border border-border bg-slate-50/60 flex flex-col justify-between space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 font-bold text-xs">
                          DB
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-textMain">Supabase PostgreSQL Ledger</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-emerald-100 text-emerald-800">
                              Realtime Active
                            </span>
                          </div>
                          <p className="text-[11px] text-textMuted mt-0.5 font-mono">
                            {apiHealth.database.latency ? `⚡ ${apiHealth.database.latency}ms latency` : "State & Telemetry"}
                          </p>
                        </div>
                      </div>

                      {/* Status Badge */}
                      {apiHealth.database.status === "testing" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          <Loader2 className="h-3 w-3 animate-spin" /> Testing
                        </span>
                      ) : apiHealth.database.status === "success" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" /> Connected
                        </span>
                      ) : apiHealth.database.status === "error" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          <XCircle className="h-3 w-3" /> Failed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          Not Tested
                        </span>
                      )}
                    </div>

                    {apiHealth.database.message && (
                      <p
                        className={`text-[11px] leading-relaxed p-2 rounded border ${
                          apiHealth.database.status === "success"
                            ? "bg-emerald-50/50 border-emerald-100 text-emerald-900"
                            : apiHealth.database.status === "error"
                            ? "bg-rose-50/50 border-rose-100 text-rose-900"
                            : "bg-slate-100/50 border-slate-200 text-slate-600"
                        }`}
                      >
                        {apiHealth.database.message}
                      </p>
                    )}

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => testSingleApi("database")}
                        disabled={apiHealth.database.status === "testing"}
                        className="px-3 py-1 text-xs font-semibold rounded border border-border bg-surface hover:bg-slate-100 text-textMain flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {apiHealth.database.status === "testing" && (
                          <Loader2 className="h-3 w-3 animate-spin text-brand-600" />
                        )}
                        <Server className="h-3 w-3 text-emerald-600" />
                        <span>Verify Database</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Guardrails Card */}
              <div className="bg-surface border border-border rounded-lg p-6 space-y-6">
                <h3 className="text-xs font-bold text-brand-600 uppercase tracking-wider flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  <span>Quantitative Risk Guardrails</span>
                </h3>

                {/* Target Reward-to-Risk (RRR) Card */}
                <div className="p-4 bg-brand-50/50 rounded-xl border border-brand-200/60">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-800">
                          Target Reward-to-Risk Ratio (RRR)
                        </label>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-600 text-white shadow-xs">
                          1 : {Number(formSettings.target_rr ?? 2.5).toFixed(1)} R
                        </span>
                      </div>
                      <p className="text-[11px] text-textMuted mt-0.5">
                        Dynamically derives Take Profit targets from Stop Loss distance across all 6 strategies and AI gates.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[
                        { label: "1:2.0 Scalp", val: 2.0 },
                        { label: "1:2.5 Standard", val: 2.5 },
                        { label: "1:3.0 Runner", val: 3.0 },
                        { label: "1:4.0 Expansion", val: 4.0 },
                        { label: "1:5.0 Macro", val: 5.0 },
                      ].map((preset) => (
                        <button
                          key={preset.val}
                          type="button"
                          onClick={() => setFormSettings({ ...formSettings, target_rr: preset.val })}
                          className={`px-2.5 py-1 text-xs rounded-md font-semibold border transition-all cursor-pointer ${
                            Number(formSettings.target_rr ?? 2.5) === preset.val
                              ? "bg-brand-600 text-white border-brand-700 shadow-xs"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="1.5"
                      max="6.0"
                      step="0.1"
                      value={formSettings.target_rr ?? 2.5}
                      onChange={(e) => setFormSettings({ ...formSettings, target_rr: parseFloat(e.target.value) })}
                      className="w-full accent-brand-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
                    />
                    <div className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-md border border-slate-200 shrink-0">
                      <span className="text-xs font-medium text-slate-500">1:</span>
                      <input
                        type="number"
                        min="1.5"
                        max="10.0"
                        step="0.1"
                        value={formSettings.target_rr ?? 2.5}
                        onChange={(e) =>
                          setFormSettings({
                            ...formSettings,
                            target_rr: Math.max(1.5, Math.min(10.0, parseFloat(e.target.value) || 2.5)),
                          })
                        }
                        className="w-12 text-xs font-bold text-slate-800 text-center focus:outline-hidden"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-[10px] text-textMuted mt-1.5">
                    <span>1:1.5 (High Frequency Scalp)</span>
                    <span>1:2.5 (Institutional Optimal)</span>
                    <span>1:6.0+ (Outlier Trend)</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-textMain mb-1">
                      Risk Per Trade: {(Number(formSettings.risk_pct || 0.01) * 100).toFixed(2)}%
                    </label>
                    <input
                      type="range"
                      min="0.0025"
                      max="0.02"
                      step="0.0025"
                      value={formSettings.risk_pct || 0.01}
                      onChange={(e) => setFormSettings({ ...formSettings, risk_pct: parseFloat(e.target.value) })}
                      className="w-full accent-brand-600 cursor-pointer"
                    />
                    <span className="text-[10px] text-textMuted">Range: 0.25% to 2.0%</span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-textMain">
                        Min DeepSeek Score: <span className="text-brand-600 font-bold">{formSettings.min_score || 70} pts</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setFormSettings({ ...formSettings, min_score: 70 })}
                          className={`px-2 py-0.5 text-[10px] rounded font-medium transition-colors ${
                            formSettings.min_score === 70 ? "bg-brand-600 text-white" : "bg-slate-100 text-textMuted hover:bg-slate-200"
                          }`}
                        >
                          Responsive (70)
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormSettings({ ...formSettings, min_score: 75 })}
                          className={`px-2 py-0.5 text-[10px] rounded font-medium transition-colors ${
                            formSettings.min_score === 75 ? "bg-brand-600 text-white" : "bg-slate-100 text-textMuted hover:bg-slate-200"
                          }`}
                        >
                          Balanced (75)
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormSettings({ ...formSettings, min_score: 80 })}
                          className={`px-2 py-0.5 text-[10px] rounded font-medium transition-colors ${
                            formSettings.min_score === 80 ? "bg-brand-600 text-white" : "bg-slate-100 text-textMuted hover:bg-slate-200"
                          }`}
                        >
                          Strict (80)
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="95"
                      step="1"
                      value={formSettings.min_score || 70}
                      onChange={(e) => setFormSettings({ ...formSettings, min_score: parseInt(e.target.value) })}
                      className="w-full accent-brand-600 cursor-pointer"
                    />
                    <span className="text-[10px] text-textMuted">
                      Range: 50 to 95 Points. (70 is standard; to unlock &lt;70, run the SQL migration in Supabase).
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-textMain mb-1">
                      Min Relative Volume RVOL: {formSettings.min_rvol || 1.0}x
                    </label>
                    <input
                      type="range"
                      min="0.8"
                      max="2.5"
                      step="0.1"
                      value={formSettings.min_rvol || 1.0}
                      onChange={(e) => setFormSettings({ ...formSettings, min_rvol: parseFloat(e.target.value) })}
                      className="w-full accent-brand-600 cursor-pointer"
                    />
                    <span className="text-[10px] text-textMuted">Range: 0.8x to 2.5x (1.0x captures standard breakout/pullback volume).</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-border">
                  <div>
                    <label className="block text-xs font-semibold text-textMain mb-1.5">
                      Max Directional Exposure Pct
                    </label>
                    <input
                      type="number"
                      step="0.005"
                      value={formSettings.max_directional_exposure_pct || 0.015}
                      onChange={(e) =>
                        setFormSettings({ ...formSettings, max_directional_exposure_pct: parseFloat(e.target.value) })
                      }
                      className="w-full rounded-md border border-border bg-slate-50 py-2 px-3 text-xs text-textMain font-mono focus:border-brand-500 focus:bg-white focus:outline-hidden"
                    />
                    <span className="text-[10px] text-textMuted">Default: 0.015 (1.5%)</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-textMain mb-1.5">
                      Max Hold Bars (Time-Stop)
                    </label>
                    <input
                      type="number"
                      value={formSettings.max_hold_bars || 20}
                      onChange={(e) => setFormSettings({ ...formSettings, max_hold_bars: parseInt(e.target.value) })}
                      className="w-full rounded-md border border-border bg-slate-50 py-2 px-3 text-xs text-textMain font-mono focus:border-brand-500 focus:bg-white focus:outline-hidden"
                    />
                    <span className="text-[10px] text-textMuted">15m bars before exit if &lt;0.5R</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-textMain mb-1.5">
                      Max Funding Rate Pct
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formSettings.max_funding_rate_pct || 0.05}
                      onChange={(e) =>
                        setFormSettings({ ...formSettings, max_funding_rate_pct: parseFloat(e.target.value) })
                      }
                      className="w-full rounded-md border border-border bg-slate-50 py-2 px-3 text-xs text-textMain font-mono focus:border-brand-500 focus:bg-white focus:outline-hidden"
                    />
                    <span className="text-[10px] text-textMuted">Filter crowded positioning</span>
                  </div>
                </div>

                {/* Feature Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-border">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formSettings.enable_breakeven_partial ?? true}
                      onChange={(e) => setFormSettings({ ...formSettings, enable_breakeven_partial: e.target.checked })}
                      className="h-4 w-4 rounded border-border text-brand-600 focus:ring-0"
                    />
                    <span className="text-xs font-medium text-textMain">+1.0R Partial &amp; BE Lock</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formSettings.use_limit_maker_entry ?? true}
                      onChange={(e) => setFormSettings({ ...formSettings, use_limit_maker_entry: e.target.checked })}
                      className="h-4 w-4 rounded border-border text-brand-600 focus:ring-0"
                    />
                    <span className="text-xs font-medium text-textMain">Limit Maker (GTX)</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formSettings.telegram_notifications ?? true}
                      onChange={(e) => setFormSettings({ ...formSettings, telegram_notifications: e.target.checked })}
                      className="h-4 w-4 rounded border-border text-brand-600 focus:ring-0"
                    />
                    <span className="text-xs font-medium text-textMain">Telegram Push Alerts</span>
                  </label>
                </div>
              </div>

              {/* Watchlist Symbols */}
              <div className="bg-surface border border-border rounded-lg p-6 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-brand-600 uppercase tracking-wider">
                    Watchlist Symbols (Binance USDT-M Futures)
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setFormSettings({
                          ...formSettings,
                          symbols: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
                        })
                      }
                      className="px-2 py-0.5 text-[10px] font-medium bg-slate-100 hover:bg-slate-200 text-textMain rounded transition-colors"
                    >
                      Core 3
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormSettings({
                          ...formSettings,
                          symbols: [
                            "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT",
                            "DOGE/USDT", "ADA/USDT", "SUI/USDT", "LINK/USDT", "AVAX/USDT"
                          ],
                        })
                      }
                      className="px-2 py-0.5 text-[10px] font-medium bg-brand-50 hover:bg-brand-100 text-brand-700 rounded transition-colors"
                    >
                      Top 10 Volume
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormSettings({
                          ...formSettings,
                          symbols: [
                            "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT",
                            "DOGE/USDT", "ADA/USDT", "SUI/USDT", "LINK/USDT", "AVAX/USDT",
                            "PEPE/USDT", "NEAR/USDT", "INJ/USDT", "TIA/USDT", "APT/USDT",
                            "ARB/USDT", "OP/USDT", "LTC/USDT", "UNI/USDT", "DOT/USDT",
                            "1000SHIB/USDT", "FTM/USDT", "WIF/USDT", "FET/USDT", "RENDER/USDT"
                          ],
                        })
                      }
                      className="px-2 py-0.5 text-[10px] font-medium bg-brand-600 hover:bg-brand-700 text-white rounded transition-colors shadow-xs"
                    >
                      Top 25 Futures (Recommended)
                    </button>
                  </div>
                </div>
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
                  className="w-full rounded-md border border-border bg-slate-50 py-2.5 px-4 text-xs text-textMain font-mono focus:border-brand-500 focus:bg-white focus:outline-hidden"
                />
                <div className="flex items-center justify-between text-[10px] text-textMuted">
                  <span>Comma-separated CCXT pair identifiers.</span>
                  <span>Active count: <strong className="text-textMain font-semibold">{(formSettings.symbols || []).length} pairs</strong></span>
                </div>
              </div>

              {/* Watchlist Symbols (Forex & CFDs via Bybit UTA) */}
              <div className="bg-surface border border-border rounded-lg p-6 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      <span>Forex &amp; Commodity Watchlist (Bybit UTA V5)</span>
                    </h3>
                    <p className="text-[11px] text-textMuted mt-0.5">
                      Currencies, Gold, and Silver traded 24/5 on Bybit Unified Trading Account
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setFormSettings({
                          ...formSettings,
                          forex_symbols: ["EUR/USD", "GBP/USD", "USD/JPY", "XAU/USD", "XAG/USD"],
                        })
                      }
                      className="px-2.5 py-1 text-[10px] font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors shadow-xs cursor-pointer"
                    >
                      ★ Bybit UTA Listed (All 5)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormSettings({
                          ...formSettings,
                          forex_symbols: ["XAU/USD", "XAG/USD"],
                        })
                      }
                      className="px-2 py-0.5 text-[10px] font-medium bg-amber-50 hover:bg-amber-100 text-amber-800 rounded transition-colors border border-amber-200 cursor-pointer"
                    >
                      Gold & Silver (2)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormSettings({
                          ...formSettings,
                          forex_symbols: ["EUR/USD", "GBP/USD", "USD/JPY"],
                        })
                      }
                      className="px-2 py-0.5 text-[10px] font-medium bg-slate-100 hover:bg-slate-200 text-textMain rounded transition-colors cursor-pointer"
                    >
                      FX Majors (3)
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={(formSettings.forex_symbols || []).join(", ")}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      forex_symbols: e.target.value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
                    })
                  }
                  placeholder="EUR/USD, GBP/USD, USD/JPY, XAU/USD, XAG/USD"
                  className="w-full rounded-md border border-border bg-slate-50 py-2.5 px-4 text-xs text-textMain font-mono focus:border-amber-500 focus:bg-white focus:outline-hidden"
                />
                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[10px] text-textMuted gap-1">
                  <span>
                    <strong>Note:</strong> Bybit V5 Unified Trading Account (UTA) lists <strong>EUR/USD</strong>, <strong>GBP/USD</strong>, <strong>USD/JPY</strong>, <strong>XAU/USD (Gold)</strong>, and <strong>XAG/USD (Silver)</strong>. Other pairs (AUD/USD, USD/CAD) require Bybit MT5.
                  </span>
                  <span className="shrink-0 font-medium text-textMain">Active: {(formSettings.forex_symbols || []).length} pairs</span>
                </div>
              </div>

              {/* Forex Institutional Safeguards Card */}
              <div className="bg-surface border border-border rounded-lg p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    <span>Forex Institutional Safeguards &amp; Session Risk Rules</span>
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                    24/5 Regulated Protection
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-textMain">
                        Max Forex Spread Filter: <span className="text-amber-700 font-bold">{formSettings.forex_max_spread_pips ?? 3.5} pips</span>
                      </label>
                      <div className="flex items-center gap-1">
                        {[
                          { label: "2.5 pips (Strict FX)", val: 2.5 },
                          { label: "3.5 pips (Bybit Standard)", val: 3.5 },
                          { label: "5.0 pips (Metals & Volatile)", val: 5.0 },
                        ].map((preset) => (
                          <button
                            key={preset.val}
                            type="button"
                            onClick={() => setFormSettings({ ...formSettings, forex_max_spread_pips: preset.val })}
                            className={`px-1.5 py-0.5 text-[9px] rounded font-medium border transition-colors cursor-pointer ${
                              (formSettings.forex_max_spread_pips ?? 3.5) === preset.val
                                ? "bg-amber-100 text-amber-800 border-amber-300 font-bold"
                                : "bg-slate-50 text-textMuted border-border hover:bg-slate-100"
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="10.0"
                      step="0.5"
                      value={formSettings.forex_max_spread_pips ?? 3.5}
                      onChange={(e) => setFormSettings({ ...formSettings, forex_max_spread_pips: parseFloat(e.target.value) })}
                      className="w-full accent-amber-600 cursor-pointer"
                    />
                    <span className="text-[10px] text-textMuted">
                      Rejects entries if live broker spread exceeds this. On Bybit, USD/JPY floating spread is typically 2.0–3.0 pips; Silver (XAG/USD) is ~2.0 pips. Recommended: <strong>3.5 pips</strong>.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-textMain mb-1">
                      Max Forex Leverage: <span className="text-amber-700 font-bold">{formSettings.forex_max_leverage ?? 20}x</span>
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="50"
                      step="1"
                      value={formSettings.forex_max_leverage ?? 20}
                      onChange={(e) => setFormSettings({ ...formSettings, forex_max_leverage: parseInt(e.target.value) })}
                      className="w-full accent-amber-600 cursor-pointer"
                    />
                    <span className="text-[10px] text-textMuted">
                      Upper leverage limit for currency/metal margin orders on Bybit UTA (standard: 20x-30x).
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-border">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formSettings.enable_forex_trading ?? true}
                      onChange={(e) => setFormSettings({ ...formSettings, enable_forex_trading: e.target.checked })}
                      className="h-4 w-4 rounded border-border text-amber-600 focus:ring-0"
                    />
                    <div>
                      <span className="text-xs font-medium text-textMain block">Enable Forex Scanning</span>
                      <span className="text-[10px] text-textMuted">Activates Bybit currency engine</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formSettings.forex_weekend_shield ?? true}
                      onChange={(e) => setFormSettings({ ...formSettings, forex_weekend_shield: e.target.checked })}
                      className="h-4 w-4 rounded border-border text-amber-600 focus:ring-0"
                    />
                    <div>
                      <span className="text-xs font-medium text-textMain block">Weekend Shield (Auto-Close)</span>
                      <span className="text-[10px] text-textMuted">Flattens FX Friday 21:00 UTC</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formSettings.forex_rollover_shield ?? true}
                      onChange={(e) => setFormSettings({ ...formSettings, forex_rollover_shield: e.target.checked })}
                      className="h-4 w-4 rounded border-border text-amber-600 focus:ring-0"
                    />
                    <div>
                      <span className="text-xs font-medium text-textMain block">NY Rollover Blackout</span>
                      <span className="text-[10px] text-textMuted">Blocks entries 21:50–22:15 UTC</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Dynamic Trade Execution Engine & AI Risk Architecture */}
              <div className="bg-surface border border-border rounded-lg p-6 space-y-6">
                <div>
                  <h3 className="text-xs font-bold text-brand-600 uppercase tracking-wider flex items-center gap-2">
                    <Cpu className="h-4 w-4" />
                    <span>Trade Execution Engine &amp; AI Risk Architecture</span>
                  </h3>
                  <p className="text-xs text-textMuted mt-1">
                    Select your execution model: trade directly on pure Raw Technical Strategies with 0ms LLM latency, or enforce AI Risk Officer consensus gatekeeping.
                  </p>
                </div>

                {/* Master Trade Execution Architecture Mode Toggle */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-textMain">
                    Trade Execution Architecture Mode
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {/* Mode 1: Raw Technical Strategy Mode */}
                    <div
                      onClick={() => setFormSettings({ ...formSettings, ai_provider: "technical" })}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        formSettings.ai_provider === "technical"
                          ? "border-amber-500 bg-amber-50/50 text-amber-950 shadow-xs ring-2 ring-amber-400/20"
                          : "border-border bg-slate-50/50 hover:bg-slate-100/60 text-textMain"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Zap className={`w-4 h-4 ${formSettings.ai_provider === "technical" ? "text-amber-600" : "text-slate-400"}`} />
                          <span className="text-xs font-black">⚡ Raw Technical Strategy Mode</span>
                        </div>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          formSettings.ai_provider === "technical"
                            ? "bg-amber-600 text-white"
                            : "bg-slate-200 text-slate-600"
                        }`}>
                          High Velocity / Zero AI
                        </span>
                      </div>
                      <p className="text-[11px] text-textMuted leading-relaxed">
                        Trades execute directly off mathematical institutional setups (SMC Sweeps, Order Block FVG, Asian Judas Breakers). <strong>0ms LLM latency, $0 token costs, zero external API dependencies</strong>, and maximum signal compounding velocity.
                      </p>
                      {formSettings.ai_provider === "technical" && (
                        <div className="mt-2.5 pt-2 border-t border-amber-200/60 flex items-center gap-1.5 text-[10px] font-bold text-amber-800">
                          <CheckCircle2 className="w-3 h-3 text-amber-600" />
                          <span>Active: All AI gatekeepers bypassed. Trades take direct signal entries.</span>
                        </div>
                      )}
                    </div>

                    {/* Mode 2: AI-Audited Mode */}
                    <div
                      onClick={() => {
                        if (formSettings.ai_provider === "technical") {
                          setFormSettings({ ...formSettings, ai_provider: "council_3model" });
                        }
                      }}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        formSettings.ai_provider !== "technical"
                          ? "border-purple-500 bg-purple-50/40 text-purple-950 shadow-xs ring-2 ring-purple-400/20"
                          : "border-border bg-slate-50/50 hover:bg-slate-100/60 text-textMain"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Cpu className={`w-4 h-4 ${formSettings.ai_provider !== "technical" ? "text-purple-600" : "text-slate-400"}`} />
                          <span className="text-xs font-black">🤖 AI-Audited Mode (Risk Officer)</span>
                        </div>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          formSettings.ai_provider !== "technical"
                            ? "bg-purple-600 text-white"
                            : "bg-slate-200 text-slate-600"
                        }`}>
                          Conservative Gatekeeper
                        </span>
                      </div>
                      <p className="text-[11px] text-textMuted leading-relaxed">
                        Candidate setups are submitted to the chosen AI Risk Officer or Consensus Council. Enforces 100-pt discrete rubric scoring, macroeconomic news blackout checks, and HTF alignment before entry.
                      </p>
                      {formSettings.ai_provider !== "technical" && (
                        <div className="mt-2.5 pt-2 border-t border-purple-200/60 flex items-center gap-1.5 text-[10px] font-bold text-purple-800">
                          <CheckCircle2 className="w-3 h-3 text-purple-600" />
                          <span>Active: Trades audited by {formSettings.ai_provider === "deepseek" ? "DeepSeek Solo" : formSettings.ai_provider === "gemini" ? "Google Gemini" : formSettings.ai_provider === "auto" ? "Hybrid Fallback" : "3-Model Council"}.</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {formSettings.ai_provider === "technical" ? (
                  <div className="p-4 rounded-xl border border-amber-300 bg-amber-50/60 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                      <Zap className="w-4 h-4 text-amber-600" />
                      <span>Raw Technical Strategy Mode is Active</span>
                    </div>
                    <p className="text-xs text-amber-800/90 leading-relaxed">
                      The live bot will execute all high-probability technical setups immediately upon signal detection. AI API keys, payment balances, and external rate limits will not block or delay any trades. Banker&apos;s scale-outs (+1.5R partial bank &amp; BE, +3.0R bank, +5.0R full close) remain fully active.
                    </p>
                    <div className="text-[11px] text-amber-700 font-medium">
                      💡 To re-enable AI LLM auditing, simply click <strong>&quot;AI-Audited Mode&quot;</strong> above.
                    </div>
                  </div>
                ) : (
                  /* AI Provider Selector */
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-textMain">
                      Active AI Model Provider
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {[
                        {
                          id: "council_3model",
                          title: "🏛️ 3-Model AI Council",
                          desc: "Pluggable Council: Chartist (OpenAI/Gemini /40) + Quant (Grok/Qwen /30) + DeepSeek (Risk /30)",
                          badge: "Flagship Consensus",
                          color: "border-purple-500 bg-purple-50/50 text-purple-900"
                        },
                        {
                          id: "deepseek",
                          title: "DeepSeek V3 / R1",
                          desc: "Standard institutional reasoning via api.deepseek.com",
                          badge: "Direct API",
                          color: "border-indigo-500 bg-indigo-50/50 text-indigo-900"
                        },
                        {
                          id: "gemini",
                          title: "Google Gemini",
                          desc: "Ultra-fast auditing with 1,500 daily requests free on Google AI Studio",
                          badge: "Free Tier",
                          color: "border-blue-500 bg-blue-50/50 text-blue-900"
                        },
                        {
                          id: "auto",
                          title: "Auto-Fallback (Hybrid)",
                          desc: "DeepSeek primary -> Automatic instant Gemini backup on 402 or balance outage",
                          badge: "Shield",
                          color: "border-emerald-500 bg-emerald-50/50 text-emerald-900"
                        }
                      ].map((opt) => {
                        const isSel = (formSettings.ai_provider || "council_3model") === opt.id;
                        return (
                          <div
                            key={opt.id}
                            onClick={() => setFormSettings({ ...formSettings, ai_provider: opt.id as any })}
                            className={`p-3.5 rounded-lg border-2 cursor-pointer transition-all ${
                              isSel
                                ? opt.color + " shadow-xs"
                                : "border-border bg-slate-50/50 hover:bg-slate-100/60 text-textMain"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-bold">{opt.title}</span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                isSel ? "bg-white/90 text-textMain border border-border/50" : "bg-slate-200/80 text-textMuted"
                              }`}>
                                {opt.badge}
                              </span>
                            </div>
                            <p className="text-[11px] text-textMuted leading-tight">{opt.desc}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Pluggable Council Role Engine Selector */}
                {(formSettings.ai_provider || "council_3model") === "council_3model" && (
                  <div className="p-4 rounded-lg border-2 border-purple-200 bg-purple-50/40 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-purple-600" />
                        🏛️ 3-Model AI Council: Pluggable Role Assignment
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-200 text-purple-800">
                        Modular Architecture
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Role 1 Selection: Chartist */}
                      <div className="bg-white p-3.5 rounded-md border border-purple-100 shadow-2xs space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-bold text-textMain">
                            Role 1: Top-Down Chartist (40 Pts Max)
                          </label>
                          <span className="text-[10px] text-textMuted font-mono">1D→4H→1H→15m Structure</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setFormSettings({ ...formSettings, council_chartist_provider: "openai" })}
                            className={`p-2.5 rounded border text-left cursor-pointer transition-all ${
                              (formSettings.council_chartist_provider || "openai") === "openai"
                                ? "border-emerald-500 bg-emerald-50/70 text-emerald-950 font-semibold ring-1 ring-emerald-500"
                                : "border-border bg-slate-50 text-textMuted hover:bg-slate-100"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold">OpenAI</span>
                              <span className="text-[9px] bg-emerald-200 text-emerald-800 px-1 py-0.2 rounded font-bold">ACTIVE</span>
                            </div>
                            <p className="text-[10px] text-textMuted">gpt-4o-mini • No card hold</p>
                          </button>

                          <button
                            type="button"
                            onClick={() => setFormSettings({ ...formSettings, council_chartist_provider: "gemini" })}
                            className={`p-2.5 rounded border text-left cursor-pointer transition-all ${
                              formSettings.council_chartist_provider === "gemini"
                                ? "border-blue-500 bg-blue-50/70 text-blue-950 font-semibold ring-1 ring-blue-500"
                                : "border-border bg-slate-50 text-textMuted hover:bg-slate-100"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold">Gemini</span>
                              <span className="text-[9px] bg-slate-200 text-slate-700 px-1 py-0.2 rounded font-bold">STANDBY</span>
                            </div>
                            <p className="text-[10px] text-textMuted">gemini-3.5-flash • Free tier</p>
                          </button>
                        </div>
                      </div>

                      {/* Role 2 Selection: Quant & News */}
                      <div className="bg-white p-3.5 rounded-md border border-purple-100 shadow-2xs space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-bold text-textMain">
                            Role 2: Quant &amp; News (30 Pts Max)
                          </label>
                          <span className="text-[10px] text-textMuted font-mono">RVOL, OI &amp; ForexFactory</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setFormSettings({ ...formSettings, council_quant_provider: "grok" })}
                            className={`p-2.5 rounded border text-left cursor-pointer transition-all ${
                              (formSettings.council_quant_provider || "grok") === "grok"
                                ? "border-emerald-500 bg-emerald-50/70 text-emerald-950 font-semibold ring-1 ring-emerald-500"
                                : "border-border bg-slate-50 text-textMuted hover:bg-slate-100"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold">Grok / xAI</span>
                              <span className="text-[9px] bg-emerald-200 text-emerald-800 px-1 py-0.2 rounded font-bold">ACTIVE</span>
                            </div>
                            <p className="text-[10px] text-textMuted">grok-beta • No KYC needed</p>
                          </button>

                          <button
                            type="button"
                            onClick={() => setFormSettings({ ...formSettings, council_quant_provider: "qwen" })}
                            className={`p-2.5 rounded border text-left cursor-pointer transition-all ${
                              formSettings.council_quant_provider === "qwen"
                                ? "border-amber-500 bg-amber-50/70 text-amber-950 font-semibold ring-1 ring-amber-500"
                                : "border-border bg-slate-50 text-textMuted hover:bg-slate-100"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold">Qwen</span>
                              <span className="text-[9px] bg-slate-200 text-slate-700 px-1 py-0.2 rounded font-bold">STANDBY</span>
                            </div>
                            <p className="text-[10px] text-textMuted">qwen3.7-flash • DashScope</p>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sub-Group: DeepSeek Configuration (Chief Risk Officer & Judge) */}
                {((formSettings.ai_provider || "council_3model") === "deepseek" || formSettings.ai_provider === "auto" || (formSettings.ai_provider || "council_3model") === "council_3model") && (
                  <div className="p-4 rounded-lg border border-border bg-slate-50/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-textMain flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                        DeepSeek (Chief Quantitative Risk Officer &amp; Judge) Configuration
                      </span>
                      <button
                        type="button"
                        onClick={() => testSingleApi("deepseek")}
                        disabled={apiHealth.deepseek.status === "testing"}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded border border-border bg-surface hover:bg-slate-100 text-textMain flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {apiHealth.deepseek.status === "testing" ? <Loader2 className="h-3 w-3 animate-spin text-brand-600" /> : <Check className="h-3 w-3 text-indigo-600" />}
                        <span>Test DeepSeek</span>
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-textMain mb-1">DeepSeek / OpenAI Base URL</label>
                      <input
                        type="text"
                        value={formSettings.deepseek_base_url || "https://api.deepseek.com"}
                        onChange={(e) => setFormSettings({ ...formSettings, deepseek_base_url: e.target.value })}
                        placeholder="https://api.deepseek.com"
                        className="w-full rounded-md border border-border bg-surface py-2 px-3 text-xs text-textMain font-mono focus:border-brand-500 focus:outline-hidden"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { name: "Official DeepSeek", url: "https://api.deepseek.com", defaultModel: "deepseek-chat" },
                        { name: "OpenRouter Free", url: "https://openrouter.ai/api/v1", defaultModel: "deepseek/deepseek-chat:free" },
                        { name: "BeatAPI", url: "https://beatapi.io/v1", defaultModel: "deepseek-chat" },
                      ].map((preset) => {
                        const isSelected = (formSettings.deepseek_base_url || "https://api.deepseek.com") === preset.url;
                        return (
                          <button
                            key={preset.url}
                            type="button"
                            onClick={() =>
                              setFormSettings({
                                ...formSettings,
                                deepseek_base_url: preset.url,
                                deepseek_model: formSettings.deepseek_model || preset.defaultModel,
                              })
                            }
                            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] rounded border transition-all cursor-pointer ${
                              isSelected
                                ? "bg-indigo-50 border-indigo-400 text-indigo-700 font-semibold"
                                : "bg-surface border-border text-textMuted hover:bg-slate-100"
                            }`}
                          >
                            <span>{preset.name}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-textMain mb-1">DeepSeek Model Identifier</label>
                      <input
                        type="text"
                        value={formSettings.deepseek_model || "deepseek-chat"}
                        onChange={(e) => setFormSettings({ ...formSettings, deepseek_model: e.target.value })}
                        placeholder="deepseek-chat"
                        className="w-full rounded-md border border-border bg-surface py-2 px-3 text-xs text-textMain font-mono focus:border-brand-500 focus:outline-hidden"
                      />
                      <span className="text-[10px] text-textMuted mt-1 block">
                        Standard: <code>deepseek-chat</code>. Reasoning model: <code>deepseek-reasoner</code>.
                      </span>
                    </div>
                  </div>
                )}

                {/* Sub-Group: OpenAI Configuration (Chartist Engine) */}
                {((formSettings.council_chartist_provider || "openai") === "openai" || (formSettings.ai_provider || "council_3model") === "council_3model") && (
                  <div className="p-4 rounded-lg border border-border bg-slate-50/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-textMain flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        OpenAI (Top-Down Price Action &amp; Market Structure Chartist) Configuration
                      </span>
                      <button
                        type="button"
                        onClick={() => testSingleApi("openai")}
                        disabled={apiHealth.openai.status === "testing"}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded border border-border bg-surface hover:bg-slate-100 text-textMain flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {apiHealth.openai.status === "testing" ? <Loader2 className="h-3 w-3 animate-spin text-brand-600" /> : <Check className="h-3 w-3 text-emerald-600" />}
                        <span>Test OpenAI</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-textMain mb-1">OpenAI Base URL</label>
                        <input
                          type="text"
                          value={formSettings.openai_base_url || "https://api.openai.com/v1"}
                          onChange={(e) => setFormSettings({ ...formSettings, openai_base_url: e.target.value })}
                          placeholder="https://api.openai.com/v1"
                          className="w-full rounded-md border border-border bg-surface py-2 px-3 text-xs text-textMain font-mono focus:border-brand-500 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-textMain mb-1">OpenAI Model Identifier</label>
                        <input
                          type="text"
                          value={formSettings.openai_model || "gpt-4o-mini"}
                          onChange={(e) => setFormSettings({ ...formSettings, openai_model: e.target.value })}
                          placeholder="gpt-4o-mini"
                          className="w-full rounded-md border border-border bg-surface py-2 px-3 text-xs text-textMain font-mono focus:border-brand-500 focus:outline-hidden"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] text-textMuted font-medium">Quick Presets:</span>
                      {[
                        { name: "GPT-4o-mini (Recommended - $0.15/1M)", model: "gpt-4o-mini" },
                        { name: "GPT-4o (High-Precision)", model: "gpt-4o" },
                        { name: "O3-Mini (Reasoning)", model: "o3-mini" },
                      ].map((preset) => {
                        const isSelected = (formSettings.openai_model || "gpt-4o-mini") === preset.model;
                        return (
                          <button
                            key={preset.model}
                            type="button"
                            onClick={() =>
                              setFormSettings({
                                ...formSettings,
                                openai_model: preset.model,
                              })
                            }
                            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] rounded border transition-all cursor-pointer ${
                              isSelected
                                ? "bg-emerald-50 border-emerald-400 text-emerald-800 font-semibold"
                                : "bg-surface border-border text-textMuted hover:bg-slate-100"
                            }`}
                          >
                            <span>{preset.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Sub-Group: Grok / xAI Configuration (Quant & News Analyst) */}
                {((formSettings.council_quant_provider || "grok") === "grok" || (formSettings.ai_provider || "council_3model") === "council_3model") && (
                  <div className="p-4 rounded-lg border border-border bg-slate-50/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-textMain flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        Grok / xAI (Quant Microstructure, RVOL &amp; Macro Analyst) Configuration
                      </span>
                      <button
                        type="button"
                        onClick={() => testSingleApi("grok")}
                        disabled={apiHealth.grok.status === "testing"}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded border border-border bg-surface hover:bg-slate-100 text-textMain flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {apiHealth.grok.status === "testing" ? <Loader2 className="h-3 w-3 animate-spin text-brand-600" /> : <Check className="h-3 w-3 text-emerald-600" />}
                        <span>Test Grok</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-textMain mb-1">Grok Base URL</label>
                        <input
                          type="text"
                          value={formSettings.grok_base_url || "https://api.x.ai/v1"}
                          onChange={(e) => setFormSettings({ ...formSettings, grok_base_url: e.target.value })}
                          placeholder="https://api.x.ai/v1"
                          className="w-full rounded-md border border-border bg-surface py-2 px-3 text-xs text-textMain font-mono focus:border-brand-500 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-textMain mb-1">Grok Model Identifier</label>
                        <input
                          type="text"
                          value={formSettings.grok_model || "grok-beta"}
                          onChange={(e) => setFormSettings({ ...formSettings, grok_model: e.target.value })}
                          placeholder="grok-beta"
                          className="w-full rounded-md border border-border bg-surface py-2 px-3 text-xs text-textMain font-mono focus:border-brand-500 focus:outline-hidden"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] text-textMuted font-medium">Quick Presets:</span>
                      {[
                        { name: "grok-beta (Standard)", model: "grok-beta" },
                        { name: "grok-2-latest", model: "grok-2-latest" },
                        { name: "grok-2-vision-1212", model: "grok-2-vision-1212" },
                      ].map((preset) => {
                        const isSelected = (formSettings.grok_model || "grok-beta") === preset.model;
                        return (
                          <button
                            key={preset.model}
                            type="button"
                            onClick={() =>
                              setFormSettings({
                                ...formSettings,
                                grok_model: preset.model,
                              })
                            }
                            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] rounded border transition-all cursor-pointer ${
                              isSelected
                                ? "bg-emerald-50 border-emerald-400 text-emerald-800 font-semibold"
                                : "bg-surface border-border text-textMuted hover:bg-slate-100"
                            }`}
                          >
                            <span>{preset.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Standby & Reserved AI Providers Collapsible (Google Gemini & Alibaba Qwen) */}
                <div className="border border-dashed border-border rounded-lg overflow-hidden bg-slate-50/30">
                  <button
                    type="button"
                    onClick={() => setShowStandbyAiProviders(!showStandbyAiProviders)}
                    className="w-full flex items-center justify-between p-3.5 bg-slate-100/70 hover:bg-slate-100 transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-2">
                      <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform ${showStandbyAiProviders ? "rotate-90" : ""}`} />
                      <span className="text-xs font-bold text-textMain">
                        Secondary &amp; Reserved AI Providers (Google Gemini &amp; Alibaba Qwen — In Standby)
                      </span>
                    </div>
                    <span className="text-[10px] bg-slate-200 text-slate-700 font-semibold px-2 py-0.5 rounded">
                      Preserved in Code • Ready for Later Selection
                    </span>
                  </button>

                  {showStandbyAiProviders && (
                    <div className="p-4 space-y-4 border-t border-border bg-white">
                      {/* Google Gemini Sub-Settings */}
                      <div className="p-3.5 rounded-lg border border-border bg-slate-50/50 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-textMain flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                            Google Gemini (Top-Down Price Action Chartist) Configuration
                          </span>
                          <button
                            type="button"
                            onClick={() => testSingleApi("gemini")}
                            disabled={apiHealth.gemini.status === "testing"}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded border border-border bg-surface hover:bg-slate-100 text-textMain flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {apiHealth.gemini.status === "testing" ? <Loader2 className="h-3 w-3 animate-spin text-brand-600" /> : <Check className="h-3 w-3 text-blue-600" />}
                            <span>Test Gemini</span>
                          </button>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-textMain mb-1">Gemini Model Identifier</label>
                          <input
                            type="text"
                            value={formSettings.gemini_model || "gemini-3.5-flash"}
                            onChange={(e) => setFormSettings({ ...formSettings, gemini_model: e.target.value })}
                            placeholder="gemini-3.5-flash"
                            className="w-full rounded-md border border-border bg-surface py-2 px-3 text-xs text-textMain font-mono focus:border-brand-500 focus:outline-hidden"
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {[
                            { name: "Gemini 3.5 Flash (Recommended)", model: "gemini-3.5-flash" },
                            { name: "Gemini 3.8 Flash", model: "gemini-3.8-flash" },
                            { name: "Gemini Flash Latest", model: "gemini-flash-latest" },
                            { name: "Gemini 2.5 Flash Lite", model: "gemini-2.5-flash-lite" },
                          ].map((preset) => {
                            const isSelected = (formSettings.gemini_model || "gemini-3.5-flash") === preset.model;
                            return (
                              <button
                                key={preset.model}
                                type="button"
                                onClick={() =>
                                  setFormSettings({
                                    ...formSettings,
                                    gemini_model: preset.model,
                                  })
                                }
                                className={`flex items-center gap-1 px-2.5 py-1 text-[11px] rounded border transition-all cursor-pointer ${
                                  isSelected
                                    ? "bg-blue-50 border-blue-400 text-blue-700 font-semibold"
                                    : "bg-surface border-border text-textMuted hover:bg-slate-100"
                                }`}
                              >
                                <span>{preset.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Alibaba Qwen Sub-Settings */}
                      <div className="p-3.5 rounded-lg border border-border bg-slate-50/50 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-textMain flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                            Alibaba Qwen (Quant Microstructure, RVOL &amp; Macro Analyst) Configuration
                          </span>
                          <button
                            type="button"
                            onClick={() => testSingleApi("qwen")}
                            disabled={apiHealth.qwen.status === "testing"}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded border border-border bg-surface hover:bg-slate-100 text-textMain flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {apiHealth.qwen.status === "testing" ? <Loader2 className="h-3 w-3 animate-spin text-brand-600" /> : <Check className="h-3 w-3 text-amber-600" />}
                            <span>Test Qwen</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-textMain mb-1">Qwen Base URL</label>
                            <input
                              type="text"
                              value={formSettings.qwen_base_url || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"}
                              onChange={(e) => setFormSettings({ ...formSettings, qwen_base_url: e.target.value })}
                              placeholder="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
                              className="w-full rounded-md border border-border bg-surface py-2 px-3 text-xs text-textMain font-mono focus:border-brand-500 focus:outline-hidden"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-textMain mb-1">Qwen Model Identifier</label>
                            <input
                              type="text"
                              value={formSettings.qwen_model || "qwen3.7-flash"}
                              onChange={(e) => setFormSettings({ ...formSettings, qwen_model: e.target.value })}
                              placeholder="qwen3.7-flash"
                              className="w-full rounded-md border border-border bg-surface py-2 px-3 text-xs text-textMain font-mono focus:border-brand-500 focus:outline-hidden"
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] text-textMuted font-medium">Quick Presets:</span>
                          <button
                            type="button"
                            onClick={() =>
                              setFormSettings({
                                ...formSettings,
                                qwen_base_url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
                                qwen_model: "qwen3.7-flash",
                              })
                            }
                            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] rounded border transition-all cursor-pointer ${
                              (formSettings.qwen_base_url || "").includes("dashscope-intl")
                                ? "bg-amber-50 border-amber-400 text-amber-800 font-semibold"
                                : "bg-surface border-border text-textMuted hover:bg-slate-100"
                            }`}
                          >
                            🇸🇬 Singapore DashScope / Qwen Cloud
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setFormSettings({
                                ...formSettings,
                                qwen_base_url: "https://ap-southeast-1.maas.qwencloudapi.com/compatible-mode/v1",
                                qwen_model: "qwen3.7-flash",
                              })
                            }
                            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] rounded border transition-all cursor-pointer ${
                              (formSettings.qwen_base_url || "").includes("qwencloudapi")
                                ? "bg-amber-50 border-amber-400 text-amber-800 font-semibold"
                                : "bg-surface border-border text-textMuted hover:bg-slate-100"
                            }`}
                          >
                            ⚡ QwenCloud Direct (ap-southeast-1)
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setFormSettings({
                                ...formSettings,
                                qwen_base_url: "https://openrouter.ai/api/v1",
                                qwen_model: "qwen/qwen-2.5-72b-instruct",
                              })
                            }
                            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] rounded border transition-all cursor-pointer ${
                              (formSettings.qwen_base_url || "").includes("openrouter.ai")
                                ? "bg-amber-50 border-amber-400 text-amber-800 font-semibold"
                                : "bg-surface border-border text-textMuted hover:bg-slate-100"
                            }`}
                          >
                            🌐 OpenRouter (Global Fallback)
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Encrypted API Keys */}
              <div className="bg-surface border border-border rounded-lg p-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border">
                  <div>
                    <h3 className="text-xs font-bold text-brand-600 uppercase tracking-wider flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      <span>Encrypted API Key Overrides</span>
                    </h3>
                    <p className="text-xs text-textMuted mt-0.5">
                      Leave empty to fallback to container environment variables. Values entered here take immediate precedence.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveSettings()}
                    disabled={isSavingConfig}
                    className="px-4 py-2 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer self-start sm:self-auto disabled:opacity-50"
                  >
                    {isSavingConfig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    <span>{isSavingConfig ? "Saving to Database..." : "Save API Keys Now"}</span>
                  </button>
                </div>

                {/* Sub-Group 1: Binance Credentials */}
                <div className="p-4 rounded-md border border-border bg-slate-50/50 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-textMain flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      <span>Binance Futures API Credentials</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => testSingleApi("binance")}
                      disabled={apiHealth.binance.status === "testing"}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded border border-border bg-surface hover:bg-slate-100 text-textMain flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {apiHealth.binance.status === "testing" ? (
                        <Loader2 className="h-3 w-3 animate-spin text-brand-600" />
                      ) : (
                        <Check className="h-3 w-3 text-amber-600" />
                      )}
                      <span>Test Binance</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-textMain mb-1">Binance Futures API Key</label>
                      <div className="relative">
                        <input
                          type={showSecretKeys["binance_api_key_override"] ? "text" : "password"}
                          value={formSettings.binance_api_key_override || ""}
                          onChange={(e) =>
                            setFormSettings({ ...formSettings, binance_api_key_override: e.target.value })
                          }
                          placeholder="••••••••••••••••"
                          className="w-full rounded-md border border-border bg-surface py-2 px-3 pr-10 text-xs text-textMain font-mono focus:border-brand-500 focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowSecretKeys({
                              ...showSecretKeys,
                              binance_api_key_override: !showSecretKeys["binance_api_key_override"],
                            })
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {showSecretKeys["binance_api_key_override"] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-textMain mb-1">Binance Futures Secret</label>
                      <div className="relative">
                        <input
                          type={showSecretKeys["binance_secret_override"] ? "text" : "password"}
                          value={formSettings.binance_secret_override || ""}
                          onChange={(e) =>
                            setFormSettings({ ...formSettings, binance_secret_override: e.target.value })
                          }
                          placeholder="••••••••••••••••"
                          className="w-full rounded-md border border-border bg-surface py-2 px-3 pr-10 text-xs text-textMain font-mono focus:border-brand-500 focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowSecretKeys({
                              ...showSecretKeys,
                              binance_secret_override: !showSecretKeys["binance_secret_override"],
                            })
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {showSecretKeys["binance_secret_override"] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sub-Group: Bybit UTA Credentials */}
                <div className="p-4 rounded-md border border-border bg-slate-50/50 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-textMain flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-600"></span>
                      <span>Bybit UTA V5 API Credentials (Forex &amp; CFDs)</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => testSingleApi("bybit")}
                      disabled={apiHealth.bybit.status === "testing"}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded border border-border bg-surface hover:bg-slate-100 text-textMain flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {apiHealth.bybit.status === "testing" ? (
                        <Loader2 className="h-3 w-3 animate-spin text-brand-600" />
                      ) : (
                        <Check className="h-3 w-3 text-amber-600" />
                      )}
                      <span>Test Bybit</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-textMain mb-1">Bybit V5 API Key</label>
                      <div className="relative">
                        <input
                          type={showSecretKeys["bybit_api_key_override"] ? "text" : "password"}
                          value={formSettings.bybit_api_key_override || ""}
                          onChange={(e) =>
                            setFormSettings({ ...formSettings, bybit_api_key_override: e.target.value })
                          }
                          placeholder="••••••••••••••••"
                          className="w-full rounded-md border border-border bg-surface py-2 px-3 pr-10 text-xs text-textMain font-mono focus:border-brand-500 focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowSecretKeys({
                              ...showSecretKeys,
                              bybit_api_key_override: !showSecretKeys["bybit_api_key_override"],
                            })
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {showSecretKeys["bybit_api_key_override"] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-textMain mb-1">Bybit V5 Secret</label>
                      <div className="relative">
                        <input
                          type={showSecretKeys["bybit_secret_override"] ? "text" : "password"}
                          value={formSettings.bybit_secret_override || ""}
                          onChange={(e) =>
                            setFormSettings({ ...formSettings, bybit_secret_override: e.target.value })
                          }
                          placeholder="••••••••••••••••"
                          className="w-full rounded-md border border-border bg-surface py-2 px-3 pr-10 text-xs text-textMain font-mono focus:border-brand-500 focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowSecretKeys({
                              ...showSecretKeys,
                              bybit_secret_override: !showSecretKeys["bybit_secret_override"],
                            })
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {showSecretKeys["bybit_secret_override"] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sub-Group 2: DeepSeek AI Credentials */}
                <div className="p-4 rounded-md border border-border bg-slate-50/50 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-textMain flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                      <span>DeepSeek / AI Model API Key</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => testSingleApi("deepseek")}
                      disabled={apiHealth.deepseek.status === "testing"}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded border border-border bg-surface hover:bg-slate-100 text-textMain flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {apiHealth.deepseek.status === "testing" ? (
                        <Loader2 className="h-3 w-3 animate-spin text-brand-600" />
                      ) : (
                        <Check className="h-3 w-3 text-indigo-600" />
                      )}
                      <span>Test AI Key</span>
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-textMain mb-1">
                      DeepSeek, OpenRouter, or BeatAPI Key
                    </label>
                    <div className="relative">
                      <input
                        type={showSecretKeys["deepseek_key_override"] ? "text" : "password"}
                        value={formSettings.deepseek_key_override || ""}
                        onChange={(e) =>
                          setFormSettings({ ...formSettings, deepseek_key_override: e.target.value })
                        }
                        placeholder="sk-••••••••••••••••"
                        className="w-full rounded-md border border-border bg-surface py-2 px-3 pr-10 text-xs text-textMain font-mono focus:border-brand-500 focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowSecretKeys({
                            ...showSecretKeys,
                            deepseek_key_override: !showSecretKeys["deepseek_key_override"],
                          })
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showSecretKeys["deepseek_key_override"] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Sub-Group 3: OpenAI API Credentials (Active Chartist Engine) */}
                <div className="p-4 rounded-md border border-border bg-slate-50/50 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-textMain flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span>OpenAI API Key (sk-...) — Active Chartist Engine</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => testSingleApi("openai")}
                      disabled={apiHealth.openai.status === "testing"}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded border border-border bg-surface hover:bg-slate-100 text-textMain flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {apiHealth.openai.status === "testing" ? (
                        <Loader2 className="h-3 w-3 animate-spin text-brand-600" />
                      ) : (
                        <Check className="h-3 w-3 text-emerald-600" />
                      )}
                      <span>Test OpenAI Key</span>
                    </button>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-textMain">
                        OpenAI Platform API Key (sk-...)
                      </label>
                      <a
                        href="https://platform.openai.com/api-keys"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-emerald-700 hover:underline flex items-center gap-1 font-medium"
                      >
                        <span>Get Key at OpenAI Platform &rarr;</span>
                      </a>
                    </div>
                    <div className="relative">
                      <input
                        type={showSecretKeys["openai_api_key_override"] ? "text" : "password"}
                        value={formSettings.openai_api_key_override || ""}
                        onChange={(e) =>
                          setFormSettings({ ...formSettings, openai_api_key_override: e.target.value })
                        }
                        placeholder="sk-proj-••••••••••••••••••••••••••••••••"
                        className="w-full rounded-md border border-border bg-surface py-2 px-3 pr-10 text-xs text-textMain font-mono focus:border-brand-500 focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowSecretKeys({
                            ...showSecretKeys,
                            openai_api_key_override: !showSecretKeys["openai_api_key_override"],
                          })
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showSecretKeys["openai_api_key_override"] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <span className="text-[10px] text-textMuted mt-1 block">
                      Powers Role 1: Top-Down Market Structure, HTF Trend, FVG &amp; Order Block analysis via <code>gpt-4o-mini</code> (no card hold required).
                    </span>
                  </div>
                </div>

                {/* Sub-Group 4: Grok / xAI API Credentials (Active Quant & Macro Analyst) */}
                <div className="p-4 rounded-md border border-border bg-slate-50/50 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-textMain flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span>Grok / xAI API Key (xai-...) — Active Quant Analyst</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => testSingleApi("grok")}
                      disabled={apiHealth.grok.status === "testing"}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded border border-border bg-surface hover:bg-slate-100 text-textMain flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {apiHealth.grok.status === "testing" ? (
                        <Loader2 className="h-3 w-3 animate-spin text-brand-600" />
                      ) : (
                        <Check className="h-3 w-3 text-emerald-600" />
                      )}
                      <span>Test Grok Key</span>
                    </button>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-textMain">
                        xAI Console API Key (xai-...)
                      </label>
                      <a
                        href="https://console.x.ai/"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-emerald-700 hover:underline flex items-center gap-1 font-medium"
                      >
                        <span>Get Key at xAI Console (console.x.ai) &rarr;</span>
                      </a>
                    </div>
                    <div className="relative">
                      <input
                        type={showSecretKeys["grok_api_key_override"] ? "text" : "password"}
                        value={formSettings.grok_api_key_override || ""}
                        onChange={(e) =>
                          setFormSettings({ ...formSettings, grok_api_key_override: e.target.value })
                        }
                        placeholder="xai-••••••••••••••••••••••••••••••••"
                        className="w-full rounded-md border border-border bg-surface py-2 px-3 pr-10 text-xs text-textMain font-mono focus:border-brand-500 focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowSecretKeys({
                            ...showSecretKeys,
                            grok_api_key_override: !showSecretKeys["grok_api_key_override"],
                          })
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showSecretKeys["grok_api_key_override"] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <span className="text-[10px] text-textMuted mt-1 block">
                      Powers Role 2: Quantitative Microstructure, Relative Volume (RVOL), Open Interest (OI), and ForexFactory Macro auditing via <code>grok-beta</code> (no KYC required).
                    </span>
                  </div>
                </div>

                {/* Standby / Reserved API Keys Collapsible (Google Gemini & Alibaba Qwen) */}
                <div className="border border-dashed border-border rounded-lg overflow-hidden bg-slate-50/30">
                  <button
                    type="button"
                    onClick={() => setShowStandbyAiProviders(!showStandbyAiProviders)}
                    className="w-full flex items-center justify-between p-3.5 bg-slate-100/70 hover:bg-slate-100 transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-2">
                      <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform ${showStandbyAiProviders ? "rotate-90" : ""}`} />
                      <span className="text-xs font-bold text-textMain">
                        Secondary &amp; Reserved API Keys (Google Gemini &amp; Alibaba Qwen — Standby)
                      </span>
                    </div>
                    <span className="text-[10px] bg-slate-200 text-slate-700 font-semibold px-2 py-0.5 rounded">
                      Preserved in Code • Ready for Later Selection
                    </span>
                  </button>

                  {showStandbyAiProviders && (
                    <div className="p-4 space-y-4 border-t border-border bg-white">
                      {/* Google Gemini AI Credentials */}
                      <div className="p-3.5 rounded-md border border-border bg-slate-50/50 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-textMain flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                            <span>Google Gemini API Key (Free Tier)</span>
                          </h4>
                          <button
                            type="button"
                            onClick={() => testSingleApi("gemini")}
                            disabled={apiHealth.gemini.status === "testing"}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded border border-border bg-surface hover:bg-slate-100 text-textMain flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {apiHealth.gemini.status === "testing" ? (
                              <Loader2 className="h-3 w-3 animate-spin text-brand-600" />
                            ) : (
                              <Check className="h-3 w-3 text-blue-600" />
                            )}
                            <span>Test Gemini Key</span>
                          </button>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-medium text-textMain">
                              Google AI Studio Key
                            </label>
                            <a
                              href="https://aistudio.google.com/app/apikey"
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-brand-600 hover:underline flex items-center gap-1 font-medium"
                            >
                              <span>Get Free Key at Google AI Studio &rarr;</span>
                            </a>
                          </div>
                          <div className="relative">
                            <input
                              type={showSecretKeys["gemini_api_key_override"] ? "text" : "password"}
                              value={formSettings.gemini_api_key_override || ""}
                              onChange={(e) =>
                                setFormSettings({ ...formSettings, gemini_api_key_override: e.target.value })
                              }
                              placeholder="AIzaSy••••••••••••••••••••••••••••••••••"
                              className="w-full rounded-md border border-border bg-surface py-2 px-3 pr-10 text-xs text-textMain font-mono focus:border-brand-500 focus:outline-hidden"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setShowSecretKeys({
                                  ...showSecretKeys,
                                  gemini_api_key_override: !showSecretKeys["gemini_api_key_override"],
                                })
                              }
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                              {showSecretKeys["gemini_api_key_override"] ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                          <span className="text-[10px] text-textMuted mt-1 block">
                            Free tier provides 15 requests per minute and 1,500 requests per day at zero charge.
                          </span>
                        </div>
                      </div>

                      {/* Alibaba Qwen AI Credentials */}
                      <div className="p-3.5 rounded-md border border-border bg-slate-50/50 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-textMain flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                            <span>Alibaba Qwen API Key (Singapore DashScope / OpenRouter)</span>
                          </h4>
                          <button
                            type="button"
                            onClick={() => testSingleApi("qwen")}
                            disabled={apiHealth.qwen.status === "testing"}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded border border-border bg-surface hover:bg-slate-100 text-textMain flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {apiHealth.qwen.status === "testing" ? (
                              <Loader2 className="h-3 w-3 animate-spin text-brand-600" />
                            ) : (
                              <Check className="h-3 w-3 text-amber-600" />
                            )}
                            <span>Test Qwen Key</span>
                          </button>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-medium text-textMain">
                              Qwen Cloud / DashScope API Key (sk-...)
                            </label>
                            <a
                              href="https://www.qwencloud.com/"
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-amber-700 hover:underline flex items-center gap-1 font-medium"
                            >
                              <span>Get Official Key at Qwen Cloud (qwencloud.com) &rarr;</span>
                            </a>
                          </div>
                          <div className="relative">
                            <input
                              type={showSecretKeys["qwen_api_key_override"] ? "text" : "password"}
                              value={formSettings.qwen_api_key_override || ""}
                              onChange={(e) =>
                                setFormSettings({ ...formSettings, qwen_api_key_override: e.target.value })
                              }
                              placeholder="sk-••••••••••••••••••••••••••••••••"
                              className="w-full rounded-md border border-border bg-surface py-2 px-3 pr-10 text-xs text-textMain font-mono focus:border-brand-500 focus:outline-hidden"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setShowSecretKeys({
                                  ...showSecretKeys,
                                  qwen_api_key_override: !showSecretKeys["qwen_api_key_override"],
                                })
                              }
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                              {showSecretKeys["qwen_api_key_override"] ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                          <span className="text-[10px] text-textMuted mt-1 block">
                            Powers Role 2: Quantitative Microstructure, Relative Volume (RVOL), Funding Rates, and USD Red-Folder Macro Blackout auditing.
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Sub-Group 5: Telegram Alert Credentials */}
                <div className="p-4 rounded-md border border-border bg-slate-50/50 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-textMain flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                      <span>Telegram Bot Token &amp; Chat ID</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => testSingleApi("telegram")}
                      disabled={apiHealth.telegram.status === "testing"}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded border border-border bg-surface hover:bg-slate-100 text-textMain flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {apiHealth.telegram.status === "testing" ? (
                        <Loader2 className="h-3 w-3 animate-spin text-brand-600" />
                      ) : (
                        <Send className="h-3 w-3 text-sky-600" />
                      )}
                      <span>Test Alert Push</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-textMain mb-1">Telegram Bot Token</label>
                      <div className="relative">
                        <input
                          type={showSecretKeys["telegram_token_override"] ? "text" : "password"}
                          value={formSettings.telegram_token_override || ""}
                          onChange={(e) =>
                            setFormSettings({ ...formSettings, telegram_token_override: e.target.value })
                          }
                          placeholder="123456789:ABCdefGHIjkl..."
                          className="w-full rounded-md border border-border bg-surface py-2 px-3 pr-10 text-xs text-textMain font-mono focus:border-brand-500 focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowSecretKeys({
                              ...showSecretKeys,
                              telegram_token_override: !showSecretKeys["telegram_token_override"],
                            })
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {showSecretKeys["telegram_token_override"] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-textMain mb-1">Telegram Chat ID</label>
                      <div className="relative">
                        <input
                          type={showSecretKeys["telegram_chat_id_override"] ? "text" : "password"}
                          value={formSettings.telegram_chat_id_override || ""}
                          onChange={(e) =>
                            setFormSettings({ ...formSettings, telegram_chat_id_override: e.target.value })
                          }
                          placeholder="987654321"
                          className="w-full rounded-md border border-border bg-surface py-2 px-3 pr-10 text-xs text-textMain font-mono focus:border-brand-500 focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowSecretKeys({
                              ...showSecretKeys,
                              telegram_chat_id_override: !showSecretKeys["telegram_chat_id_override"],
                            })
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {showSecretKeys["telegram_chat_id_override"] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSavingConfig}
                  className="rounded-md bg-brand-600 px-6 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-brand-700 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {isSavingConfig ? "Saving Changes..." : "Save Quantitative Configuration"}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
