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
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-indigo-500/15 selection:text-indigo-800">
        {children}
      </body>
    </html>
  );
}
