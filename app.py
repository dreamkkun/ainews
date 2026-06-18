"""
app.py — AI 경제뉴스 투자 인사이트 대시보드 (v3 — 종합 리포트 방식)
========================================================================
변경 내역 (v2 → v3):
  - 상단: 오늘의 AI 종합 시장 리포트 박스 (시장요약 + 섹터동향 + 인사이트 + 리스크)
  - 하단: 뉴스 카드 리스트 (제목·출처·섹터·시간만 표시, 기사별 AI 분석 제거)
  - 리포트 없을 때 안내 메시지 표시
"""

import json
import logging
from datetime import datetime, timedelta, timezone

import streamlit as st
import pandas as pd

from database import NewsDatabase, run_pipeline

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("app")

KST = timezone(timedelta(hours=9))

# ── 페이지 설정 ─────────────────────────────────────────────────
st.set_page_config(
    page_title="AI 경제뉴스 인사이트",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ══════════════════════════════════════════════════════════════
# 1. 전역 CSS
# ══════════════════════════════════════════════════════════════
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&family=Inter:wght@400;600;700&display=swap');
html, body, [class*="css"] { font-family: 'Noto Sans KR', 'Inter', sans-serif; }
.stApp { background-color: #0D1117; color: #E6EDF3; }

[data-testid="stSidebar"] {
    background-color: #161B22;
    border-right: 1px solid #21262D;
}
[data-testid="stSidebar"] label {
    color: #8B949E; font-size: 0.78rem;
    letter-spacing: 0.05em; text-transform: uppercase;
}

/* ── 헤더 ── */
.header-banner {
    background: linear-gradient(135deg, #1C2333 0%, #0D1117 100%);
    border: 1px solid #21262D; border-radius: 12px;
    padding: 24px 32px; margin-bottom: 24px;
    display: flex; align-items: center; justify-content: space-between;
}
.header-title    { font-size: 1.6rem; font-weight: 700; color: #E6EDF3; letter-spacing: -0.02em; margin: 0; }
.header-subtitle { font-size: 0.85rem; color: #58A6FF; margin-top: 4px; }
.header-timestamp{ font-size: 0.78rem; color: #8B949E; text-align: right; }

/* ── KPI 카드 ── */
.kpi-card {
    background-color: #161B22; border: 1px solid #21262D;
    border-radius: 10px; padding: 20px 24px;
    text-align: center; transition: border-color 0.2s;
}
.kpi-card:hover { border-color: #58A6FF; }
.kpi-label { font-size: 0.72rem; color: #8B949E; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
.kpi-value { font-size: 2rem; font-weight: 700; color: #E6EDF3; line-height: 1; }
.kpi-sub   { color: #8B949E; font-size: 0.82rem; margin-top: 4px; }

/* ── 종합 리포트 박스 ── */
.report-box {
    background: linear-gradient(135deg, #161B22 0%, #1C2333 100%);
    border: 1px solid #30363D; border-radius: 14px;
    padding: 28px 32px; margin-bottom: 24px;
}
.report-header {
    display: flex; align-items: center; gap: 12px;
    margin-bottom: 20px; padding-bottom: 16px;
    border-bottom: 1px solid #21262D;
}
.report-title { font-size: 1.1rem; font-weight: 700; color: #E6EDF3; margin: 0; }
.report-meta  { font-size: 0.75rem; color: #8B949E; margin-top: 2px; }

.sentiment-pill {
    display: inline-block; padding: 5px 14px;
    border-radius: 20px; font-size: 0.78rem; font-weight: 700;
}
.pill-pos { background-color: #1A3C2F; color: #3FB950; border: 1px solid #2EA043; }
.pill-neg { background-color: #3C1A1A; color: #F85149; border: 1px solid #DA3633; }
.pill-neu { background-color: #21262D; color: #8B949E; border: 1px solid #30363D; }

/* ── 섹터 태그 행 ── */
.sector-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
.sector-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px; border-radius: 8px;
    font-size: 0.78rem; font-weight: 500;
    border: 1px solid transparent;
}
.chip-pos { background-color: #1A3C2F; color: #3FB950; border-color: #2EA043; }
.chip-neg { background-color: #3C1A1A; color: #F85149; border-color: #DA3633; }
.chip-neu { background-color: #21262D; color: #8B949E; border-color: #30363D; }

/* ── 인사이트/리스크 패널 ── */
.insight-panel {
    background-color: #0D1117; border: 1px solid #30363D;
    border-left: 3px solid #3FB950; border-radius: 8px;
    padding: 16px 20px; margin-top: 4px;
}
.risk-panel {
    background-color: #0D1117; border: 1px solid #30363D;
    border-left: 3px solid #F85149; border-radius: 8px;
    padding: 16px 20px; margin-top: 4px;
}
.panel-header { font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; }
.panel-header-green { color: #3FB950; }
.panel-header-red   { color: #F85149; }

/* ── 종목 태그 ── */
.ticker-tag {
    display: inline-block; background-color: #1C2333;
    border: 1px solid #30363D; color: #79C0FF;
    font-size: 0.72rem; padding: 3px 8px;
    border-radius: 4px; margin: 2px 3px;
    font-family: 'Inter', monospace;
}

/* ── 뉴스 카드 (간소화) ── */
.news-item {
    background-color: #161B22; border: 1px solid #21262D;
    border-radius: 10px; padding: 16px 20px; margin-bottom: 10px;
    display: flex; align-items: flex-start; gap: 14px;
    transition: border-color 0.2s;
}
.news-item:hover { border-color: #58A6FF; }
.news-item-body { flex: 1; }
.news-item-title {
    font-size: 0.95rem; font-weight: 600; color: #E6EDF3;
    line-height: 1.5; margin-bottom: 6px;
}
.news-item-title a { color: #E6EDF3; text-decoration: none; }
.news-item-title a:hover { color: #58A6FF; }
.news-item-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.news-source  { background-color: #21262D; color: #8B949E; font-size: 0.68rem; padding: 2px 7px; border-radius: 4px; }
.news-time    { color: #8B949E; font-size: 0.72rem; }
.sector-badge {
    font-size: 0.68rem; padding: 2px 7px; border-radius: 4px;
    background-color: #1C2333; color: #79C0FF;
}

/* ── 섹션 타이틀 ── */
.section-title {
    font-size: 0.9rem; font-weight: 700; color: #8B949E;
    text-transform: uppercase; letter-spacing: 0.08em;
    margin: 24px 0 12px; padding-bottom: 8px;
    border-bottom: 1px solid #21262D;
}

/* ── 빈 상태 ── */
.empty-state { text-align: center; padding: 60px 20px; color: #8B949E; }
.empty-icon  { font-size: 3rem; margin-bottom: 12px; }

#MainMenu, footer, header { visibility: hidden; }
.block-container { padding-top: 1.5rem; }
</style>
""", unsafe_allow_html=True)


# ══════════════════════════════════════════════════════════════
# 2. DB 인스턴스
# ══════════════════════════════════════════════════════════════

@st.cache_resource
def get_db() -> NewsDatabase:
    return NewsDatabase()

db = get_db()


# ══════════════════════════════════════════════════════════════
# 3. 헬퍼 함수
# ══════════════════════════════════════════════════════════════

def format_time_ago(iso_str: str) -> str:
    try:
        dt   = datetime.fromisoformat(iso_str)
        now  = datetime.now(dt.tzinfo or KST)
        mins = int((now - dt).total_seconds() // 60)
        if mins < 60:   return f"{mins}분 전"
        if mins < 1440: return f"{mins // 60}시간 전"
        return f"{mins // 1440}일 전"
    except Exception:
        return iso_str[:10]

def sentiment_pill(sentiment: str) -> str:
    m = {
        "positive": ('<span class="sentiment-pill pill-pos">▲ 강세</span>', "▲ 강세"),
        "negative": ('<span class="sentiment-pill pill-neg">▼ 약세</span>', "▼ 약세"),
        "neutral":  ('<span class="sentiment-pill pill-neu">— 중립</span>', "— 중립"),
    }
    return m.get(sentiment, m["neutral"])[0]

def sector_chip(sector: str, sentiment: str) -> str:
    cls = {"positive": "chip-pos", "negative": "chip-neg"}.get(sentiment, "chip-neu")
    icon = {"positive": "▲", "negative": "▼"}.get(sentiment, "—")
    return f'<span class="sector-chip {cls}">{icon} {sector}</span>'

def ticker_tags(tickers: list) -> str:
    if not tickers:
        return "<span style='color:#8B949E; font-size:0.82rem'>해당 없음</span>"
    return " ".join(f'<span class="ticker-tag">{t}</span>' for t in tickers)


# ══════════════════════════════════════════════════════════════
# 4. 사이드바
# ══════════════════════════════════════════════════════════════

with st.sidebar:
    st.markdown("### 🔍 필터")
    st.markdown("<hr style='border-color:#21262D; margin:8px 0 16px'>", unsafe_allow_html=True)

    st.markdown("**기간 선택**")
    date_from = st.date_input("시작일", value=datetime.now().date() - timedelta(days=7),
                               label_visibility="collapsed")
    date_to   = st.date_input("종료일", value=datetime.now().date(),
                               label_visibility="collapsed")
    st.markdown("<div style='height:12px'></div>", unsafe_allow_html=True)

    all_sectors = ["전체", "반도체", "거시경제", "IT/플랫폼", "바이오", "에너지/소재", "금융", "자동차", "일반경제"]
    selected_sector = st.selectbox("섹터", all_sectors)
    st.markdown("<div style='height:12px'></div>", unsafe_allow_html=True)

    search_kw = st.text_input("키워드 검색", placeholder="예: 금리, 삼성전자")

    st.markdown("<hr style='border-color:#21262D; margin:16px 0 12px'>", unsafe_allow_html=True)

    if st.button("🔄 뉴스 수집 & 리포트 생성", use_container_width=True, type="primary"):
        with st.spinner("뉴스 수집 중… (약 30~60초 소요)"):
            try:
                result = run_pipeline(naver_items_per_query=10, use_rss_fallback=True)
                sentiment_label = {"positive": "강세 📈", "negative": "약세 📉"}.get(
                    result.get("sentiment", ""), "중립 ➡️"
                )
                st.success(
                    f"완료!\n\n"
                    f"수집 {result['collected']}건 · 저장 {result['saved']}건\n\n"
                    f"시장 감성: **{sentiment_label}**"
                )
                st.cache_resource.clear()
                st.rerun()
            except Exception as e:
                st.error(f"오류 발생: {e}")

    # 리포트 생성 이력
    history = db.get_report_history(limit=5)
    if history:
        st.markdown("<div style='height:8px'></div>", unsafe_allow_html=True)
        st.markdown("<p style='color:#8B949E; font-size:0.75rem; margin-bottom:6px'>📋 리포트 이력</p>",
                    unsafe_allow_html=True)
        for h in history:
            gen_str = h["generated_at"][:16].replace("T", " ")
            sent_icon = {"positive": "📈", "negative": "📉"}.get(h["sentiment"], "➡️")
            st.markdown(
                f"<p style='color:#8B949E; font-size:0.72rem; margin:2px 0'>"
                f"{sent_icon} {gen_str} · {h['news_count']}건</p>",
                unsafe_allow_html=True,
            )

    st.markdown(
        "<p style='color:#8B949E; font-size:0.72rem; margin-top:12px; text-align:center'>"
        "v3 — 종합 리포트 방식</p>",
        unsafe_allow_html=True,
    )


# ══════════════════════════════════════════════════════════════
# 5. 메인 영역
# ══════════════════════════════════════════════════════════════

# ── 5-A. 헤더 ─────────────────────────────────────────────────
news_stats = db.get_news_stats()
last_upd   = news_stats.get("last_update", "")
last_upd_str = last_upd[:16].replace("T", " ") if last_upd else "미수집"

st.markdown(f"""
<div class="header-banner">
  <div>
    <p class="header-title">📈 AI 경제뉴스 인사이트</p>
    <p class="header-subtitle">실시간 경제 뉴스 수집 · AI 종합 분석 · 투자 인사이트 도출</p>
  </div>
  <div class="header-timestamp">
    마지막 수집<br>
    <strong style="color:#E6EDF3; font-size:0.95rem">{last_upd_str}</strong>
  </div>
</div>
""", unsafe_allow_html=True)


# ── 5-B. KPI 카드 ─────────────────────────────────────────────
total_news = int(news_stats.get("total",   0) or 0)
sectors    = int(news_stats.get("sectors", 0) or 0)
latest_report = db.get_latest_report()
report_cnt    = len(db.get_report_history(limit=100))

col1, col2, col3, col4 = st.columns(4)
with col1:
    st.markdown(f"""<div class="kpi-card">
        <div class="kpi-label">총 수집 뉴스</div>
        <div class="kpi-value">{total_news}</div>
        <div class="kpi-sub">전체 기간</div>
    </div>""", unsafe_allow_html=True)

with col2:
    st.markdown(f"""<div class="kpi-card">
        <div class="kpi-label">커버 섹터</div>
        <div class="kpi-value">{sectors}</div>
        <div class="kpi-sub">개 분야</div>
    </div>""", unsafe_allow_html=True)

with col3:
    r_sentiment = latest_report.get("sentiment", "—") if latest_report else "—"
    r_icon = {"positive": "📈 강세", "negative": "📉 약세", "neutral": "➡️ 중립"}.get(r_sentiment, "—")
    st.markdown(f"""<div class="kpi-card">
        <div class="kpi-label">최신 시장 감성</div>
        <div class="kpi-value" style="font-size:1.4rem">{r_icon}</div>
        <div class="kpi-sub">AI 종합 판단</div>
    </div>""", unsafe_allow_html=True)

with col4:
    st.markdown(f"""<div class="kpi-card">
        <div class="kpi-label">리포트 생성 횟수</div>
        <div class="kpi-value">{report_cnt}</div>
        <div class="kpi-sub">누적</div>
    </div>""", unsafe_allow_html=True)

st.markdown("<div style='height:24px'></div>", unsafe_allow_html=True)


# ── 5-C. AI 종합 리포트 ───────────────────────────────────────
st.markdown('<div class="section-title">🤖 AI 종합 시장 리포트</div>', unsafe_allow_html=True)

if not latest_report:
    st.markdown("""
    <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p style="font-size:1rem; color:#E6EDF3">아직 생성된 리포트가 없습니다.</p>
        <p style="font-size:0.85rem">왼쪽 사이드바의 <strong>🔄 뉴스 수집 & 리포트 생성</strong> 버튼을 눌러 시작하세요.</p>
    </div>""", unsafe_allow_html=True)
else:
    gen_time   = latest_report.get("generated_at", "")[:16].replace("T", " ")
    news_count = latest_report.get("news_count", 0)
    sentiment  = latest_report.get("sentiment", "neutral")
    pill_html  = sentiment_pill(sentiment)

    # 리포트 헤더
    st.markdown(f"""
    <div class="report-box">
        <div class="report-header">
            <div style="flex:1">
                <p class="report-title">오늘의 시장 종합 분석</p>
                <p class="report-meta">생성 시각: {gen_time} · 분석 뉴스: {news_count}건</p>
            </div>
            {pill_html}
        </div>
    </div>
    """, unsafe_allow_html=True)

    # 탭으로 리포트 섹션 분리
    tab1, tab2, tab3 = st.tabs(["📋 시장 요약 & 섹터 동향", "💡 투자 인사이트", "⚠️ 리스크 요인"])

    with tab1:
        # 시장 요약
        market_summary = latest_report.get("market_summary", "")
        st.markdown(
            f"<div class='insight-panel'>"
            f"<div class='panel-header panel-header-green'>📊 오늘의 시장 요약</div>"
            f"<p style='color:#C9D1D9; font-size:0.92rem; line-height:1.8; margin:0'>{market_summary}</p>"
            f"</div>",
            unsafe_allow_html=True,
        )
        st.markdown("<div style='height:16px'></div>", unsafe_allow_html=True)

        # 섹터별 동향 칩
        sector_insights = latest_report.get("sector_insights", [])
        if sector_insights:
            chips_html = "".join(
                sector_chip(s.get("sector", ""), s.get("sentiment", "neutral"))
                for s in sector_insights
            )
            st.markdown(
                f"<div class='panel-header panel-header-green' style='margin-bottom:8px'>📌 섹터별 감성</div>"
                f"<div class='sector-row'>{chips_html}</div>",
                unsafe_allow_html=True,
            )
            st.markdown("<div style='height:12px'></div>", unsafe_allow_html=True)

            # 섹터 상세 테이블
            sector_data = [
                {
                    "섹터": s.get("sector", ""),
                    "감성": {"positive": "▲ 긍정", "negative": "▼ 부정"}.get(s.get("sentiment", ""), "— 중립"),
                    "핵심 동향": s.get("summary", ""),
                }
                for s in sector_insights
            ]
            df = pd.DataFrame(sector_data)
            st.dataframe(
                df,
                use_container_width=True,
                hide_index=True,
                column_config={
                    "섹터":     st.column_config.TextColumn(width="small"),
                    "감성":     st.column_config.TextColumn(width="small"),
                    "핵심 동향": st.column_config.TextColumn(width="large"),
                },
            )

    with tab2:
        top_insights = latest_report.get("top_insights", "")
        top_tickers  = latest_report.get("top_tickers", [])

        st.markdown(
            f"<div class='insight-panel'>"
            f"<div class='panel-header panel-header-green'>💡 투자자 핵심 액션 포인트</div>",
            unsafe_allow_html=True,
        )
        st.markdown(top_insights)
        st.markdown("</div>", unsafe_allow_html=True)

        if top_tickers:
            st.markdown("<div style='height:16px'></div>", unsafe_allow_html=True)
            st.markdown(
                f"<div class='insight-panel'>"
                f"<div class='panel-header panel-header-green'>📌 AI 추출 주목 종목</div>"
                f"<p style='margin:0'>{ticker_tags(top_tickers)}</p>"
                f"</div>",
                unsafe_allow_html=True,
            )
        st.caption("※ 투자 권유가 아닙니다. 참고용으로만 활용하세요.")

    with tab3:
        risk_factors = latest_report.get("risk_factors", "")
        st.markdown(
            f"<div class='risk-panel'>"
            f"<div class='panel-header panel-header-red'>⚠️ 오늘의 주요 리스크 요인</div>",
            unsafe_allow_html=True,
        )
        st.markdown(risk_factors)
        st.markdown("</div>", unsafe_allow_html=True)


# ── 5-D. 섹터별 뉴스 분포 차트 ────────────────────────────────
dist = db.get_sector_distribution()
if dist:
    with st.expander("📊 섹터별 뉴스 분포", expanded=False):
        df_dist = pd.DataFrame(dist).set_index("sector")
        st.bar_chart(df_dist["total"], color="#58A6FF", height=250)

st.markdown("<div style='height:8px'></div>", unsafe_allow_html=True)


# ── 5-E. 뉴스 리스트 ─────────────────────────────────────────
st.markdown('<div class="section-title">📰 수집된 뉴스 목록</div>', unsafe_allow_html=True)

date_from_iso = f"{date_from}T00:00:00+09:00"
date_to_iso   = f"{date_to}T23:59:59+09:00"

news_list = db.get_news(
    limit          = 50,
    sector         = None if selected_sector == "전체" else selected_sector,
    date_from      = date_from_iso,
    date_to        = date_to_iso,
    search_keyword = search_kw if search_kw else None,
)

filter_label = selected_sector if selected_sector != "전체" else "전체 섹터"
st.markdown(
    f"<p style='color:#8B949E; font-size:0.85rem; margin-bottom:12px'>"
    f"<strong style='color:#E6EDF3'>{filter_label}</strong> · {len(news_list)}건</p>",
    unsafe_allow_html=True,
)

if not news_list:
    if total_news == 0:
        st.markdown("""
        <div class="empty-state">
            <div class="empty-icon">📭</div>
            <p>수집된 뉴스가 없습니다. 사이드바에서 수집을 실행해 주세요.</p>
        </div>""", unsafe_allow_html=True)
    else:
        st.markdown("""
        <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <p>선택한 조건에 맞는 뉴스가 없습니다.</p>
        </div>""", unsafe_allow_html=True)
else:
    for news in news_list:
        time_ago = format_time_ago(news.get("published_at", ""))
        source   = news.get("source", "")
        sector   = news.get("sector", "")
        title    = news.get("title", "제목 없음")
        url      = news.get("url", "#")

        st.markdown(f"""
        <div class="news-item">
            <div class="news-item-body">
                <div class="news-item-title">
                    <a href="{url}" target="_blank">{title}</a>
                </div>
                <div class="news-item-meta">
                    <span class="news-source">{source}</span>
                    <span class="news-time">{time_ago}</span>
                    <span class="sector-badge">{sector}</span>
                </div>
            </div>
        </div>
        """, unsafe_allow_html=True)


# ── 푸터 ──────────────────────────────────────────────────────
st.markdown("<div style='height:40px'></div>", unsafe_allow_html=True)
st.markdown(
    "<p style='text-align:center; color:#30363D; font-size:0.75rem'>"
    "AI 경제뉴스 인사이트 v3 · 투자 판단의 최종 책임은 본인에게 있습니다"
    "</p>",
    unsafe_allow_html=True,
)
