"use client";
import { useState } from "react";

interface Recommendation {
  companyName: string; ticker: string; sector: string; currentPrice: string;
  quantScore: number; momentumScore: number; growthScore: number;
  recommendationReason: string; detailedAnalysis: string;
}
interface MarketRecommendations { marketContext: string; recommendations: Recommendation[]; }

const THEMES = ["전체", "반도체", "AI/데이터센터", "바이오/헬스케어", "맹크/성장주", "배당성장주", "에너지/전력", "소비재/로케쏼"];

export default function RecommendTab() {
  const [theme, setTheme]     = useState("전체");
  const [data, setData]       = useState<MarketRecommendations | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const getRecommend = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/gemini/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: theme === "전체" ? null : theme }),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      setData(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "추천 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (v: number) => v >= 80 ? "#3FB950" : v >= 60 ? "#E3B341" : "#F85149";
  const scoreBar = (v: number) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, background: "#21262D", borderRadius: 4, height: 6 }}>
        <div style={{ width: `${v}%`, background: scoreColor(v), borderRadius: 4, height: 6, transition: "width .4s" }} />
      </div>
      <span style={{ color: scoreColor(v), fontWeight: 700, fontSize: "0.85rem", minWidth: 28 }}>{v}</span>
    </div>
  );

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 8, borderBottom: "1px solid #21262D", flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#8B949E", textTransform: "uppercase", letterSpacing: "0.08em" }}>⭐ 오늘의 추천</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select value={theme} onChange={e => setTheme(e.target.value)} style={sel}>
            {THEMES.map(t => <option key={t}>{t}</option>)}
          </select>
          <button onClick={getRecommend} disabled={loading} style={btnStar}>
            {loading ? "분석 중…" : "✨ 추천 종목 받기"}
          </button>
        </div>
      </div>

      {error && <div style={errBox}>{error}</div>}

      {loading && (
        <div style={{ textAlign: "center", padding: "80px 20px", color: "#8B949E" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>⭐</div>
          <p>Gemini AI가 오늘의 추천 종목을 선별하고 있습니다…</p>
        </div>
      )}

      {data && !loading && (
        <>
          <div style={{ background: "#161B22", border: "1px solid #30363D", borderLeft: "3px solid #E3B341", borderRadius: 8, padding: "16px 20px", marginBottom: 20 }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "#E3B341", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>📊 시장 컨텍스트</div>
            <p style={{ color: "#C9D1D9", fontSize: "0.92rem", lineHeight: 1.8, margin: 0 }}>{data.marketContext}</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.recommendations.map((r, i) => {
              const key = r.ticker ?? String(i);
              return (
                <div key={key} style={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 12, padding: "20px 24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                      <div style={{ background: "#1C2333", borderRadius: 8, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#E3B341", fontSize: "1.1rem", flexShrink: 0 }}>
                        {i + 1}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: "#E6EDF3", fontSize: "1.05rem" }}>{r.companyName}</div>
                        <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                          {r.ticker && <span style={{ background: "#1C2333", border: "1px solid #30363D", color: "#79C0FF", fontSize: "0.72rem", padding: "2px 7px", borderRadius: 4 }}>{r.ticker}</span>}
                          <span style={{ background: "#21262D", color: "#8B949E", fontSize: "0.72rem", padding: "2px 7px", borderRadius: 4 }}>{r.sector}</span>
                          <span style={{ color: "#8B949E", fontSize: "0.78rem" }}>{r.currentPrice}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 20, flexShrink: 0 }}>
                      {[{ label: "퀀트", v: r.quantScore }, { label: "모멘텀", v: r.momentumScore }, { label: "성장성", v: r.growthScore }].map(s => (
                        <div key={s.label} style={{ textAlign: "center", minWidth: 48 }}>
                          <div style={{ fontSize: "0.68rem", color: "#8B949E", marginBottom: 4 }}>{s.label}</div>
                          <div style={{ fontWeight: 700, fontSize: "1.1rem", color: scoreColor(s.v) }}>{s.v}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 점수 바 */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 14 }}>
                    {[{ label: "퀀트", v: r.quantScore }, { label: "모멘텀", v: r.momentumScore }, { label: "성장성", v: r.growthScore }].map(s => (
                      <div key={s.label}>
                        <div style={{ fontSize: "0.68rem", color: "#8B949E", marginBottom: 4 }}>{s.label}</div>
                        {scoreBar(s.v)}
                      </div>
                    ))}
                  </div>

                  <p style={{ color: "#C9D1D9", fontSize: "0.88rem", lineHeight: 1.7, marginTop: 14, marginBottom: 0 }}>{r.recommendationReason}</p>

                  <button onClick={() => setExpanded(expanded === key ? null : key)}
                    style={{ marginTop: 10, background: "transparent", border: "1px solid #30363D", color: "#8B949E", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: "0.78rem" }}>
                    {expanded === key ? "▲ 요약" : "▼ 상세 분석"}
                  </button>

                  {expanded === key && (
                    <div style={{ marginTop: 12, background: "#0D1117", borderRadius: 8, padding: "14px 16px", color: "#C9D1D9", fontSize: "0.88rem", lineHeight: 1.8 }}>
                      {r.detailedAnalysis}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p style={{ color: "#8B949E", fontSize: "0.75rem", textAlign: "center", marginTop: 24 }}>※ 투자 권유가 아닙니다. 참고용으로만 활용하세요.</p>
        </>
      )}

      {!data && !loading && !error && (
        <div style={{ textAlign: "center", padding: "80px 20px", color: "#8B949E" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>⭐</div>
          <p>위의 버튼을 눌러 오늘의 AI 추천 종목을 받아보세요.</p>
          <p style={{ fontSize: "0.82rem", marginTop: 6 }}>테마를 선택하면 해당 섹터 중심으로 추천합니다.</p>
        </div>
      )}
    </div>
  );
}

const sel: React.CSSProperties = { background: "#161B22", border: "1px solid #30363D", color: "#E6EDF3", padding: "8px 12px", borderRadius: 8, fontSize: "0.85rem" };
const btnStar: React.CSSProperties = { background: "#E3B341", color: "#000", border: "none", padding: "9px 18px", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: "0.85rem", whiteSpace: "nowrap" };
const errBox: React.CSSProperties = { background: "#3C1A1A", border: "1px solid #DA3633", borderRadius: 8, padding: "12px 16px", color: "#F85149", fontSize: "0.88rem", marginBottom: 16 };
