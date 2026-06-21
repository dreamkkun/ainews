"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useState } from "react";

interface SectorChartProps {
  sectors: { sector: string; total: number }[];
}

const COLORS = ["#58A6FF","#3FB950","#79C0FF","#F78166","#FFA657","#D2A8FF","#FF7B72"];

export default function SectorChart({ sectors }: SectorChartProps) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginBottom: 24 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "none", border: "none", cursor: "pointer",
          fontSize: "0.85rem", color: "var(--text-muted)", padding: "8px 0",
          width: "100%", textAlign: "left",
        }}
      >
        <span style={{ transition: "transform 0.2s", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
        📊 섹터별 뉴스 분포
      </button>

      {open && (
        <div style={{
          background: "var(--bg-secondary)", border: "1px solid var(--border)",
          borderRadius: 10, padding: "20px", marginTop: 8,
        }}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={sectors} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <XAxis dataKey="sector" tick={{ fill: "#8B949E", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#8B949E", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "#1C2333", border: "1px solid #30363D", borderRadius: 8, color: "#E6EDF3" }}
                cursor={{ fill: "rgba(88,166,255,0.1)" }}
              />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {sectors.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
