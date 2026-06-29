"use client";
import { useState } from "react";
import { CompanyAnalysis, GroundingSource } from "@/lib/types";

export default function AnalyzeTab() {
  const [query, setQuery]     = useState("");
  const [result, setResult]   = useState<CompanyAnalysis | null>(null);
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const analyze = async () => {
    if (!query.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: query }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResult(data.analysis);
      setSources(data.sources ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "분석 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={secTitle}>🔍 기업 분석</div>

      {/* 입력 */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <input
          value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && analyze()}
          placeholder="기업명 또는 티커 입력 (예: 삼성전자, 005930)"
          style={{ ...inputSt, flex: 1 }}
        />
        <button onClick={analyze} disabled={loading || !query.trim()} style={btnBlue}>
          {loading ? "분석 중…" : "분석 시작"}
        </button>
      </div>

      {error && <div style={errBox}>{error}</div>}

      {loading && (
        <div style={card}>
          <div style={{ textAlign: "center", padding: "60px 0", color: "#8B949E" }}>
            <div style={{ fontSize: "2rem", marginBottom: 12 }}>🔍</div>
            <p>AI가 기업을 분석하고 있습니다…</p>
          </div>
        </div>
      )}

      {result && (
        <>
          {/* 기업 개요 */}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.4rem", color: "#E6EDF3" }}>{result.companyName}</h2>
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {result.ticker && <Tag text={result.ticker} color="#79C0FF" />}
                  {result.industryAnalysis.sectorName && <Tag text={result.industryAnalysis.sectorName} color="#8B949E" />}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: "#8B949E", fontSize: "0.75rem" }}>현재가</div>
                <div style={{ color: "#E6EDF3", fontWeight: 700, fontSize: "1.2rem" }}>{result.currentPrice}</div>
                <div style={{ color: "#8B949E", fontSize: "0.75rem", marginTop: 2 }}>시총 {result.marketCap}</div>
              </div>
            </div>
            <div style={{ marginTop: 16, padding: "12px 16px", background: "#0D1117", borderRadius: 8 }}>
              <div style={labelSt}>비즈니스 모델</div>
              <p style={bodyText}>{result.bm}</p>
            </div>
          </div>

          {/* 산업 분석 */}
          <div style={card}>
            <div style={cardTitle}>📊 산업 분석</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={infoBox}>
                <div style={labelSt}>산업 트렌드</div>
                <p style={bodyText}>{result.industryAnalysis.trends}</p>
              </div>
              <div style={infoBox}>
                <div style={labelSt}>시장 포지션</div>
                <p style={bodyText}>{result.industryAnalysis.position}</p>
              </div>
            </div>
          </div>

          {/* 강세/약세 요인 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ ...card, borderLeft: "3px solid #3FB950" }}>
              <div style={{ ...cardTitle, color: "#3FB950" }}>▲ 강세 요인 (Bullish)</div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {result.recentIssues.bullish.map((b, i) => (
                  <li key={i} style={{ color: "#C9D1D9", fontSize: "0.88rem", marginBottom: 6, lineHeight: 1.6 }}>{b}</li>
                ))}
              </ul>
            </div>
            <div style={{ ...card, borderLeft: "3px solid #F85149" }}>
              <div style={{ ...cardTitle, color: "#F85149" }}>▼ 약세 요인 (Bearish)</div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {result.recentIssues.bearish.map((b, i) => (
                  <li key={i} style={{ color: "#C9D1D9", fontSize: "0.88rem", marginBottom: 6, lineHeight: 1.6 }}>{b}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* 밸류에이션 */}
          <div style={card}>
            <div style={cardTitle}>💰 밸류에이션 비교</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ background: "#0D1117" }}>
                  {["기업", "PER", "PBR"].map(h => <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#8B949E", fontWeight: 600 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {[result.valuationComparison.targetCompany, ...result.valuationComparison.competitors, { name: "산업 평균", ...result.valuationComparison.industryAverage }].map((r: {name: string; per: number; pbr: number}, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #21262D", background: i === 0 ? "#1C2333" : "transparent" }}>
                    <td style={{ padding: "10px 12px", color: i === 0 ? "#E6EDF3" : "#C9D1D9", fontWeight: i === 0 ? 600 : 400 }}>{r.name}</td>
                    <td style={{ padding: "10px 12px", color: "#C9D1D9" }}>{r.per}x</td>
                    <td style={{ padding: "10px 12px", color: "#C9D1D9" }}>{r.pbr}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 12, padding: "12px 16px", background: "#0D1117", borderRadius: 8, color: "#C9D1D9", fontSize: "0.88rem", lineHeight: 1.7 }}>
              {result.valuationComparison.evaluation}
            </div>
          </div>

          {/* 출처 */}
          {sources.length > 0 && (
            <div style={{ ...card, background: "transparent", border: "1px solid #21262D" }}>
              <div style={{ ...cardTitle, color: "#8B949E" }}>📎 참고 출처</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {sources.map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noreferrer"
                    style={{ color: "#58A6FF", fontSize: "0.82rem", textDecoration: "none" }}>
                    {i + 1}. {s.title}
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!result && !loading && !error && (
        <div style={{ textAlign: "center", padding: "80px 20px", color: "#8B949E" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>🔍</div>
          <p>분석할 기업명 또는 티커를 입력하세요.</p>
          <p style={{ fontSize: "0.82rem" }}>예: 삼성전자, SK하이닉스, NVDA, 005930</p>
        </div>
      )}
    </div>
  );
}

function Tag({ text, color }: { text: string; color: string }) {
  return <span style={{ background: "#21262D", color, fontSize: "0.75rem", padding: "3px 8px", borderRadius: 4 }}>{text}</span>;
}

const secTitle: React.CSSProperties = { fontSize: "0.9rem", fontWeight: 700, color: "#8B949E", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 20, paddingBottom: 8, borderBottom: "1px solid #21262D" };
const card: React.CSSProperties = { background: "#161B22", border: "1px solid #21262D", borderRadius: 12, padding: "20px 24px", marginBottom: 12 };
const cardTitle: React.CSSProperties = { fontWeight: 700, color: "#E6EDF3", marginBottom: 14, fontSize: "0.95rem" };
const labelSt: React.CSSProperties = { fontSize: "0.72rem", fontWeight: 600, color: "#8B949E", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 };
const bodyText: React.CSSProperties = { color: "#C9D1D9", fontSize: "0.88rem", lineHeight: 1.7, margin: 0 };
const infoBox: React.CSSProperties = { background: "#0D1117", borderRadius: 8, padding: "12px 16px" };
const inputSt: React.CSSProperties = { background: "#161B22", border: "1px solid #30363D", color: "#E6EDF3", padding: "10px 14px", borderRadius: 8, fontSize: "0.9rem" };
const btnBlue: React.CSSProperties = { background: "#1F6FEB", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
const errBox: React.CSSProperties = { background: "#3C1A1A", border: "1px solid #DA3633", borderRadius: 8, padding: "12px 16px", color: "#F85149", fontSize: "0.88rem", marginBottom: 16 };
