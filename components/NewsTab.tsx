"use client";
import { useState, useEffect, useCallback } from "react";

interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  sector: string;
}
interface SectorInsight { sector: string; summary: string; sentiment: string; }
interface MarketReport {
  generatedAt: string; newsCount: number; sentiment: string;
  marketSummary: string; sectorInsights: SectorInsight[];
  topInsights: string; topTickers: string[]; riskFactors: string;
}
interface Stats { total: number; sectors: number; reportCount: number; lastUpdate: string; }

const SECTORS = ["전체", "반도체", "거시경제", "IT/플랫폼", "바이오", "에너지/소재", "금융", "자동차", "일반경제"];

export default function NewsTab() {
  const [news, setNews]       = useState<NewsItem[]>([]);
  const [report, setReport]   = useState<MarketReport | null>(null);
  const [stats, setStats]     = useState<Stats>({ total: 0, sectors: 0, reportCount: 0, lastUpdate: "" });
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [sector, setSector]   = useState("전체");
  const [keyword, setKeyword] = useState("");
  const [reportTab, setReportTab] = useState(0);
  const [error, setError]     = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
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
    } catch (e) {
      setError("데이터를 불러오지 못했습니다. API 서버를 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [sector, keyword]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const runPipeline = async () => {
    setCollecting(true); setError("");
    try {
      const res = await fetch("/api/pipeline/run", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      await fetchAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "수집 실패");
    } finally {
      setCollecting(false);
    }
  };

  const timeAgo = (iso: string) => {
    try {
      const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
      if (mins < 1) return "방금";
      if (mins < 60) return `${mins}분 전`;
      if (mins < 1440) return `${Math.floor(mins / 60)}시간 전`;
      return `${Math.floor(mins / 1440)}일 전`;
    } catch { return iso?.slice(0, 10) ?? ""; }
  };

  const sentimentIcon = (s?: string) =>
    ({ positive: "📈 강세", negative: "📉 약세", neutral: "➡️ 중립" }[s ?? ""] ?? "—");

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1280, margin: "0 auto" }}>

      {/* 필터 + 수집 버튼 */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <select value={sector} onChange={e => setSector(e.target.value)} style={sel}>
          {SECTORS.map(s => <option key={s}>{s}</option>)}
        </select>
        <input value={keyword} onChange={e => setKeyword(e.target.value)}
          placeholder="키워드 검색" style={{ ...sel, flex: 1, minWidth: 180 }} />
        <button onClick={fetchAll} disabled={loading} style={btnGray}>
          {loading ? "로딩…" : "🔄 새로고침"}
        </button>
        <button onClick={runPipeline} disabled={collecting} style={btnGreen}>
          {collecting ? "수집 중… (약 30~60초)" : "⚡ 뉴스 수집 & 리포트 생성"}
        </button>
      </div>

      {error && <div style={errBox}>{error}</div>}

      {/* KPI 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "총 수집 뉴스",    value: stats.total,       sub: "전체 기간" },
          { label: "커버 섹터",       value: stats.sectors,     sub: "개 분야" },
          { label: "최신 시장 감성",  value: sentimentIcon(report?.sentiment), sub: "AI 종합 판단", sm: true },
          { label: "리포트 횟수",    value: stats.reportCount, sub: "누적" },
        ].map(k => (
          <div key={k.label} style={kpiCard}>
            <div style={kpiLbl}>{k.label}</div>
            <div style={{ ...kpiVal, fontSize: k.sm ? "1.3rem" : "2rem" }}>{k.value}</div>
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
          <p style={{ fontSize: "0.85rem" }}>"⚡ 뉴스 수집 & 리포트 생성" 버튼을 눌러 시작하세요.</p>
        </div>
      ) : (
        <div style={reportBox}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #21262D", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700, color: "#E6EDF3", fontSize: "1rem" }}>오늘의 시장 종합 분석</div>
              <div style={{ fontSize: "0.75rem", color: "#8B949E", marginTop: 4 }}>
                {report.generatedAt?.slice(0, 16).replace("T", " ")} · {report.newsCount}건 분석
              </div>
            </div>
            <SentimentPill s={report.sentiment} />
          </div>
          <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
            {["📋 시장 요약 & 섹터", "💡 투자 인사이트", "⚠️ 리스크"].map((t, i) => (
              <button key={i} onClick={() => setReportTab(i)} style={{
                padding: "7px 14px", borderRadius: 6, fontSize: "0.82rem", border: "none", cursor: "pointer",
                background: reportTab === i ? "#21262D" : "transparent",
                color: reportTab === i ? "#E6EDF3" : "#8B949E",
              }}>{t}</button>
            ))}
          </div>
          {reportTab === 0 && (
            <>
              <div style={insightPanel}>
                <div style={phGreen}>📊 시장 요약</div>
                <p style={{ color: "#C9D1D9", fontSize: "0.92rem", lineHeight: 1.8, margin: 0 }}>{report.marketSummary}</p>
              </div>
              {report.sectorInsights?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ ...phGreen, marginBottom: 10 }}>📌 섹터별 감성</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                    {report.sectorInsights.map(s => <SectorChip key={s.sector} s={s} />)}
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead><tr>{["섹터", "감성", "핵심 동향"].map(h => <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "#8B949E", fontWeight: 600 }}>{h}</th>)}</tr></thead>
                    <tbody>{report.sectorInsights.map(s => (
                      <tr key={s.sector} style={{ borderBottom: "1px solid #21262D" }}>
                        <td style={td}>{s.sector}</td>
                        <td style={td}>{{ positive: "▲ 긍정", negative: "▼ 부정", neutral: "— 중립" }[s.sentiment] ?? s.sentiment}</td>
                        <td style={td}>{s.summary}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {reportTab === 1 && (
            <div style={insightPanel}>
              <div style={phGreen}>💡 투자자 핵심 액션 포인트</div>
              <pre style={{ color: "#C9D1D9", fontSize: "0.9rem", whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.8 }}>{report.topInsights}</pre>
              {report.topTickers?.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ ...phGreen, marginBottom: 8 }}>📌 주목 종목</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {report.topTickers.map(t => (
                      <span key={t} style={{ background: "#1C2333", border: "1px solid #30363D", color: "#79C0FF", fontSize: "0.72rem", padding: "3px 9px", borderRadius: 4 }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
              <p style={{ color: "#8B949E", fontSize: "0.75rem", marginTop: 14, marginBottom: 0 }}>※ 투자 권유가 아닙니다.</p>
            </div>
          )}
          {reportTab === 2 && (
            <div style={riskPanel}>
              <div style={phRed}>⚠️ 주요 리스크 요인</div>
              <pre style={{ color: "#C9D1D9", fontSize: "0.9rem", whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.8 }}>{report.riskFactors}</pre>
            </div>
          )}
        </div>
      )}

      {/* 뉴스 목록 */}
      <div style={{ ...secTitle, marginTop: 32 }}>📰 수집된 뉴스 목록</div>
      <p style={{ color: "#8B949E", fontSize: "0.85rem", marginBottom: 14 }}>
        <strong style={{ color: "#E6EDF3" }}>{sector === "전체" ? "전체 섹터" : sector}</strong> · {news.length}건
      </p>
      {news.length === 0 && !loading ? (
        <div style={empty}><div style={{ fontSize: "2.5rem" }}>📭</div><p style={{ marginTop: 12 }}>수집된 뉴스가 없습니다.</p></div>
      ) : news.map(n => (
        <div key={n.id} style={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 10, padding: "14px 20px", marginBottom: 8, transition: "border-color .15s" }}>
          <a href={n.url} target="_blank" rel="noreferrer"
            style={{ color: "#E6EDF3", fontWeight: 600, fontSize: "0.95rem", lineHeight: 1.5, display: "block", marginBottom: 6 }}>
            {n.title}
          </a>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
  const m: Record<string, [string, string, string]> = {
    positive: ["#1A3C2F", "#3FB950", "▲ 강세"],
    negative: ["#3C1A1A", "#F85149", "▼ 약세"],
    neutral:  ["#21262D", "#8B949E", "— 중립"],
  };
  const [bg, color, label] = m[s] ?? m.neutral;
  return <span style={{ background: bg, color, border: `1px solid ${color}`, padding: "5px 14px", borderRadius: 20, fontSize: "0.78rem", fontWeight: 700 }}>{label}</span>;
}
function SectorChip({ s }: { s: { sector: string; sentiment: string } }) {
  const m: Record<string, [string, string, string, string]> = {
    positive: ["#1A3C2F", "#3FB950", "#2EA043", "▲"],
    negative: ["#3C1A1A", "#F85149", "#DA3633", "▼"],
    neutral:  ["#21262D", "#8B949E", "#30363D", "—"],
  };
  const [bg, color, border, icon] = m[s.sentiment] ?? m.neutral;
  return <span style={{ background: bg, color, border: `1px solid ${border}`, padding: "5px 11px", borderRadius: 8, fontSize: "0.78rem" }}>{icon} {s.sector}</span>;
}

const sel: React.CSSProperties = { background: "#161B22", border: "1px solid #30363D", color: "#E6EDF3", padding: "8px 12px", borderRadius: 8, fontSize: "0.85rem" };
const btnGreen: React.CSSProperties = { background: "#238636", color: "#fff", border: "none", padding: "9px 16px", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: "0.85rem", whiteSpace: "nowrap" };
const btnGray: React.CSSProperties = { background: "#21262D", color: "#C9D1D9", border: "1px solid #30363D", padding: "9px 14px", borderRadius: 8, cursor: "pointer", fontSize: "0.85rem" };
const kpiCard: React.CSSProperties = { background: "#161B22", border: "1px solid #21262D", borderRadius: 10, padding: "20px 24px", textAlign: "center" };
const kpiLbl: React.CSSProperties = { fontSize: "0.72rem", color: "#8B949E", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 };
const kpiVal: React.CSSProperties = { fontWeight: 700, color: "#E6EDF3", lineHeight: 1 };
const kpiSub: React.CSSProperties = { color: "#8B949E", fontSize: "0.82rem", marginTop: 4 };
const secTitle: React.CSSProperties = { fontSize: "0.9rem", fontWeight: 700, color: "#8B949E", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px", paddingBottom: 8, borderBottom: "1px solid #21262D" };
const reportBox: React.CSSProperties = { background: "linear-gradient(135deg,#161B22 0%,#1C2333 100%)", border: "1px solid #30363D", borderRadius: 14, padding: "24px 28px" };
const insightPanel: React.CSSProperties = { background: "#0D1117", border: "1px solid #30363D", borderLeft: "3px solid #3FB950", borderRadius: 8, padding: "16px 20px" };
const riskPanel: React.CSSProperties = { background: "#0D1117", border: "1px solid #30363D", borderLeft: "3px solid #F85149", borderRadius: 8, padding: "16px 20px" };
const phGreen: React.CSSProperties = { fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#3FB950", marginBottom: 10 };
const phRed: React.CSSProperties = { ...phGreen, color: "#F85149" };
const empty: React.CSSProperties = { textAlign: "center", padding: "60px 20px", color: "#8B949E" };
const errBox: React.CSSProperties = { background: "#3C1A1A", border: "1px solid #DA3633", borderRadius: 8, padding: "12px 16px", color: "#F85149", fontSize: "0.88rem", marginBottom: 16 };
const td: React.CSSProperties = { padding: "8px 12px", color: "#C9D1D9" };
