"use client";

export type TabKey = "news" | "analyze" | "recommend" | "portfolio";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "news",       label: "시장 뉴스",      icon: "📰" },
  { key: "analyze",    label: "기업 분석",      icon: "🔍" },
  { key: "recommend",  label: "오늘의 추천",    icon: "⭐" },
  { key: "portfolio",  label: "포트폴리오 추적", icon: "💼" },
];

interface TabNavProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

export default function TabNav({ active, onChange }: TabNavProps) {
  return (
    <header style={{
      background: "linear-gradient(135deg, #1C2333 0%, #0D1117 100%)",
      borderBottom: "1px solid #21262D",
      padding: "16px 32px",
      position: "sticky", top: 0, zIndex: 50,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 1280, margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#E6EDF3", letterSpacing: "-0.02em", margin: 0 }}>
          📊 AI 투자 인사이트 터미널
        </h1>
        <nav style={{ display: "flex", gap: 4 }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 16px", borderRadius: 8,
                fontSize: "0.85rem", fontWeight: 600,
                border: "none", cursor: "pointer",
                background: active === tab.key ? "#21262D" : "transparent",
                color: active === tab.key ? "#E6EDF3" : "#8B949E",
                transition: "all 0.15s",
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
