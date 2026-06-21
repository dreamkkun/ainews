"""
news_collector.py — 경제뉴스 수집기
=====================================
수집 전략 (우선순위 순):
  1순위: 네이버 뉴스 검색 API  ← 공식 API, 클라우드 환경에서도 안정적
  2순위: RSS 피드               ← 환경에 따라 403 차단될 수 있어 보조 수단으로 사용

[네이버 API 발급 방법]
  1. https://developers.naver.com/apps/#/register 접속
  2. 애플리케이션 등록 → 검색 API 선택
  3. Client ID / Client Secret 발급 (무료, 일 25,000건)
  4. .env 파일에 NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 저장

[출력 스키마 — 이후 ai_analyzer.py / database.py 와 공유]
  {
    "id":           str   — 중복 판단용 해시 (title + published_at)
    "title":        str   — 뉴스 제목
    "source":       str   — 출처 언론사
    "url":          str   — 원문 링크
    "description":  str   — 리드문 (AI 분석 입력값으로 사용)
    "published_at": str   — ISO 8601 문자열 (예: "2024-08-20T09:30:00")
    "sector":       str   — 자동 분류된 섹터 (미분류 = "일반경제")
    "collected_at": str   — 수집 시각 ISO 8601
  }
"""

import os
import re
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import requests
import feedparser
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# ── 환경변수 로드 ──────────────────────────────────────────────
load_dotenv()

# ── 로거 설정 ─────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("news_collector")


# ══════════════════════════════════════════════════════════════
# 0. 상수 & 설정
# ══════════════════════════════════════════════════════════════

# 네이버 검색 API 엔드포인트
NAVER_API_URL = "https://openapi.naver.com/v1/search/news.json"

# 검색 키워드 묶음: (display_name, [query_list])
# display_name → sector 필드에 저장됨
SEARCH_TOPICS: list[tuple[str, list[str]]] = [
    ("반도체",       ["반도체 주가", "HBM", "삼성전자 반도체", "SK하이닉스"]),
    ("거시경제",     ["금리", "한국은행 기준금리", "미 연준 FOMC", "환율 달러"]),
    ("IT/플랫폼",    ["카카오 주가", "네이버 AI", "IT 플랫폼 규제"]),
    ("바이오",       ["바이오 FDA", "임상 승인", "신약 허가"]),
    ("에너지/소재",  ["국제유가", "2차전지 리튬", "포스코 철강"]),
    ("금융",         ["은행 NIM", "증권사 실적", "보험 금리"]),
    ("자동차",       ["현대차 전기차", "기아 판매", "자동차 수출"]),
]

# RSS 피드 목록 (네이버 API 실패 시 보조 수단)
RSS_FEEDS: list[dict] = [
    {"name": "한국경제",   "url": "https://www.hankyung.com/feed/all-news",      "sector": "거시경제"},
    {"name": "매일경제",   "url": "https://www.mk.co.kr/rss/30000001/",          "sector": "거시경제"},
    {"name": "머니투데이", "url": "https://rss.mt.co.kr/mt/rss/economy.rss",     "sector": "거시경제"},
    {"name": "ZDNet",      "url": "https://www.zdnet.co.kr/rss/",                "sector": "IT/플랫폼"},
]

# 섹터 자동 분류 키워드 맵 (네이버 API 결과에도 적용)
SECTOR_KEYWORDS: dict[str, list[str]] = {
    "반도체":       ["반도체", "HBM", "DRAM", "낸드", "파운드리", "삼성전자", "SK하이닉스", "TSMC"],
    "IT/플랫폼":    ["카카오", "네이버", "플랫폼", "AI", "인공지능", "소프트웨어", "앱", "클라우드"],
    "바이오":       ["바이오", "제약", "임상", "FDA", "신약", "의약품", "헬스케어"],
    "에너지/소재":  ["유가", "원유", "배터리", "2차전지", "리튬", "철강", "화학", "포스코"],
    "금융":         ["금리", "은행", "증권", "보험", "대출", "채권", "연준", "한국은행"],
    "자동차":       ["자동차", "전기차", "현대차", "기아", "테슬라", "EV", "수소차"],
    "거시경제":     ["GDP", "물가", "인플레이션", "환율", "달러", "무역수지", "경상수지"],
}

# HTTP 요청 공통 헤더
REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "ko-KR,ko;q=0.9",
}

# 한국 시간대 (UTC+9)
KST = timezone(timedelta(hours=9))


# ══════════════════════════════════════════════════════════════
# 1. 유틸리티 함수
# ══════════════════════════════════════════════════════════════

def make_news_id(title: str, published_at: str) -> str:
    """
    제목 + 발행 시각을 합쳐 SHA-256 해시(앞 12자리)로 ID 생성.
    동일 기사가 여러 소스에서 수집돼도 중복 판별 가능.
    """
    raw = f"{title}|{published_at}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]


def clean_html(text: str) -> str:
    """
    HTML 태그 및 특수 엔티티 제거.
    네이버 API 리드문에 <b>, &quot; 등이 섞여 들어옴.
    """
    text = BeautifulSoup(text, "html.parser").get_text()
    text = re.sub(r"\s+", " ", text).strip()
    return text


def classify_sector(title: str, description: str) -> str:
    """
    제목 + 리드문에서 키워드를 찾아 섹터 자동 분류.
    여러 섹터 키워드가 겹치면 먼저 매칭된 섹터를 반환.
    """
    combined = (title + " " + description).lower()
    for sector, keywords in SECTOR_KEYWORDS.items():
        if any(kw.lower() in combined for kw in keywords):
            return sector
    return "일반경제"


def parse_naver_date(date_str: str) -> str:
    """
    네이버 API 날짜 형식 'Tue, 20 Aug 2024 09:30:00 +0900'
    → ISO 8601 문자열 '2024-08-20T09:30:00+09:00' 로 변환.
    파싱 실패 시 현재 시각 반환 (프로그램 중단 방지).
    """
    try:
        dt = datetime.strptime(date_str, "%a, %d %b %Y %H:%M:%S %z")
        return dt.isoformat()
    except Exception:
        logger.warning(f"날짜 파싱 실패: {date_str!r} — 현재 시각으로 대체")
        return datetime.now(KST).isoformat()


def now_kst_iso() -> str:
    """현재 한국 시각을 ISO 8601 문자열로 반환"""
    return datetime.now(KST).isoformat()


# ══════════════════════════════════════════════════════════════
# 2. 수집기 A — 네이버 뉴스 검색 API (1순위)
# ══════════════════════════════════════════════════════════════

class NaverNewsCollector:
    """
    네이버 검색 API로 키워드별 뉴스를 수집.
    일 25,000건 무료 / 1회 최대 100건 / 클라우드 환경 안정적.

    사용 전: .env 에 NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 필요.
    """

    def __init__(self):
        self.client_id     = os.getenv("NAVER_CLIENT_ID", "")
        self.client_secret = os.getenv("NAVER_CLIENT_SECRET", "")
        self.is_available  = bool(self.client_id and self.client_secret)

        if not self.is_available:
            logger.warning(
                "네이버 API 키 없음. "
                ".env 에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 를 설정해 주세요."
            )

    def _fetch_query(
        self,
        query: str,
        display: int = 20,
        sort: str = "date",
    ) -> list[dict]:
        """
        단일 쿼리로 네이버 API 호출 → 원시 뉴스 리스트 반환.

        Args:
            query:   검색어
            display: 가져올 건수 (최대 100)
            sort:    'date'(최신순) or 'sim'(유사도순)

        Returns:
            뉴스 딕셔너리 리스트 (네이버 원본 스키마)
        """
        params = {
            "query":   query,
            "display": display,
            "sort":    sort,
        }
        headers = {
            **REQUEST_HEADERS,
            "X-Naver-Client-Id":     self.client_id,
            "X-Naver-Client-Secret": self.client_secret,
        }

        try:
            resp = requests.get(
                NAVER_API_URL,
                params=params,
                headers=headers,
                timeout=10,
            )
            resp.raise_for_status()          # 4xx / 5xx → 예외 발생
            data = resp.json()
            return data.get("items", [])

        except requests.exceptions.Timeout:
            logger.warning(f"[네이버API] 타임아웃 — 쿼리: {query!r}")
            return []

        except requests.exceptions.HTTPError as e:
            logger.error(f"[네이버API] HTTP 오류 {e.response.status_code} — 쿼리: {query!r}")
            return []

        except Exception as e:
            logger.error(f"[네이버API] 예외 — {e}")
            return []

    def collect(self, items_per_query: int = 10) -> list[dict]:
        """
        SEARCH_TOPICS 의 모든 키워드를 순회하며 뉴스 수집.
        중복(동일 ID) 제거 후 공통 스키마로 정규화 반환.

        Args:
            items_per_query: 키워드 1개당 수집 건수

        Returns:
            정규화된 뉴스 딕셔너리 리스트
        """
        if not self.is_available:
            logger.warning("네이버 API 사용 불가 — 수집 건너뜀")
            return []

        results: list[dict] = []
        seen_ids: set[str]  = set()          # 중복 판별용 ID 집합

        for sector, queries in SEARCH_TOPICS:
            for query in queries:
                raw_items = self._fetch_query(query, display=items_per_query)
                logger.info(f"[네이버API] '{query}' → {len(raw_items)}건 수신")

                for item in raw_items:
                    try:
                        title       = clean_html(item.get("title", ""))
                        description = clean_html(item.get("description", ""))
                        published   = parse_naver_date(item.get("pubDate", ""))
                        url         = item.get("originallink") or item.get("link", "")
                        source      = self._extract_source(url)

                        news_id = make_news_id(title, published)
                        if news_id in seen_ids:
                            continue                  # 중복 스킵
                        seen_ids.add(news_id)

                        # 섹터: 검색 토픽 섹터를 기본값으로 하되,
                        # 키워드 분류기로 재검증
                        final_sector = classify_sector(title, description) or sector

                        results.append({
                            "id":           news_id,
                            "title":        title,
                            "source":       source,
                            "url":          url,
                            "description":  description,
                            "published_at": published,
                            "sector":       final_sector,
                            "collected_at": now_kst_iso(),
                        })

                    except Exception as e:
                        # 개별 아이템 파싱 실패 → 로그만 남기고 계속
                        logger.warning(f"아이템 파싱 실패 — {e}")
                        continue

        logger.info(f"[네이버API] 최종 수집: {len(results)}건 (중복 제거 완료)")
        return results

    @staticmethod
    def _extract_source(url: str) -> str:
        """
        URL 도메인에서 언론사 이름 추출.
        예: 'https://www.hankyung.com/...' → '한국경제'
        """
        DOMAIN_MAP = {
            "hankyung.com":   "한국경제",
            "mk.co.kr":       "매일경제",
            "mt.co.kr":       "머니투데이",
            "news.naver.com": "네이버뉴스",
            "yonhapnews.co.kr": "연합뉴스",
            "zdnet.co.kr":    "ZDNet Korea",
            "edaily.co.kr":   "이데일리",
            "etnews.com":     "전자신문",
            "sedaily.com":    "서울경제",
            "chosun.com":     "조선일보",
            "joongang.co.kr": "중앙일보",
        }
        for domain, name in DOMAIN_MAP.items():
            if domain in url:
                return name
        # 매핑 없으면 도메인 2단계만 추출 (예: 'yna.co.kr' → 'yna')
        match = re.search(r"://(?:www\.)?([^/]+)", url)
        return match.group(1).split(".")[0] if match else "알 수 없음"


# ══════════════════════════════════════════════════════════════
# 3. 수집기 B — RSS 피드 파서 (2순위 보조)
# ══════════════════════════════════════════════════════════════

class RSSCollector:
    """
    RSS_FEEDS 에 정의된 피드를 feedparser 로 수집.
    클라우드 환경에서 403 차단이 많으므로 네이버 API 실패 시 보조 수단으로 사용.
    """

    def collect(self) -> list[dict]:
        """
        모든 RSS 피드 순회 → 정규화된 뉴스 리스트 반환.
        개별 피드 실패 시 해당 피드를 건너뛰고 계속 진행 (프로그램 중단 없음).
        """
        results: list[dict] = []
        seen_ids: set[str]  = set()

        for feed_info in RSS_FEEDS:
            name   = feed_info["name"]
            url    = feed_info["url"]
            sector = feed_info["sector"]

            try:
                # feedparser 는 내부적으로 requests 를 쓰지 않아 User-Agent 별도 설정
                feed = feedparser.parse(
                    url,
                    request_headers=REQUEST_HEADERS,
                )

                # bozo=True 이면 파싱 오류 (XML 깨짐 등) — 데이터는 있을 수 있으므로 경고만
                if feed.bozo:
                    logger.warning(f"[RSS] '{name}' 파싱 경고: {feed.bozo_exception}")

                if not feed.entries:
                    logger.warning(f"[RSS] '{name}' — 항목 없음 (차단 또는 빈 피드)")
                    continue

                logger.info(f"[RSS] '{name}' → {len(feed.entries)}건 수신")

                for entry in feed.entries:
                    try:
                        title       = clean_html(getattr(entry, "title", ""))
                        description = clean_html(
                            getattr(entry, "summary", "")
                            or getattr(entry, "description", "")
                        )
                        url_item = getattr(entry, "link", "")
                        published = self._parse_rss_date(entry)

                        news_id = make_news_id(title, published)
                        if news_id in seen_ids:
                            continue
                        seen_ids.add(news_id)

                        final_sector = classify_sector(title, description) or sector

                        results.append({
                            "id":           news_id,
                            "title":        title,
                            "source":       name,
                            "url":          url_item,
                            "description":  description,
                            "published_at": published,
                            "sector":       final_sector,
                            "collected_at": now_kst_iso(),
                        })

                    except Exception as e:
                        logger.warning(f"[RSS] 항목 파싱 실패 '{name}' — {e}")
                        continue

            except Exception as e:
                # 피드 전체 실패 → 로그만 남기고 다음 피드 계속
                logger.error(f"[RSS] '{name}' 수집 실패 — {e}")
                continue

        logger.info(f"[RSS] 최종 수집: {len(results)}건")
        return results

    @staticmethod
    def _parse_rss_date(entry) -> str:
        """
        feedparser 엔트리에서 날짜 파싱.
        published_parsed(struct_time) → ISO 8601 문자열 변환.
        없으면 현재 시각 반환.
        """
        try:
            if hasattr(entry, "published_parsed") and entry.published_parsed:
                import calendar
                ts = calendar.timegm(entry.published_parsed)  # UTC timestamp
                dt = datetime.fromtimestamp(ts, tz=timezone.utc).astimezone(KST)
                return dt.isoformat()
        except Exception:
            pass
        return datetime.now(KST).isoformat()


# ══════════════════════════════════════════════════════════════
# 4. 통합 수집기 — 외부에서 호출하는 진입점
# ══════════════════════════════════════════════════════════════

class NewsCollector:
    """
    NaverNewsCollector + RSSCollector 를 통합 관리.

    사용법:
        collector = NewsCollector()
        news_list = collector.collect_all()
        # → list[dict]  공통 스키마 뉴스 목록
    """

    def __init__(self):
        self.naver = NaverNewsCollector()
        self.rss   = RSSCollector()

    def collect_all(
        self,
        naver_items_per_query: int = 10,
        use_rss_fallback: bool = True,
    ) -> list[dict]:
        """
        1. 네이버 API 수집 시도
        2. 결과가 없거나 API 키 미설정 시 RSS 보조 수집
        3. 두 결과 합산 후 전체 중복 제거 → 최신순 정렬

        Args:
            naver_items_per_query: 네이버 API 키워드 1개당 수집 건수
            use_rss_fallback:      RSS 보조 수집 여부

        Returns:
            공통 스키마 뉴스 딕셔너리 리스트 (최신순)
        """
        all_news: list[dict] = []
        seen_ids: set[str]   = set()

        # ── 1단계: 네이버 API ──
        naver_news = self.naver.collect(items_per_query=naver_items_per_query)
        for item in naver_news:
            if item["id"] not in seen_ids:
                seen_ids.add(item["id"])
                all_news.append(item)

        logger.info(f"네이버 API 수집 완료: {len(naver_news)}건")

        # ── 2단계: RSS 보조 (옵션) ──
        if use_rss_fallback:
            rss_news = self.rss.collect()
            added = 0
            for item in rss_news:
                if item["id"] not in seen_ids:
                    seen_ids.add(item["id"])
                    all_news.append(item)
                    added += 1
            logger.info(f"RSS 보조 수집 완료: {added}건 추가")

        # ── 최신순 정렬 ──
        all_news.sort(key=lambda x: x["published_at"], reverse=True)

        logger.info(f"최종 수집 합계: {len(all_news)}건 (중복 제거 완료)")
        return all_news


# ══════════════════════════════════════════════════════════════
# 5. 단독 실행 테스트 (python news_collector.py)
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import json

    print("=" * 60)
    print("뉴스 수집기 테스트 실행")
    print("=" * 60)

    collector = NewsCollector()

    # 테스트: 키워드 1개당 3건만 (빠른 확인용)
    news = collector.collect_all(naver_items_per_query=3, use_rss_fallback=True)

    if not news:
        print("\n[결과] 수집된 뉴스 없음")
        print("→ .env 파일에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 를 설정했는지 확인해 주세요.")
    else:
        print(f"\n[결과] 총 {len(news)}건 수집 완료\n")
        # 처음 3건만 미리보기 출력
        for i, n in enumerate(news[:3], 1):
            print(f"── [{i}] ──────────────────────────────")
            print(f"  제목:     {n['title'][:50]}...")
            print(f"  출처:     {n['source']}")
            print(f"  섹터:     {n['sector']}")
            print(f"  발행:     {n['published_at']}")
            print(f"  리드문:   {n['description'][:60]}...")
            print()

        # JSON 파일로 저장 (database.py 작업 전 임시 확인용)
        output_path = "news_sample.json"
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(news, f, ensure_ascii=False, indent=2)
        print(f"[저장] {output_path} 에 전체 결과 저장 완료")
