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
    <div style={{
      display: "flex",
      minHeight: "100vh",
      background: "#0D1117",
      color: "#E6EDF3",
      fontFamily: "'Noto Sans KR', Inter, sans-serif",
    }}>
      <TabNav active={tab} onChange={setTab} />
      <main style={{
        flex: 1,
        minWidth: 0,
        overflowY: "auto",
        minHeight: "100vh",
      }}>
        {tab === "news"      && <NewsTab />}
        {tab === "analyze"  && <AnalyzeTab />}
        {tab === "recommend" && <RecommendTab />}
        {tab === "portfolio" && <PortfolioTab />}
      </main>
    </div>
  );
}
