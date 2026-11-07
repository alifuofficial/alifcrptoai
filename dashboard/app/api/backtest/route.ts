import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { spawn } from "child_process";
import path from "path";

export const dynamic = "force-dynamic";

// GET /api/backtest - Returns saved historical backtest runs from Supabase
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol");
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    let query = supabase
      .from("backtest_runs")
      .select("*")
      .order("executed_at", { ascending: false })
      .limit(limit);

    if (symbol) {
      query = query.eq("symbol", symbol);
    }

    const { data, error } = await query;

    if (error) {
      // If table does not yet exist in Supabase, return graceful empty list
      return NextResponse.json({
        success: true,
        runs: [],
        note: error.message
      });
    }

    return NextResponse.json({
      success: true,
      runs: data || []
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch backtest runs" },
      { status: 500 }
    );
  }
}

// POST /api/backtest - Triggers a real historical backtest run
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const symbol = body.symbol || "BTC/USDT";
    const lookback_days = parseInt(body.lookback_days || "365", 10);
    const initial_capital = parseFloat(body.initial_capital || "100.0");
    const target_rr = parseFloat(body.target_rr || "2.5");

    // Resolve script path
    // Root directory is parent of dashboard
    const projectRoot = path.resolve(process.cwd(), "..");
    const backtestScript = path.resolve(projectRoot, "bot", "backtest.py");
    const localBacktestScript = path.resolve(process.cwd(), "bot", "backtest.py");

    const resolvedScript = require("fs").existsSync(backtestScript)
      ? backtestScript
      : localBacktestScript;

    // Execute Python backtester as a child process
    return new Promise<NextResponse>((resolve) => {
      // Try python, python3, or system executable
      const pythonExe = process.platform === "win32"
        ? (process.env.PYTHON_PATH || "C:\\Users\\Admin\\AppData\\Local\\Python\\bin\\python.exe")
        : "python3";

      const args = [
        resolvedScript,
        "--symbol", symbol,
        "--days", String(lookback_days),
        "--capital", String(initial_capital),
        "--rr", String(target_rr),
        "--save-db",
        "--json"
      ];

      let childProcess;
      try {
        childProcess = spawn(pythonExe, args, {
          env: { ...process.env, PYTHONUNBUFFERED: "1" }
        });
      } catch (spawnErr: any) {
        // Fallback to "python" if full path is invalid
        try {
          childProcess = spawn("python", args, {
            env: { ...process.env, PYTHONUNBUFFERED: "1" }
          });
        } catch (fallbackErr: any) {
          return resolve(
            NextResponse.json({
              success: false,
              error: `Python execution failed: ${spawnErr.message}`
            }, { status: 500 })
          );
        }
      }

      let stdoutData = "";
      let stderrData = "";

      childProcess.stdout.on("data", (chunk: any) => {
        stdoutData += chunk.toString();
      });

      childProcess.stderr.on("data", (chunk: any) => {
        stderrData += chunk.toString();
      });

      childProcess.on("close", async (code: number) => {
        if (code === 0 && stdoutData.trim()) {
          try {
            // Find JSON in stdout (in case log prints occurred before JSON)
            const jsonStart = stdoutData.indexOf("{");
            const jsonEnd = stdoutData.lastIndexOf("}");
            if (jsonStart !== -1 && jsonEnd !== -1) {
              const jsonStr = stdoutData.substring(jsonStart, jsonEnd + 1);
              const parsedReport = JSON.parse(jsonStr);

              // Also ensure inserted in Supabase from API if not already saved
              try {
                await supabase.from("backtest_runs").insert({
                  symbol: parsedReport.symbol,
                  exchange: "bybit" in symbol.toLowerCase() ? "bybit" : "binance",
                  timeframe: "15m",
                  lookback_days: parsedReport.lookback_days,
                  initial_capital: parsedReport.initial_capital,
                  final_capital: parsedReport.final_capital,
                  net_pnl_usdt: parsedReport.net_pnl_usdt,
                  net_return_pct: parsedReport.net_return_pct,
                  win_rate_pct: parsedReport.win_rate_pct,
                  profit_factor: parsedReport.profit_factor,
                  total_r_accumulated: parsedReport.total_r_accumulated,
                  max_drawdown_pct: parsedReport.max_drawdown_pct,
                  total_trades: parsedReport.total_trades,
                  wins: parsedReport.wins,
                  losses: parsedReport.losses,
                  breakevens: parsedReport.breakevens,
                  strategy_breakdown: parsedReport.strategies,
                  monthly_performance: parsedReport.monthly_performance,
                  equity_curve: parsedReport.equity_curve,
                  sample_trades: parsedReport.sample_trades,
                  executed_at: new Date().toISOString()
                });
              } catch (dbErr) {
                // Non-fatal if DB insert fails
              }

              return resolve(
                NextResponse.json({
                  success: true,
                  report: parsedReport
                })
              );
            }
          } catch (jsonErr) {
            // Fall through to error
          }
        }

        // Return error output or fallback response
        return resolve(
          NextResponse.json({
            success: false,
            error: stderrData || `Backtest process exited with code ${code}`,
            rawOutput: stdoutData.substring(0, 500)
          }, { status: 500 })
        );
      });

      // 60-second timeout
      setTimeout(() => {
        try {
          childProcess.kill();
        } catch (e) {}
        resolve(
          NextResponse.json({
            success: false,
            error: "Backtest execution timed out (exceeded 60 seconds)"
          }, { status: 504 })
        );
      }, 60000);
    });

  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Invalid backtest request" },
      { status: 400 }
    );
  }
}
