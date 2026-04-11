import type { Metadata } from "next";
import { JetBrains_Mono, Noto_Sans_SC } from "next/font/google";

import { AppProviders } from "@/providers/app-providers";
import "./globals.css";

const notoSansSc = Noto_Sans_SC({
  variable: "--font-app-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-app-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hermes Agent — 工业级 Web UI",
  description: "面向 NousResearch/hermes-agent 的高性能流式对话与推理界面",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${notoSansSc.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="h-full overflow-hidden font-sans text-[15px] leading-relaxed text-zinc-100">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
