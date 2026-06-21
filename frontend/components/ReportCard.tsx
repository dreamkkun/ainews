"use client";
import { useState } from "react";

interface ReportCardProps {
  report:  any;
  loading: boolean;
}

const sentimentPill: Record<string, { text: string; bg: string; color: string; border: string }> = {
  positive: { text: "▲ 강세", bg: "#1A3C2F", color: "#3FB950", border: "#2EA043" },
  negative: { text: "▼ 약세", bg: "#3C1A1A", color: "#F85149", border: "#DA3633" },
  neutral:  { text: "— 중립", bg: "#21262D", color: "#8B949E", border: "#30363D" },
};

const sectorChipStyle: Record<string, { bg: string; color: string; border: string }> = {
  positive: { bg: "#1A3C2F", color: "#3FB950", border: "#2EA043" },
  negative: { bg: "#3C1A1A", color: "#F85149", border: "#DA3633" },
  neutral:  { bg: "#21262D", color: "#8B949E", border: "#30363D" },
};

export default function ReportCard({ report, loading }: ReportCardProps) {
  const [activeTab, setActiveTab] = useState<"summary" | "insights" | "risks">("summary");

  const tabs = [
    { key: "summary",  label: "📋 시장 요약 & 섹터 동향" },
    { key: "insights", label: "💡 투자 인사이트" },
    { key: "risks",    label: "⚠️ 리스크 요인" },
  ];

  const sectionTitle = (title: string) => (
    <div style={{
      fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase",
      letterSpacing: "0.08em", color: "var(--blue)", marginBottom: 10,
    }}>{title}</div>
  );

  return (
    <div style={{ marginBottom: 24 }}>
      {/* 섹션 타이틀 */}
      <div style={{
        fontSize: "0.9rem", fontWeight: 700, color: "var(--text-muted)",
        textTransform: "uppercase", letterSpacing: "0.08em",
        marginBottom: 12, paddingBottom: 8,
        borderBottom: "1px solid var(--border)",
      }}>
        🤖 AI 종합 시장 리포트
      </div>

      {loading ? (
        <div style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 14, padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
          로딩 중…
        </div>
      ) : !report ? (
        <div style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 14, padding: "60px", textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>📭</div>
          <p style={{ color: "var(--text-primary)", fontSize: "1rem" }}>아직 생성된 리포트가 없습니다.</p>
          <p style={{ fontSize: "0.85rem", marginTop: 8 }}>왼쪽 사이드바의 <strong>🔄 뉴스 수집 & 리포트 생성</strong> 버튼을 눌러 시작하세요.</p>
        </div>
      ) : (
        <div style={{
          background: "linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%)",
          border: "1px solid var(--border-light)", borderRadius: 14, overflow: "hidden",
        }}>
          {/* 리포트 헤더 */}
          <div style={{
            padding: "20px 28px",
            borderBottom: "1px solid var(--border)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>오늘의 시장 종합 분석</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
                생성: {report.generated_at?.slice(0, 16).replace("T", " ")} · 분석 뉴스: {report.news_count}건
              </div>
            </div>
            {(() => {
              const s = sentimentPill[report.sentiment] || sentimentPill.neutral;
              return (
                <span style={{
                  padding: "5px 14px", borderRadius: 20, fontSize: "0.78rem", fontWeight: 700,
                  background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                }}>{s.text}</span>
              );
            })()}
          </div>

          {/* 탭 */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)", padding: "0 28px" }}>
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                style={{
                  padding: "12px 16px", fontSize: "0.85rem", fontWeight: 500,
                  background: "none", border: "none", cursor: "pointer",
                  color: activeTab === tab.key ? "var(--text-primary)" : "var(--text-muted)",
                  borderBottom: activeTab === tab.key ? "2px solid var(--blue)" : "2px solid transparent",
                  transition: "all 0.15s",
                }}
              >{tab.label}</button>
            ))}
          </div>

          {/* 탭 콘텐츠 */}
          <div style={{ padding: "24px 28px" }}>

            {/* 시장 요약 & 섹터 동향 */}
            {activeTab === "summary" && (
              <div>
                <div style={{
                  background: "var(--bg-primary)", border: "1px solid var(--border-light)",
                  borderLeft: "3px solid var(--green)", borderRadius: 8, padding: "16px 20px", marginBottom: 20,
                }}>
                  {sectionTitle("📊 오늘의 시장 요약")}
                  <p style={{ color: "#C9D1D9", fontSize: "0.92rem", lineHeight: 1.8 }}>{report.market_summary}</p>
                </div>

                {report.sector_insights?.length > 0 && (
                  <>
                    <div style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--green)", marginBottom: 10 }}>
                      📌 섹터별 감성
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                      {report.sector_insights.map((s: any) => {
                        const style = sectorChipStyle[s.sentiment] || sectorChipStyle.neutral;
                        const icon  = s.sentiment === "positive" ? "▲" : s.sentiment === "negative" ? "▼" : "—";
                        return (
                          <span key={s.sector} style={{
                            padding: "6px 12px", borderRadius: 8, fontSize: "0.78rem", fontWeight: 500,
                            background: style.bg, color: style.color, border: `1px solid ${style.border}`,
                          }}>{icon} {s.sector}</span>
                        );
                      })}
                    </div>

                    {/* 섹터 테이블 */}
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--border)" }}>
                            {["섹터", "감성", "핵심 동향"].map(h => (
                              <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500, fontSize: "0.75rem", textTransform: "uppercase" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {report.sector_insights.map((s: any) => (
                            <tr key={s.sector} style={{ borderBottom: "1px solid var(--border)" }}>
                              <td style={{ padding: "12px 14px", color: "var(--text-primary)", fontWeight: 600, whiteSpace: "nowrap" }}>{s.sector}</td>
                              <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                                <span style={{
                                  fontSize: "0.78rem", fontWeight: 600,
                                  color: s.sentiment === "positive" ? "#3FB950" : s.sentiment === "negative" ? "#F85149" : "#8B949E",
                                }}>
                                  {s.sentiment === "positive" ? "▲ 긍정" : s.sentiment === "negative" ? "▼ 부정" : "— 중립"}
                                </span>
                              </td>
                              <td style={{ padding: "12px 14px", color: "#C9D1D9", lineHeight: 1.6 }}>{s.summary}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 투자 인사이트 */}
            {activeTab === "insights" && (
              <div>
                <div style={{
                  background: "var(--bg-primary)", border: "1px solid var(--border-light)",
                  borderLeft: "3px solid var(--green)", borderRadius: 8, padding: "16px 20px", marginBottom: 20,
                }}>
                  {sectionTitle("💡 투자자 핵심 액션 포인트")}
                  <div style={{ color: "#C9D1D9", fontSize: "0.92rem", lineHeight: 2 }}>
                    {report.top_insights?.split("\n").map((line: string, i: number) => (
                      <div key={i}>{line}</div>
                    ))}
                  </div>
                </div>
                {report.top_tickers?.length > 0 && (
                  <div style={{
                    background: "var(--bg-primary)", border: "1px solid var(--border-light)",
                    borderLeft: "3px solid var(--blue)", borderRadius: 8, padding: "16px 20px",
                  }}>
                    {sectionTitle("📌 AI 추출 주목 종목")}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {report.top_tickers.map((t: string) => (
                        <span key={t} style={{
                          background: "var(--bg-tertiary)", border: "1px solid var(--border-light)",
                          color: "var(--purple)", fontSize: "0.78rem", padding: "4px 10px",
                          borderRadius: 6, fontFamily: "monospace",
                        }}>{t}</span>
                      ))}
                    </div>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: 12 }}>
                      ※ 투자 권유가 아닙니다. 참고용으로만 활용하세요.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 리스크 요인 */}
            {activeTab === "risks" && (
              <div style={{
                background: "var(--bg-primary)", border: "1px solid var(--border-light)",
                borderLeft: "3px solid var(--red)", borderRadius: 8, padding: "16px 20px",
              }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--red)", marginBottom: 10 }}>
                  ⚠️ 오늘의 주요 리스크 요인
                </div>
                <div style={{ color: "#C9D1D9", fontSize: "0.92rem", lineHeight: 2 }}>
                  {report.risk_factors?.split("\n").map((line: string, i: number) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
