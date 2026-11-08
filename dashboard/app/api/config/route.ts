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

    const maskKey = (val?: string | null) => {
      if (!val) return null;
      if (val.length <= 8) return "••••••••";
      return `${val.slice(0, 4)}••••${val.slice(-4)}`;
    };
    const maskSecret = (val?: string | null) => {
      if (!val) return null;
      return "••••••••••••••••";
    };

    const sanitizeConfig = (cfg: any) => ({
      ...cfg,
      binance_api_key_override: maskKey(cfg.binance_api_key_override),
      binance_secret_override: maskSecret(cfg.binance_secret_override),
      bybit_api_key_override: maskKey(cfg.bybit_api_key_override),
      bybit_secret_override: maskSecret(cfg.bybit_secret_override),
      deepseek_key_override: maskKey(cfg.deepseek_key_override),
      gemini_api_key_override: maskKey(cfg.gemini_api_key_override),
      qwen_api_key_override: maskKey(cfg.qwen_api_key_override),
      openai_api_key_override: maskKey(cfg.openai_api_key_override),
      grok_api_key_override: maskKey(cfg.grok_api_key_override),
      telegram_token_override: maskKey(cfg.telegram_token_override),
    });

    if (existing) {
      if (
        !existing.gemini_model ||
        ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-3.1-flash-lite"].includes(existing.gemini_model)
      ) {
        existing.gemini_model = "gemini-3.5-flash";
      }
      if (!existing.qwen_base_url) {
        existing.qwen_base_url = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
      }
      if (!existing.qwen_model) {
        existing.qwen_model = "qwen3.7-flash";
      }
      if (!existing.ai_provider) {
        existing.ai_provider = "council_3model";
      }
      if (!existing.forex_max_spread_pips || Number(existing.forex_max_spread_pips) <= 1.5) {
        existing.forex_max_spread_pips = 3.5;
      }
      if (!existing.target_rr || Number(existing.target_rr) < 1.5) {
        existing.target_rr = 2.5;
      }
      if (!existing.simulated_equity || Number(existing.simulated_equity) <= 0) {
        existing.simulated_equity = 1000.0;
      }
      return NextResponse.json({
        success: true,
        data: sanitizeConfig(existing),
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
        "Asian_Judas_Swing",
        "SMT_Divergence",
      ],
      timeframe: "15m",
      risk_pct: 0.01,
      target_rr: 2.5,
      simulated_equity: 1000.0,
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
      ai_provider: "council_3model",
      gemini_api_key_override: null,
      gemini_model: "gemini-3.5-flash",
      qwen_api_key_override: null,
      qwen_base_url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      qwen_model: "qwen3.7-flash",
      openai_api_key_override: null,
      openai_model: "gpt-4o-mini",
      openai_base_url: "https://api.openai.com/v1",
      grok_api_key_override: null,
      grok_model: "grok-beta",
      grok_base_url: "https://api.x.ai/v1",
      council_chartist_provider: "openai",
      council_quant_provider: "grok",
      exchange_mode: "binance",
      bybit_api_key_override: null,
      bybit_secret_override: null,
      enable_forex_trading: true,
      forex_symbols: ["EUR/USD", "GBP/USD", "USD/JPY", "XAU/USD", "XAG/USD"],
      forex_max_leverage: 30,
      forex_weekend_shield: true,
      forex_rollover_shield: true,
      forex_max_spread_pips: 3.5,
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

    // Prevent masked secret strings from overwriting real secrets in the database
    const secretKeys = [
      "binance_api_key_override",
      "binance_secret_override",
      "bybit_api_key_override",
      "bybit_secret_override",
      "deepseek_key_override",
      "gemini_api_key_override",
      "qwen_api_key_override",
      "openai_api_key_override",
      "grok_api_key_override",
      "telegram_token_override",
    ];
    for (const key of secretKeys) {
      if (typeof payload[key] === "string" && (payload[key].includes("••••") || payload[key].includes("****"))) {
        delete payload[key];
      }
    }

    if (payload.target_rr !== undefined) {
      payload.target_rr = Math.max(1.5, Math.min(10.0, Number(payload.target_rr) || 2.5));
    }
    if (payload.simulated_equity !== undefined) {
      payload.simulated_equity = Math.max(10.0, Math.min(1000000.0, Number(payload.simulated_equity) || 1000.0));
    }

    // Use UPSERT so it will insert row 1 if missing, or update if existing!
    let { data: saved, error } = await supabase
      .from("bot_config")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      if (payload.simulated_equity !== undefined && (error.code === "PGRST204" || error.message?.includes("simulated_equity"))) {
        const fallbackPayload: Record<string, any> = { ...payload };
        const requestedSimEquity = fallbackPayload.simulated_equity;
        delete fallbackPayload.simulated_equity;

        const { data: retrySaved, error: retryErr } = await supabase
          .from("bot_config")
          .upsert(fallbackPayload, { onConflict: "id" })
          .select()
          .single();

        if (retryErr) {
          return NextResponse.json(
            {
              success: false,
              error: retryErr.message,
              code: retryErr.code,
              details: retryErr.details,
              hint: retryErr.hint,
            },
            { status: 400 }
          );
        }
        saved = { ...retrySaved, simulated_equity: requestedSimEquity };
      } else {
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
    }

    const maskKey = (val?: string | null) => {
      if (!val) return null;
      if (val.length <= 8) return "••••••••";
      return `${val.slice(0, 4)}••••${val.slice(-4)}`;
    };
    const maskSecret = (val?: string | null) => {
      if (!val) return null;
      return "••••••••••••••••";
    };

    const sanitizedSaved = {
      ...saved,
      binance_api_key_override: maskKey(saved.binance_api_key_override),
      binance_secret_override: maskSecret(saved.binance_secret_override),
      bybit_api_key_override: maskKey(saved.bybit_api_key_override),
      bybit_secret_override: maskSecret(saved.bybit_secret_override),
      deepseek_key_override: maskKey(saved.deepseek_key_override),
      gemini_api_key_override: maskKey(saved.gemini_api_key_override),
      qwen_api_key_override: maskKey(saved.qwen_api_key_override),
      openai_api_key_override: maskKey(saved.openai_api_key_override),
      grok_api_key_override: maskKey(saved.grok_api_key_override),
      telegram_token_override: maskKey(saved.telegram_token_override),
    };

    return NextResponse.json({
      success: true,
      message: "Configuration successfully committed and persisted to PostgreSQL database!",
      data: sanitizedSaved,
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
