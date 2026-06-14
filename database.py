"""
database.py — SQLite 뉴스 저장소
=====================================
역할:
  news_collector + ai_analyzer 의 결과를 SQLite 에 영속 저장하고
  app.py 가 읽어 갈 수 있는 조회 인터페이스 제공.

[테이블 구조 — news]
  id           TEXT PRIMARY KEY   — SHA-256 12자리 해시
  title        TEXT               — 뉴스 제목
  source       TEXT               — 출처 언론사
  url          TEXT               — 원문 링크
  description  TEXT               — 리드문
  published_at TEXT               — 발행 시각 ISO 8601
  sector       TEXT               — 섹터 분류
  collected_at TEXT               — 수집 시각 ISO 8601
  ai_summary   TEXT               — AI 요약
  ai_sentiment TEXT               — 감성 (positive/negative/neutral)
  ai_insight   TEXT               — AI 인사이트 마크다운
  ai_tickers   TEXT               — JSON 배열 문자열 (예: '["005930","000660"]')

[파일 위치]
  DB_PATH 환경변수로 지정 가능. 기본값: ./news.db
"""

import os
import json
import logging
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from typing import Optional

from dotenv import load_dotenv

# ── 환경변수 로드 ──────────────────────────────────────────────
load_dotenv()

# ── 로거 설정 ─────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("database")

# ── 상수 ──────────────────────────────────────────────────────
DB_PATH = os.getenv("DB_PATH", "news.db")   # 환경변수로 경로 변경 가능
KST     = timezone(timedelta(hours=9))

# 테이블 생성 DDL
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS news (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    source       TEXT,
    url          TEXT,
    description  TEXT,
    published_at TEXT,
    sector       TEXT,
    collected_at TEXT,
    ai_summary   TEXT,
    ai_sentiment TEXT DEFAULT 'neutral',
    ai_insight   TEXT,
    ai_tickers   TEXT DEFAULT '[]'
);

-- 빠른 조회를 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_published_at ON news (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_sector       ON news (sector);
CREATE INDEX IF NOT EXISTS idx_ai_sentiment ON news (ai_sentiment);
"""


# ══════════════════════════════════════════════════════════════
# 1. DB 커넥션 컨텍스트 매니저
# ══════════════════════════════════════════════════════════════

@contextmanager
def get_connection(db_path: str = DB_PATH):
    """
    SQLite 커넥션을 열고 with 블록 종료 시 자동으로 닫음.
    예외 발생 시 자동 롤백.

    사용법:
        with get_connection() as conn:
            conn.execute("SELECT ...")
    """
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row      # 결과를 딕셔너리처럼 접근 가능
    conn.execute("PRAGMA journal_mode=WAL")  # 동시 읽기/쓰기 성능 향상
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"DB 트랜잭션 롤백 — {e}")
        raise
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════
# 2. NewsDatabase 클래스
# ══════════════════════════════════════════════════════════════

class NewsDatabase:
    """
    뉴스 저장 / 조회 / 통계 인터페이스.

    사용법:
        db = NewsDatabase()
        db.upsert_many(enriched_news_list)
        recent = db.get_news(limit=20)
    """

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._init_db()

    # ── 테이블 초기화 ───────────────────────────────────────────
    def _init_db(self) -> None:
        """DB 파일과 테이블이 없으면 생성 (멱등성 보장)"""
        try:
            with get_connection(self.db_path) as conn:
                conn.executescript(CREATE_TABLE_SQL)
            logger.info(f"DB 초기화 완료: {self.db_path}")
        except Exception as e:
            logger.error(f"DB 초기화 실패 — {e}")
            raise

    # ── 저장 (Upsert) ───────────────────────────────────────────
    def upsert(self, news: dict) -> bool:
        """
        뉴스 1건을 저장. 동일 ID 가 있으면 AI 분석 필드만 업데이트.
        (제목·출처 등 메타는 처음 수집된 값 유지)

        Returns:
            True: 신규 삽입
            False: 기존 레코드 업데이트
        """
        sql_insert = """
        INSERT INTO news
            (id, title, source, url, description, published_at, sector,
             collected_at, ai_summary, ai_sentiment, ai_insight, ai_tickers)
        VALUES
            (:id, :title, :source, :url, :description, :published_at, :sector,
             :collected_at, :ai_summary, :ai_sentiment, :ai_insight, :ai_tickers)
        ON CONFLICT(id) DO UPDATE SET
            ai_summary   = excluded.ai_summary,
            ai_sentiment = excluded.ai_sentiment,
            ai_insight   = excluded.ai_insight,
            ai_tickers   = excluded.ai_tickers,
            collected_at = excluded.collected_at
        """

        # tickers 는 JSON 배열 문자열로 저장
        record = {
            **news,
            "ai_tickers":   json.dumps(news.get("ai_tickers", []), ensure_ascii=False),
            "ai_summary":   news.get("ai_summary",   ""),
            "ai_sentiment": news.get("ai_sentiment", "neutral"),
            "ai_insight":   news.get("ai_insight",   ""),
        }

        try:
            with get_connection(self.db_path) as conn:
                cursor = conn.execute(sql_insert, record)
                # lastrowid 는 INSERT 시에만 > 0
                is_new = cursor.lastrowid is not None and cursor.rowcount > 0
            return is_new
        except Exception as e:
            logger.error(f"upsert 실패 (id={news.get('id')}) — {e}")
            return False

    def upsert_many(self, news_list: list[dict]) -> dict:
        """
        뉴스 리스트 일괄 저장.
        개별 실패는 로그만 남기고 계속 진행.

        Returns:
            {"total": int, "success": int, "failed": int}
        """
        success, failed = 0, 0
        for news in news_list:
            try:
                self.upsert(news)
                success += 1
            except Exception as e:
                logger.warning(f"저장 실패 (id={news.get('id', '?')}) — {e}")
                failed += 1

        result = {"total": len(news_list), "success": success, "failed": failed}
        logger.info(f"일괄 저장 완료 — {result}")
        return result

    # ── 조회 ────────────────────────────────────────────────────
    def get_news(
        self,
        limit:          int            = 50,
        sector:         Optional[str]  = None,
        sentiment:      Optional[str]  = None,
        date_from:      Optional[str]  = None,   # ISO 8601 문자열
        date_to:        Optional[str]  = None,   # ISO 8601 문자열
        ai_only:        bool           = False,  # AI 분석 완료된 것만
        search_keyword: Optional[str]  = None,   # 제목 검색
    ) -> list[dict]:
        """
        조건에 맞는 뉴스를 최신순으로 조회.

        Args:
            limit:          최대 반환 건수
            sector:         섹터 필터 (None = 전체)
            sentiment:      감성 필터 (None = 전체)
            date_from:      발행 시작 날짜 (ISO 8601)
            date_to:        발행 종료 날짜 (ISO 8601)
            ai_only:        AI 분석 완료 뉴스만 조회
            search_keyword: 제목에 포함된 키워드 검색

        Returns:
            뉴스 딕셔너리 리스트 (ai_tickers 는 파이썬 리스트로 복원)
        """
        conditions = []
        params: list = []

        # ── 필터 조건 조립 ──
        if sector:
            conditions.append("sector = ?")
            params.append(sector)

        if sentiment:
            conditions.append("ai_sentiment = ?")
            params.append(sentiment)

        if date_from:
            conditions.append("published_at >= ?")
            params.append(date_from)

        if date_to:
            # date_to 는 해당 날짜 23:59:59 까지 포함
            date_to_end = date_to.replace("T00:00:00", "T23:59:59") if "T" not in date_to else date_to
            conditions.append("published_at <= ?")
            params.append(date_to_end)

        if ai_only:
            conditions.append("ai_summary IS NOT NULL AND ai_summary != ''")

        if search_keyword:
            conditions.append("title LIKE ?")
            params.append(f"%{search_keyword}%")

        where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        sql = f"""
        SELECT *
        FROM   news
        {where_clause}
        ORDER BY published_at DESC
        LIMIT  ?
        """
        params.append(limit)

        try:
            with get_connection(self.db_path) as conn:
                rows = conn.execute(sql, params).fetchall()
            return [self._row_to_dict(row) for row in rows]
        except Exception as e:
            logger.error(f"조회 실패 — {e}")
            return []

    def get_by_id(self, news_id: str) -> Optional[dict]:
        """ID 로 단일 뉴스 조회"""
        try:
            with get_connection(self.db_path) as conn:
                row = conn.execute("SELECT * FROM news WHERE id = ?", (news_id,)).fetchone()
            return self._row_to_dict(row) if row else None
        except Exception as e:
            logger.error(f"ID 조회 실패 — {e}")
            return None

    # ── 통계 ────────────────────────────────────────────────────
    def get_stats(self) -> dict:
        """
        대시보드 KPI 카드용 통계 반환.

        Returns:
            {
              "total":       int  — 전체 뉴스 수
              "positive":    int  — 긍정 뉴스 수
              "negative":    int  — 부정 뉴스 수
              "neutral":     int  — 중립 뉴스 수
              "sectors":     int  — 섹터 종류 수
              "last_update": str  — 가장 최근 수집 시각
            }
        """
        sql = """
        SELECT
            COUNT(*)                                        AS total,
            SUM(CASE WHEN ai_sentiment = 'positive' THEN 1 ELSE 0 END) AS positive,
            SUM(CASE WHEN ai_sentiment = 'negative' THEN 1 ELSE 0 END) AS negative,
            SUM(CASE WHEN ai_sentiment = 'neutral'  THEN 1 ELSE 0 END) AS neutral,
            COUNT(DISTINCT sector)                          AS sectors,
            MAX(collected_at)                               AS last_update
        FROM news
        """
        try:
            with get_connection(self.db_path) as conn:
                row = conn.execute(sql).fetchone()
            return dict(row) if row else {}
        except Exception as e:
            logger.error(f"통계 조회 실패 — {e}")
            return {}

    def get_sector_distribution(self) -> list[dict]:
        """섹터별 뉴스 수와 감성 분포 반환 (차트용)"""
        sql = """
        SELECT
            sector,
            COUNT(*) AS total,
            SUM(CASE WHEN ai_sentiment = 'positive' THEN 1 ELSE 0 END) AS positive,
            SUM(CASE WHEN ai_sentiment = 'negative' THEN 1 ELSE 0 END) AS negative,
            SUM(CASE WHEN ai_sentiment = 'neutral'  THEN 1 ELSE 0 END) AS neutral
        FROM news
        GROUP BY sector
        ORDER BY total DESC
        """
        try:
            with get_connection(self.db_path) as conn:
                rows = conn.execute(sql).fetchall()
            return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"섹터 분포 조회 실패 — {e}")
            return []

    def count(self) -> int:
        """전체 뉴스 건수 반환"""
        try:
            with get_connection(self.db_path) as conn:
                return conn.execute("SELECT COUNT(*) FROM news").fetchone()[0]
        except Exception:
            return 0

    # ── 삭제 ────────────────────────────────────────────────────
    def delete_old_news(self, days: int = 30) -> int:
        """
        N일 이전 뉴스 삭제 (DB 용량 관리용).

        Args:
            days: 보존 기간 (기본 30일)

        Returns:
            삭제된 건수
        """
        cutoff = datetime.now(KST) - timedelta(days=days)
        cutoff_iso = cutoff.isoformat()

        try:
            with get_connection(self.db_path) as conn:
                cursor = conn.execute(
                    "DELETE FROM news WHERE published_at < ?",
                    (cutoff_iso,)
                )
            deleted = cursor.rowcount
            logger.info(f"{days}일 이전 뉴스 {deleted}건 삭제")
            return deleted
        except Exception as e:
            logger.error(f"오래된 뉴스 삭제 실패 — {e}")
            return 0

    # ── 내부 유틸 ───────────────────────────────────────────────
    @staticmethod
    def _row_to_dict(row: sqlite3.Row) -> dict:
        """
        sqlite3.Row → 파이썬 딕셔너리 변환.
        ai_tickers 는 JSON 문자열 → 리스트로 복원.
        """
        d = dict(row)
        try:
            d["ai_tickers"] = json.loads(d.get("ai_tickers", "[]"))
        except (json.JSONDecodeError, TypeError):
            d["ai_tickers"] = []
        return d


# ══════════════════════════════════════════════════════════════
# 3. 파이프라인 통합 함수 — app.py 에서 호출하는 진입점
# ══════════════════════════════════════════════════════════════

def run_pipeline(
    naver_items_per_query: int = 10,
    use_rss_fallback:      bool = True,
) -> dict:
    """
    뉴스 수집 → AI 분석 → DB 저장 전체 파이프라인 실행.
    app.py 의 '뉴스 수집 실행' 버튼에서 호출.

    Returns:
        {
          "collected": int  — 수집 건수
          "analyzed":  int  — AI 분석 완료 건수
          "saved":     int  — DB 저장 건수
          "failed":    int  — 실패 건수
        }
    """
    # import 를 함수 안으로 옮겨 순환 참조 방지
    from news_collector import NewsCollector
    from ai_analyzer    import AIAnalyzer

    logger.info("=== 파이프라인 시작 ===")

    # 1. 수집
    collector  = NewsCollector()
    news_list  = collector.collect_all(
        naver_items_per_query=naver_items_per_query,
        use_rss_fallback=use_rss_fallback,
    )
    collected = len(news_list)
    logger.info(f"수집 완료: {collected}건")

    if not news_list:
        return {"collected": 0, "analyzed": 0, "saved": 0, "failed": 0}

    # 2. AI 분석
    analyzer      = AIAnalyzer()
    enriched_list = analyzer.analyze_batch(news_list)
    analyzed      = sum(1 for n in enriched_list if n.get("ai_summary"))
    logger.info(f"AI 분석 완료: {analyzed}건")

    # 3. DB 저장
    db     = NewsDatabase()
    result = db.upsert_many(enriched_list)
    logger.info(f"DB 저장 완료: {result}")

    logger.info("=== 파이프라인 종료 ===")
    return {
        "collected": collected,
        "analyzed":  analyzed,
        "saved":     result["success"],
        "failed":    result["failed"],
    }


# ══════════════════════════════════════════════════════════════
# 4. 단독 실행 테스트 (python database.py)
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 60)
    print("DB 모듈 단독 테스트")
    print("=" * 60)

    db = NewsDatabase()

    # 테스트 데이터 삽입
    test_records = [
        {
            "id":           "test001",
            "title":        "삼성전자, HBM4 양산 성공",
            "source":       "매일경제",
            "url":          "https://example.com/1",
            "description":  "삼성전자가 HBM4 양산 테스트를 통과했다.",
            "published_at": "2024-08-20T09:30:00+09:00",
            "sector":       "반도체",
            "collected_at": "2024-08-20T10:00:00+09:00",
            "ai_summary":   "삼성전자 HBM4 양산 성공으로 엔비디아 납품 가능성 높아짐.",
            "ai_sentiment": "positive",
            "ai_insight":   "• 단기 전망: 주가 상방 압력\n• 섹터 영향: 후공정 수혜\n• 리스크: 단가 협상",
            "ai_tickers":   ["005930", "000660"],
        },
        {
            "id":           "test002",
            "title":        "HLB, FDA 승인 불발",
            "source":       "한국경제",
            "url":          "https://example.com/2",
            "description":  "HLB 간암 신약이 FDA CRL을 받았다.",
            "published_at": "2024-08-20T08:00:00+09:00",
            "sector":       "바이오",
            "collected_at": "2024-08-20T10:00:00+09:00",
            "ai_summary":   "HLB 간암 신약 FDA 불승인으로 재심사 1년 소요 전망.",
            "ai_sentiment": "negative",
            "ai_insight":   "• 단기 전망: 주가 급락\n• 섹터 영향: 바이오 전반 약세\n• 리스크: 추가 임상 비용",
            "ai_tickers":   ["028300"],
        },
    ]

    # 저장 테스트
    result = db.upsert_many(test_records)
    print(f"\n[저장] {result}")

    # 통계 테스트
    stats = db.get_stats()
    print(f"\n[통계]")
    print(f"  전체: {stats.get('total')}건")
    print(f"  긍정: {stats.get('positive')}건")
    print(f"  부정: {stats.get('negative')}건")

    # 조회 테스트
    news = db.get_news(limit=5)
    print(f"\n[조회] 최신 {len(news)}건")
    for n in news:
        print(f"  [{n['ai_sentiment']:8s}] {n['title'][:40]}  종목: {n['ai_tickers']}")

    # 섹터 분포
    dist = db.get_sector_distribution()
    print(f"\n[섹터 분포]")
    for d in dist:
        print(f"  {d['sector']:12s} 총 {d['total']}건 (긍정:{d['positive']} 부정:{d['negative']})")

    print(f"\n[DB 파일] {DB_PATH}")
