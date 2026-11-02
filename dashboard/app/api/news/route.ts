import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

interface RawNewsItem {
  id?: number | string;
  title: string;
  source: string;
  url: string;
  coin: string;
  category: "crypto" | "macro";
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  impact: "HIGH" | "MEDIUM" | "LOW";
  published_at: string;
}

// Helper to determine sentiment based on headline keywords
function detectSentiment(title: string): "BULLISH" | "BEARISH" | "NEUTRAL" {
  const lower = title.toLowerCase();
  const bullishKeywords = [
    "surge", "rally", "skyrocket", "gain", "high", "ath", "inflow", "breakout", 
    "bull", "bullish", "approval", "etf", "accumulate", "jump", "record", "soar",
    "cut rate", "rate cut", "boost"
  ];
  const bearishKeywords = [
    "plunge", "crash", "drop", "hack", "exploit", "sec", "lawsuit", "ban",
    "bear", "bearish", "selloff", "liquidat", "dump", "fall", "low", "outflow",
    "collapse", "loss", "warning", "rate hike", "hike"
  ];

  for (const w of bullishKeywords) {
    if (lower.includes(w)) return "BULLISH";
  }
  for (const w of bearishKeywords) {
    if (lower.includes(w)) return "BEARISH";
  }
  return "NEUTRAL";
}

async function fetchExternalNewsAndMacro(): Promise<RawNewsItem[]> {
  const collected: RawNewsItem[] = [];

  // 1. Fetch CryptoCompare Headlines (BTC, ETH, SOL)
  try {
    const res = await fetch(
      "https://min-api.cryptocompare.com/data/v2/news/?categories=BTC,ETH,SOL&excludeCategories=Sponsored",
      {
        headers: { "User-Agent": "alifcrptoai/1.0" },
        next: { revalidate: 300 }, // 5 min cache
      }
    );
    if (res.ok) {
      const json = await res.json();
      const articles = json.Data || [];
      for (const item of articles.slice(0, 30)) {
        const title = (item.title || "").trim();
        if (!title) continue;

        let coin = "MARKET";
        const catStr = (item.categories || "").toUpperCase();
        if (catStr.includes("BTC")) coin = "BTC";
        else if (catStr.includes("ETH")) coin = "ETH";
        else if (catStr.includes("SOL")) coin = "SOL";

        const pubSecs = item.published_on ? Number(item.published_on) * 1000 : Date.now();

        collected.push({
          title,
          source: item.source_info?.name || "CryptoNews",
          url: item.url || "https://cryptocompare.com",
          coin,
          category: "crypto",
          sentiment: detectSentiment(title),
          impact: "MEDIUM",
          published_at: new Date(pubSecs).toISOString(),
        });
      }
    }
  } catch (err) {
    console.warn("[api/news] Failed to fetch CryptoCompare news:", err);
  }

  // 2. Fetch ForexFactory High-Impact USD Economic Calendar
  try {
    const ffRes = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
      headers: { "User-Agent": "Mozilla/5.0 alifcrptoai-macro" },
      next: { revalidate: 3600 },
    });
    if (ffRes.ok) {
      const events = await ffRes.json();
      if (Array.isArray(events)) {
        for (const ev of events) {
          if (ev.country === "USD" && ev.impact === "High") {
            const evTitle = ev.title || "USD High-Impact Release";
            collected.push({
              title: `USD High Impact: ${evTitle}`,
              source: "ForexFactory Calendar",
              url: "https://www.forexfactory.com/calendar",
              coin: "USD",
              category: "macro",
              sentiment: "NEUTRAL",
              impact: "HIGH",
              published_at: ev.date ? new Date(ev.date).toISOString() : new Date().toISOString(),
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn("[api/news] Failed to fetch ForexFactory calendar:", err);
  }

  return collected;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "true";
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  try {
    // 1. Try querying Supabase market_news table first
    if (!forceRefresh) {
      const { data: dbNews, error } = await supabase
        .from("market_news")
        .select("*")
        .order("published_at", { ascending: false })
        .limit(limit);

      if (!error && dbNews && dbNews.length > 0) {
        return NextResponse.json({
          success: true,
          source: "database",
          count: dbNews.length,
          data: dbNews,
        });
      }
    }

    // 2. If table empty, doesn't exist, or force refresh requested:
    const liveItems = await fetchExternalNewsAndMacro();

    // Attempt to persist to Supabase if table exists
    if (liveItems.length > 0) {
      try {
        await supabase.from("market_news").upsert(liveItems, { onConflict: "title" });
      } catch (upsertErr) {
        // Table might not exist yet; safe to ignore
      }
    }

    // Return the items
    return NextResponse.json({
      success: true,
      source: "live_sync",
      count: liveItems.length,
      data: liveItems.slice(0, limit),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to retrieve news",
        data: [],
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const liveItems = await fetchExternalNewsAndMacro();
    let savedCount = 0;

    if (liveItems.length > 0) {
      const { data, error } = await supabase
        .from("market_news")
        .upsert(liveItems, { onConflict: "title" })
        .select();

      if (!error && data) {
        savedCount = data.length;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synchronized ${liveItems.length} news & macro events to database`,
      savedCount,
      data: liveItems,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Sync failed" },
      { status: 500 }
    );
  }
}
