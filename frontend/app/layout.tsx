import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 경제뉴스 인사이트",
  description: "실시간 경제 뉴스 수집 · AI 종합 분석 · 투자 인사이트 도출",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
