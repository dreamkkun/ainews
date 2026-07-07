"use client";
import { useState, useRef, useEffect } from "react";

interface CompanyAnalysis {
  companyName: string; ticker: string; bm: string;
  marketCap: string; currentPrice: string;
  industryAnalysis: { sectorName: string; trends: string; position: string };
  recentIssues: { bullish: string[]; bearish: string[] };
  valuationComparison: {
    targetCompany: { name: string; per: number; pbr: number };
    competitors: { name: string; per: number; pbr: number }[];
    industryAverage: { per: number; pbr: number };
    evaluation: string;
  };
}
interface GroundingSource { title: string; url: string; }

const POPULAR = [
  { name: "삼성전자", ticker: "005930" },
  { name: "SK하이닙스", ticker: "000660" },
  { name: "엔비디아", ticker: "NVDA" },
  { name: "애플", ticker: "AAPL" },
  { name: "현대자", ticker: "005380" },
  { name: "카카오", ticker: "035720" },
];

const STEPS = [
  "🔍 기업 기본 정보 수집 중…",
  "🌐 웹 검색으로 최신 뉴스 분석 중…",
  "📊 시장 포지션 & 산업 동향 파악 중…",
  "💰 밸류에이션 & 경쟁사 비교 중…",
  "✍️ AI 리포트 생성 중…",
];

const RECENT_KEY = "analyze_recent";
function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
}
function saveRecent(q: string) {
  try {
    const prev = loadRecent().filter(r => r !== q);
    localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...prev].slice(0, 6)));
  } catch {}
}

export default function AnalyzeTab() {
  const [query, setQuery]     = useState("");
  const [result, setResult]   = useState<CompanyAnalysis | null>(null);
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [focused, setFocused] = useState(false);
  const [step, setStep]       = useState(0);
  const [progress, setProgress] = useState(0);
  const [recent, setRecent]   = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef  = useRef<HTMLDivElement>(null);

  useEffect(() => { setRecent(loadRecent()); }, []);

  // 외부 클릭 시 드롤다운 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!inputRef.current?.contains(e.target as Node) &&
          !dropRef.current?.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const pickSuggestion = (name: string) => {
    setQuery(name);
    setFocused(false);
    setTimeout(() => analyze(name), 50);
  };

  const analyze = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q) return;
    setLoading(true); setError(""); setResult(null); setSources([]);
    setStep(0); setProgress(0);
    saveRecent(q);
    setRecent(loadRecent());

    // 프로그레스 애니메이션
    let s = 0;
    const interval = setInterval(() => {
      s = Math.min(s + 1, STEPS.length - 1);
      setStep(s);
      setProgress(prev => Math.min(prev + 18, 90));
    }, 6000);

    try {
      const res = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: q }),
      });
      clearInterval(interval);
      setProgress(100);
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const data = await res.json();
      setResult(data.analysis ?? data);
      setSources(data.sources ?? []);
    } catch (e: unknown) {
      clearInterval(interval);
      setError(e instanceof Error ? e.message : "분석 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const showDrop = focused && !loading && (recent.length > 0 || POPULAR.length > 0);

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={secTitle}>🔍 기업 분석</div>

      {/* 인풀박스 + 드론다운 */}
      <div style={{ position: "relative", marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onKeyDown={e => e.key === "Enter" && analyze()}
            placeholder="기업명 또는 티커 입력 (예: 삼성전자, 005930, NVDA)"
            style={{ ...inputSt, flex: 1 }}
          />
          <button onClick={() => analyze()} disabled={loading || !query.trim()} style={btnBlue}>
            {loading ? "분석 중…" : "🔍 분석 시작"}
          </button>
        </div>

        {/* 스마트 드론다운 */}
        {showDrop && (
          <div ref={dropRef} style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0,
            width: "calc(100% - 110px)",
            background: "#161B22", border: "1px solid #30363D",
            borderRadius: 10, zIndex: 100, overflow: "hidden",
            boxShadow: "0 8px 24px rgba(0,0,0,.5)",
          }}>
            {recent.length > 0 && (
              <div style={{ padding: "10px 14px 6px" }}>
                <div style={dropLabel}>🕒 최근 검색</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {recent.map(r => (
                    <button key={r} onClick={() => pickSuggestion(r)} style={chipBtn}>{r}</button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ padding: recent.length > 0 ? "6px 14px 10px" : "10px 14px" }}>
              <div style={dropLabel}>🔥 인기 분석 종목</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {POPULAR.map(p => (
                  <button key={p.ticker} onClick={() => pickSuggestion(p.name)} style={chipBtn}>
                    {p.name} <span style={{ color: "#8B949E", fontSize: "0.7rem" }}>{p.ticker}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {error && <div style={errBox}>{error}</div>}

      {/* 프로그레스 / 스켈레톤 UI */}
      {loading && (
        <div style={card}>
          {/* 프로그레스 바 */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: "0.82rem", color: "#8B949E" }}>
              <span>{STEPS[step]}</span>
              <span style={{ color: "#58A6FF", fontWeight: 600 }}>{progress}%</span>
            </div>
            <div style={{ background: "#21262D", borderRadius: 6, height: 6, overflow: "hidden" }}>
              <div style={{
                height: 6, borderRadius: 6,
                background: "linear-gradient(90deg, #1F6FEB, #58A6FF)",
                width: `${progress}%`,
                transition: "width 1.2s ease",
              }} />
            </div>
          </div>

          {/* 스켈레톤 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <Skeleton w={180} h={24} mb={10} />
              <Skeleton w={120} h={16} />
            </div>
            <Skeleton w={80} h={36} />
          </div>
          <Skeleton w="100%" h={14} mb={8} />
          <Skeleton w="92%" h={14} mb={8} />
          <Skeleton w="78%" h={14} mb={24} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div><Skeleton w="100%" h={80} /></div>
            <div><Skeleton w="100%" h={80} /></div>
          </div>
          <Skeleton w="100%" h={14} mb={8} />
          <Skeleton w="85%" h={14} />
          <div style={{ textAlign: "center", marginTop: 20, color: "#8B949E", fontSize: "0.8rem" }}>
            🔍 Gemini AI가 웹에서 실시간 정보를 검색하고 있습니다. 수십 초 소요될 수 있습니다.
          </div>
        </div>
      )}

      {result && !loading && (
        <>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.4rem", color: "#E6EDF3" }}>{result.companyName}</h2>
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {result.ticker && <Tag text={result.ticker} color="#79C0FF" />}
                  {result.industryAnalysis?.sectorName && <Tag text={result.industryAnalysis.sectorName} color="#8B949E" />}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: "#8B949E", fontSize: "0.75rem" }}>현재가</div>
                <div style={{ color: "#E6EDF3", fontWeight: 700, fontSize: "1.3rem" }}>{result.currentPrice}</div>
                <div style={{ color: "#8B949E", fontSize: "0.75rem", marginTop: 2 }}>시수 {result.marketCap}</div>
              </div>
            </div>
            {result.bm && (
              <div style={{ marginTop: 14, background: "#0D1117", borderRadius: 8, padding: "12px 16px" }}>
                <div style={labelSt}>비즈니스 모델</div>
                <p style={bodyTxt}>{result.bm}</p>
              </div>
            )}
          </div>

          {result.industryAnalysis && (
            <div style={card}>
              <div style={cardTitle}>📊 산업 분석</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={infoBox}><div style={labelSt}>산업 트렌드</div><p style={bodyTxt}>{result.industryAnalysis.trends}</p></div>
                <div style={infoBox}><div style={labelSt}>시장 포지션</div><p style={bodyTxt}>{result.industryAnalysis.position}</p></div>
              </div>
            </div>
          )}

          {result.recentIssues && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ ...card, borderLeft: "3px solid #3FB950" }}>
                <div style={{ ...cardTitle, color: "#3FB950" }}>▲ 강세 요인 (Bullish)</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {(result.recentIssues.bullish ?? []).map((b, i) => <li key={i} style={{ color: "#C9D1D9", fontSize: "0.88rem", marginBottom: 6, lineHeight: 1.7 }}>{b}</li>)}
                </ul>
              </div>
              <div style={{ ...card, borderLeft: "3px solid #F85149" }}>
                <div style={{ ...cardTitle, color: "#F85149" }}>▼ 약세 요인 (Bearish)</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {(result.recentIssues.bearish ?? []).map((b, i) => <li key={i} style={{ color: "#C9D1D9", fontSize: "0.88rem", marginBottom: 6, lineHeight: 1.7 }}>{b}</li>)}
                </ul>
              </div>
            </div>
          )}

          {result.valuationComparison && (
            <div style={card}>
              <div style={cardTitle}>💰 밸류에이션 비교</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                <thead><tr style={{ background: "#0D1117" }}>
                  {["기업", "PER", "PBR"].map(h => <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#8B949E", fontWeight: 600 }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {[result.valuationComparison.targetCompany,
                    ...(result.valuationComparison.competitors ?? []),
                    { name: "산업 평균", ...result.valuationComparison.industryAverage }
                  ].map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #21262D", background: i === 0 ? "#1C2333" : "transparent" }}>
                      <td style={{ padding: "10px 12px", color: i === 0 ? "#E6EDF3" : "#C9D1D9", fontWeight: i === 0 ? 600 : 400 }}>{r.name}</td>
                      <td style={{ padding: "10px 12px", color: "#C9D1D9" }}>{r.per}x</td>
                      <td style={{ padding: "10px 12px", color: "#C9D1D9" }}>{r.pbr}x</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.valuationComparison.evaluation && (
                <div style={{ marginTop: 12, background: "#0D1117", borderRadius: 8, padding: "12px 16px", color: "#C9D1D9", fontSize: "0.88rem", lineHeight: 1.7 }}>
                  {result.valuationComparison.evaluation}
                </div>
              )}
            </div>
          )}

          {sources.length > 0 && (
            <div style={{ ...card, background: "transparent", border: "1px solid #21262D" }}>
              <div style={{ ...cardTitle, color: "#8B949E" }}>📎 참고 출체 (Grounding)</div>
              {sources.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer"
                  style={{ display: "block", color: "#58A6FF", fontSize: "0.82rem", marginBottom: 6 }}>
                  {i + 1}. {s.title}
                </a>
              ))}
            </div>
          )}
        </>
      )}

      {!result && !loading && !error && (
        <div style={{ textAlign: "center", padding: "80px 20px", color: "#8B949E" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>🔍</div>
          <p>분석할 기업명 또는 티커를 입력하세요.</p>
          <p style={{ fontSize: "0.82rem", marginTop: 6 }}>Gemini AI가 웹 검색을 통해 실시간 정보를 분석합니다.</p>
        </div>
      )}
    </div>
  );
}

function Skeleton({ w, h, mb }: { w: number | string; h: number; mb?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 6,
      background: "linear-gradient(90deg, #21262D 25%, #2D333B 50%, #21262D 75%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.5s infinite",
      marginBottom: mb ?? 0,
    }} />
  );
}

function Tag({ text, color }: { text: string; color: string }) {
  return <span style={{ background: "#21262D", color, fontSize: "0.75rem", padding: "3px 9px", borderRadius: 4 }}>{text}</span>;
}

const secTitle: React.CSSProperties = { fontSize: "0.9rem", fontWeight: 700, color: "#8B949E", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 20, paddingBottom: 8, borderBottom: "1px solid #21262D" };
const card: React.CSSProperties = { background: "#161B22", border: "1px solid #21262D", borderRadius: 12, padding: "20px 24px", marginBottom: 12 };
const cardTitle: React.CSSProperties = { fontWeight: 700, color: "#E6EDF3", marginBottom: 14, fontSize: "0.95rem" };
const labelSt: React.CSSProperties = { fontSize: "0.72rem", fontWeight: 600, color: "#8B949E", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 };
const bodyTxt: React.CSSProperties = { color: "#C9D1D9", fontSize: "0.88rem", lineHeight: 1.7, margin: 0 };
const infoBox: React.CSSProperties = { background: "#0D1117", borderRadius: 8, padding: "12px 16px" };
const inputSt: React.CSSProperties = { background: "#161B22", border: "1px solid #30363D", color: "#E6EDF3", padding: "10px 14px", borderRadius: 8, fontSize: "0.9rem", outline: "none" };
const btnBlue: React.CSSProperties = { background: "#1F6FEB", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: "0.88rem", whiteSpace: "nowrap" };
const errBox: React.CSSProperties = { background: "#3C1A1A", border: "1px solid #DA3633", borderRadius: 8, padding: "12px 16px", color: "#F85149", fontSize: "0.88rem", marginBottom: 16 };
const dropLabel: React.CSSProperties = { fontSize: "0.68rem", fontWeight: 600, color: "#8B949E", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 };
const chipBtn: React.CSSProperties = { background: "#21262D", border: "1px solid #30363D", color: "#C9D1D9", padding: "5px 11px", borderRadius: 6, fontSize: "0.82rem", cursor: "pointer", whiteSpace: "nowrap" };
