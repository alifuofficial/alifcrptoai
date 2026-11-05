import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. Check if row id = 1 exists in bot_config
    const { data: existing, error: selectErr } = await supabase
      .from("bot_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (selectErr) {
      return NextResponse.json(
        {
          success: false,
          error: selectErr.message,
          code: selectErr.code,
          hint: selectErr.hint,
        },
        { status: 500 }
      );
    }

    if (existing) {
      if (
        !existing.gemini_model ||
        ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite"].includes(existing.gemini_model)
      ) {
        existing.gemini_model = "gemini-3.1-flash-lite";
      }
      return NextResponse.json({
        success: true,
        data: existing,
        seeded: false,
      });
    }

    // 2. If row id = 1 does NOT exist, insert it now!
    const defaultSingleton = {
      id: 1,
      is_active: false,
      sandbox_mode: true,
      auto_apply_lessons: false,
      symbols: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
      active_strategies: [
        "SMC_Liquidity_Sweep",
        "ICT_OrderBlock_FVG",
        "Supertrend_ADX_Momentum",
        "EMA_Trend_Pullback",
        "BB_Volatility_Breakout",
        "RSI_Divergence_Reversal",
      ],
      timeframe: "15m",
      risk_pct: 0.01,
      min_score: 75,
      min_rvol: 1.2,
      enable_breakeven_partial: true,
      max_directional_exposure_pct: 0.015,
      max_hold_bars: 20,
      use_limit_maker_entry: true,
      max_funding_rate_pct: 0.05,
      telegram_notifications: true,
      blocked_utc_hours: [],
      quarantined_symbols: [],
      deepseek_model: "deepseek-chat",
      deepseek_base_url: "https://api.deepseek.com",
      ai_provider: "deepseek",
      gemini_api_key_override: null,
      gemini_model: "gemini-3.1-flash-lite",
      exchange_mode: "binance",
      bybit_api_key_override: null,
      bybit_secret_override: null,
      enable_forex_trading: true,
      forex_symbols: ["EUR/USD", "GBP/USD", "USD/JPY", "XAU/USD", "XAG/USD"],
      forex_max_leverage: 30,
      forex_weekend_shield: true,
      forex_rollover_shield: true,
      forex_max_spread_pips: 1.5,
      panic_close_target: "ALL",
      panic_close_all: false,
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("bot_config")
      .upsert(defaultSingleton, { onConflict: "id" })
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to seed default singleton row 1: ${insertErr.message}`,
          code: insertErr.code,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: inserted,
      seeded: true,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const updates = body.updates || body;

    // Remove protected or read-only fields
    delete updates.id;

    // Ensure id = 1 is targeted
    const payload = {
      id: 1,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    // Use UPSERT so it will insert row 1 if missing, or update if existing!
    const { data: saved, error } = await supabase
      .from("bot_config")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Configuration successfully committed and persisted to PostgreSQL database!",
      data: saved,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: `Server save error: ${err.message}`,
      },
      { status: 500 }
    );
  }
}
