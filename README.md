# alifcrptoai

**Author & Developer:** Alifu Haji (Individual Developer)  
**Target Architecture:** Contabo VPS (6 vCPU, 12GB RAM) via CapRover  
**Language / Stack:** Python 3.12 (`ccxt`, `supabase`, `openai`, `pandas`, `numpy`, `requests`), Next.js 14+ App Router (TypeScript, Tailwind CSS, `@supabase/supabase-js`, `lucide-react`), PostgreSQL (Supabase Realtime).

---

## Overview

`alifcrptoai` is an institutional-grade, self-improving autonomous crypto derivatives trading monorepo designed to deploy automatically to a Contabo VPS via CapRover. The engine trades Binance USDT-M Futures with multi-strategy signal scanning, deterministic DeepSeek AI risk auditing, USD macro blackout protection, and automated post-mortem autopsies.

### Key Capabilities

1. **Multi-Strategy Quantitative Plugins (`/bot/strategies.py`)**:
   - `SMC_Liquidity_Sweep`: 15-bar liquidity sweep + displacement reclaim + Fair Value Gap (FVG) confirmation.
   - `EMA_Trend_Pullback`: EMA 20/50 trend continuation with dynamic pullback bounce/rejection.
   - `BB_Volatility_Breakout`: Volatility squeeze compression (`bb_width < 0.025`) and breakout expansion on `RVOL >= 1.4`.
   - `RSI_Divergence_Reversal`: Extreme oversold/overbought exhaustion reclaim with engulfing price action.

2. **Zero-Cost News & USD Macro Shield (`/bot/news_macro.py`)**:
   - Live asset headlines from CryptoCompare (10-minute in-memory cache, 5s timeout).
   - High-Impact USD Economic Calendar from ForexFactory (6-hour cache). Implements a strict blackout window **30 minutes before** to **15 minutes after** major USD releases (CPI, FOMC, NFP, GDP, Powell speeches).

3. **Prefix-Cached DeepSeek AI Audits (`/bot/prompts.py`)**:
   - **Stage 1 (Binary Kill-Switch)**: Automatically vetoes trades on macro blackouts, opposing hard news, crowded funding rates, or $RR < 2.0$.
   - **Stage 2 (Discrete Rubric)**: DeepSeek acts as Chief Quantitative Risk Officer, enforcing chain-of-thought flaw deductions before assigning scores `{0, 12, 25}`, `{0, 7, 15}`, and `{0, 10, 20}`. Validated via deterministic Python clamping.

4. **Institutional Trade Management & Self-Learning (`/bot/bot.py`)**:
   - **+1.0R Break-Even & 50% Partial TP**: At +1.0R milestone, closes 50% at Market, cancels old SL, and places a native server-side `STOP_MARKET` order at entry + fee buffer for the remaining 50%.
   - **Zombie Trade Time-Stop**: Exits stagnating positions at Market if open for $\ge$ `max_hold_bars` with $< 0.5R$ gain.
   - **Post-Mortem Autopsies**: Triggered on `CLOSED_SL` trades, categorizing failure into one of 5 root causes and auto-injecting guardrail rules into `bot_lessons`.
   - **Statistical Self-Optimizer**: Automatically quarantines any strategy with $\ge 8$ trades and Profit Factor $< 0.80$.
   - **Correlation & Beta-Stacking Lock**: Clamps un-hedged open risk in the same direction to `max_directional_exposure_pct`.

5. **Next.js 14+ Command Center (`/dashboard/`)**:
   - Real-time Supabase subscriptions for telemetry, live positions, audit streams, and settings.
   - Leaderboard comparing strategies across closed trades, win rates, and profit factors.
   - Discovered weaknesses queue with "Approve & Inject Rule" and "Dismiss" buttons.
   - Emergency Panic Flatten switch to cancel all orders and close all positions immediately.
   - Standalone Next.js Docker container for CapRover.

---

## Monorepo Directory Structure

```
alifcrptoai/
├── .github/
│   └── workflows/
│       └── deploy-caprover.yml    # Automated CapRover CI/CD workflow
├── supabase/
│   └── schema.sql                 # PostgreSQL schema, view, RLS, and Realtime publication
├── bot/
│   ├── bot.py                     # Master execution, risk & self-learning loop
│   ├── strategies.py              # 4 quantitative strategy plugins & indicators
│   ├── news_macro.py              # CryptoCompare headlines & USD Macro calendar
│   ├── notifier.py                # Telegram push alerts & notifications
│   ├── prompts.py                 # Prefix-cached DeepSeek audit & autopsy prompts
│   ├── requirements.txt           # Python dependencies
│   ├── Dockerfile                 # Contabo VPS-optimized container
│   ├── captain-definition         # CapRover deployment schema
│   └── .env.example               # Worker environment variables
└── dashboard/
    ├── app/                       # Next.js App Router (Command Center & Login)
    ├── lib/                       # Supabase client singleton
    ├── package.json
    ├── tsconfig.json
    ├── next.config.mjs            # Standalone output configuration
    ├── tailwind.config.ts         # Dark-mode styling with high-contrast accents
    ├── postcss.config.mjs
    ├── Dockerfile                 # Multi-stage standalone build
    ├── captain-definition         # CapRover deployment schema
    └── .env.example               # Dashboard public environment variables
```

---

## Deployment & Setup

### 1. Database Setup (Supabase)
1. In your Supabase project, navigate to the **SQL Editor**.
2. Run the script in [`supabase/schema.sql`](./supabase/schema.sql).
3. Under **Authentication > Users**, create your operator login email and password.

### 2. CapRover Setup (Contabo VPS)
Create two apps in CapRover:
1. `alifcrptoai-bot`:
   - Set environment variables as documented in [`bot/.env.example`](./bot/.env.example).
   - Under **Deployment**, enable **App Token** and copy the secret.
2. `alifcrptoai-dashboard`:
   - Set environment variables as documented in [`dashboard/.env.example`](./dashboard/.env.example).
   - Enable HTTPS / SSL.
   - Under **Deployment**, enable **App Token** and copy the secret.

### 3. GitHub Secrets
In this GitHub repository under **Settings > Secrets and variables > Actions**, add:
- `CAPROVER_SERVER`: `https://captain.yourdomain.com`
- `BOT_APP_TOKEN`: App Token for `alifcrptoai-bot`
- `DASHBOARD_APP_TOKEN`: App Token for `alifcrptoai-dashboard`

Pushing to `main` will automatically trigger CapRover deployment for both services.

---

## License
Proprietary software developed by Alifu Haji. All rights reserved.
