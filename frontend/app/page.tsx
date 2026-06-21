"use client";

import { useState, useEffect, useCallback } from "react";
import KpiCards from "@/components/KpiCards";
import ReportCard from "@/components/ReportCard";
import NewsList from "@/components/NewsList";
import SectorChart from "@/components/SectorChart";
import Sidebar from "@/components/Sidebar";

// 백엔드 URL — 환경변수로 관리
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Home() {
  const [stats,       setStats]       = useState<any>(null);
  const [report,      setReport]      = useState<any>(null);
  const [news,        setNews]        = useState<any[]>([]);
  const [sectors,     setSectors]     = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [running,     setRunning]     = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // 필터 상태
  const [selectedSector,  setSelectedSector]  = useState("전체");
  const [selectedKeyword, setSelectedKeyword] = useState("");
  const [dateFrom,        setDateFrom]        = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  // ── 데이터 패치 ─────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, reportRes, sectorsRes] = await Promise.all([
        fetch(`${API_BASE}/api/stats`),
        fetch(`${API_BASE}/api/report/latest`),
        fetch(`${API_BASE}/api/sectors`),
      ]);
      const [statsData, reportData, sectorsData] = await Promise.all([
        statsRes.json(),
        reportRes.json(),
        sectorsRes.json(),
      ]);
      setStats(statsData);
      setReport(reportData.report);
      setSectors(sectorsData.sectors || []);
      setRunning(statsData.pipeline_running || false);
    } catch (e) {
      console.error("데이터 패치 오류:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchNews = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (selectedSector !== "전체") params.set("sector", selectedSector);
      if (selectedKeyword)           params.set("keyword", selectedKeyword);
      if (dateFrom)                  params.set("date_from", `${dateFrom}T00:00:00+09:00`);
      if (dateTo)                    params.set("date_to",   `${dateTo}T23:59:59+09:00`);

      const res  = await fetch(`${API_BASE}/api/news?${params}`);
      const data = await res.json();
      setNews(data.news || []);
    } catch (e) {
      console.error("뉴스 패치 오류:", e);
    }
  }, [selectedSector, selectedKeyword, dateFrom, dateTo]);

  // ── 파이프라인 실행 ─────────────────────────────────────────
  const handleRunPipeline = async () => {
    if (running) return;
    setRunning(true);
    try {
      await fetch(`${API_BASE}/api/pipeline/run`, { method: "POST" });
      // 3초 간격으로 완료될 때까지 폴링
      const poll = setInterval(async () => {
        const res  = await fetch(`${API_BASE}/api/stats`);
        const data = await res.json();
        if (!data.pipeline_running) {
          clearInterval(poll);
          setRunning(false);
          await fetchAll();
          await fetchNews();
          setLastRefresh(new Date());
        }
      }, 3000);
    } catch (e) {
      console.error("파이프라인 오류:", e);
      setRunning(false);
    }
  };

  // ── 초기 로드 & 필터 변경 시 뉴스 재패치 ──────────────────
  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { fetchNews(); }, [fetchNews]);

  const lastUpdateStr = stats?.last_update
    ? stats.last_update.slice(0, 16).replace("T", " ")
    : "미수집";

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>

      {/* 사이드바 */}
      <Sidebar
        selectedSector={selectedSector}
        setSelectedSector={setSelectedSector}
        selectedKeyword={selectedKeyword}
        setSelectedKeyword={setSelectedKeyword}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        running={running}
        onRunPipeline={handleRunPipeline}
      />

      {/* 메인 콘텐츠 */}
      <main style={{ flex: 1, padding: "24px 32px", overflowY: "auto" }}>

        {/* 헤더 */}
        <div style={{
          background: "linear-gradient(135deg, #1C2333 0%, #0D1117 100%)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "24px 32px",
          marginBottom: 24,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              📈 AI 경제뉴스 인사이트
            </h1>
            <p style={{ fontSize: "0.85rem", color: "var(--blue)", marginTop: 4 }}>
              실시간 경제 뉴스 수집 · AI 종합 분석 · 투자 인사이트 도출
            </p>
          </div>
          <div style={{ textAlign: "right", fontSize: "0.78rem", color: "var(--text-muted)" }}>
            마지막 수집<br />
            <strong style={{ color: "var(--text-primary)", fontSize: "0.95rem" }}>{lastUpdateStr}</strong>
          </div>
        </div>

        {/* KPI 카드 */}
        <KpiCards stats={stats} loading={loading} />

        {/* AI 종합 리포트 */}
        <ReportCard report={report} loading={loading} />

        {/* 섹터 분포 차트 */}
        {sectors.length > 0 && (
          <SectorChart sectors={sectors} />
        )}

        {/* 뉴스 목록 */}
        <NewsList
          news={news}
          loading={loading}
          totalNews={stats?.total_news || 0}
          selectedSector={selectedSector}
        />

        {/* 푸터 */}
        <div style={{ textAlign: "center", color: "#30363D", fontSize: "0.75rem", marginTop: 40, paddingBottom: 24 }}>
          AI 경제뉴스 인사이트 v1.0 · 투자 판단의 최종 책임은 본인에게 있습니다
        </div>
      </main>
    </div>
  );
}
