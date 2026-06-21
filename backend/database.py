"""
database.py — SQLite 저장소 (v2 — 종합 리포트 테이블 추가)
=============================================================
변경 내역 (v1 → v2):
  - news 테이블: ai_summary / ai_sentiment / ai_insight / ai_tickers 컬럼 제거
  - reports 테이블 신규 추가 (종합 리포트 저장)
  - run_pipeline(): 기사별 분석 → 종합 리포트 1건 생성으로 변경

[테이블 구조]

  [news]
    id, title, source, url, description,
    published_at, sector, collected_at

  [reports]
    id            INTEGER PRIMARY KEY AUTOINCREMENT
    generated_at  TEXT    — 리포트 생성 시각 ISO 8601
    news_count    INTEGER — 분석한 뉴스 건수
    sentiment     TEXT    — 전반적 시장 감성
    market_summary TEXT   — 시장 전체 요약
    sector_insights TEXT  — JSON 배열
    top_insights   TEXT   — 불릿 마크다운
    top_tickers    TEXT   — JSON 배열
    risk_factors   TEXT   — 불릿 마크다운
"""

import os
import json
import logging
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("database")

DB_PATH = os.getenv("DB_PATH", "news.db")
KST     = timezone(timedelta(hours=9))

# ── DDL ───────────────────────────────────────────────────────
CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS news (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    source       TEXT,
    url          TEXT,
    description  TEXT,
    published_at TEXT,
    sector       TEXT,
    collected_at TEXT
);

CREATE TABLE IF NOT EXISTS reports (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    generated_at    TEXT NOT NULL,
    news_count      INTEGER DEFAULT 0,
    sentiment       TEXT DEFAULT 'neutral',
    market_summary  TEXT,
    sector_insights TEXT DEFAULT '[]',
    top_insights    TEXT,
    top_tickers     TEXT DEFAULT '[]',
    risk_factors    TEXT
);

CREATE INDEX IF NOT EXISTS idx_news_published ON news (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_sector    ON news (sector);
CREATE INDEX IF NOT EXISTS idx_reports_gen    ON reports (generated_at DESC);
"""


# ══════════════════════════════════════════════════════════════
# 1. DB 커넥션
# ══════════════════════════════════════════════════════════════

@contextmanager
def get_connection(db_path: str = DB_PATH):
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"DB 롤백 — {e}")
        raise
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════
# 2. NewsDatabase 클래스
# ══════════════════════════════════════════════════════════════

class NewsDatabase:

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        try:
            with get_connection(self.db_path) as conn:
                conn.executescript(CREATE_TABLES_SQL)
            logger.info(f"DB 초기화 완료: {self.db_path}")
        except Exception as e:
            logger.error(f"DB 초기화 실패 — {e}")
            raise

    # ── 뉴스 저장 ────────────────────────────────────────────────
    def upsert(self, news: dict) -> bool:
        """뉴스 1건 저장. 동일 ID 있으면 무시 (중복 방지)"""
        sql = """
        INSERT OR IGNORE INTO news
            (id, title, source, url, description, published_at, sector, collected_at)
        VALUES
            (:id, :title, :source, :url, :description, :published_at, :sector, :collected_at)
        """
        try:
            with get_connection(self.db_path) as conn:
                cursor = conn.execute(sql, news)
            return cursor.rowcount > 0
        except Exception as e:
            logger.error(f"upsert 실패 (id={news.get('id')}) — {e}")
            return False

    def upsert_many(self, news_list: list[dict]) -> dict:
        """뉴스 리스트 일괄 저장"""
        success, failed = 0, 0
        for news in news_list:
            try:
                self.upsert(news)
                success += 1
            except Exception as e:
                logger.warning(f"저장 실패 — {e}")
                failed += 1
        result = {"total": len(news_list), "success": success, "failed": failed}
        logger.info(f"뉴스 일괄 저장 — {result}")
        return result

    # ── 뉴스 조회 ────────────────────────────────────────────────
    def get_news(
        self,
        limit:          int           = 50,
        sector:         Optional[str] = None,
        date_from:      Optional[str] = None,
        date_to:        Optional[str] = None,
        search_keyword: Optional[str] = None,
    ) -> list[dict]:
        """조건에 맞는 뉴스 최신순 조회"""
        conditions, params = [], []

        if sector:
            conditions.append("sector = ?")
            params.append(sector)
        if date_from:
            conditions.append("published_at >= ?")
            params.append(date_from)
        if date_to:
            conditions.append("published_at <= ?")
            params.append(date_to)
        if search_keyword:
            conditions.append("title LIKE ?")
            params.append(f"%{search_keyword}%")

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        sql   = f"SELECT * FROM news {where} ORDER BY published_at DESC LIMIT ?"
        params.append(limit)

        try:
            with get_connection(self.db_path) as conn:
                rows = conn.execute(sql, params).fetchall()
            return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"뉴스 조회 실패 — {e}")
            return []

    def count_news(self) -> int:
        try:
            with get_connection(self.db_path) as conn:
                return conn.execute("SELECT COUNT(*) FROM news").fetchone()[0]
        except Exception:
            return 0

    def get_news_stats(self) -> dict:
        """KPI 카드용 뉴스 통계 (섹터 수, 최근 수집 시각 등)"""
        sql = """
        SELECT
            COUNT(*)               AS total,
            COUNT(DISTINCT sector) AS sectors,
            MAX(collected_at)      AS last_update
        FROM news
        """
        try:
            with get_connection(self.db_path) as conn:
                row = conn.execute(sql).fetchone()
            return dict(row) if row else {}
        except Exception as e:
            logger.error(f"뉴스 통계 조회 실패 — {e}")
            return {}

    def get_sector_distribution(self) -> list[dict]:
        """섹터별 뉴스 수 (차트용)"""
        sql = """
        SELECT sector, COUNT(*) AS total
        FROM   news
        GROUP  BY sector
        ORDER  BY total DESC
        """
        try:
            with get_connection(self.db_path) as conn:
                rows = conn.execute(sql).fetchall()
            return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"섹터 분포 조회 실패 — {e}")
            return []

    # ── 리포트 저장 ──────────────────────────────────────────────
    def save_report(self, report: dict, news_count: int) -> int:
        """
        종합 리포트 1건 저장.

        Returns:
            저장된 리포트 ID (실패 시 -1)
        """
        sql = """
        INSERT INTO reports
            (generated_at, news_count, sentiment, market_summary,
             sector_insights, top_insights, top_tickers, risk_factors)
        VALUES
            (:generated_at, :news_count, :sentiment, :market_summary,
             :sector_insights, :top_insights, :top_tickers, :risk_factors)
        """
        record = {
            "generated_at":    report.get("generated_at", datetime.now(KST).isoformat()),
            "news_count":      news_count,
            "sentiment":       report.get("sentiment", "neutral"),
            "market_summary":  report.get("market_summary", ""),
            "sector_insights": json.dumps(report.get("sector_insights", []), ensure_ascii=False),
            "top_insights":    report.get("top_insights", ""),
            "top_tickers":     json.dumps(report.get("top_tickers", []), ensure_ascii=False),
            "risk_factors":    report.get("risk_factors", ""),
        }
        try:
            with get_connection(self.db_path) as conn:
                cursor = conn.execute(sql, record)
            report_id = cursor.lastrowid
            logger.info(f"리포트 저장 완료 (id={report_id})")
            return report_id
        except Exception as e:
            logger.error(f"리포트 저장 실패 — {e}")
            return -1

    # ── 리포트 조회 ──────────────────────────────────────────────
    def get_latest_report(self) -> Optional[dict]:
        """가장 최근 종합 리포트 1건 반환"""
        sql = "SELECT * FROM reports ORDER BY generated_at DESC LIMIT 1"
        try:
            with get_connection(self.db_path) as conn:
                row = conn.execute(sql).fetchone()
            return self._row_to_report(row) if row else None
        except Exception as e:
            logger.error(f"최신 리포트 조회 실패 — {e}")
            return None

    def get_report_history(self, limit: int = 10) -> list[dict]:
        """리포트 생성 이력 (최신순)"""
        sql = """
        SELECT id, generated_at, news_count, sentiment
        FROM   reports
        ORDER  BY generated_at DESC
        LIMIT  ?
        """
        try:
            with get_connection(self.db_path) as conn:
                rows = conn.execute(sql, (limit,)).fetchall()
            return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"리포트 이력 조회 실패 — {e}")
            return []

    # ── 삭제 ────────────────────────────────────────────────────
    def delete_old_news(self, days: int = 30) -> int:
        cutoff = (datetime.now(KST) - timedelta(days=days)).isoformat()
        try:
            with get_connection(self.db_path) as conn:
                cursor = conn.execute("DELETE FROM news WHERE published_at < ?", (cutoff,))
            logger.info(f"{days}일 이전 뉴스 {cursor.rowcount}건 삭제")
            return cursor.rowcount
        except Exception as e:
            logger.error(f"오래된 뉴스 삭제 실패 — {e}")
            return 0

    # ── 내부 유틸 ───────────────────────────────────────────────
    @staticmethod
    def _row_to_report(row: sqlite3.Row) -> dict:
        d = dict(row)
        try:
            d["sector_insights"] = json.loads(d.get("sector_insights", "[]"))
        except Exception:
            d["sector_insights"] = []
        try:
            d["top_tickers"] = json.loads(d.get("top_tickers", "[]"))
        except Exception:
            d["top_tickers"] = []
        return d


# ══════════════════════════════════════════════════════════════
# 3. 파이프라인 통합 함수 — app.py 진입점
# ══════════════════════════════════════════════════════════════

def run_pipeline(
    naver_items_per_query: int  = 10,
    use_rss_fallback:      bool = True,
) -> dict:
    """
    뉴스 수집 → DB 저장 → 종합 리포트 생성 → 리포트 저장

    Returns:
        {collected, saved, report_id, sentiment}
    """
    # Streamlit 환경에서 .env 재로드 보장
    from dotenv import load_dotenv
    load_dotenv(override=True)

    from news_collector import NewsCollector
    from ai_analyzer    import AIAnalyzer

    logger.info("=== 파이프라인 시작 ===")

    # 1. 뉴스 수집
    collector = NewsCollector()
    news_list = collector.collect_all(
        naver_items_per_query=naver_items_per_query,
        use_rss_fallback=use_rss_fallback,
    )
    logger.info(f"수집 완료: {len(news_list)}건")

    # 2. 뉴스 DB 저장
    db     = NewsDatabase()
    result = db.upsert_many(news_list)

    if not news_list:
        return {"collected": 0, "saved": 0, "report_id": -1, "sentiment": "neutral"}

    # 3. 종합 리포트 생성 (API 1회 호출)
    analyzer = AIAnalyzer()
    report   = analyzer.generate_report(news_list)

    # 4. 리포트 저장
    report_id = db.save_report(report, news_count=len(news_list))

    logger.info("=== 파이프라인 종료 ===")
    return {
        "collected":  len(news_list),
        "saved":      result["success"],
        "report_id":  report_id,
        "sentiment":  report.get("sentiment", "neutral"),
    }


# ══════════════════════════════════════════════════════════════
# 4. 단독 실행 테스트
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 60)
    print("DB 모듈 단독 테스트")
    print("=" * 60)

    db = NewsDatabase()

    # 테스트 뉴스 저장
    test_news = [
        {
            "id": "t001", "title": "삼성전자 HBM4 양산 성공",
            "source": "매일경제", "url": "https://example.com/1",
            "description": "테스트", "published_at": "2024-08-20T09:00:00+09:00",
            "sector": "반도체", "collected_at": "2024-08-20T10:00:00+09:00",
        },
        {
            "id": "t002", "title": "미 연준 금리인하 신호",
            "source": "한국경제", "url": "https://example.com/2",
            "description": "테스트", "published_at": "2024-08-20T08:00:00+09:00",
            "sector": "거시경제", "collected_at": "2024-08-20T10:00:00+09:00",
        },
    ]
    db.upsert_many(test_news)

    # 테스트 리포트 저장
    test_report = {
        "generated_at":    datetime.now(KST).isoformat(),
        "sentiment":       "positive",
        "market_summary":  "오늘 시장은 반도체 호재와 금리인하 기대가 겹치며 강세를 보였다.",
        "sector_insights": [{"sector": "반도체", "summary": "HBM4 양산 성공으로 수출 확대 기대", "sentiment": "positive"}],
        "top_insights":    "• 반도체 섹터 비중 확대 고려\n• 금리 민감주 관심 필요",
        "top_tickers":     ["005930", "000660"],
        "risk_factors":    "• 미중 무역 갈등 재점화 가능성\n• 환율 변동성",
    }
    report_id = db.save_report(test_report, news_count=2)
    print(f"\n[리포트 저장] id={report_id}")

    # 최신 리포트 조회
    latest = db.get_latest_report()
    if latest:
        print(f"[최신 리포트] 감성={latest['sentiment']} | 뉴스={latest['news_count']}건")
        print(f"  요약: {latest['market_summary'][:50]}...")

    # 뉴스 통계
    stats = db.get_news_stats()
    print(f"\n[뉴스 통계] 전체={stats.get('total')}건 | 섹터={stats.get('sectors')}개")
