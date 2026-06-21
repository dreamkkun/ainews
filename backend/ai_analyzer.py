"""
ai_analyzer.py — AI 뉴스 분석 엔진 (v2 — 종합 리포트 방식)
=============================================================
변경 내역 (v1 → v2):
  - 기사별 개별 분석 제거
  - 수집된 전체 기사 제목 목록을 한 번에 전송 → 종합 리포트 1건 생성
  - API 호출 횟수: 기사 수 N회 → 1회 (비용 대폭 절감)

[종합 리포트 구조]
  - market_summary  : 오늘의 시장 전체 요약 (3~5문장)
  - sentiment       : 전반적 시장 감성 (positive / negative / neutral)
  - sector_insights : 섹터별 핵심 동향 (딕셔너리 리스트)
  - top_insights    : 투자자 핵심 액션 포인트 3~5개 (불릿)
  - top_tickers     : 주목 종목 코드 리스트
  - risk_factors    : 주요 리스크 요인 (불릿)
"""

import os
import json
import time
import logging
from datetime import datetime, timezone, timedelta

import anthropic
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("ai_analyzer")

# ── 상수 ──────────────────────────────────────────────────────
MODEL_ID          = "claude-sonnet-4-6"
MAX_TOKENS        = 2000    # 종합 리포트는 더 긴 응답 필요
MAX_TITLE_CHARS   = 80      # 기사 제목 최대 전송 글자 수
MAX_NEWS_COUNT    = 50      # 한 번에 분석할 최대 기사 수 (토큰 한도 고려)
RETRY_LIMIT       = 2
RETRY_DELAY       = 3.0
KST               = timezone(timedelta(hours=9))

# 분석 실패 시 기본값
DEFAULT_REPORT = {
    "market_summary":  "분석 실패 — API 호출 중 오류가 발생했습니다.",
    "sentiment":       "neutral",
    "sector_insights": [],
    "top_insights":    "• 인사이트 생성에 실패했습니다. API 키를 확인해 주세요.",
    "top_tickers":     [],
    "risk_factors":    "• 리스크 분석 실패",
    "generated_at":    "",
}


# ══════════════════════════════════════════════════════════════
# 1. 프롬프트 빌더 — 종합 리포트용
# ══════════════════════════════════════════════════════════════

def build_report_prompt(news_list: list[dict]) -> str:
    """
    수집된 뉴스 제목 전체를 넘겨 종합 시장 리포트 생성 요청.
    기사 제목만 사용 (description 제외) → 토큰 절약.

    반환 JSON 스키마:
    {
      "market_summary":  "string",
      "sentiment":       "positive|negative|neutral",
      "sector_insights": [{"sector": "str", "summary": "str", "sentiment": "str"}, ...],
      "top_insights":    "string (불릿 마크다운)",
      "top_tickers":     ["종목코드6자리", ...],
      "risk_factors":    "string (불릿 마크다운)"
    }
    """
    today = datetime.now(KST).strftime("%Y년 %m월 %d일")

    # 섹터별로 기사 제목 묶기
    sector_map: dict[str, list[str]] = {}
    for news in news_list[:MAX_NEWS_COUNT]:
        sector = news.get("sector", "일반경제")
        title  = news.get("title", "")[:MAX_TITLE_CHARS]
        if title:
            sector_map.setdefault(sector, []).append(title)

    # 프롬프트용 텍스트 조합
    news_block = ""
    for sector, titles in sector_map.items():
        news_block += f"\n[{sector}]\n"
        for t in titles:
            news_block += f"  - {t}\n"

    return f"""당신은 국내 주식시장 전문 애널리스트입니다.
오늘({today}) 수집된 경제 뉴스 헤드라인을 종합 분석해 투자자용 시장 리포트를 작성해 주세요.

[오늘의 뉴스 헤드라인]
{news_block}

[요구사항]
반드시 아래 JSON 형식으로만 응답하세요. 마크다운 코드블록(```)은 절대 포함하지 마세요.

{{
  "market_summary": "전체 뉴스를 종합한 오늘의 시장 상황 요약 (3~5문장, 핵심 흐름 중심)",
  "sentiment": "전반적 시장 감성 — positive 또는 negative 또는 neutral 중 하나",
  "sector_insights": [
    {{"sector": "섹터명", "summary": "해당 섹터 핵심 동향 1~2문장", "sentiment": "positive|negative|neutral"}},
    ...
  ],
  "top_insights": "• 투자자 핵심 액션 포인트 1\\n• 포인트 2\\n• 포인트 3\\n• 포인트 4\\n• 포인트 5",
  "top_tickers": ["주목할 종목 코드 6자리", "최대 5개"],
  "risk_factors": "• 오늘 시장의 주요 리스크 1\\n• 리스크 2\\n• 리스크 3"
}}

[작성 기준]
- market_summary: 특정 종목 추천 아닌 시장 흐름 서술
- sector_insights: 뉴스가 있는 섹터만 포함 (없으면 빈 배열)
- top_tickers: 뉴스에 직접 언급된 기업의 한국 6자리 종목코드만 (삼성전자=005930, SK하이닉스=000660 등)
- top_insights / risk_factors: 불릿(•) + 줄바꿈(\\n) 형식 준수"""


# ══════════════════════════════════════════════════════════════
# 2. AI 분석기 클래스
# ══════════════════════════════════════════════════════════════

class AIAnalyzer:
    """
    뉴스 전체를 한 번에 분석해 종합 시장 리포트 1건 생성.

    사용법:
        analyzer = AIAnalyzer()
        report   = analyzer.generate_report(news_list)
    """

    def __init__(self):
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        if not api_key:
            logger.warning("ANTHROPIC_API_KEY 없음 — AI 분석 비활성화")
            self.client       = None
            self.is_available = False
        else:
            self.client       = anthropic.Anthropic(api_key=api_key)
            self.is_available = True
            logger.info("Anthropic API 연결 완료")

    def generate_report(self, news_list: list[dict]) -> dict:
        """
        뉴스 리스트 전체를 종합 분석해 시장 리포트 딕셔너리 반환.

        Args:
            news_list: news_collector.py 출력 리스트

        Returns:
            종합 리포트 딕셔너리 (실패 시 DEFAULT_REPORT 반환)
        """
        if not self.is_available:
            logger.warning("AI 분석기 비활성화 — 기본값 반환")
            report = DEFAULT_REPORT.copy()
            report["generated_at"] = datetime.now(KST).isoformat()
            return report

        if not news_list:
            logger.warning("분석할 뉴스 없음")
            report = DEFAULT_REPORT.copy()
            report["market_summary"] = "수집된 뉴스가 없습니다."
            report["generated_at"]   = datetime.now(KST).isoformat()
            return report

        logger.info(f"종합 리포트 생성 시작 — 뉴스 {len(news_list)}건 분석 중")
        prompt = build_report_prompt(news_list)

        for attempt in range(1, RETRY_LIMIT + 1):
            try:
                response = self.client.messages.create(
                    model=MODEL_ID,
                    max_tokens=MAX_TOKENS,
                    messages=[{"role": "user", "content": prompt}],
                )
                raw_text = response.content[0].text.strip()
                report   = self._parse_report(raw_text)
                report["generated_at"] = datetime.now(KST).isoformat()
                logger.info("종합 리포트 생성 완료")
                return report

            except anthropic.RateLimitError:
                wait = RETRY_DELAY * attempt
                logger.warning(f"Rate Limit — {wait}초 후 재시도 ({attempt}/{RETRY_LIMIT})")
                time.sleep(wait)

            except anthropic.APIStatusError as e:
                logger.error(f"API 오류 {e.status_code}: {e.message}")
                if attempt < RETRY_LIMIT:
                    time.sleep(RETRY_DELAY)
                else:
                    break

            except Exception as e:
                logger.error(f"리포트 생성 예외 — {e}")
                break

        report = DEFAULT_REPORT.copy()
        report["generated_at"] = datetime.now(KST).isoformat()
        return report

    @staticmethod
    def _parse_report(raw_text: str) -> dict:
        """
        Claude 응답 JSON 파싱 + 필드 검증.
        파싱 실패 시 DEFAULT_REPORT 반환.
        """
        try:
            cleaned = raw_text.replace("```json", "").replace("```", "").strip()
            data    = json.loads(cleaned)

            # sentiment 검증
            sentiment = str(data.get("sentiment", "neutral")).lower()
            if sentiment not in ("positive", "negative", "neutral"):
                sentiment = "neutral"

            # sector_insights 검증
            raw_sectors = data.get("sector_insights", [])
            sector_insights = []
            if isinstance(raw_sectors, list):
                for s in raw_sectors:
                    if isinstance(s, dict):
                        s_sentiment = str(s.get("sentiment", "neutral")).lower()
                        if s_sentiment not in ("positive", "negative", "neutral"):
                            s_sentiment = "neutral"
                        sector_insights.append({
                            "sector":    str(s.get("sector", "")),
                            "summary":   str(s.get("summary", "")),
                            "sentiment": s_sentiment,
                        })

            # top_tickers 검증 (6자리 숫자만)
            raw_tickers = data.get("top_tickers", [])
            top_tickers = []
            if isinstance(raw_tickers, list):
                top_tickers = [
                    t for t in raw_tickers
                    if isinstance(t, str) and t.isdigit() and len(t) == 6
                ]

            return {
                "market_summary":  str(data.get("market_summary",  DEFAULT_REPORT["market_summary"])),
                "sentiment":       sentiment,
                "sector_insights": sector_insights,
                "top_insights":    str(data.get("top_insights",    DEFAULT_REPORT["top_insights"])),
                "top_tickers":     top_tickers,
                "risk_factors":    str(data.get("risk_factors",    DEFAULT_REPORT["risk_factors"])),
            }

        except json.JSONDecodeError as e:
            logger.error(f"JSON 파싱 실패: {e}\n원문: {raw_text[:300]}")
            return DEFAULT_REPORT.copy()
        except Exception as e:
            logger.error(f"리포트 파싱 예외: {e}")
            return DEFAULT_REPORT.copy()


# ══════════════════════════════════════════════════════════════
# 3. 단독 실행 테스트
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 60)
    print("AI 종합 리포트 생성 테스트")
    print("=" * 60)

    analyzer = AIAnalyzer()

    if not analyzer.is_available:
        print("\n[오류] ANTHROPIC_API_KEY 미설정")
        print("→ .env 파일에 ANTHROPIC_API_KEY=sk-ant-... 를 추가해 주세요.")
    else:
        test_news = [
            {"title": "삼성전자 HBM4 양산 성공, 엔비디아 납품 협상 급물살", "sector": "반도체"},
            {"title": "미 연준 9월 금리인하 신호 재확인, 달러 인덱스 하락", "sector": "거시경제"},
            {"title": "카카오 AI 에이전트 연내 출시 확정, 주가 급등",        "sector": "IT/플랫폼"},
            {"title": "HLB 간암 신약 FDA 최종 심사 불발, 추가 임상 요구",    "sector": "바이오"},
            {"title": "국제유가 배럴당 72달러 하락, 정유주 약세",            "sector": "에너지/소재"},
        ]

        print(f"\n뉴스 {len(test_news)}건으로 종합 리포트 생성 중...\n")
        report = analyzer.generate_report(test_news)

        print("── 종합 리포트 ───────────────────────────────")
        print(f"[시장 감성]   {report['sentiment']}")
        print(f"[시장 요약]\n  {report['market_summary']}")
        print(f"\n[섹터 동향]")
        for s in report["sector_insights"]:
            print(f"  [{s['sector']}] {s['sentiment']} — {s['summary']}")
        print(f"\n[핵심 인사이트]\n{report['top_insights']}")
        print(f"\n[주목 종목] {report['top_tickers']}")
        print(f"\n[리스크]\n{report['risk_factors']}")

        with open("report_sample.json", "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print("\n[저장] report_sample.json 완료")
