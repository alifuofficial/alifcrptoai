import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const tables = [
    "bot_config",
    "account_snapshots",
    "ai_audit_logs",
    "trade_executions",
    "trade_autopsies",
    "bot_lessons",
    "market_news",
    "strategy_performance_view",
  ];

  const results: Record<string, any> = {};

  for (const tbl of tables) {
    try {
      const { data, error, count } = await supabase
        .from(tbl)
        .select("*", { count: "exact", head: true });

      if (error) {
        results[tbl] = {
          exists: false,
          code: error.code,
          message: error.message,
        };
      } else {
        results[tbl] = {
          exists: true,
          count: count ?? 0,
        };
      }
    } catch (err: any) {
      results[tbl] = {
        exists: false,
        error: err.message,
      };
    }
  }

  const allExist = Object.values(results).every((r) => r.exists === true);

  return NextResponse.json({
    allTablesReady: allExist,
    schemaStatus: results,
  });
}
