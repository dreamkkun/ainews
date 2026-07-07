"use client";
import { useState } from "react";

interface Recommendation {
  companyName: string; ticker: string; sector: string; currentPrice: string;
  quantScore: number; momentumScore: number; growthScore: number;
  recommendationReason: string; detailedAnalysis: string;
}
interface MarketRecommendations { marketContext: string; recommendations: Recommendation[]; }

const MARKET_TYPES = [
  { label: "시장 선택", value: "", disabled: true },
  { label: "전체 (한국 + 미국)", value: "ALL" },
  { label: "한국주 (KOSPI/KOSDAQ)", value: "KOREA" },
  { label: "미국주 (NYSE/NASDAQ)", value: "US" },
];

const THEMES = [
  { label: "테마 선택", value: "", disabled: true },
  { label: "전체 테마", value: "전체" },
  { label: "반도체", value: "반도체" },
  { label: "AI / 데이터센터", value: "AI/데이터센터" },
  { label: "바이오 / 헬스케어", value: "바이오/헬스케어" },
  { label: "맥크 / 성장주", value: "맥크/성장주" },
  { label: "배당 성장주", value: "배당성장주" },
  { label: "에너지 / 전력", value: "에너지/전력" },
  { label: "소비재 / 로케이션", value: "소비재/로케이션" },
];

function GhostCard({ rank }: { rank: number }) {
  return (
    <div style={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 12, padding: "20px 24px", opacity: 0.45 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ background: "#1C2333", borderRadius: 8, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", color: "#E3B341", fontWeight: 700, fontSize: "1.1rem", flexShrink: 0 }}>{rank}</div>
          <div><Skel w={120} h={18} mb={8} /><div style={{ display: "flex", gap: 6 }}><Skel w={56} h={14} /><Skel w={72} h={14} /></div></div>
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          {["퀀트", "모멘텀", "성장성"].map(l => (
            <div key={l} style={{ textAlign: "center", minWidth: 48 }}>
              <div style={{ fontSize: "0.68rem", color: "#484F58", marginBottom: 4 }}>{l}</div>
              <Skel w={36} h={22} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        {[0,1,2].map(i => <div key={i}><Skel w="100%" h={6} /></div>)}
      </div>
      <Skel w="100%" h={14} mb={6} />
      <Skel w="88%" h={14} />
    </div>
  );
}
function Skel({ w, h, mb }: { w: number | string; h: number; mb?: number }) {
  return <div style={{ width: w, height: h, borderRadius: 4, background: "#21262D", marginBottom: mb ?? 0 }} />;
}

export default function RecommendTab() {
  const [marketType, setMarketType] = useState("ALL");
  const [theme, setTheme]     = useState("전체");
  const [data, setData]       = useState<MarketRecommendations | null>(null);
  const [sources, setSources] = useState<{ title: string; url: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const getRecommend = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/gemini/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketType,
          selectedTheme: theme === "전체" ? undefined : theme,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const json = await res.json();
      const payload = json.data ?? json;
      setData({
        marketContext: payload.marketContext ?? "",
        recommendations: Array.isArray(payload.recommendations) ? payload.recommendations : [],
      });
      setSources(json.sources ?? []);
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
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select value={marketType} onChange={e => setMarketType(e.target.value)} style={sel}>
            {MARKET_TYPES.map(m => <option key={m.value} value={m.value} disabled={m.disabled}>{m.label}</option>)}
          </select>
          <select value={theme} onChange={e => setTheme(e.target.value)} style={sel}>
            {THEMES.map(t => <option key={t.value} value={t.value} disabled={t.disabled}>{t.label}</option>)}
          </select>
          <button onClick={getRecommend} disabled={loading} style={btnStar}>
            {loading ? "Claude AI 분석 중…" : "✨ 추천 종목 받기"}
          </button>
        </div>
      </div>

      {error && <div style={errBox}>{error}</div>}

      {loading && (
        <div style={{ textAlign: "center", padding: "40px 20px 20px", color: "#8B949E" }}>
          <div style={{ fontSize: "2rem", marginBottom: 10 }}>⭐</div>
          <p style={{ marginBottom: 24 }}>Claude AI가 오늘의 추천 종목을 선별하고 있습니다…</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1,2,3].map(i => <GhostCard key={i} rank={i} />)}
          </div>
        </div>
      )}

      {data && !loading && (
        <>
          <div style={{ background: "#161B22", border: "1px solid #30363D", borderLeft: "3px solid #E3B341", borderRadius: 8, padding: "16px 20px", marginBottom: 20 }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "#E3B341", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>📊 시장 콘텍스트</div>
            <p style={{ color: "#C9D1D9", fontSize: "0.92rem", lineHeight: 1.8, margin: 0 }}>{data.marketContext}</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.recommendations.map((r, i) => {
              const key = r.ticker ?? String(i);
              return (
                <div key={key} style={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 12, padding: "20px 24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                      <div style={{ background: "#1C2333", borderRadius: 8, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#E3B341", fontSize: "1.1rem", flexShrink: 0 }}>{i + 1}</div>
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
                    <div style={{ marginTop: 12, background: "#0D1117", borderRadius: 8, padding: "14px 16px", color: "#C9D1D9", fontSize: "0.88rem", lineHeight: 1.8 }}>{r.detailedAnalysis}</div>
                  )}
                </div>
              );
            })}
          </div>
          {sources.length > 0 && (
            <div style={{ background: "transparent", border: "1px solid #21262D", borderRadius: 10, padding: "16px 20px", marginTop: 16 }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "#8B949E", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>📎 참고 출체</div>
              {sources.map((s, i) => <a key={i} href={s.url} target="_blank" rel="noreferrer" style={{ display: "block", color: "#58A6FF", fontSize: "0.82rem", marginBottom: 5 }}>{i + 1}. {s.title}</a>)}
            </div>
          )}
          <p style={{ color: "#8B949E", fontSize: "0.75rem", textAlign: "center", marginTop: 24 }}>※ 투자 권유가 아닙니다. Claude AI 분석 기반 참고용입니다.</p>
        </>
      )}

      {!data && !loading && !error && (
        <div>
          <div style={{ textAlign: "center", padding: "32px 20px 24px", color: "#8B949E" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 10 }}>⭐</div>
            <p style={{ marginBottom: 4, color: "#C9D1D9" }}>Claude AI가 시장과 테마를 분석해 추천 종목을 선별합니다.</p>
            <p style={{ fontSize: "0.82rem", marginBottom: 28 }}>아래는 생성될 카드의 예시 형태입니다.</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, pointerEvents: "none" }}>
            {[1,2,3].map(i => <GhostCard key={i} rank={i} />)}
          </div>
          <div style={{ textAlign: "center", marginTop: 24 }}>
            <button onClick={getRecommend} style={{ ...btnStar, padding: "12px 28px", fontSize: "0.95rem" }}>✨ 지금 추천 받기</button>
          </div>
        </div>
      )}
    </div>
  );
}

const sel: React.CSSProperties = { background: "#161B22", border: "1px solid #30363D", color: "#E6EDF3", padding: "8px 12px", borderRadius: 8, fontSize: "0.85rem", cursor: "pointer" };
const btnStar: React.CSSProperties = { background: "#E3B341", color: "#000", border: "none", padding: "9px 18px", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: "0.85rem", whiteSpace: "nowrap" };
const errBox: React.CSSProperties = { background: "#3C1A1A", border: "1px solid #DA3633", borderRadius: 8, padding: "12px 16px", color: "#F85149", fontSize: "0.88rem", marginBottom: 16 };
