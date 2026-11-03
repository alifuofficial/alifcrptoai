import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import crypto from "crypto";

export const dynamic = "force-dynamic";

interface BinanceTestOptions {
  apiKey?: string;
  secret?: string;
  sandbox?: boolean;
}

interface DeepSeekTestOptions {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

interface TelegramTestOptions {
  token?: string;
  chatId?: string;
  sendTestMessage?: boolean;
}

async function testBinance(options?: BinanceTestOptions) {
  const start = Date.now();
  let apiKey = options?.apiKey?.trim();
  let secret = options?.secret?.trim();
  let sandbox = options?.sandbox;

  if (!apiKey || !secret) {
    try {
      const { data: cfg } = await supabase.from("bot_config").select("*").eq("id", 1).maybeSingle();
      if (cfg) {
        if (!apiKey) apiKey = cfg.binance_api_key_override?.trim() || process.env.BINANCE_API_KEY?.trim();
        if (!secret) secret = cfg.binance_secret_override?.trim() || process.env.BINANCE_SECRET?.trim();
        if (sandbox === undefined) sandbox = Boolean(cfg.sandbox_mode);
      }
    } catch {
      // Fallback
    }
  }

  const baseUrl = sandbox ? "https://testnet.binancefuture.com" : "https://fapi.binance.com";

  try {
    // 1. Test public ping & server time
    const pingRes = await fetch(`${baseUrl}/fapi/v1/ping`, {
      method: "GET",
      signal: AbortSignal.timeout(6000),
    });
    const pingLatency = Date.now() - start;

    if (!pingRes.ok) {
      return {
        success: false,
        service: "binance",
        message: `Binance gateway responded with HTTP ${pingRes.status} (${pingLatency}ms)`,
        latencyMs: pingLatency,
        sandbox,
        configured: Boolean(apiKey && secret),
      };
    }

    if (!apiKey || !secret) {
      return {
        success: false,
        service: "binance",
        message: `Binance server reachable (${pingLatency}ms), but API credentials are empty. Please enter your API Key & Secret.`,
        latencyMs: pingLatency,
        sandbox,
        configured: false,
      };
    }

    // 2. Authenticated account balance query
    const timestamp = Date.now();
    const query = `timestamp=${timestamp}`;
    const signature = crypto.createHmac("sha256", secret).update(query).digest("hex");

    const authRes = await fetch(`${baseUrl}/fapi/v2/account?${query}&signature=${signature}`, {
      method: "GET",
      headers: {
        "X-MBX-APIKEY": apiKey,
      },
      signal: AbortSignal.timeout(8000),
    });

    const authLatency = Date.now() - start;
    const authData = await authRes.json();

    if (!authRes.ok) {
      const errorMsg = authData?.msg || `HTTP ${authRes.status}`;
      const errorCode = authData?.code ? `[Code ${authData.code}] ` : "";
      return {
        success: false,
        service: "binance",
        message: `Binance Auth Failed: ${errorCode}${errorMsg}`,
        latencyMs: authLatency,
        sandbox,
        configured: true,
      };
    }

    const totalWallet = Number(authData.totalWalletBalance || 0);
    const available = Number(authData.availableBalance || 0);
    const canTrade = authData.canTrade !== false;

    return {
      success: true,
      service: "binance",
      message: `Binance Futures Connected! Total: $${totalWallet.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDT (Trading: ${canTrade ? "Active" : "Disabled"}, Latency: ${authLatency}ms)`,
      latencyMs: authLatency,
      sandbox,
      configured: true,
      details: {
        totalWalletBalance: totalWallet,
        availableBalance: available,
        canTrade,
        serverTime: authData.updateTime,
      },
    };
  } catch (err: any) {
    const latency = Date.now() - start;
    return {
      success: false,
      service: "binance",
      message: `Binance Network Error / Timeout: ${err.message}`,
      latencyMs: latency,
      sandbox,
      configured: Boolean(apiKey && secret),
    };
  }
}

async function testDeepSeek(options?: DeepSeekTestOptions) {
  const start = Date.now();
  let baseUrl = options?.baseUrl?.trim();
  let apiKey = options?.apiKey?.trim();
  let model = options?.model?.trim();

  if (!baseUrl || !apiKey || !model) {
    try {
      const { data: cfg } = await supabase.from("bot_config").select("*").eq("id", 1).maybeSingle();
      if (cfg) {
        if (!baseUrl) baseUrl = cfg.deepseek_base_url || "https://api.deepseek.com";
        if (!apiKey) apiKey = cfg.deepseek_key_override || process.env.DEEPSEEK_API_KEY;
        if (!model) model = cfg.deepseek_model || "deepseek-chat";
      }
    } catch {
      // Fallback
    }
  }

  baseUrl = baseUrl || "https://api.deepseek.com";
  model = model || "deepseek-chat";

  if (!apiKey) {
    return {
      success: false,
      service: "deepseek",
      message: "No AI API Key provided. Please enter your DeepSeek, OpenRouter, or BeatAPI key.",
      configured: false,
      latencyMs: 0,
      model,
      baseUrl,
    };
  }

  let endpoint = baseUrl.replace(/\/+$/, "");
  if (!endpoint.endsWith("/chat/completions")) {
    endpoint = `${endpoint}/chat/completions`;
  }

  try {
    const isSpecialRouter = baseUrl.includes("openrouter.ai");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    };
    if (isSpecialRouter) {
      headers["HTTP-Referer"] = "https://alifcrptoai.local";
      headers["X-Title"] = "alifcrptoai Quantitative Trader";
    }

    const aiRes = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a quantitative trading auditor ping test." },
          { role: "user", content: "Reply with the single word: READY" },
        ],
        max_tokens: 15,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(12000),
    });

    const latencyMs = Date.now() - start;
    const aiData = await aiRes.json();

    if (!aiRes.ok) {
      const errMsg = aiData?.error?.message || aiData?.message || `HTTP ${aiRes.status}`;
      return {
        success: false,
        service: "deepseek",
        message: `AI Endpoint Error (${aiRes.status}): ${errMsg}`,
        latencyMs,
        model,
        baseUrl,
        configured: true,
      };
    }

    const reply = aiData.choices?.[0]?.message?.content?.trim() || "READY";

    return {
      success: true,
      service: "deepseek",
      message: `AI Endpoint Connected! Model '${model}' responded "${reply}" (${latencyMs}ms)`,
      latencyMs,
      model,
      baseUrl,
      configured: true,
      reply,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    return {
      success: false,
      service: "deepseek",
      message: `AI Endpoint Unreachable: ${err.message}`,
      latencyMs,
      model,
      baseUrl,
      configured: true,
    };
  }
}

async function testTelegram(options?: TelegramTestOptions) {
  const start = Date.now();
  let token = options?.token?.trim();
  let chatId = options?.chatId?.trim();
  const sendTestMessage = options?.sendTestMessage ?? true;

  if (!token || !chatId) {
    try {
      const { data: cfg } = await supabase.from("bot_config").select("*").eq("id", 1).maybeSingle();
      if (cfg) {
        if (!token) token = cfg.telegram_token_override || process.env.TELEGRAM_BOT_TOKEN;
        if (!chatId) chatId = cfg.telegram_chat_id_override || process.env.TELEGRAM_CHAT_ID;
      }
    } catch {
      // Fallback
    }
  }

  if (!token) {
    return {
      success: false,
      service: "telegram",
      message: "No Telegram Bot Token provided. Enter a bot token created with @BotFather.",
      configured: false,
      latencyMs: 0,
    };
  }

  try {
    const getMeRes = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      method: "GET",
      signal: AbortSignal.timeout(7000),
    });

    const latencyMs = Date.now() - start;
    const getMeData = await getMeRes.json();

    if (!getMeRes.ok || !getMeData.ok) {
      const desc = getMeData?.description || `HTTP ${getMeRes.status}`;
      return {
        success: false,
        service: "telegram",
        message: `Telegram Token Invalid: ${desc}`,
        latencyMs,
        configured: true,
      };
    }

    const botUser = getMeData.result;
    const botHandle = botUser.username ? `@${botUser.username}` : botUser.first_name;

    if (chatId && sendTestMessage) {
      const msgText = `🔔 *[alifcrptoai Trading Engine]*\n\n✅ *API Connection Test Successful!*\nTelegram push alert delivery is active and operational.\n\n⏱ _Diagnostic Latency: ${latencyMs}ms_`;
      const sendRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: msgText,
          parse_mode: "Markdown",
        }),
        signal: AbortSignal.timeout(7000),
      });

      const sendData = await sendRes.json();
      if (!sendRes.ok || !sendData.ok) {
        const desc = sendData?.description || `HTTP ${sendRes.status}`;
        return {
          success: false,
          service: "telegram",
          message: `Bot ${botHandle} valid, but failed to deliver to Chat ID '${chatId}': ${desc}`,
          latencyMs: Date.now() - start,
          botHandle,
          configured: true,
        };
      }

      return {
        success: true,
        service: "telegram",
        message: `Telegram Connected as ${botHandle}! Test notification delivered to Chat ID ${chatId}.`,
        latencyMs: Date.now() - start,
        botHandle,
        configured: true,
      };
    }

    return {
      success: true,
      service: "telegram",
      message: `Telegram Connected as ${botHandle}. Add Chat ID to test live alert delivery.`,
      latencyMs,
      botHandle,
      configured: true,
    };
  } catch (err: any) {
    return {
      success: false,
      service: "telegram",
      message: `Telegram Gateway Error: ${err.message}`,
      latencyMs: Date.now() - start,
      configured: true,
    };
  }
}

async function testDatabase() {
  const start = Date.now();
  try {
    const { error } = await supabase.from("bot_config").select("id, is_active").eq("id", 1).maybeSingle();
    const latencyMs = Date.now() - start;
    if (error) {
      return {
        success: false,
        service: "database",
        message: `Supabase Database error: ${error.message}`,
        latencyMs,
        configured: true,
      };
    }
    return {
      success: true,
      service: "database",
      message: `PostgreSQL Database operational (Latency: ${latencyMs}ms)`,
      latencyMs,
      configured: true,
    };
  } catch (err: any) {
    return {
      success: false,
      service: "database",
      message: `Supabase Connection Error: ${err.message}`,
      latencyMs: Date.now() - start,
      configured: true,
    };
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { service = "all", params = {} } = body;

    if (service === "binance") {
      const result = await testBinance(params.binance);
      return NextResponse.json(result);
    }

    if (service === "deepseek") {
      const result = await testDeepSeek(params.deepseek);
      return NextResponse.json(result);
    }

    if (service === "telegram") {
      const result = await testTelegram(params.telegram);
      return NextResponse.json(result);
    }

    if (service === "database") {
      const result = await testDatabase();
      return NextResponse.json(result);
    }

    // Default: Test all services
    const [binanceRes, deepseekRes, telegramRes, dbRes] = await Promise.all([
      testBinance(params.binance),
      testDeepSeek(params.deepseek),
      testTelegram(params.telegram),
      testDatabase(),
    ]);

    const allSuccessful = binanceRes.success && deepseekRes.success && telegramRes.success && dbRes.success;

    return NextResponse.json({
      success: allSuccessful,
      service: "all",
      results: {
        binance: binanceRes,
        deepseek: deepseekRes,
        telegram: telegramRes,
        database: dbRes,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: `API Diagnostics Dispatcher Error: ${err.message}`,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  const [binanceRes, deepseekRes, telegramRes, dbRes] = await Promise.all([
    testBinance(),
    testDeepSeek(),
    testTelegram(),
    testDatabase(),
  ]);

  return NextResponse.json({
    success: binanceRes.success && deepseekRes.success && telegramRes.success && dbRes.success,
    service: "all",
    results: {
      binance: binanceRes,
      deepseek: deepseekRes,
      telegram: telegramRes,
      database: dbRes,
    },
  });
}
