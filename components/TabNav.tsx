"use client";
export type TabKey = "news" | "analyze" | "recommend" | "portfolio";

const TABS: { key: TabKey; icon: string; label: string }[] = [
  { key: "news",      icon: "📰", label: "시장 뉴스" },
  { key: "analyze",  icon: "🔍", label: "기업 분석" },
  { key: "recommend",icon: "⭐", label: "오늘의 추천" },
  { key: "portfolio",icon: "💼", label: "포트폴리오" },
];

interface Props { active: TabKey; onChange: (k: TabKey) => void; }

export default function TabNav({ active, onChange }: Props) {
  return (
    <aside style={{
      width: 220,
      minHeight: "100vh",
      background: "#0D1117",
      borderRight: "1px solid #21262D",
      display: "flex",
      flexDirection: "column",
      padding: "0",
      flexShrink: 0,
    }}>
      {/* 로고 */}
      <div style={{
        padding: "24px 20px 20px",
        borderBottom: "1px solid #21262D",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: "1.4rem" }}>📊</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#E6EDF3", letterSpacing: "-0.02em", lineHeight: 1.2 }}>AI 투자</div>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#58A6FF", letterSpacing: "-0.02em", lineHeight: 1.2 }}>인사이트</div>
          </div>
        </div>
      </div>

      {/* 메뉴 */}
      <nav style={{ padding: "12px 10px", flex: 1 }}>
        {TABS.map(t => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                padding: "11px 14px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                marginBottom: 4,
                background: isActive ? "#161B22" : "transparent",
                color: isActive ? "#E6EDF3" : "#8B949E",
                fontWeight: isActive ? 700 : 400,
                fontSize: "0.9rem",
                textAlign: "left",
                transition: "background .15s, color .15s",
                borderLeft: isActive ? "3px solid #58A6FF" : "3px solid transparent",
              }}
            >
              <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* 하단 면책 */}
      <div style={{ padding: "16px 18px", borderTop: "1px solid #21262D" }}>
        <p style={{ color: "#30363D", fontSize: "0.68rem", lineHeight: 1.6, margin: 0 }}>
          투자 판단의 최종 책임은<br />본인에게 있습니다
        </p>
      </div>
    </aside>
  );
}
