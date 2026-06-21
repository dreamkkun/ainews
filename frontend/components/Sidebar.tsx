"use client";

interface SidebarProps {
  selectedSector:    string;
  setSelectedSector: (v: string) => void;
  selectedKeyword:   string;
  setSelectedKeyword:(v: string) => void;
  dateFrom:          string;
  setDateFrom:       (v: string) => void;
  dateTo:            string;
  setDateTo:         (v: string) => void;
  running:           boolean;
  onRunPipeline:     () => void;
}

const SECTORS = ["전체","반도체","거시경제","IT/플랫폼","바이오","에너지/소재","금융","자동차","일반경제"];

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px",
  background: "#0D1117", border: "1px solid #30363D",
  borderRadius: 6, color: "#E6EDF3", fontSize: "0.82rem",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.72rem", color: "#8B949E",
  textTransform: "uppercase", letterSpacing: "0.08em",
  display: "block", marginBottom: 6,
};

export default function Sidebar({
  selectedSector, setSelectedSector,
  selectedKeyword, setSelectedKeyword,
  dateFrom, setDateFrom,
  dateTo, setDateTo,
  running, onRunPipeline,
}: SidebarProps) {
  return (
    <aside style={{
      width: 260, minWidth: 260,
      background: "#161B22",
      borderRight: "1px solid #21262D",
      padding: "24px 16px",
      display: "flex", flexDirection: "column", gap: 20,
      position: "sticky", top: 0, height: "100vh", overflowY: "auto",
    }}>
      <div style={{ fontSize: "1rem", fontWeight: 700, color: "#E6EDF3" }}>🔍 필터</div>

      <hr style={{ border: "none", borderTop: "1px solid #21262D" }} />

      {/* 기간 선택 */}
      <div>
        <label style={labelStyle}>기간 선택</label>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
        <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   style={inputStyle} />
      </div>

      {/* 섹터 */}
      <div>
        <label style={labelStyle}>섹터</label>
        <select
          value={selectedSector}
          onChange={e => setSelectedSector(e.target.value)}
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* 키워드 검색 */}
      <div>
        <label style={labelStyle}>키워드 검색</label>
        <input
          type="text"
          value={selectedKeyword}
          onChange={e => setSelectedKeyword(e.target.value)}
          placeholder="예: 금리, 삼성전자"
          style={inputStyle}
        />
      </div>

      <hr style={{ border: "none", borderTop: "1px solid #21262D" }} />

      {/* 수집 실행 버튼 */}
      <button
        onClick={onRunPipeline}
        disabled={running}
        style={{
          width: "100%", padding: "12px",
          background: running ? "#30363D" : "#F85149",
          color: "#fff", border: "none",
          borderRadius: 8, fontSize: "0.88rem", fontWeight: 600,
          cursor: running ? "not-allowed" : "pointer",
          transition: "background 0.2s",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}
      >
        {running ? (
          <>
            <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
            수집 중…
          </>
        ) : (
          "🔄 뉴스 수집 & 리포트 생성"
        )}
      </button>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <p style={{ fontSize: "0.72rem", color: "#8B949E", textAlign: "center" }}>
        v1.0 — Next.js + FastAPI
      </p>
    </aside>
  );
}
