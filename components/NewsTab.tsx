"use client";
import { useState, useEffect, useCallback } from "react";
import { NewsItem, MarketReport } from "@/lib/types";

const SECTORS = ["전체", "반도체", "거시경제", "IT/플랫폼", "바이오", "에너지/소재", "금융", "자동차", "일반경제"];

export default function NewsTab() {
  const [news, setNews]       = useState<NewsItem[]>([]);
  const [report, setReport]   = useState<MarketReport | null>(null);
  const [stats, setStats]     = useState({ total: 0, sectors: 0, reportCount: 0 });
  const [loading, setLoading] = useState(false);
  const [sector, setSector]   = useState("전체");
  const [keyword, setKeyword] = useState("");
  const [activeTab, setTab]   = useState(0);

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams();
    if (sector !== "전체") params.set("sector", sector);
    if (keyword) params.set("keyword", keyword);
    const [nRes, rRes, sRes] = await Promise.all([
      fetch(`/api/news?${params}`),
      fetch("/api/report/latest"),
      fetch("/api/stats"),
    ]);
    if (nRes.ok) setNews(await nRes.json());
    if (rRes.ok) setReport(await rRes.json());
    if (sRes.ok) setStats(await sRes.json());
  }, [sector, keyword]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const collect = async () => {
    setLoading(true);
    try {
      await fetch("/api/collect", { method: "POST" });
      await fetchData();
    } finally {
      setLoading(false);
    }
  };

  const timeAgo = (iso: string) => {
    try {
      const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
      if (mins < 60) return `${mins}분 전`;
      if (mins < 1440) return `${Math.floor(mins / 60)}시간 전`;
      return `${Math.floor(mins / 1440)}일 전`;
    } catch { return iso.slice(0, 10); }
  };

  const sentimentIcon = (s?: string) =>
    ({ positive: "📈 강세", negative: "📉 약세", neutral: "➡️ 중립" }[s ?? ""] ?? "—");

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1280, margin: "0 auto" }}>
      {/* 필터 바 */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <select value={sector} onChange={e => setSector(e.target.value)} style={sel}>
          {SECTORS.map(s => <option key={s}>{s}</option>)}
        </select>
        <input value={keyword} onChange={e => setKeyword(e.target.value)}
          placeholder="키워드 검색 (예: 금리, 삼성전자)" style={{ ...sel, flex: 1, minWidth: 200 }} />
        <button onClick={collect} disabled={loading} style={btnGreen}>
          {loading ? "수집 중…" : "🔄 뉴스 수집 & 리포트 생성"}
        </button>
      </div>

      {/* KPI 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "총 수집 뉴스",    value: stats.total,       sub: "전체 기간" },
          { label: "커버 섹터",       value: stats.sectors,     sub: "개 분야" },
          { label: "최신 시장 감성",  value: sentimentIcon(report?.sentiment), sub: "AI 종합 판단", sm: true },
          { label: "리포트 생성 횟수", value: stats.reportCount, sub: "누적" },
        ].map(k => (
          <div key={k.label} style={kpiCard}>
            <div style={kpiLbl}>{k.label}</div>
            <div style={{ ...kpiVal, fontSize: k.sm ? "1.4rem" : "2rem" }}>{k.value}</div>
            <div style={kpiSub}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* AI 리포트 */}
      <div style={secTitle}>🤖 AI 종합 시장 리포트</div>
      {!report ? (
        <div style={empty}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>📭</div>
          <p style={{ color: "#E6EDF3" }}>아직 생성된 리포트가 없습니다.</p>
          <p style={{ fontSize: "0.85rem" }}>위의 뉴스 수집 버튼을 눌러 시작하세요.</p>
        </div>
      ) : (
        <div style={reportBox}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #21262D" }}>
            <div>
              <div style={{ fontWeight: 700, color: "#E6EDF3" }}>오늘의 시장 종합 분석</div>
              <div style={{ fontSize: "0.75rem", color: "#8B949E" }}>
                {report.generatedAt?.slice(0, 16).replace("T", " ")} · {report.newsCount}건
              </div>
            </div>
            <SentimentPill s={report.sentiment} />
          </div>

          {/* 내부 탭 */}
          <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
            {["📋 시장 요약 & 섹터 동향", "💡 투자 인사이트", "⚠️ 리스크 요인"].map((t, i) => (
              <button key={i} onClick={() => setTab(i)} style={{
                padding: "7px 14px", borderRadius: 6, fontSize: "0.82rem", border: "none", cursor: "pointer",
                background: activeTab === i ? "#21262D" : "transparent",
                color: activeTab === i ? "#E6EDF3" : "#8B949E",
              }}>{t}</button>
            ))}
          </div>

          {activeTab === 0 && (
            <>
              <div style={insightPanel}>
                <div style={phGreen}>📊 오늘의 시장 요약</div>
                <p style={{ color: "#C9D1D9", fontSize: "0.92rem", lineHeight: 1.8, margin: 0 }}>{report.marketSummary}</p>
              </div>
              {report.sectorInsights?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={phGreen}>📌 섹터별 감성</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8, marginBottom: 12 }}>
                    {report.sectorInsights.map(s => <SectorChip key={s.sector} s={s} />)}
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead>
                      <tr>{["섹터", "감성", "핵심 동향"].map(h => <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "#8B949E", fontWeight: 600 }}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {report.sectorInsights.map(s => (
                        <tr key={s.sector} style={{ borderBottom: "1px solid #21262D" }}>
                          <td style={{ padding: "8px 12px", color: "#C9D1D9" }}>{s.sector}</td>
                          <td style={{ padding: "8px 12px", color: "#C9D1D9" }}>{{ positive: "▲ 긍정", negative: "▼ 부정", neutral: "— 중립" }[s.sentiment]}</td>
                          <td style={{ padding: "8px 12px", color: "#C9D1D9" }}>{s.summary}</td>
                        </tr>
                      ))}
                    </tbody>
2                  </table>
                </div>
              )}
            </>
          )}
          {activeTab === 1 && (
            <div style={insightPanel}>
              <div style={phGreen}>💡 투자자 핵심 액션 포인트</div>
              <pre style={{ color: "#C9D1D9", fontSize: "0.9rem", whiteSpace: "pre-wrap", margin: 0 }}>{report.topInsights}</pre>
              {report.topTickers?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ ...phGreen, marginBottom: 8 }}>📌 주목 종목</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {report.topTickers.map(t => (
                      <span key={t} style={{ background: "#1C2333", border: "1px solid #30363D", color: "#79C0FF", fontSize: "0.72rem", padding: "3px 8px", borderRadius: 4 }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
              <p style={{ color: "#8B949E", fontSize: "0.75rem", marginTop: 12, marginBottom: 0 }}>※ 투자 권유가 아닙니다. 참고용으로만 활용하세요.</p>
            </div>
          )}
          {activeTab === 2 && (
            <div style={riskPanel}>
              <div style={phRed}>⚠️ 오늘의 주요 리스크 요인</div>
              <pre style={{ color: "#C9D1D9", fontSize: "0.9rem", whiteSpace: "pre-wrap", margin: 0 }}>{report.riskFactors}</pre>
            </div>
          )}
        </div>
      )}

      {/* 뉴스 목록 */}
      <div style={{ ...secTitle, marginTop: 32 }}>📰 수집된 뉴스 목록</div>
      <p style={{ color: "#8B949E", fontSize: "0.85rem", marginBottom: 12 }}>
        <strong style={{ color: "#E6EDF3" }}>{sector === "전체" ? "전체 섹터" : sector}</strong> · {news.length}건
      </p>
      {news.length === 0 ? (
        <div style={empty}><div style={{ fontSize: "3rem" }}>📭</div><p>수집된 뉴스가 없습니다.</p></div>
      ) : news.map(n => (
        <div key={n.id} style={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 10, padding: "16px 20px", marginBottom: 10 }}>
          <a href={n.url} target="_blank" rel="noreferrer"
            style={{ color: "#E6EDF3", fontWeight: 600, fontSize: "0.95rem", textDecoration: "none", lineHeight: 1.5 }}>
            {n.title}
          </a>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <span style={{ background: "#21262D", color: "#8B949E", fontSize: "0.68rem", padding: "2px 7px", borderRadius: 4 }}>{n.source}</span>
            <span style={{ color: "#8B949E", fontSize: "0.72rem" }}>{timeAgo(n.publishedAt)}</span>
            <span style={{ background: "#1C2333", color: "#79C0FF", fontSize: "0.68rem", padding: "2px 7px", borderRadius: 4 }}>{n.sector}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SentimentPill({ s }: { s: string }) {
  const map: Record<string, [string, string, string]> = {
    positive: ["#1A3C2F", "#3FB950", "▲ 강세"],
    negative: ["#3C1A1A", "#F85149", "▼ 약세"],
    neutral:  ["#21262D", "#8B949E", "— 중립"],
  };
  const [bg, color, label] = map[s] ?? map.neutral;
  return <span style={{ background: bg, color, border: `1px solid ${color}`, padding: "5px 14px", borderRadius: 20, fontSize: "0.78rem", fontWeight: 700 }}>{label}</span>;
}

function SectorChip({ s }: { s: { sector: string; sentiment: string } }) {
  const map: Record<string, [string, string, string, string]> = {
    positive: ["#1A3C2F", "#3FB950", "#2EA043", "▲"],
    negative: ["#3C1A1A", "#F85149", "#DA3633", "▼"],
    neutral:  ["#21262D", "#8B949E", "#30363D", "—"],
  };
  const [bg, color, border, icon] = map[s.sentiment] ?? map.neutral;
  return <span style={{ background: bg, color, border: `1px solid ${border}`, padding: "6px 12px", borderRadius: 8, fontSize: "0.78rem" }}>{icon} {s.sector}</span>;
}

const sel: React.CSSProperties = { background: "#161B22", border: "1px solid #30363D", color: "#E6EDF3", padding: "8px 12px", borderRadius: 8, fontSize: "0.85rem" };
const btnGreen: React.CSSProperties = { background: "#238636", color: "#fff", border: "none", padding: "9px 18px", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" };
const kpiCard: React.CSSProperties = { background: "#161B22", border: "1px solid #21262D", borderRadius: 10, padding: "20px 24px", textAlign: "center" };
const kpiLbl: React.CSSProperties = { fontSize: "0.72rem", color: "#8B949E", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 };
const kpiVal: React.CSSProperties = { fontWeight: 700, color: "#E6EDF3", lineHeight: 1 };
const kpiSub: React.CSSProperties = { color: "#8B949E", fontSize: "0.82rem", marginTop: 4 };
const secTitle: React.CSSProperties = { fontSize: "0.9rem", fontWeight: 700, color: "#8B949E", textTransform: "uppercase", letterSpacing: "0.08em", margin: "24px 0 12px", paddingBottom: 8, borderBottom: "1px solid #21262D" };
const reportBox: React.CSSProperties = { background: "linear-gradient(135deg,#161B22 0%,#1C2333 100%)", border: "1px solid #30363D", borderRadius: 14, padding: "28px 32px" };
const insightPanel: React.CSSProperties = { background: "#0D1117", border: "1px solid #30363D", borderLeft: "3px solid #3FB950", borderRadius: 8, padding: "16px 20px" };
const riskPanel: React.CSSProperties = { background: "#0D1117", border: "1px solid #30363D", borderLeft: "3px solid #F85149", borderRadius: 8, padding: "16px 20px" };
const phGreen: React.CSSProperties = { fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#3FB950", marginBottom: 10 };
const phRed: React.CSSProperties = { ...phGreen, color: "#F85149" };
const empty: React.CSSProperties = { textAlign: "center", padding: "60px 20px", color: "#8B949E" };
