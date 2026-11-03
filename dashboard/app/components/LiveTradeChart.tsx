"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineStyle,
  createSeriesMarkers,
  IChartApi,
  ISeriesApi,
  IPriceLine,
  UTCTimestamp,
  SeriesMarker,
} from "lightweight-charts";
import {
  Activity,
  Maximize2,
  TrendingUp,
  TrendingDown,
  Layers,
  Radio,
  Eye,
  X,
  RefreshCw,
  Sliders,
  Sparkles,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";

export interface TradeExecutionItem {
  id: number;
  symbol: string;
  strategy_name: string;
  side: "LONG" | "SHORT";
  initial_qty?: number;
  qty?: number;
  entry_price: number;
  exit_price?: number | null;
  stop_loss: number;
  take_profit: number;
  breakeven_activated?: boolean;
  status: "OPEN" | "CLOSED_TP" | "CLOSED_SL" | "TIME_STOP" | "MANUAL_CLOSE";
  pnl_usdt?: number | null;
  pnl_r?: number | null;
  mfe_r?: number;
  mae_r?: number;
  trader_notes?: string;
  emotion_or_grade?: string;
  user_rating?: number;
  fees_usdt?: number;
  opened_at: string;
  closed_at?: string | null;
  [key: string]: any;
}

interface LiveTradeChartProps {
  openTrades?: TradeExecutionItem[];
  closedTrades?: TradeExecutionItem[];
  focusedTrade?: TradeExecutionItem | null;
  onClearFocus?: () => void;
  availableSymbols?: string[];
}

const TIMEFRAMES = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1h", value: "1h" },
  { label: "4h", value: "4h" },
  { label: "1d", value: "1d" },
];

const DEFAULT_SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT"];

export default function LiveTradeChart({
  openTrades = [],
  closedTrades = [],
  focusedTrade = null,
  onClearFocus,
  availableSymbols = DEFAULT_SYMBOLS,
}: LiveTradeChartProps) {
  // Chart Modes: "bot" (Lightweight-charts Canvas) vs "tradingview" (TV Pro Studio)
  const [viewMode, setViewMode] = useState<"bot" | "tradingview">("bot");
  const [selectedSymbol, setSelectedSymbol] = useState<string>(
    focusedTrade?.symbol || availableSymbols[0] || "BTC/USDT"
  );
  const [timeframe, setTimeframe] = useState<string>("15m");
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange24h, setPriceChange24h] = useState<number | null>(null);
  const [isLoadingCandles, setIsLoadingCandles] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const tvContainerRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const markersPluginRef = useRef<any>(null);
  const activePriceLinesRef = useRef<IPriceLine[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const candlesDataRef = useRef<{ time: number; open: number; high: number; low: number; close: number }[]>([]);

  // If focused trade changes, automatically switch selectedSymbol to match it
  useEffect(() => {
    if (focusedTrade?.symbol && focusedTrade.symbol !== selectedSymbol) {
      setSelectedSymbol(focusedTrade.symbol);
    }
  }, [focusedTrade]);

  // Clean symbol string (e.g., "BTC/USDT" -> "BTCUSDT")
  const binanceSymbol = useMemo(() => {
    return selectedSymbol.replace("/", "").toUpperCase();
  }, [selectedSymbol]);

  // Format currency
  const formatPrice = (val: number | null | undefined) => {
    if (val === null || val === undefined) return "--";
    return val.toLocaleString(undefined, {
      minimumFractionDigits: val < 10 ? 4 : 2,
      maximumFractionDigits: val < 10 ? 4 : 2,
    });
  };

  // ---------------------------------------------------------------------------
  // 1. LIGHTWEIGHT-CHARTS INITIALIZATION & LIFECYCLE
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (viewMode !== "bot" || !chartContainerRef.current) return;

    // Destroy any old instance before recreating
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
      markersPluginRef.current = null;
      activePriceLinesRef.current = [];
    }

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth || 800,
      height: 480,
      layout: {
        background: { color: "#0B0E14" },
        textColor: "#94a3b8",
        fontSize: 12,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(30, 41, 59, 0.4)" },
        horzLines: { color: "rgba(30, 41, 59, 0.4)" },
      },
      crosshair: {
        mode: 1, // Magnet
        vertLine: {
          color: "#38bdf8",
          width: 1,
          style: LineStyle.Dotted,
          labelBackgroundColor: "#0284c7",
        },
        horzLine: {
          color: "#38bdf8",
          width: 1,
          style: LineStyle.Dotted,
          labelBackgroundColor: "#0284c7",
        },
      },
      rightPriceScale: {
        borderColor: "#1e293b",
        scaleMargins: {
          top: 0.1,
          bottom: 0.22, // Leaves space for volume histogram below
        },
      },
      timeScale: {
        borderColor: "#1e293b",
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#f43f5e",
      borderUpColor: "#10b981",
      borderDownColor: "#f43f5e",
      wickUpColor: "#10b981",
      wickDownColor: "#f43f5e",
    });

    // Volume Histogram Series at the bottom
    const volSeries = chart.addSeries(HistogramSeries, {
      color: "rgba(16, 185, 129, 0.35)",
      priceFormat: {
        type: "volume",
      },
      priceScaleId: "", // Overlay on same chart
    });

    volSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
    });

    chartInstanceRef.current = chart;
    candlestickSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volSeries;

    // Handle responsive container resize
    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [viewMode]);

  // ---------------------------------------------------------------------------
  // 2. FETCH HISTORICAL KLINES (REST API)
  // ---------------------------------------------------------------------------
  const fetchKlines = useCallback(async () => {
    if (viewMode !== "bot" || !candlestickSeriesRef.current || !volumeSeriesRef.current) return;

    setIsLoadingCandles(true);
    setLoadError(null);

    try {
      const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${binanceSymbol}&interval=${timeframe}&limit=200`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Binance Futures returned HTTP ${res.status}`);
      }
      const rawKlines = await res.json();
      if (!Array.isArray(rawKlines) || rawKlines.length === 0) {
        throw new Error("Empty candle array returned from Binance Futures");
      }

      const formattedCandles: { time: UTCTimestamp; open: number; high: number; low: number; close: number }[] = [];
      const formattedVolumes: { time: UTCTimestamp; value: number; color: string }[] = [];

      for (const k of rawKlines) {
        const timeSec = Math.floor(Number(k[0]) / 1000) as UTCTimestamp;
        const open = parseFloat(k[1]);
        const high = parseFloat(k[2]);
        const low = parseFloat(k[3]);
        const close = parseFloat(k[4]);
        const vol = parseFloat(k[5]);

        formattedCandles.push({
          time: timeSec,
          open,
          high,
          low,
          close,
        });

        formattedVolumes.push({
          time: timeSec,
          value: vol,
          color: close >= open ? "rgba(16, 185, 129, 0.35)" : "rgba(244, 63, 94, 0.35)",
        });
      }

      candlesDataRef.current = formattedCandles;
      candlestickSeriesRef.current.setData(formattedCandles);
      volumeSeriesRef.current.setData(formattedVolumes);

      const latestCandle = formattedCandles[formattedCandles.length - 1];
      if (latestCandle) {
        setCurrentPrice(latestCandle.close);
        const firstCandle = formattedCandles[0];
        if (firstCandle && firstCandle.open > 0) {
          const changePct = ((latestCandle.close - firstCandle.open) / firstCandle.open) * 100;
          setPriceChange24h(changePct);
        }
      }

      if (chartInstanceRef.current) {
        chartInstanceRef.current.timeScale().fitContent();
      }
    } catch (err: any) {
      console.error("Failed to fetch klines:", err);
      setLoadError(err.message || "Failed to connect to Binance Futures API");
    } finally {
      setIsLoadingCandles(false);
    }
  }, [binanceSymbol, timeframe, viewMode]);

  useEffect(() => {
    fetchKlines();
  }, [fetchKlines]);

  // ---------------------------------------------------------------------------
  // 3. REAL-TIME CANDLE STREAM VIA BINANCE FUTURES WEBSOCKET
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (viewMode !== "bot") return;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const wsUrl = `wss://fstream.binance.com/ws/${binanceSymbol.toLowerCase()}@kline_${timeframe}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsWsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.e === "kline" && message.k) {
          const k = message.k;
          const timeSec = Math.floor(Number(k.t) / 1000) as UTCTimestamp;
          const open = parseFloat(k.o);
          const high = parseFloat(k.h);
          const low = parseFloat(k.l);
          const close = parseFloat(k.c);
          const vol = parseFloat(k.v);

          const updatedBar = { time: timeSec, open, high, low, close };

          if (candlestickSeriesRef.current) {
            candlestickSeriesRef.current.update(updatedBar);
          }
          if (volumeSeriesRef.current) {
            volumeSeriesRef.current.update({
              time: timeSec,
              value: vol,
              color: close >= open ? "rgba(16, 185, 129, 0.4)" : "rgba(244, 63, 94, 0.4)",
            });
          }

          setCurrentPrice(close);
        }
      } catch (err) {
        // ignore malformed ws messages
      }
    };

    ws.onerror = () => {
      setIsWsConnected(false);
    };

    ws.onclose = () => {
      setIsWsConnected(false);
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [binanceSymbol, timeframe, viewMode]);

  // ---------------------------------------------------------------------------
  // 4. DRAW ACTIVE & FOCUSED TRADE PRICE LINES (Entry, SL, TP, Replay)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (viewMode !== "bot" || !candlestickSeriesRef.current) return;

    const series = candlestickSeriesRef.current;

    // Clean up all existing price lines
    activePriceLinesRef.current.forEach((line) => {
      try {
        series.removePriceLine(line);
      } catch {
        // ignore
      }
    });
    activePriceLinesRef.current = [];

    const newLines: IPriceLine[] = [];

    // Case A: Focused Replay Trade from Trading Journal
    if (focusedTrade && focusedTrade.symbol === selectedSymbol) {
      // 1. Entry Line
      const entryLine = series.createPriceLine({
        price: Number(focusedTrade.entry_price),
        color: "#38bdf8",
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `FOCUS #${focusedTrade.id} ${focusedTrade.side} ENTRY @ $${formatPrice(focusedTrade.entry_price)}`,
      });
      newLines.push(entryLine);

      // 2. Stop Loss Line
      const isBe = Boolean(focusedTrade.breakeven_activated);
      const slLine = series.createPriceLine({
        price: Number(focusedTrade.stop_loss),
        color: isBe ? "#10b981" : "#f43f5e",
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: isBe
          ? `FOCUS SL (LOCKED +1R BE) @ $${formatPrice(focusedTrade.stop_loss)}`
          : `FOCUS SL @ $${formatPrice(focusedTrade.stop_loss)}`,
      });
      newLines.push(slLine);

      // 3. Take Profit Line
      const tpLine = series.createPriceLine({
        price: Number(focusedTrade.take_profit),
        color: "#10b981",
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `FOCUS TP TARGET (+2.2R+) @ $${formatPrice(focusedTrade.take_profit)}`,
      });
      newLines.push(tpLine);

      // 4. If trade is closed, show Exit Price Line
      if (focusedTrade.exit_price) {
        const pnlR = Number(focusedTrade.pnl_r || 0);
        const exitLine = series.createPriceLine({
          price: Number(focusedTrade.exit_price),
          color: pnlR >= 0 ? "#a855f7" : "#f97316",
          lineWidth: 2,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: `FOCUS EXIT @ $${formatPrice(focusedTrade.exit_price)} (${pnlR >= 0 ? "+" : ""}${pnlR.toFixed(2)}R)`,
        });
        newLines.push(exitLine);
      }
    } else {
      // Case B: Standard Active Open Trades for selectedSymbol
      const currentOpenTrades = openTrades.filter(
        (t) => t.status === "OPEN" && t.symbol === selectedSymbol
      );

      currentOpenTrades.forEach((t) => {
        // Solid Cyan Entry line
        const entryLine = series.createPriceLine({
          price: Number(t.entry_price),
          color: "#38bdf8",
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `${t.side} ENTRY (${t.strategy_name || "Bot"}) @ $${formatPrice(t.entry_price)}`,
        });
        newLines.push(entryLine);

        // Stop Loss: Emerald if BE locked, else Rose
        const isBe = Boolean(t.breakeven_activated);
        const slLine = series.createPriceLine({
          price: Number(t.stop_loss),
          color: isBe ? "#10b981" : "#f43f5e",
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: isBe
            ? `SL (LOCKED +1R BE) @ $${formatPrice(t.stop_loss)}`
            : `SL @ $${formatPrice(t.stop_loss)}`,
        });
        newLines.push(slLine);

        // Dashed Emerald Take Profit line
        const tpLine = series.createPriceLine({
          price: Number(t.take_profit),
          color: "#10b981",
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `TP TARGET (+2R+) @ $${formatPrice(t.take_profit)}`,
        });
        newLines.push(tpLine);
      });
    }

    activePriceLinesRef.current = newLines;
  }, [viewMode, openTrades, focusedTrade, selectedSymbol, isLoadingCandles]);

  // ---------------------------------------------------------------------------
  // 5. DRAW HISTORICAL CLOSED TRADE ENTRY/EXIT CANDLE MARKERS
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (viewMode !== "bot" || !candlestickSeriesRef.current || isLoadingCandles) return;

    const series = candlestickSeriesRef.current;
    const candles = candlesDataRef.current;
    if (!candles || candles.length === 0) return;

    // Helper: Find closest candle timestamp to snap trade timestamps to valid bars
    const snapToNearestCandleTime = (isoTimeStr: string | null | undefined): UTCTimestamp | null => {
      if (!isoTimeStr) return null;
      const targetSec = Math.floor(new Date(isoTimeStr).getTime() / 1000);
      if (isNaN(targetSec)) return null;

      let closestSec = candles[0].time;
      let minDiff = Math.abs(targetSec - candles[0].time);

      for (let i = 1; i < candles.length; i++) {
        const diff = Math.abs(targetSec - candles[i].time);
        if (diff < minDiff) {
          minDiff = diff;
          closestSec = candles[i].time;
        }
      }

      // If the closest candle is within a reasonable timeframe window (e.g. 7 days)
      return closestSec as UTCTimestamp;
    };

    // Filter relevant trades for selected symbol
    const relevantClosedTrades = closedTrades
      .filter((t) => t.symbol === selectedSymbol && t.status !== "OPEN")
      .slice(0, 20); // Last 20 closed executions

    const markers: SeriesMarker<UTCTimestamp>[] = [];

    relevantClosedTrades.forEach((trade) => {
      const entryTime = snapToNearestCandleTime(trade.opened_at);
      if (entryTime) {
        markers.push({
          time: entryTime,
          position: trade.side === "LONG" ? "belowBar" : "aboveBar",
          color: trade.side === "LONG" ? "#10b981" : "#f43f5e",
          shape: trade.side === "LONG" ? "arrowUp" : "arrowDown",
          text: `${trade.side} (${trade.strategy_name?.split("_")[0] || "Strat"})`,
          size: 1,
        });
      }

      if (trade.closed_at) {
        const exitTime = snapToNearestCandleTime(trade.closed_at);
        if (exitTime) {
          const pnlR = Number(trade.pnl_r || 0);
          markers.push({
            time: exitTime,
            position: trade.side === "LONG" ? "aboveBar" : "belowBar",
            color: pnlR > 0 ? "#10b981" : "#f43f5e",
            shape: "circle",
            text: `Exit ${pnlR >= 0 ? "+" : ""}${pnlR.toFixed(1)}R`,
            size: 1,
          });
        }
      }
    });

    // Also include current open trades entry markers
    openTrades
      .filter((t) => t.symbol === selectedSymbol && t.status === "OPEN")
      .forEach((trade) => {
        const entryTime = snapToNearestCandleTime(trade.opened_at);
        if (entryTime) {
          markers.push({
            time: entryTime,
            position: trade.side === "LONG" ? "belowBar" : "aboveBar",
            color: "#38bdf8",
            shape: trade.side === "LONG" ? "arrowUp" : "arrowDown",
            text: `ACTIVE ${trade.side}`,
            size: 2,
          });
        }
      });

    // Markers must be sorted strictly in ascending order by timestamp for lightweight-charts
    markers.sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));

    // Remove duplicates having identical time and shape
    const uniqueMarkers: SeriesMarker<UTCTimestamp>[] = [];
    const seenKeys = new Set<string>();
    for (const m of markers) {
      const key = `${m.time}_${m.position}_${m.text}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueMarkers.push(m);
      }
    }

    if (markersPluginRef.current) {
      markersPluginRef.current.setMarkers(uniqueMarkers);
    } else {
      markersPluginRef.current = createSeriesMarkers(series, uniqueMarkers);
    }
  }, [viewMode, closedTrades, openTrades, selectedSymbol, isLoadingCandles]);

  // ---------------------------------------------------------------------------
  // 6. TRADINGVIEW PRO STUDIO EMBED (MODE B)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (viewMode !== "tradingview") return;

    let tvScript = document.getElementById("tradingview-widget-script") as HTMLScriptElement | null;

    const initTvWidget = () => {
      if (typeof (window as any).TradingView !== "undefined" && tvContainerRef.current) {
        tvContainerRef.current.innerHTML = "";
        const tvDiv = document.createElement("div");
        tvDiv.id = `tv_chart_${Date.now()}`;
        tvDiv.style.width = "100%";
        tvDiv.style.height = "520px";
        tvContainerRef.current.appendChild(tvDiv);

        new (window as any).TradingView.widget({
          autosize: true,
          symbol: `BINANCE:${binanceSymbol}.P`,
          interval: timeframe === "1m" ? "1" : timeframe === "5m" ? "5" : timeframe === "15m" ? "15" : timeframe === "1h" ? "60" : timeframe === "4h" ? "240" : "D",
          timezone: "Etc/UTC",
          theme: "dark",
          style: "1",
          locale: "en",
          toolbar_bg: "#0B0E14",
          enable_publishing: false,
          allow_symbol_change: true,
          container_id: tvDiv.id,
          studies: ["Volume@tv-basicstudies", "RSI@tv-basicstudies"],
        });
      }
    };

    if (!tvScript) {
      tvScript = document.createElement("script");
      tvScript.id = "tradingview-widget-script";
      tvScript.src = "https://s3.tradingview.com/tv.js";
      tvScript.type = "text/javascript";
      tvScript.onload = initTvWidget;
      document.head.appendChild(tvScript);
    } else {
      initTvWidget();
    }
  }, [viewMode, binanceSymbol, timeframe]);

  const activeSymbolTrades = openTrades.filter(
    (t) => t.status === "OPEN" && t.symbol === selectedSymbol
  );

  return (
    <div className="bg-[#0B0E14] border border-border/70 rounded-xl overflow-hidden shadow-2xl transition-all">
      {/* ========================================================================= */}
      {/* 1. TOP CONTROL BAR */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between px-5 py-3.5 border-b border-border/60 bg-[#0d121c]/90 backdrop-blur-md gap-4">
        {/* Left: Symbol Selector & Live Ticker */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Symbol Selector */}
          <div className="flex items-center space-x-1.5 bg-slate-900/90 p-1 rounded-lg border border-border/70">
            {availableSymbols.map((sym) => {
              const isOpen = openTrades.some((t) => t.status === "OPEN" && t.symbol === sym);
              return (
                <button
                  key={sym}
                  onClick={() => setSelectedSymbol(sym)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center space-x-1.5 ${
                    selectedSymbol === sym
                      ? "bg-brand-600 text-white shadow-sm font-bold"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  <span>{sym}</span>
                  {isOpen && (
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Timeframe Selector */}
          <div className="flex items-center space-x-1 bg-slate-900/90 p-1 rounded-lg border border-border/70">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                onClick={() => setTimeframe(tf.value)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  timeframe === tf.value
                    ? "bg-slate-700 text-white font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Live Price & 24h Ticker */}
          <div className="flex items-center space-x-2.5 px-3 py-1 bg-slate-900/60 border border-slate-800 rounded-lg tabular-nums">
            <span className="text-sm font-bold text-white tracking-tight">
              ${formatPrice(currentPrice)}
            </span>
            {priceChange24h !== null && (
              <span
                className={`text-xs font-semibold flex items-center ${
                  priceChange24h >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {priceChange24h >= 0 ? "+" : ""}
                {priceChange24h.toFixed(2)}%
              </span>
            )}
            <div className="flex items-center space-x-1 text-[11px] text-slate-400 border-l border-slate-800 pl-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  isWsConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                }`}
              />
              <span>{isWsConnected ? "Stream" : "Polling"}</span>
            </div>
          </div>
        </div>

        {/* Right: Mode Switcher & Replay Status */}
        <div className="flex items-center space-x-3">
          {/* Active Positions Indicator Badge */}
          {activeSymbolTrades.length > 0 && (
            <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 bg-cyan-950/60 border border-cyan-800/60 rounded-md text-cyan-300 text-xs font-medium">
              <Radio className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
              <span>{activeSymbolTrades.length} Active Position(s) Plotted</span>
            </div>
          )}

          {/* Mode Switcher: Bot Execution vs TradingView */}
          <div className="flex items-center bg-slate-900 p-1 rounded-lg border border-border/80">
            <button
              onClick={() => setViewMode("bot")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center space-x-1.5 ${
                viewMode === "bot"
                  ? "bg-brand-600 text-white font-bold shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Bot Execution Canvas</span>
            </button>
            <button
              onClick={() => setViewMode("tradingview")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center space-x-1.5 ${
                viewMode === "tradingview"
                  ? "bg-slate-700 text-white font-bold shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>TradingView Studio</span>
            </button>
          </div>

          <button
            onClick={() => fetchKlines()}
            disabled={isLoadingCandles}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 rounded-lg border border-border transition-colors cursor-pointer"
            title="Refresh Candles"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingCandles ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. REPLAY & ACTIVE FOCUS NOTIFICATION BANNER */}
      {/* ========================================================================= */}
      {focusedTrade && (
        <div className="flex items-center justify-between px-5 py-2.5 bg-gradient-to-r from-blue-950/90 via-slate-900/90 to-purple-950/90 border-b border-blue-800/50 text-xs">
          <div className="flex items-center space-x-2.5">
            <Eye className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-cyan-300">
              Journal Replay Mode:
            </span>
            <span className="text-white">
              Inspecting Trade #{focusedTrade.id} ({focusedTrade.symbol} - {focusedTrade.side} by{" "}
              {focusedTrade.strategy_name})
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              Entry: ${formatPrice(focusedTrade.entry_price)}
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              SL: ${formatPrice(focusedTrade.stop_loss)}
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              TP: ${formatPrice(focusedTrade.take_profit)}
            </span>
            {focusedTrade.pnl_r !== undefined && focusedTrade.pnl_r !== null && (
              <span
                className={`px-2 py-0.5 rounded font-bold ${
                  Number(focusedTrade.pnl_r) >= 0
                    ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                    : "bg-rose-950 text-rose-400 border border-rose-800"
                }`}
              >
                Outcome: {Number(focusedTrade.pnl_r) >= 0 ? "+" : ""}
                {Number(focusedTrade.pnl_r).toFixed(2)}R
              </span>
            )}
          </div>

          {onClearFocus && (
            <button
              onClick={onClearFocus}
              className="flex items-center space-x-1 px-2.5 py-1 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear Replay</span>
            </button>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. CHART CANVAS CONTAINER */}
      {/* ========================================================================= */}
      <div className="relative w-full h-[500px]">
        {/* Mode A: Lightweight-charts Container */}
        <div
          ref={chartContainerRef}
          className={`w-full h-full ${viewMode === "bot" ? "block" : "hidden"}`}
        />

        {/* Mode B: TradingView Pro Studio Container */}
        <div
          ref={tvContainerRef}
          className={`w-full h-full ${viewMode === "tradingview" ? "block" : "hidden"}`}
        />

        {/* Loading Overlay */}
        {isLoadingCandles && viewMode === "bot" && (
          <div className="absolute inset-0 bg-[#0B0E14]/80 flex flex-col items-center justify-center space-y-3 z-20 backdrop-blur-xs">
            <RefreshCw className="w-7 h-7 text-brand-500 animate-spin" />
            <span className="text-xs font-semibold text-slate-300 tracking-wide">
              Streaming Institutional Klines for {selectedSymbol}...
            </span>
          </div>
        )}

        {/* Error Overlay */}
        {loadError && viewMode === "bot" && !isLoadingCandles && (
          <div className="absolute inset-0 bg-[#0B0E14]/90 flex flex-col items-center justify-center space-y-3 z-20">
            <AlertCircle className="w-8 h-8 text-rose-500" />
            <span className="text-sm font-semibold text-white">{loadError}</span>
            <button
              onClick={() => fetchKlines()}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-500 rounded-md transition"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* Legend Overlay at Top Left of Canvas */}
        {viewMode === "bot" && !isLoadingCandles && (
          <div className="absolute top-3 left-4 z-10 flex flex-wrap items-center gap-2 pointer-events-none bg-slate-950/70 p-2 rounded-lg border border-slate-800/60 backdrop-blur-xs text-[11px] text-slate-300">
            <div className="flex items-center space-x-1">
              <span className="w-3 h-0.5 bg-cyan-400" />
              <span>Solid Cyan: Entry</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="w-3 h-0.5 border-t border-dashed border-rose-500" />
              <span>Dashed Rose: SL</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="w-3 h-0.5 border-t border-dashed border-emerald-500" />
              <span>Dashed Emerald: TP / Locked BE</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              <span>Green / Red Arrows: Closed Trades</span>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. FOOTER STATUS BAR */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between px-5 py-2 bg-[#090C11] border-t border-border/50 text-[11px] text-slate-400">
        <div className="flex items-center space-x-4">
          <span>Binance Futures USD-M ({binanceSymbol})</span>
          <span>Timeframe: {timeframe}</span>
          <span>Feed: Real-Time Tick WebSocket</span>
        </div>
        <div className="flex items-center space-x-3">
          <span>Historical Markers: Last 20 Closed Trades</span>
          <span className="text-slate-600">•</span>
          <span className="text-brand-400 font-medium">alifcrptoai Execution Engine</span>
        </div>
      </div>
    </div>
  );
}
