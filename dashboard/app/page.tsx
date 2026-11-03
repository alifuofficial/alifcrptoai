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
  deepseek_base_url?: string | null;
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
  const [chartTimeframe, setChartTimeframe] = useState<"24H" | "7D" | "30D" | "ALL">("ALL");
  const [showPanicModal, setShowPanicModal] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [toastNotification, setToastNotification] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  // API Health Diagnostics State
  const [apiHealth, setApiHealth] = useState<{
    binance: { status: "idle" | "testing" | "success" | "error"; message?: string; latency?: number };
    deepseek: { status: "idle" | "testing" | "success" | "error"; message?: string; latency?: number };
    telegram: { status: "idle" | "testing" | "success" | "error"; message?: string; latency?: number };
    database: { status: "idle" | "testing" | "success" | "error"; message?: string; latency?: number };
  }>({
    binance: { status: "idle" },
    deepseek: { status: "idle" },
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
          // If completely empty database, record the initial baseline snapshot directly
          const initialEquity = 10000.0;
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
      const eq = Number(latestSnapshot?.equity_usdt || 10000.0);
      const free = Number(latestSnapshot?.free_usdt || 10000.0);
      const pnl = Number(latestSnapshot?.daily_pnl_usdt || 0.0);
      const pnlPct = Number(latestSnapshot?.daily_pnl_pct || 0.0);

      const { data, error } = await supabase
        .from("account_snapshots")
        .insert({
          equity_usdt: eq,
          free_usdt: free,
          daily_pnl_usdt: pnl,
          daily_pnl_pct: pnlPct,
          open_positions: openTrades || [],
        })
        .select()
        .single();

      if (!error && data) {
        setSnapshotsHistory((prev) => [...prev, data]);
        setLatestSnapshot(data);
        showToast("Synchronized real equity snapshot to database");
      } else if (error) {
        showToast(`Snapshot error: ${error.message}`);
      }
    } catch (err: any) {
      showToast(`Snapshot error: ${err.message}`);
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

  const testSingleApi = async (service: "binance" | "deepseek" | "telegram" | "database") => {
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
            deepseek: {
              baseUrl: formSettings.deepseek_base_url,
              apiKey: formSettings.deepseek_key_override,
              model: formSettings.deepseek_model,
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
      binance: { status: "testing", message: "Testing gateway..." },
      deepseek: { status: "testing", message: "Testing model..." },
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
            deepseek: {
              baseUrl: formSettings.deepseek_base_url,
              apiKey: formSettings.deepseek_key_override,
              model: formSettings.deepseek_model,
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
        const d = data.results.deepseek;
        const t = data.results.telegram;
        const db = data.results.database;

        setApiHealth({
          binance: { status: b.success ? "success" : "error", message: b.message, latency: b.latencyMs },
          deepseek: { status: d.success ? "success" : "error", message: d.message, latency: d.latencyMs },
          telegram: { status: t.success ? "success" : "error", message: t.message, latency: t.latencyMs },
          database: { status: db.success ? "success" : "error", message: db.message, latency: db.latencyMs },
        });

        if (data.success) {
          showToast("All trading APIs & services connected successfully!", "success");
        } else {
          const failedServices = [
            !b.success && "Binance",
            !d.success && "AI Model",
            !t.success && "Telegram",
            !db.success && "Database",
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
        deepseek_base_url: formSettings.deepseek_base_url || "https://api.deepseek.com",
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
          value: Number(s.equity_usdt || 10000.0),
          pnl: Number(s.daily_pnl_usdt || 0.0),
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
      const base = Number(latestSnapshot?.equity_usdt || 10000.0);
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
          pnl: Number(latestSnapshot?.daily_pnl_usdt || 0.0),
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
      const base = Number(latestSnapshot?.equity_usdt || 10000.0);
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
    const minVal = values.length ? Math.min(...values) : 10000;
    const maxVal = values.length ? Math.max(...values) : 10000;
    const diff = maxVal - minVal;
    const padding = diff === 0 ? 25 : Math.max(diff * 0.15, 10);

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
              <h3 className="text-base font-bold text-textMain">Emergency Panic Flatten</h3>
            </div>
            <p className="text-xs text-textMuted mb-6 leading-relaxed">
              This will <strong>IMMEDIATELY CANCEL ALL CONDITIONAL ORDERS</strong> on Binance and execute
              <strong> MARKET CLOSE</strong> on every active futures position, setting the bot state to <strong>PAUSED</strong>.
              Are you sure you want to proceed?
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowPanicModal(false)}
                className="rounded-md border border-border bg-surface px-4 py-2 text-xs font-semibold text-textMain hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel / Stand Down
              </button>
              <button
                onClick={triggerPanicCloseAll}
                className="rounded-md bg-rose-600 px-5 py-2 text-xs font-bold text-white hover:bg-rose-700 transition-all cursor-pointer"
              >
                CONFIRM FLATTEN ALL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SIDEBAR */}
      {/* ========================================================================= */}
      <aside className="w-64 bg-surface border-r border-border flex flex-col h-full shrink-0 z-20">
        {/* Logo Area */}
        <div className="h-16 flex items-center px-6 border-b border-border">
          <div className="w-8 h-8 bg-brand-900 rounded flex items-center justify-center mr-3">
            <Activity className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wide leading-tight">alifcrptoai</h1>
            <span className="text-[10px] text-textMuted font-medium uppercase tracking-wider">By Alifu Haji</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
          {/* Section 1: Trading Desk */}
          <div>
            <p className="px-3 text-[10px] font-bold text-textMuted uppercase tracking-wider mb-2">Trading Desk</p>
            <button
              onClick={() => setActiveSection("overview")}
              className={`flex w-full items-center px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                activeSection === "overview"
                  ? "bg-brand-50 text-brand-600"
                  : "text-textMuted hover:text-textMain hover:bg-slate-50"
              }`}
            >
              <LayoutDashboard className="w-4 h-4 mr-3" />
              <span>Overview &amp; KPIs</span>
            </button>

            <button
              onClick={() => setActiveSection("positions")}
              className={`flex w-full items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer mt-1 ${
                activeSection === "positions"
                  ? "bg-brand-50 text-brand-600"
                  : "text-textMuted hover:text-textMain hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center">
                <Layers className="w-4 h-4 mr-3" />
                <span>Live Positions</span>
              </div>
              {openTrades.length > 0 && (
                <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-sm">
                  {openTrades.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveSection("strategies")}
              className={`flex w-full items-center px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer mt-1 ${
                activeSection === "strategies"
                  ? "bg-brand-50 text-brand-600"
                  : "text-textMuted hover:text-textMain hover:bg-slate-50"
              }`}
            >
              <TrendingUp className="w-4 h-4 mr-3" />
              <span>Strategy Analytics</span>
            </button>
          </div>

          {/* Section 2: Market Intelligence */}
          <div>
            <p className="px-3 text-[10px] font-bold text-textMuted uppercase tracking-wider mb-2">Market Intelligence</p>
            <button
              onClick={() => setActiveSection("news")}
              className={`flex w-full items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                activeSection === "news"
                  ? "bg-brand-50 text-brand-600"
                  : "text-textMuted hover:text-textMain hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center">
                <Newspaper className="w-4 h-4 mr-3" />
                <span>Market &amp; Macro News</span>
              </div>
              <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-sm">
                {newsItems.length}
              </span>
            </button>
          </div>

          {/* Section 3: AI Intelligence */}
          <div>
            <p className="px-3 text-[10px] font-bold text-textMuted uppercase tracking-wider mb-2">AI Intelligence</p>
            <button
              onClick={() => setActiveSection("audits")}
              className={`flex w-full items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                activeSection === "audits"
                  ? "bg-brand-50 text-brand-600"
                  : "text-textMuted hover:text-textMain hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center">
                <Cpu className="w-4 h-4 mr-3" />
                <span>DeepSeek Audits</span>
              </div>
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
            </button>

            <button
              onClick={() => setActiveSection("autopsies")}
              className={`flex w-full items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer mt-1 ${
                activeSection === "autopsies"
                  ? "bg-brand-50 text-brand-600"
                  : "text-textMuted hover:text-textMain hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center">
                <BrainCircuit className="w-4 h-4 mr-3" />
                <span>Self-Learning</span>
              </div>
              {lessons.filter((l) => l.status === "PENDING").length > 0 && (
                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded-sm">
                  {lessons.filter((l) => l.status === "PENDING").length}
                </span>
              )}
            </button>
          </div>

          {/* Section 4: Management */}
          <div>
            <p className="px-3 text-[10px] font-bold text-textMuted uppercase tracking-wider mb-2">Management</p>
            <button
              onClick={() => setActiveSection("settings")}
              className={`flex w-full items-center px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                activeSection === "settings"
                  ? "bg-brand-50 text-brand-600"
                  : "text-textMuted hover:text-textMain hover:bg-slate-50"
              }`}
            >
              <SlidersHorizontal className="w-4 h-4 mr-3" />
              <span>Risk &amp; Settings</span>
            </button>
          </div>
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                AH
              </div>
              <div className="ml-3">
                <p className="text-sm font-semibold leading-tight">Alifu Haji</p>
                <p className="text-[10px] text-emerald-600 font-medium flex items-center mt-0.5">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1.5"></span> Realtime Active
                </p>
              </div>
            </div>
            <button
              onClick={() => supabase.auth.signOut().then(() => router.push("/login"))}
              className="text-textMuted hover:text-textMain p-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* MAIN CONTENT */}
      {/* ========================================================================= */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* TOP HEADER */}
        <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center space-x-2 text-sm text-textMuted">
            <span>DESK</span>
            <ChevronRight className="w-3 h-3" />
            <span className="font-medium text-textMain capitalize">
              {activeSection === "overview" && "Overview"}
              {activeSection === "positions" && "Live Positions"}
              {activeSection === "strategies" && "Strategy Analytics"}
              {activeSection === "news" && "Market & Macro News"}
              {activeSection === "audits" && "DeepSeek Audits"}
              {activeSection === "autopsies" && "Self-Learning"}
              {activeSection === "settings" && "Risk & Settings"}
            </span>
          </div>

          {/* Status Toggles */}
          <div className="flex items-center space-x-3 text-xs font-medium">
            <button
              onClick={toggleBotActive}
              className={`flex items-center px-2.5 py-1.5 rounded-md border transition-colors cursor-pointer ${
                config?.is_active
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-amber-50 border-amber-200 text-amber-700"
              }`}
            >
              {config?.is_active ? (
                <PlayCircle className="w-3.5 h-3.5 mr-1.5" />
              ) : (
                <PauseCircle className="w-3.5 h-3.5 mr-1.5" />
              )}
              <span>{config?.is_active ? "RUNNING" : "PAUSED"}</span>
            </button>

            <button
              onClick={toggleSandboxMode}
              className={`flex items-center px-2.5 py-1.5 rounded-md border transition-colors cursor-pointer ${
                config?.sandbox_mode
                  ? "bg-blue-50 border-blue-200 text-blue-700"
                  : "bg-rose-50 border-rose-200 text-rose-700"
              }`}
            >
              <Radio className="w-3.5 h-3.5 mr-1.5" />
              <span>{config?.sandbox_mode ? "TESTNET / DEMO" : "LIVE BINANCE"}</span>
            </button>

            <div className="hidden sm:flex items-center px-2.5 py-1.5 border border-border text-textMain rounded-md">
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5 text-emerald-500" /> NORMAL
            </div>

            <div className="hidden md:flex items-center px-2.5 py-1.5 border border-border text-textMain rounded-md tabular-nums">
              <Gauge className="w-3.5 h-3.5 mr-1.5 text-brand-500" /> {calculatedExposure.current}% / {calculatedExposure.max}%
            </div>

            <button
              onClick={() => setShowPanicModal(true)}
              className="flex items-center px-3 py-1.5 border border-rose-600 text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
            >
              <AlertOctagon className="w-3.5 h-3.5 mr-1.5" /> PANIC CLOSE
            </button>
          </div>
        </header>

        {/* SCROLLABLE DASHBOARD AREA */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ========================================================================= */}
          {/* TAB 1: EXECUTIVE OVERVIEW */}
          {/* ========================================================================= */}
          {activeSection === "overview" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-semibold tracking-tight">Executive Overview &amp; Telemetry</h2>
              </div>

              {/* KPI CARDS GRID */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                      ${Number(latestSnapshot?.equity_usdt || 10000.0).toLocaleString(undefined, {
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
                      ${Number(latestSnapshot?.free_usdt || 10000.0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3">
                      <div
                        className="bg-brand-500 h-1.5 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(
                            100,
                            ((Number(latestSnapshot?.free_usdt || 10000) / Number(latestSnapshot?.equity_usdt || 10000)) *
                              100)
                          )}%`,
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
                        const isVetoed = a.veto_triggered || a.total_score < (config?.min_score || 75);
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
          {/* TAB 2: LIVE POSITIONS DESK */}
          {/* ========================================================================= */}
          {activeSection === "positions" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Institutional Positions Ledger</h2>
                  <p className="text-xs text-textMuted mt-0.5">
                    Active server-side conditional trades protected on Binance Futures with trailing telemetry
                  </p>
                </div>
                <button
                  onClick={fetchAllData}
                  className="flex items-center px-3 py-1.5 text-xs font-medium border border-border text-textMain hover:bg-slate-50 rounded transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh Orders
                </button>
              </div>

              {openTrades.length === 0 ? (
                <div className="bg-surface border border-border rounded-lg p-12 text-center">
                  <Layers className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                  <h4 className="text-sm font-semibold text-textMain">No Open Positions</h4>
                  <p className="text-xs text-textMuted mt-1">
                    The autonomous bot is actively scanning 15m candles for SMC sweeps and EMA pullbacks.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto bg-surface border border-border rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-border bg-slate-50 text-textMuted uppercase font-semibold text-[10px] tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Symbol / Strategy</th>
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
                      {openTrades.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-textMain">{t.symbol}</div>
                            <div className="text-[10px] text-brand-600">{t.strategy_name}</div>
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
                            ${Number(t.entry_price).toFixed(4)}
                          </td>
                          <td className="py-3.5 px-4 text-right text-rose-600 font-semibold tabular-nums">
                            ${Number(t.stop_loss).toFixed(4)}
                          </td>
                          <td className="py-3.5 px-4 text-right text-emerald-600 font-semibold tabular-nums">
                            ${Number(t.take_profit).toFixed(4)}
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
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
                <table className="w-full text-left text-xs">
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

              {recentAudits.length === 0 ? (
                <div className="bg-surface border border-border rounded-lg p-12 text-center text-xs text-textMuted">
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
                        className={`bg-surface border rounded-lg p-5 transition-all ${
                          isVetoed ? "border-rose-200" : "border-border"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                          <div className="flex items-center gap-3">
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

                        <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
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
                  <span>Risk, Execution &amp; API Settings Control</span>
                </h2>
                <p className="text-xs text-textMuted mt-0.5">
                  Quantitative risk parameters synchronized directly with Contabo VPS Python trading worker
                </p>
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
                    <label className="block text-xs font-semibold text-textMain mb-1">
                      Min DeepSeek Score: {formSettings.min_score || 75}
                    </label>
                    <input
                      type="range"
                      min="70"
                      max="95"
                      step="1"
                      value={formSettings.min_score || 75}
                      onChange={(e) => setFormSettings({ ...formSettings, min_score: parseInt(e.target.value) })}
                      className="w-full accent-brand-600 cursor-pointer"
                    />
                    <span className="text-[10px] text-textMuted">Range: 70 to 95 Points</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-textMain mb-1">
                      Min Relative Volume RVOL: {formSettings.min_rvol || 1.2}x
                    </label>
                    <input
                      type="range"
                      min="0.8"
                      max="2.5"
                      step="0.1"
                      value={formSettings.min_rvol || 1.2}
                      onChange={(e) => setFormSettings({ ...formSettings, min_rvol: parseFloat(e.target.value) })}
                      className="w-full accent-brand-600 cursor-pointer"
                    />
                    <span className="text-[10px] text-textMuted">Range: 0.8x to 2.5x</span>
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
                <h3 className="text-xs font-bold text-brand-600 uppercase tracking-wider">
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
                  className="w-full rounded-md border border-border bg-slate-50 py-2.5 px-4 text-xs text-textMain font-mono focus:border-brand-500 focus:bg-white focus:outline-hidden"
                />
                <span className="text-[10px] text-textMuted">Comma-separated ccxt pair identifiers.</span>
              </div>

              {/* Dynamic AI Base URL & Routing */}
              <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-brand-600 uppercase tracking-wider flex items-center gap-2">
                      <Cpu className="h-4 w-4" />
                      <span>Dynamic AI Endpoint &amp; Base URL Routing</span>
                    </h3>
                    <p className="text-xs text-textMuted mt-1">
                      Route Chief Quantitative Risk Officer audits through Official DeepSeek, OpenRouter, or BeatAPI proxies.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-textMain mb-1">
                      DeepSeek / OpenAI Base URL
                    </label>
                    <input
                      type="text"
                      value={formSettings.deepseek_base_url || "https://api.deepseek.com"}
                      onChange={(e) => setFormSettings({ ...formSettings, deepseek_base_url: e.target.value })}
                      placeholder="https://api.deepseek.com"
                      className="w-full rounded-md border border-border bg-slate-50 py-2 px-3 text-xs text-textMain font-mono focus:border-brand-500 focus:bg-white focus:outline-hidden"
                    />
                  </div>

                  {/* Quick Presets */}
                  <div>
                    <span className="text-[10px] font-bold text-textMuted uppercase tracking-wider block mb-1.5">
                      Quick-Select Presets:
                    </span>
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
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-all cursor-pointer ${
                              isSelected
                                ? "bg-brand-50 border-brand-500 text-brand-700 font-semibold shadow-xs"
                                : "bg-surface border-border text-textMuted hover:text-textMain hover:bg-slate-50"
                            }`}
                          >
                            <span>{preset.name}</span>
                            <span className="text-[9px] px-1 py-0.2 rounded bg-slate-100 text-slate-600 font-mono">
                              {preset.url.replace("https://", "")}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-textMain mb-1">
                      AI Model Identifier
                    </label>
                    <input
                      type="text"
                      value={formSettings.deepseek_model || "deepseek-chat"}
                      onChange={(e) => setFormSettings({ ...formSettings, deepseek_model: e.target.value })}
                      placeholder="deepseek-chat"
                      className="w-full rounded-md border border-border bg-slate-50 py-2 px-3 text-xs text-textMain font-mono focus:border-brand-500 focus:bg-white focus:outline-hidden"
                    />
                    <span className="text-[10px] text-textMuted">
                      Standard: <code>deepseek-chat</code>. For OpenRouter: <code>deepseek/deepseek-chat</code> or <code>deepseek/deepseek-r1</code>.
                    </span>
                  </div>

                  <div className="flex justify-end pt-2 border-t border-border">
                    <button
                      type="button"
                      onClick={() => testSingleApi("deepseek")}
                      disabled={apiHealth.deepseek.status === "testing"}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded-md border border-brand-500 bg-brand-50 hover:bg-brand-100 text-brand-700 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {apiHealth.deepseek.status === "testing" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600" />
                      ) : (
                        <Cpu className="h-3.5 w-3.5 text-brand-600" />
                      )}
                      <span>Test AI Endpoint Connection</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Encrypted API Keys */}
              <div className="bg-surface border border-border rounded-lg p-6 space-y-6">
                <div>
                  <h3 className="text-xs font-bold text-brand-600 uppercase tracking-wider flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    <span>Encrypted API Key Overrides</span>
                  </h3>
                  <p className="text-xs text-textMuted mt-0.5">
                    Leave empty to fallback to container environment variables. Values entered here take immediate precedence.
                  </p>
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

                {/* Sub-Group 3: Telegram Alert Credentials */}
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
