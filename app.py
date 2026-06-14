"""
app.py — AI 경제뉴스 투자 인사이트 대시보드 (Phase 2 — DB 실데이터 연동)
========================================================================
변경 내역 (Phase 1 → Phase 2):
  - get_mock_news() 제거
  - database.NewsDatabase 연동 → 실 데이터 조회
  - 사이드바 '뉴스 수집 실행' → database.run_pipeline() 호출
  - 섹터별 감성 분포 바 차트 추가
  - DB 비어 있을 때 안내 메시지 표시

[실행 방법]
  pip install streamlit anthropic requests feedparser beautifulsoup4 python-dotenv
  streamlit run app.py

[환경변수 (.env)]
  ANTHROPIC_API_KEY=sk-ant-...
  NAVER_CLIENT_ID=...
  NAVER_CLIENT_SECRET=...
  DB_PATH=news.db          # 선택 사항 (기본값: news.db)
"""

import json
import logging
from datetime import datetime, timedelta, timezone

import streamlit as st
import pandas as pd

# 내부 모듈 (같은 디렉터리)
from database import NewsDatabase, run_pipeline

# ── 로거 ────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("app")

# ── 한국 시간대 ─────────────────────────────────────────────────
KST = timezone(timedelta(hours=9))

# ── 페이지 기본 설정 ─────────────────────────────────────────────
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

html, body, [class*="css"] {
    font-family: 'Noto Sans KR', 'Inter', sans-serif;
}
.stApp { background-color: #0D1117; color: #E6EDF3; }

[data-testid="stSidebar"] {
    background-color: #161B22;
    border-right: 1px solid #21262D;
}
[data-testid="stSidebar"] label {
    color: #8B949E;
    font-size: 0.78rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
}

/* 헤더 */
.header-banner {
    background: linear-gradient(135deg, #1C2333 0%, #0D1117 100%);
    border: 1px solid #21262D;
    border-radius: 12px;
    padding: 24px 32px;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.header-title    { font-size: 1.6rem; font-weight: 700; color: #E6EDF3; letter-spacing: -0.02em; margin: 0; }
.header-subtitle { font-size: 0.85rem; color: #58A6FF; margin-top: 4px; }
.header-timestamp{ font-size: 0.78rem; color: #8B949E; text-align: right; }

/* KPI 카드 */
.kpi-card {
    background-color: #161B22;
    border: 1px solid #21262D;
    border-radius: 10px;
    padding: 20px 24px;
    text-align: center;
    transition: border-color 0.2s;
}
.kpi-card:hover { border-color: #58A6FF; }
.kpi-label   { font-size: 0.72rem; color: #8B949E; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
.kpi-value   { font-size: 2rem; font-weight: 700; color: #E6EDF3; line-height: 1; }
.kpi-delta-pos { color: #3FB950; font-size: 0.82rem; margin-top: 4px; }
.kpi-delta-neg { color: #F85149; font-size: 0.82rem; margin-top: 4px; }
.kpi-delta-neu { color: #8B949E; font-size: 0.82rem; margin-top: 4px; }

/* 뉴스 카드 */
.news-card {
    background-color: #161B22;
    border: 1px solid #21262D;
    border-radius: 12px;
    padding: 24px 28px;
    margin-bottom: 16px;
    transition: border-color 0.2s, transform 0.15s;
}
.news-card:hover { border-color: #58A6FF; transform: translateY(-1px); }
.news-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.news-source { background-color: #21262D; color: #8B949E; font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; }
.news-date   { color: #8B949E; font-size: 0.75rem; }
.news-title  { font-size: 1.05rem; font-weight: 700; color: #E6EDF3; line-height: 1.4; margin-bottom: 16px; }
.news-title a{ color: #E6EDF3; text-decoration: none; }
.news-title a:hover { color: #58A6FF; }

/* AI 박스 */
.ai-box {
    background-color: #0D1117;
    border: 1px solid #30363D;
    border-left: 3px solid #58A6FF;
    border-radius: 8px;
    padding: 16px 20px;
    margin-top: 4px;
}
.ai-box-header { font-size: 0.72rem; color: #58A6FF; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; margin-bottom: 10px; }

/* 배지 */
.badge      { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 0.72rem; font-weight: 600; margin-right: 6px; }
.badge-pos  { background-color: #1A3C2F; color: #3FB950; }
.badge-neg  { background-color: #3C1A1A; color: #F85149; }
.badge-neu  { background-color: #21262D; color: #8B949E; }

/* 종목 태그 */
.ticker-tag {
    display: inline-block;
    background-color: #1C2333;
    border: 1px solid #30363D;
    color: #79C0FF;
    font-size: 0.72rem;
    padding: 3px 8px;
    border-radius: 4px;
    margin: 2px 3px;
    font-family: 'Inter', monospace;
}

/* 빈 상태 */
.empty-state { text-align: center; padding: 60px 20px; color: #8B949E; }
.empty-state-icon { font-size: 3rem; margin-bottom: 12px; }

/* Streamlit 기본 UI 정리 */
#MainMenu, footer, header { visibility: hidden; }
.block-container { padding-top: 1.5rem; }
</style>
""", unsafe_allow_html=True)


# ══════════════════════════════════════════════════════════════
# 2. DB 인스턴스 (세션당 1번 생성)
# ══════════════════════════════════════════════════════════════

@st.cache_resource
def get_db() -> NewsDatabase:
    """Streamlit 세션 전체에서 DB 커넥션 재사용"""
    return NewsDatabase()

db = get_db()


# ══════════════════════════════════════════════════════════════
# 3. 헬퍼 함수
# ══════════════════════════════════════════════════════════════

def sentiment_badge(sentiment: str) -> str:
    mapping = {
        "positive": '<span class="badge badge-pos">▲ 긍정</span>',
        "negative": '<span class="badge badge-neg">▼ 부정</span>',
        "neutral":  '<span class="badge badge-neu">— 중립</span>',
    }
    return mapping.get(sentiment, mapping["neutral"])


def ticker_tags(tickers: list) -> str:
    if not tickers:
        return "<span style='color:#8B949E; font-size:0.82rem'>관련 종목 없음</span>"
    return " ".join(f'<span class="ticker-tag">{t}</span>' for t in tickers)


def format_time_ago(iso_str: str) -> str:
    """ISO 8601 문자열 → '몇 시간 전' 형식"""
    try:
        dt   = datetime.fromisoformat(iso_str)
        now  = datetime.now(dt.tzinfo or KST)
        diff = now - dt
        mins = int(diff.total_seconds() // 60)
        if mins < 60:
            return f"{mins}분 전"
        hours = mins // 60
        if hours < 24:
            return f"{hours}시간 전"
        days = hours // 24
        return f"{days}일 전"
    except Exception:
        return iso_str[:10]


# ══════════════════════════════════════════════════════════════
# 4. 사이드바 — 필터 & 수집 실행
# ══════════════════════════════════════════════════════════════

with st.sidebar:
    st.markdown("### 🔍 필터")
    st.markdown("<hr style='border-color:#21262D; margin:8px 0 16px'>", unsafe_allow_html=True)

    # 날짜 범위
    st.markdown("**기간 선택**")
    date_from = st.date_input("시작일", value=datetime.now().date() - timedelta(days=7),
                               label_visibility="collapsed")
    date_to   = st.date_input("종료일", value=datetime.now().date(),
                               label_visibility="collapsed")

    st.markdown("<div style='height:12px'></div>", unsafe_allow_html=True)

    # 섹터 필터
    all_sectors = ["전체", "반도체", "거시경제", "IT/플랫폼", "바이오", "에너지/소재", "금융", "자동차", "일반경제"]
    selected_sector = st.selectbox("섹터", all_sectors)

    st.markdown("<div style='height:12px'></div>", unsafe_allow_html=True)

    # 감성 필터
    sentiment_map = {"전체": None, "긍정 📈": "positive", "부정 📉": "negative", "중립 ➡️": "neutral"}
    selected_sentiment_label = st.radio("감성", list(sentiment_map.keys()))
    selected_sentiment = sentiment_map[selected_sentiment_label]

    st.markdown("<div style='height:12px'></div>", unsafe_allow_html=True)

    # 키워드 검색
    search_kw = st.text_input("키워드 검색", placeholder="예: 금리, 삼성전자")

    st.markdown("<hr style='border-color:#21262D; margin:16px 0 12px'>", unsafe_allow_html=True)

    # 수집 실행 버튼 → 파이프라인 호출
    if st.button("🔄 뉴스 수집 실행", use_container_width=True, type="primary"):
        with st.spinner("뉴스 수집 중…"):
            try:
                report = run_pipeline(naver_items_per_query=10, use_rss_fallback=True)
                st.success(
                    f"완료! 수집 {report['collected']}건 / "
                    f"분석 {report['analyzed']}건 / "
                    f"저장 {report['saved']}건"
                )
                st.rerun()   # 화면 즉시 갱신
            except Exception as e:
                st.error(f"파이프라인 오류: {e}")

    st.markdown(
        "<p style='color:#8B949E; font-size:0.72rem; margin-top:12px; text-align:center'>"
        "Phase 2 — DB 실데이터 연동</p>",
        unsafe_allow_html=True,
    )


# ══════════════════════════════════════════════════════════════
# 5. 메인 영역
# ══════════════════════════════════════════════════════════════

# ── 5-A. 헤더 배너 ────────────────────────────────────────────
stats    = db.get_stats()
last_upd = stats.get("last_update", "")
last_upd_str = last_upd[:16].replace("T", " ") if last_upd else "미수집"

st.markdown(f"""
<div class="header-banner">
  <div>
    <p class="header-title">📈 AI 경제뉴스 인사이트</p>
    <p class="header-subtitle">실시간 경제 뉴스 수집 · AI 분석 · 투자 인사이트 도출</p>
  </div>
  <div class="header-timestamp">
    마지막 수집<br>
    <strong style="color:#E6EDF3; font-size:0.95rem">{last_upd_str}</strong>
  </div>
</div>
""", unsafe_allow_html=True)


# ── 5-B. KPI 카드 ────────────────────────────────────────────
total   = stats.get("total",    0)
pos_cnt = stats.get("positive", 0)
neg_cnt = stats.get("negative", 0)
sectors = stats.get("sectors",  0)

col1, col2, col3, col4 = st.columns(4)

with col1:
    st.markdown(f"""
    <div class="kpi-card">
        <div class="kpi-label">총 수집 뉴스</div>
        <div class="kpi-value">{total}</div>
        <div class="kpi-delta-neu">전체 기간</div>
    </div>""", unsafe_allow_html=True)

with col2:
    pct = round(pos_cnt / total * 100) if total else 0
    st.markdown(f"""
    <div class="kpi-card">
        <div class="kpi-label">긍정 뉴스</div>
        <div class="kpi-value" style="color:#3FB950">{pos_cnt}</div>
        <div class="kpi-delta-pos">전체의 {pct}%</div>
    </div>""", unsafe_allow_html=True)

with col3:
    pct = round(neg_cnt / total * 100) if total else 0
    st.markdown(f"""
    <div class="kpi-card">
        <div class="kpi-label">부정 뉴스</div>
        <div class="kpi-value" style="color:#F85149">{neg_cnt}</div>
        <div class="kpi-delta-neg">전체의 {pct}%</div>
    </div>""", unsafe_allow_html=True)

with col4:
    st.markdown(f"""
    <div class="kpi-card">
        <div class="kpi-label">커버 섹터</div>
        <div class="kpi-value">{sectors}</div>
        <div class="kpi-delta-neu">개 분야</div>
    </div>""", unsafe_allow_html=True)

st.markdown("<div style='height:24px'></div>", unsafe_allow_html=True)


# ── 5-C. 섹터별 감성 분포 차트 ───────────────────────────────
dist = db.get_sector_distribution()
if dist:
    with st.expander("📊 섹터별 감성 분포", expanded=False):
        df = pd.DataFrame(dist)
        # 감성 비율 컬럼 추가
        df["긍정"] = df["positive"]
        df["부정"] = df["negative"]
        df["중립"] = df["neutral"]
        df = df.set_index("sector")[["긍정", "부정", "중립"]]

        st.bar_chart(
            df,
            color=["#3FB950", "#F85149", "#8B949E"],
            height=280,
        )

st.markdown("<div style='height:8px'></div>", unsafe_allow_html=True)


# ── 5-D. 뉴스 피드 데이터 로드 ──────────────────────────────
date_from_iso = f"{date_from}T00:00:00+09:00"
date_to_iso   = f"{date_to}T23:59:59+09:00"

news_list = db.get_news(
    limit          = 50,
    sector         = None if selected_sector == "전체" else selected_sector,
    sentiment      = selected_sentiment,
    date_from      = date_from_iso,
    date_to        = date_to_iso,
    ai_only        = False,
    search_keyword = search_kw if search_kw else None,
)

# 필터 결과 헤더
filter_label = selected_sector if selected_sector != "전체" else "전체 섹터"
st.markdown(
    f"<p style='color:#8B949E; font-size:0.85rem; margin-bottom:12px'>"
    f"<strong style='color:#E6EDF3'>{filter_label}</strong> · "
    f"{len(news_list)}건 표시 중</p>",
    unsafe_allow_html=True,
)


# ── 5-E. 뉴스 카드 피드 ──────────────────────────────────────
if not news_list:
    # DB 자체가 비어 있는 경우
    if total == 0:
        st.markdown("""
        <div class="empty-state">
            <div class="empty-state-icon">📭</div>
            <p style="font-size:1rem; color:#E6EDF3">아직 수집된 뉴스가 없습니다.</p>
            <p style="font-size:0.85rem">왼쪽 사이드바의 <strong>🔄 뉴스 수집 실행</strong> 버튼을 눌러 시작하세요.</p>
        </div>""", unsafe_allow_html=True)
    else:
        # 필터 조건에 맞는 결과 없음
        st.markdown("""
        <div class="empty-state">
            <div class="empty-state-icon">🔍</div>
            <p>선택한 조건에 맞는 뉴스가 없습니다.</p>
            <p style="font-size:0.82rem">필터 조건을 변경해 주세요.</p>
        </div>""", unsafe_allow_html=True)
else:
    for news in news_list:
        time_ago     = format_time_ago(news.get("published_at", ""))
        badge_html   = sentiment_badge(news.get("ai_sentiment", "neutral"))
        tickers_html = ticker_tags(news.get("ai_tickers", []))
        sector_label = news.get("sector", "일반경제")
        source       = news.get("source", "")
        url          = news.get("url", "#")
        title        = news.get("title", "제목 없음")

        # 카드 렌더링
        st.markdown(f"""
        <div class="news-card">
            <div class="news-meta">
                <span class="news-source">{source}</span>
                <span class="news-date">{time_ago}</span>
                {badge_html}
                <span class="badge" style="background:#1C2333; color:#79C0FF">{sector_label}</span>
            </div>
            <div class="news-title">
                <a href="{url}" target="_blank">{title}</a>
            </div>
        </div>
        """, unsafe_allow_html=True)

        # AI 분석 expander
        with st.expander("🤖 AI 분석 보기", expanded=True):
            tab1, tab2 = st.tabs(["📋 요약 & 인사이트", "📌 관련 종목"])

            with tab1:
                ai_summary = news.get("ai_summary", "")
                ai_insight = news.get("ai_insight", "")

                if ai_summary:
                    st.markdown(
                        f"<div class='ai-box'>"
                        f"<div class='ai-box-header'>📄 AI 요약</div>"
                        f"<p style='color:#C9D1D9; font-size:0.9rem; line-height:1.7; margin:0'>{ai_summary}</p>"
                        f"</div>",
                        unsafe_allow_html=True,
                    )
                    st.markdown("<div style='height:10px'></div>", unsafe_allow_html=True)
                else:
                    st.info("AI 분석 대기 중입니다.")

                if ai_insight:
                    st.markdown(
                        f"<div class='ai-box' style='border-left-color:#3FB950'>"
                        f"<div class='ai-box-header' style='color:#3FB950'>💡 투자 인사이트</div>",
                        unsafe_allow_html=True,
                    )
                    st.markdown(ai_insight)
                    st.markdown("</div>", unsafe_allow_html=True)

            with tab2:
                st.markdown(
                    f"<div class='ai-box' style='border-left-color:#79C0FF'>"
                    f"<div class='ai-box-header' style='color:#79C0FF'>📌 AI 추출 관련 종목</div>"
                    f"<p style='margin:0'>{tickers_html}</p>"
                    f"</div>",
                    unsafe_allow_html=True,
                )
                st.caption("※ 투자 권유가 아닙니다. 참고용으로만 활용하세요.")

        st.markdown("<div style='height:4px'></div>", unsafe_allow_html=True)


# ══════════════════════════════════════════════════════════════
# 6. 푸터
# ══════════════════════════════════════════════════════════════
st.markdown("<div style='height:40px'></div>", unsafe_allow_html=True)
st.markdown(
    "<p style='text-align:center; color:#30363D; font-size:0.75rem'>"
    "AI 경제뉴스 인사이트 대시보드 · Phase 2 · 투자 판단의 최종 책임은 본인에게 있습니다"
    "</p>",
    unsafe_allow_html=True,
)
