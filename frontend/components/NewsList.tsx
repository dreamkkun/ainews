"use client";

interface NewsListProps {
  news:           any[];
  loading:        boolean;
  totalNews:      number;
  selectedSector: string;
}

function timeAgo(isoStr: string): string {
  try {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60)   return `${mins}분 전`;
    if (mins < 1440) return `${Math.floor(mins / 60)}시간 전`;
    return `${Math.floor(mins / 1440)}일 전`;
  } catch { return isoStr?.slice(0, 10) || ""; }
}

export default function NewsList({ news, loading, totalNews, selectedSector }: NewsListProps) {
  const label = selectedSector !== "전체" ? selectedSector : "전체 섹터";

  return (
    <div>
      <div style={{
        fontSize: "0.9rem", fontWeight: 700, color: "var(--text-muted)",
        textTransform: "uppercase", letterSpacing: "0.08em",
        marginBottom: 12, paddingBottom: 8,
        borderBottom: "1px solid var(--border)",
      }}>
        📰 수집된 뉴스 목록
      </div>

      <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 12 }}>
        <strong style={{ color: "var(--text-primary)" }}>{label}</strong> · {news.length}건
      </p>

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>로딩 중…</div>
      ) : news.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>
            {totalNews === 0 ? "📭" : "🔍"}
          </div>
          <p>{totalNews === 0 ? "수집된 뉴스가 없습니다." : "선택한 조건에 맞는 뉴스가 없습니다."}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {news.map((item) => (
            <div
              key={item.id}
              style={{
                background: "var(--bg-secondary)", border: "1px solid var(--border)",
                borderRadius: 10, padding: "16px 20px",
                transition: "border-color 0.2s",
                cursor: "pointer",
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--blue)")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
            >
              <a
                href={item.url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)",
                  lineHeight: 1.5, textDecoration: "none", display: "block", marginBottom: 8,
                }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--blue)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-primary)")}
              >
                {item.title}
              </a>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)", fontSize: "0.68rem", padding: "2px 7px", borderRadius: 4 }}>
                  {item.source}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>
                  {timeAgo(item.published_at)}
                </span>
                <span style={{ background: "var(--bg-tertiary)", color: "var(--purple)", fontSize: "0.68rem", padding: "2px 7px", borderRadius: 4 }}>
                  {item.sector}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
