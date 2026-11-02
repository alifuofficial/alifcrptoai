import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "alifcrptoai — Autonomous Derivatives Command Center",
  description:
    "Institutional autonomous crypto trading engine with DeepSeek AI risk auditing & self-improving post-mortems. Developed by Alifu Haji.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-cyan-500/20 selection:text-cyan-300">
        {children}
      </body>
    </html>
  );
}
