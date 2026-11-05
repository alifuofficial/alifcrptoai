import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import crypto from "crypto";
import dns from "dns";

// Force IPv4 resolution so outbound requests use 94.72.107.10 rather than VPS IPv6
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // ignore
}

export const dynamic = "force-dynamic";

interface BinanceTestOptions {
  apiKey?: string;
  secret?: string;
  sandbox?: boolean;
}

interface BybitTestOptions {
  apiKey?: string;
  secret?: string;
  sandbox?: boolean;
}

interface DeepSeekTestOptions {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

interface GeminiTestOptions {
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
    // 1. Test public ping & fetch Binance official server time to calculate clock drift
    let serverTime = Date.now();
    try {
      const timeRes = await fetch(`${baseUrl}/fapi/v1/time`, {
        method: "GET",
        signal: AbortSignal.timeout(6000),
      });
      if (timeRes.ok) {
        const timeData = await timeRes.json();
        if (timeData?.serverTime) {
          serverTime = Number(timeData.serverTime);
        }
      }
    } catch {
      // fallback
    }

    // 2. Discover outbound server IP for diagnostics
    let outboundIp = "94.72.107.10";
    try {
      const ipRes = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(3000) });
      if (ipRes.ok) {
        const ipData = await ipRes.json();
        if (ipData?.ip) outboundIp = ipData.ip;
      }
    } catch {
      // fallback
    }

    if (!apiKey || !secret) {
      return {
        success: false,
        service: "binance",
        message: `Binance server reachable, but API credentials are empty. Please enter your API Key & Secret.`,
        latencyMs: Date.now() - start,
        sandbox,
        configured: false,
        serverIp: outboundIp,
      };
    }

    // 3. Authenticated account balance query with auto-fallback between Live & Sandbox
    const checkAccount = async (targetBase: string) => {
      // Fetch target server time
      let targetTime = Date.now();
      try {
        const tRes = await fetch(`${targetBase}/fapi/v1/time`, { signal: AbortSignal.timeout(4000) });
        if (tRes.ok) {
          const tJson = await tRes.json();
          if (tJson?.serverTime) targetTime = Number(tJson.serverTime);
        }
      } catch {
        targetTime = Date.now();
      }

      const query = `timestamp=${targetTime}&recvWindow=60000`;
      const signature = crypto.createHmac("sha256", secret!).update(query).digest("hex");
      const res = await fetch(`${targetBase}/fapi/v2/account?${query}&signature=${signature}`, {
        method: "GET",
        headers: {
          "X-MBX-APIKEY": apiKey!,
        },
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data, targetTime };
    };

    let currentBaseUrl = sandbox ? "https://testnet.binancefuture.com" : "https://fapi.binance.com";
    let authCheck = await checkAccount(currentBaseUrl);

    // If currently in sandbox/testnet mode and failed with Code -2015 (common when using live Binance.com keys):
    // Automatically probe the LIVE production endpoint https://fapi.binance.com!
    if (!authCheck.ok && sandbox) {
      const liveCheck = await checkAccount("https://fapi.binance.com");
      if (liveCheck.ok) {
        authCheck = liveCheck;
        currentBaseUrl = "https://fapi.binance.com";
        sandbox = false;
        try {
          await supabase.from("bot_config").update({ sandbox_mode: false }).eq("id", 1);
        } catch {
          // ignore
        }
      }
    } else if (!authCheck.ok && !sandbox) {
      // If live failed, try testnet just in case user is testing with testnet keys
      const testnetCheck = await checkAccount("https://testnet.binancefuture.com");
      if (testnetCheck.ok) {
        authCheck = testnetCheck;
        currentBaseUrl = "https://testnet.binancefuture.com";
        sandbox = true;
        try {
          await supabase.from("bot_config").update({ sandbox_mode: true }).eq("id", 1);
        } catch {
          // ignore
        }
      }
    }

    const authLatency = Date.now() - start;
    const authData = authCheck.data;

    if (!authCheck.ok) {
      const errorMsg = authData?.msg || `HTTP ${authCheck.status}`;
      const errorCode = authData?.code ? `[Code ${authData.code}] ` : "";

      let diagnosticHint = "";
      if (authData?.code === -2015) {
        // Run a spot diagnostic to verify if keys & IP whitelist are valid
        const spotCheck = await (async () => {
          try {
            const q = `timestamp=${Date.now()}&recvWindow=60000`;
            const s = crypto.createHmac("sha256", secret!).update(q).digest("hex");
            const r = await fetch(`https://api.binance.com/api/v3/account?${q}&signature=${s}`, {
              method: "GET",
              headers: { "X-MBX-APIKEY": apiKey! },
              signal: AbortSignal.timeout(5000),
            });
            const d = await r.json().catch(() => ({}));
            return { ok: r.ok, data: d };
          } catch {
            return { ok: false, data: {} };
          }
        })();

        if (spotCheck.ok) {
          diagnosticHint = ` [DIAGNOSTIC]: Your API Key, Secret, and Server IP (${outboundIp}) are 100% VALID! However, Binance USDT-M Futures is not activated on this account. Please go to Binance -> Futures -> USD-M Futures and click "Open Futures Account" / accept the terms.`;
        } else {
          diagnosticHint = ` Server Outbound IP detected: ${outboundIp}. Please verify: (1) Server IP ${outboundIp} is added to the IP whitelist on Binance, (2) 'Enable Futures' is checked, and (3) Secret key was copied without missing characters.`;
        }
      }

      return {
        success: false,
        service: "binance",
        message: `Binance Auth Failed: ${errorCode}${errorMsg}.${diagnosticHint}`,
        latencyMs: authLatency,
        sandbox,
        configured: true,
        serverIp: outboundIp,
      };
    }

    const totalWallet = Number(authData.totalWalletBalance || 0);
    const available = Number(authData.availableBalance || 0);
    const canTrade = authData.canTrade !== false;
    const endpointLabel = currentBaseUrl.includes("testnet") ? "Testnet / Demo" : "LIVE Binance USD-M Futures";

    return {
      success: true,
      service: "binance",
      message: `Binance Connected (${endpointLabel})! Total: $${totalWallet.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDT (Trading: ${canTrade ? "Active" : "Disabled"}, Latency: ${authLatency}ms)`,
      latencyMs: authLatency,
      sandbox,
      configured: true,
      details: {
        totalWalletBalance: totalWallet,
        availableBalance: available,
        canTrade,
        serverTime: authData.updateTime,
        endpoint: currentBaseUrl,
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

async function testBybit(options?: BybitTestOptions) {
  const start = Date.now();
  let apiKey = options?.apiKey?.trim();
  let secret = options?.secret?.trim();
  let sandbox = options?.sandbox;

  if (!apiKey || !secret) {
    try {
      const { data: cfg } = await supabase.from("bot_config").select("*").eq("id", 1).maybeSingle();
      if (cfg) {
        if (!apiKey) apiKey = cfg.bybit_api_key_override?.trim() || process.env.BYBIT_API_KEY?.trim();
        if (!secret) secret = cfg.bybit_secret_override?.trim() || process.env.BYBIT_API_SECRET?.trim();
        if (sandbox === undefined) sandbox = Boolean(cfg.sandbox_mode);
      }
    } catch {
      // Fallback
    }
  }

  const baseUrl = sandbox ? "https://api-testnet.bybit.com" : "https://api.bybit.com";

  try {
    // 1. Check Bybit V5 public server time
    let serverTime = Date.now();
    try {
      const timeRes = await fetch(`${baseUrl}/v5/market/time`, {
        method: "GET",
        signal: AbortSignal.timeout(6000),
      });
      if (timeRes.ok) {
        const timeData = await timeRes.json();
        if (timeData?.timeSecond) {
          serverTime = Number(timeData.timeSecond) * 1000;
        }
      }
    } catch {
      // fallback
    }

    if (!apiKey || !secret) {
      return {
        success: false,
        service: "bybit",
        message: "Bybit V5 server reachable, but API credentials are empty. Please enter your Bybit API Key & Secret.",
        latencyMs: Date.now() - start,
        sandbox,
        configured: false,
      };
    }

    // 2. Query V5 Unified Trading Account balance
    const timestamp = Date.now().toString();
    const recvWindow = "10000";
    const queryString = "accountType=UNIFIED";
    const signString = timestamp + apiKey + recvWindow + queryString;
    const signature = crypto.createHmac("sha256", secret).update(signString).digest("hex");

    const authRes = await fetch(`${baseUrl}/v5/account/wallet-balance?${queryString}`, {
      method: "GET",
      headers: {
        "X-BAPI-API-KEY": apiKey,
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-SIGN": signature,
        "X-BAPI-RECV-WINDOW": recvWindow,
      },
      signal: AbortSignal.timeout(8000),
    });

    const authData = await authRes.json().catch(() => ({}));
    const latency = Date.now() - start;

    if (authData?.retCode === 0) {
      const list = authData.result?.list || [];
      const totalEquity = list[0]?.totalEquity ? Number(list[0].totalEquity) : 0;
      const totalWallet = list[0]?.totalWalletBalance ? Number(list[0].totalWalletBalance) : 0;
      const endpointLabel = sandbox ? "Testnet Bybit UTA" : "LIVE Bybit Unified Trading Account";

      return {
        success: true,
        service: "bybit",
        message: `Bybit Connected (${endpointLabel})! Equity: $${totalEquity.toLocaleString("en-US", { minimumFractionDigits: 2 })} (Latency: ${latency}ms)`,
        latencyMs: latency,
        sandbox,
        configured: true,
        details: {
          totalEquity,
          totalWalletBalance: totalWallet,
          endpoint: baseUrl,
        },
      };
    } else {
      const retMsg = authData?.retMsg || `HTTP ${authRes.status}`;
      return {
        success: false,
        service: "bybit",
        message: `Bybit Authentication Failed: [RetCode ${authData?.retCode}] ${retMsg}`,
        latencyMs: latency,
        sandbox,
        configured: true,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      service: "bybit",
      message: `Bybit Network Error: ${err.message}`,
      latencyMs: Date.now() - start,
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

async function testGemini(options?: GeminiTestOptions) {
  const start = Date.now();
  let apiKey = options?.apiKey?.trim();
  let model = options?.model?.trim() || "gemini-3.1-flash-lite";

  // Auto-upgrade deprecated / legacy model identifiers
  if (
    !model ||
    model === "gemini-2.5-flash" ||
    model === "gemini-1.5-flash" ||
    model === "gemini-2.0-flash" ||
    model === "gemini-2.5-flash-lite"
  ) {
    model = "gemini-3.1-flash-lite";
  }

  if (!apiKey) {
    try {
      const { data: cfg } = await supabase.from("bot_config").select("*").eq("id", 1).maybeSingle();
      if (cfg) {
        apiKey = cfg.gemini_api_key_override || process.env.GEMINI_API_KEY;
        if (cfg.gemini_model && !["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite"].includes(cfg.gemini_model)) {
          model = cfg.gemini_model;
        }
      }
    } catch {
      // Fallback
    }
  }

  if (!apiKey) {
    return {
      success: false,
      service: "gemini",
      message: "No Gemini API Key provided. Please enter your Google AI Studio API key.",
      configured: false,
      latencyMs: 0,
      model,
    };
  }

  const endpoint = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

  const runGeminiPing = async (targetModel: string) => {
    return fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: targetModel,
        messages: [
          { role: "system", content: "You are a quantitative trading auditor ping test." },
          { role: "user", content: "Reply with the single word: READY" },
        ],
        max_tokens: 15,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(12000),
    });
  };

  try {
    let aiRes = await runGeminiPing(model);
    let latencyMs = Date.now() - start;
    let aiData = await aiRes.json();

    // If 404 (model retired/deprecated for new API keys), auto-retry with gemini-3.1-flash-lite
    if (!aiRes.ok && aiRes.status === 404 && model !== "gemini-3.1-flash-lite") {
      model = "gemini-3.1-flash-lite";
      aiRes = await runGeminiPing(model);
      latencyMs = Date.now() - start;
      aiData = await aiRes.json();
    }

    if (!aiRes.ok) {
      const errMsg = aiData?.error?.message || aiData?.message || `HTTP ${aiRes.status}`;
      return {
        success: false,
        service: "gemini",
        message: `Gemini API Error (${aiRes.status}): ${errMsg}`,
        latencyMs,
        model,
        configured: true,
      };
    }

    const reply = aiData.choices?.[0]?.message?.content?.trim() || "READY";

    return {
      success: true,
      service: "gemini",
      message: `Gemini Free Tier Connected! Model '${model}' responded "${reply}" (${latencyMs}ms)`,
      latencyMs,
      model,
      configured: true,
      reply,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    return {
      success: false,
      service: "gemini",
      message: `Gemini Connection Failed: ${err.message}`,
      latencyMs,
      model,
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

    if (service === "bybit") {
      const result = await testBybit(params.bybit);
      return NextResponse.json(result);
    }

    if (service === "deepseek") {
      const result = await testDeepSeek(params.deepseek);
      return NextResponse.json(result);
    }

    if (service === "gemini") {
      const result = await testGemini(params.gemini);
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
    const [binanceRes, bybitRes, deepseekRes, geminiRes, telegramRes, dbRes] = await Promise.all([
      testBinance(params.binance),
      testBybit(params.bybit),
      testDeepSeek(params.deepseek),
      testGemini(params.gemini),
      testTelegram(params.telegram),
      testDatabase(),
    ]);

    const allSuccessful = binanceRes.success && (deepseekRes.success || geminiRes.success) && telegramRes.success && dbRes.success;

    return NextResponse.json({
      success: allSuccessful,
      service: "all",
      results: {
        binance: binanceRes,
        bybit: bybitRes,
        deepseek: deepseekRes,
        gemini: geminiRes,
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
  const [binanceRes, bybitRes, deepseekRes, geminiRes, telegramRes, dbRes] = await Promise.all([
    testBinance(),
    testBybit(),
    testDeepSeek(),
    testGemini(),
    testTelegram(),
    testDatabase(),
  ]);

  return NextResponse.json({
    success: binanceRes.success && (deepseekRes.success || geminiRes.success) && telegramRes.success && dbRes.success,
    service: "all",
    results: {
      binance: binanceRes,
      bybit: bybitRes,
      deepseek: deepseekRes,
      gemini: geminiRes,
      telegram: telegramRes,
      database: dbRes,
    },
  });
}
