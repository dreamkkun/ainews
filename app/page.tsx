"use client";
import { useState } from "react";
import TabNav, { TabKey } from "@/components/TabNav";
import NewsTab from "@/components/NewsTab";
import AnalyzeTab from "@/components/AnalyzeTab";
import RecommendTab from "@/components/RecommendTab";
import PortfolioTab from "@/components/PortfolioTab";

export default function Home() {
  const [tab, setTab] = useState<TabKey>("news");
  return (
    <div style={{ minHeight: "100vh", background: "#0D1117", color: "#E6EDF3", fontFamily: "'Noto Sans KR', Inter, sans-serif" }}>
      <TabNav active={tab} onChange={setTab} />
      <main style={{ minHeight: "calc(100vh - 64px)" }}>
        {tab === "news"      && <NewsTab />}
        {tab === "analyze"   && <AnalyzeTab />}
        {tab === "recommend" && <RecommendTab />}
        {tab === "portfolio" && <PortfolioTab />}
      </main>
      <footer style={{ textAlign: "center", padding: "24px 0", color: "#30363D", fontSize: "0.75rem", borderTop: "1px solid #21262D" }}>
        AI 투자 인사이트 터미널 · 투자 판단의 최종 책임은 본인에게 있습니다
      </footer>
    </div>
  );
}
