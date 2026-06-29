"use client";
import { useState } from "react";
import { MarketRecommendations, Recommendation } from "@/lib/types";

export default function RecommendTab() {
  const [data, setData]       = useState<MarketRecommendations | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetch_recs = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/recommend", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "추천 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (v: number) => v >= 80 ? "#3FB950" : v >= 60 ? "#E3B341" : "#F85149";

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 8, borderBottom: "1px solid #21262D" }}>
        <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#8B949E", textTransform: "uppercase", letterSpacing: "0.08em" }}>⭐ 오늘의 추천</div>
        <button onClick={fetch_recs} disabled={loading} style={btnStar}>
          {loading ? "분석 중…" : "✨ 오늘의 추천 생성"}
        </button>
      </div>

      {error && <div style={errBox}>{error}</div>}

      {loading && (
        <div style={{ textAlign: "center", padding: "80px 20px", color: "#8B949E" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>⭐</div>
          <p>AI가 오늘의 추천 종목을 분석하고 있습니다…</p>
        </div>
      )}

      {data && !loading && (
        <>
          {/* 시장 컨텍스트 */}
          <div style={contextBox}>
            <div style={phGold}>📊 오늘의 시장 컨텍스트</div>
            <p style={{ color: "#C9D1D9", fontSize: "0.92rem", lineHeight: 1.8, margin: 0 }}>{data.marketContext}</p>
          </div>

          {/* 추천 카드 목록 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
            {data.recommendations.map((r, i) => (
              <div key={r.ticker ?? i} style={recCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ background: "#1C2333", borderRadius: 8, padding: "10px 14px", fontWeight: 700, color: "#E6EDF3", fontSize: "1.1rem", minWidth: 32, textAlign: "center" }}>
                      {i + 1}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: "#E6EDF3", fontSize: "1.05rem" }}>{r.companyName}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                        {r.ticker && <span style={tickerTag}>{r.ticker}</span>}
                        <span style={sectorTag}>{r.sector}</span>
                        <span style={{ color: "#8B949E", fontSize: "0.78rem" }}>{r.currentPrice}</span>
                      </div>
                    </div>
                  </div>
                  {/* 스코어 바 */}
                  <div style={{ display: "flex", gap: 16 }}>
                    {[
                      { label: "퀀트",    v: r.quantScore },
                      { label: "모멘텀",  v: r.momentumScore },
                      { label: "성장성", v: r.growthScore },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "0.68rem", color: "#8B949E", marginBottom: 4 }}>{s.label}</div>
                        <div style={{ fontWeight: 700, fontSize: "1.1rem", color: scoreColor(s.v) }}>{s.v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 12, color: "#C9D1D9", fontSize: "0.88rem", lineHeight: 1.7 }}>
                  {r.recommendationReason}
                </div>

                <button
                  onClick={() => setExpanded(expanded === r.ticker ? null : (r.ticker ?? String(i)))}
                  style={{ marginTop: 10, background: "transparent", border: "1px solid #30363D", color: "#8B949E", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: "0.78rem" }}
                >
                  {expanded === r.ticker ? "▲ 요약" : "▼ 상세 분석"}
                </button>

                {expanded === (r.ticker ?? String(i)) && (
                  <div style={{ marginTop: 12, background: "#0D1117", borderRadius: 8, padding: "14px 16px", color: "#C9D1D9", fontSize: "0.88rem", lineHeight: 1.8 }}>
                    {r.detailedAnalysis}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p style={{ color: "#8B949E", fontSize: "0.75rem", textAlign: "center", marginTop: 24 }}>※ 투자 권유가 아닙니다. 참고용으로만 활용하세요.</p>
        </>
      )}

      {!data && !loading && !error && (
        <div style={{ textAlign: "center", padding: "80px 20px", color: "#8B949E" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>⭐</div>
          <p>버튼을 눌러 오늘의 AI 추천 종목을 받아보세요.</p>
          <p style={{ fontSize: "0.82rem" }}>퀀트 · 모멘텀 · 성장성 3가지 기준으로 종목을 선별합니다.</p>
        </div>
      )}
    </div>
  );
}

const btnStar: React.CSSProperties = { background: "#E3B341", color: "#000", border: "none", padding: "9px 18px", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: "0.85rem" };
const errBox: React.CSSProperties = { background: "#3C1A1A", border: "1px solid #DA3633", borderRadius: 8, padding: "12px 16px", color: "#F85149", fontSize: "0.88rem", marginBottom: 16 };
const contextBox: React.CSSProperties = { background: "#161B22", border: "1px solid #30363D", borderLeft: "3px solid #E3B341", borderRadius: 8, padding: "16px 20px" };
const phGold: React.CSSProperties = { fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#E3B341", marginBottom: 10 };
const recCard: React.CSSProperties = { background: "#161B22", border: "1px solid #21262D", borderRadius: 12, padding: "20px 24px" };
const tickerTag: React.CSSProperties = { background: "#1C2333", border: "1px solid #30363D", color: "#79C0FF", fontSize: "0.72rem", padding: "2px 7px", borderRadius: 4 };
const sectorTag: React.CSSProperties = { background: "#21262D", color: "#8B949E", fontSize: "0.72rem", padding: "2px 7px", borderRadius: 4 };
