"use client";
import { useState, useEffect } from "react";
import { TrackedStock } from "@/lib/types";

const STORAGE_KEY = "ainews_portfolio";

function loadStocks(): TrackedStock[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}
function saveStocks(stocks: TrackedStock[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stocks));
}

const EMPTY_FORM = { companyName: "", ticker: "", purchasePrice: "", currentPrice: "", highestPrice: "" };

export default function PortfolioTab() {
  const [stocks, setStocks]     = useState<TrackedStock[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setFormData]     = useState(EMPTY_FORM);
  const [editId, setEditId]     = useState<string | null>(null);

  useEffect(() => { setStocks(loadStocks()); }, []);

  const calcStock = (base: {
    id: string; companyName: string; ticker: string;
    purchasePrice: number; currentPrice: number; highestPrice: number;
  }): TrackedStock => {
    const drop   = ((base.highestPrice - base.currentPrice) / base.highestPrice) * 100;
    const loss   = ((base.currentPrice - base.purchasePrice) / base.purchasePrice) * 100;
    const buffer = 20 - drop;
    const status: TrackedStock["status"] = drop >= 20 ? "Cut-Loss" : loss >= 20 ? "Take-Profit" : "Hold";
    return { ...base, status, dropFromPeak: drop, lossFromPurchase: loss, bufferToStopLoss: buffer, updatedAt: new Date().toISOString() };
  };

  const resetForm = () => { setFormData(EMPTY_FORM); setEditId(null); setShowForm(false); };

  const save = () => {
    if (!form.companyName || !form.purchasePrice || !form.currentPrice) return;
    const base = {
      id: editId ?? crypto.randomUUID(),
      companyName: form.companyName,
      ticker: form.ticker,
      purchasePrice: Number(form.purchasePrice),
      currentPrice:  Number(form.currentPrice),
      highestPrice:  Number(form.highestPrice || form.currentPrice),
    };
    const stock = calcStock(base);
    const next  = editId ? stocks.map(s => s.id === editId ? stock : s) : [...stocks, stock];
    setStocks(next);
    saveStocks(next);
    resetForm();
  };

  const remove = (id: string) => {
    const next = stocks.filter(s => s.id !== id);
    setStocks(next); saveStocks(next);
  };

  const startEdit = (s: TrackedStock) => {
    setEditId(s.id);
    setFormData({
      companyName:   s.companyName,
      ticker:        s.ticker ?? "",
      purchasePrice: String(s.purchasePrice),
      currentPrice:  String(s.currentPrice),
      highestPrice:  String(s.highestPrice),
    });
    setShowForm(true);
  };

  const statusStyle = (st: string): React.CSSProperties => ({
    padding: "4px 10px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 700,
    ...({ Hold: { background: "#1C2333", color: "#79C0FF" }, "Take-Profit": { background: "#1A3C2F", color: "#3FB950" }, "Cut-Loss": { background: "#3C1A1A", color: "#F85149" } }[st] ?? {}),
  });

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 8, borderBottom: "1px solid #21262D" }}>
        <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#8B949E", textTransform: "uppercase", letterSpacing: "0.08em" }}>💼 포트폴리오 추적</div>
        <button onClick={() => { setShowForm(!showForm); setEditId(null); setFormData(EMPTY_FORM); }} style={btnAdd}>
          {showForm ? "✕ 닫기" : "+ 종목 추가"}
        </button>
      </div>

      {/* 추가/수정 폼 */}
      {(showForm || editId) && (
        <div style={{ background: "#161B22", border: "1px solid #30363D", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, color: "#E6EDF3", marginBottom: 16 }}>{editId ? "종목 수정" : "새 종목 추가"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 16 }}>
            {([
              { key: "companyName",   label: "기업명 *",     placeholder: "삼성전자" },
              { key: "ticker",        label: "티커",          placeholder: "005930" },
              { key: "purchasePrice", label: "매수가 (원) *", placeholder: "70000" },
              { key: "currentPrice",  label: "현재가 (원) *", placeholder: "75000" },
              { key: "highestPrice",  label: "최고가 (원)",   placeholder: "80000" },
            ] as const).map(f => (
              <div key={f.key}>
                <div style={{ fontSize: "0.75rem", color: "#8B949E", marginBottom: 4 }}>{f.label}</div>
                <input
                  value={form[f.key]}
                  onChange={e => setFormData(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={inputSt}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} style={btnGreen}>저장</button>
            <button onClick={resetForm} style={btnCancel}>취소</button>
          </div>
        </div>
      )}

      {/* 종목 목록 */}
      {stocks.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 20px", color: "#8B949E" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>💼</div>
          <p>추적 중인 종목이 없습니다.</p>
          <p style={{ fontSize: "0.82rem" }}>오른쪽 위 "+ 종목 추가" 버튼으로 종목을 등록하세요.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {stocks.map(s => (
            <div key={s.id} style={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 12, padding: "18px 24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, color: "#E6EDF3", fontSize: "1.05rem" }}>{s.companyName}</span>
                    {s.ticker && <span style={{ background: "#1C2333", border: "1px solid #30363D", color: "#79C0FF", fontSize: "0.72rem", padding: "2px 7px", borderRadius: 4 }}>{s.ticker}</span>}
                    <span style={statusStyle(s.status)}>{s.status}</span>
                  </div>
                  <div style={{ display: "flex", gap: 20, marginTop: 10, flexWrap: "wrap" }}>
                    {[
                      { label: "매수가",    value: `${s.purchasePrice.toLocaleString()}원` },
                      { label: "현재가",    value: `${s.currentPrice.toLocaleString()}원` },
                      { label: "최고가",    value: `${s.highestPrice.toLocaleString()}원` },
                      { label: "고점 대비", value: `${s.dropFromPeak.toFixed(1)}%↓`, color: s.dropFromPeak >= 20 ? "#F85149" : s.dropFromPeak >= 10 ? "#E3B341" : "#3FB950" },
                      { label: "수익률",    value: `${s.lossFromPurchase >= 0 ? "+" : ""}${s.lossFromPurchase.toFixed(1)}%`, color: s.lossFromPurchase >= 0 ? "#3FB950" : "#F85149" },
                      { label: "손절 여유", value: `${s.bufferToStopLoss.toFixed(1)}%`, color: s.bufferToStopLoss <= 5 ? "#F85149" : "#8B949E" },
                    ].map(m => (
                      <div key={m.label}>
                        <div style={{ fontSize: "0.68rem", color: "#8B949E", marginBottom: 2 }}>{m.label}</div>
                        <div style={{ fontWeight: 600, color: m.color ?? "#C9D1D9", fontSize: "0.9rem" }}>{m.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => startEdit(s)} style={btnEdit}>수정</button>
                  <button onClick={() => remove(s.id)} style={btnDel}>삭제</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <p style={{ color: "#8B949E", fontSize: "0.75rem", textAlign: "center", marginTop: 24 }}>
        ※ 손절 기준: 고점 대비 -20% / 익절 기준: 매수가 대비 +20%
      </p>
    </div>
  );
}

const inputSt: React.CSSProperties  = { background: "#0D1117", border: "1px solid #30363D", color: "#E6EDF3", padding: "8px 12px", borderRadius: 8, fontSize: "0.85rem", width: "100%", boxSizing: "border-box" };
const btnAdd: React.CSSProperties    = { background: "#1F6FEB", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" };
const btnGreen: React.CSSProperties  = { background: "#238636", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" };
const btnCancel: React.CSSProperties = { background: "transparent", color: "#8B949E", border: "1px solid #30363D", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: "0.85rem" };
const btnEdit: React.CSSProperties   = { background: "transparent", color: "#8B949E", border: "1px solid #30363D", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: "0.78rem" };
const btnDel: React.CSSProperties    = { background: "transparent", color: "#F85149", border: "1px solid #DA3633", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: "0.78rem" };
