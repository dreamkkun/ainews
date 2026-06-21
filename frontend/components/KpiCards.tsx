"use client";

interface KpiCardsProps {
  stats:   any;
  loading: boolean;
}

const sentimentLabel: Record<string, { text: string; color: string }> = {
  positive: { text: "📈 강세", color: "#3FB950" },
  negative: { text: "📉 약세", color: "#F85149" },
  neutral:  { text: "➡️ 중립", color: "#8B949E" },
};

export default function KpiCards({ stats, loading }: KpiCardsProps) {
  const cards = [
    {
      label: "총 수집 뉴스",
      value: loading ? "…" : (stats?.total_news ?? 0),
      sub:   "전체 기간",
      color: "var(--text-primary)",
    },
    {
      label: "커버 섹터",
      value: loading ? "…" : (stats?.sectors ?? 0),
      sub:   "개 분야",
      color: "var(--text-primary)",
    },
    {
      label: "최신 시장 감성",
      value: loading ? "…" : (sentimentLabel[stats?.last_sentiment]?.text ?? "—"),
      sub:   "AI 종합 판단",
      color: loading ? "var(--text-primary)" : (sentimentLabel[stats?.last_sentiment]?.color ?? "var(--text-primary)"),
    },
    {
      label: "리포트 생성 횟수",
      value: loading ? "…" : (stats?.report_count ?? 0),
      sub:   "누적",
      color: "var(--text-primary)",
    },
  ];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 16,
      marginBottom: 24,
    }}>
      {cards.map((card) => (
        <div key={card.label} style={{
          background:   "var(--bg-secondary)",
          border:       "1px solid var(--border)",
          borderRadius: 10,
          padding:      "20px 24px",
          textAlign:    "center",
          transition:   "border-color 0.2s",
          cursor:       "default",
        }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--blue)")}
          onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
        >
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            {card.label}
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, color: card.color, lineHeight: 1 }}>
            {card.value}
          </div>
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 4 }}>
            {card.sub}
          </div>
        </div>
      ))}
    </div>
  );
}
