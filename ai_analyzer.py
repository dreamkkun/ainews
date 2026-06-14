"""
ai_analyzer.py — AI 뉴스 분석 엔진
=====================================
역할:
  news_collector.py 가 수집한 뉴스(description)를 받아
  Anthropic Claude API 로 세 가지 분석을 수행하고 결과를 반환.

[분석 항목]
  1. ai_summary   — 3문장 이내 핵심 요약
  2. ai_sentiment — 투자 관점 감성 (positive / negative / neutral)
  3. ai_insight   — 단기 전망 + 섹터 영향 + 리스크 (불릿 마크다운)
  4. ai_tickers   — 관련 종목 코드 리스트 (예: ["005930", "000660"])

[사용법]
  .env 에 ANTHROPIC_API_KEY 필요.

[비용 절감 전략]
  - 뉴스 1건당 API 1회 호출 (요약+감성+인사이트+종목 통합 프롬프트)
  - description 이 길면 앞 500자만 전송 (토큰 절약)
  - 분석 실패 시 기본값 반환 (프로그램 중단 없음)
"""

import os
import json
import time
import logging
from typing import Optional

import anthropic
from dotenv import load_dotenv

# ── 환경변수 로드 ──────────────────────────────────────────────
load_dotenv()

# ── 로거 설정 ─────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("ai_analyzer")


# ══════════════════════════════════════════════════════════════
# 0. 상수
# ══════════════════════════════════════════════════════════════

MODEL_ID   = "claude-sonnet-4-6"   # 비용 대비 성능 균형
MAX_TOKENS = 1000                   # 응답 토큰 한도
MAX_DESC_CHARS = 500                # 뉴스 리드문 최대 전송 글자 수
RETRY_LIMIT    = 2                  # API 오류 시 재시도 횟수
RETRY_DELAY    = 2.0                # 재시도 대기 (초)
RATE_LIMIT_DELAY = 0.5             # 연속 호출 간격 (Rate Limit 방지)

# 감성 기본값 (AI 분석 실패 시 사용)
DEFAULT_RESULT = {
    "ai_summary":   "분석 실패 — API 호출 중 오류가 발생했습니다.",
    "ai_sentiment": "neutral",
    "ai_insight":   "• 인사이트 생성 실패",
    "ai_tickers":   [],
}


# ══════════════════════════════════════════════════════════════
# 1. 프롬프트 템플릿
# ══════════════════════════════════════════════════════════════

def build_prompt(title: str, description: str, sector: str) -> str:
    """
    뉴스 1건에 대한 AI 분석 요청 프롬프트 생성.
    JSON 형식으로 응답을 강제해 파싱 안정성을 높임.

    반환 JSON 스키마:
    {
      "summary":   "string",
      "sentiment": "positive" | "negative" | "neutral",
      "insight":   "string (마크다운 불릿 형식)",
      "tickers":   ["string", ...]
    }
    """
    # 너무 긴 리드문은 앞부분만 사용 (토큰 절약)
    truncated_desc = description[:MAX_DESC_CHARS] if len(description) > MAX_DESC_CHARS else description

    return f"""당신은 국내 주식시장 전문 애널리스트입니다.
아래 경제 뉴스를 읽고 투자자 관점에서 분석해 주세요.

[뉴스 정보]
섹터: {sector}
제목: {title}
내용: {truncated_desc}

[요구사항]
반드시 아래 JSON 형식으로만 응답하세요. 다른 설명이나 마크다운 코드블록(```)은 절대 포함하지 마세요.

{{
  "summary": "핵심 내용을 2~3문장으로 요약 (객관적 사실 위주)",
  "sentiment": "positive 또는 negative 또는 neutral 중 하나만 (투자 관점 기준)",
  "insight": "• 단기 전망(1~3개월):\\n• 섹터 영향:\\n• 주요 리스크:",
  "tickers": ["관련 국내 종목 코드 6자리 숫자", "없으면 빈 배열"]
}}

[판단 기준]
- sentiment: 해당 뉴스가 주식 시장/관련 종목에 긍정적이면 positive, 부정적이면 negative, 불확실/중립이면 neutral
- tickers: 뉴스에 직접 언급된 기업의 한국 6자리 종목코드만 포함 (예: 삼성전자=005930, SK하이닉스=000660)
- insight: 반드시 불릿 마크다운(•) 형식으로 3개 항목 작성"""


# ══════════════════════════════════════════════════════════════
# 2. AI 분석기 클래스
# ══════════════════════════════════════════════════════════════

class AIAnalyzer:
    """
    Anthropic Claude API 를 통해 뉴스 분석 수행.

    사용법:
        analyzer = AIAnalyzer()
        result   = analyzer.analyze(news_item)
        # result = {ai_summary, ai_sentiment, ai_insight, ai_tickers}
    """

    def __init__(self):
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        if not api_key:
            logger.warning("ANTHROPIC_API_KEY 없음 — AI 분석 비활성화")
            self.client      = None
            self.is_available = False
        else:
            self.client       = anthropic.Anthropic(api_key=api_key)
            self.is_available = True
            logger.info("Anthropic API 연결 완료")

    # ── 단일 뉴스 분석 ──────────────────────────────────────────
    def analyze(self, news_item: dict) -> dict:
        """
        뉴스 1건을 분석해 AI 분석 필드 4개를 반환.

        Args:
            news_item: news_collector.py 의 출력 딕셔너리

        Returns:
            {ai_summary, ai_sentiment, ai_insight, ai_tickers}
            실패 시 DEFAULT_RESULT 반환 (프로그램 중단 없음)
        """
        if not self.is_available:
            logger.warning("AI 분석기 비활성화 상태 — 기본값 반환")
            return DEFAULT_RESULT.copy()

        title       = news_item.get("title", "")
        description = news_item.get("description", "")
        sector      = news_item.get("sector", "일반경제")

        # 제목이 없으면 분석 의미 없음
        if not title:
            logger.warning("제목 없음 — 기본값 반환")
            return DEFAULT_RESULT.copy()

        prompt = build_prompt(title, description, sector)

        # ── 재시도 로직 ──
        for attempt in range(1, RETRY_LIMIT + 1):
            try:
                response = self.client.messages.create(
                    model=MODEL_ID,
                    max_tokens=MAX_TOKENS,
                    messages=[{"role": "user", "content": prompt}],
                )

                raw_text = response.content[0].text.strip()
                return self._parse_response(raw_text)

            except anthropic.RateLimitError:
                # Rate Limit: 대기 후 재시도
                logger.warning(f"Rate Limit 발생 — {RETRY_DELAY * attempt}초 후 재시도 ({attempt}/{RETRY_LIMIT})")
                time.sleep(RETRY_DELAY * attempt)

            except anthropic.APIStatusError as e:
                # API 서버 오류 (5xx 등)
                logger.error(f"API 오류 {e.status_code}: {e.message}")
                if attempt < RETRY_LIMIT:
                    time.sleep(RETRY_DELAY)
                else:
                    return DEFAULT_RESULT.copy()

            except Exception as e:
                # 그 외 예기치 못한 오류
                logger.error(f"분석 중 예외 발생 — {e}")
                return DEFAULT_RESULT.copy()

        # 모든 재시도 실패
        logger.error(f"AI 분석 실패 ({RETRY_LIMIT}회 재시도) — 기본값 반환")
        return DEFAULT_RESULT.copy()

    # ── 배치 분석 ───────────────────────────────────────────────
    def analyze_batch(
        self,
        news_list: list[dict],
        delay: float = RATE_LIMIT_DELAY,
    ) -> list[dict]:
        """
        뉴스 리스트 전체를 순차 분석.
        각 뉴스에 AI 분석 필드를 추가한 새 딕셔너리 리스트 반환.

        Args:
            news_list: news_collector.py 출력 리스트
            delay:     API 호출 간 대기 시간 (초) — Rate Limit 방지

        Returns:
            AI 분석 결과가 추가된 뉴스 딕셔너리 리스트
        """
        enriched: list[dict] = []
        total = len(news_list)

        for i, news in enumerate(news_list, 1):
            logger.info(f"[{i}/{total}] 분석 중: {news.get('title', '')[:40]}...")

            ai_result = self.analyze(news)

            # 기존 뉴스 딕셔너리에 AI 분석 결과 병합
            enriched_news = {
                **news,                                     # 기존 필드 유지
                "ai_summary":   ai_result["ai_summary"],
                "ai_sentiment": ai_result["ai_sentiment"],
                "ai_insight":   ai_result["ai_insight"],
                "ai_tickers":   ai_result["ai_tickers"],
            }
            enriched.append(enriched_news)

            # 마지막 항목이 아닐 때만 대기 (불필요한 sleep 방지)
            if i < total:
                time.sleep(delay)

        logger.info(f"배치 분석 완료: {len(enriched)}건")
        return enriched

    # ── 응답 파싱 ────────────────────────────────────────────────
    @staticmethod
    def _parse_response(raw_text: str) -> dict:
        """
        Claude 응답 문자열을 JSON 으로 파싱.
        파싱 실패 시 DEFAULT_RESULT 반환 (프로그램 중단 없음).

        Claude 가 가끔 ```json ... ``` 코드블록을 붙이는 경우도 처리.
        """
        try:
            # 코드블록 제거
            cleaned = raw_text.replace("```json", "").replace("```", "").strip()
            data    = json.loads(cleaned)

            # 필수 필드 검증 + 기본값 보장
            summary   = str(data.get("summary",   DEFAULT_RESULT["ai_summary"]))
            sentiment = str(data.get("sentiment", "neutral")).lower()
            insight   = str(data.get("insight",   DEFAULT_RESULT["ai_insight"]))
            tickers   = data.get("tickers", [])

            # sentiment 값 검증 (3개 중 하나여야 함)
            if sentiment not in ("positive", "negative", "neutral"):
                logger.warning(f"비정상 sentiment 값: {sentiment!r} → neutral 로 대체")
                sentiment = "neutral"

            # tickers 타입 검증 (리스트여야 함)
            if not isinstance(tickers, list):
                tickers = []

            # 종목 코드 형식 검증 (6자리 숫자만 허용)
            tickers = [t for t in tickers if isinstance(t, str) and t.isdigit() and len(t) == 6]

            return {
                "ai_summary":   summary,
                "ai_sentiment": sentiment,
                "ai_insight":   insight,
                "ai_tickers":   tickers,
            }

        except json.JSONDecodeError as e:
            logger.error(f"JSON 파싱 실패: {e}\n원문: {raw_text[:200]}")
            return DEFAULT_RESULT.copy()

        except Exception as e:
            logger.error(f"응답 처리 중 예외: {e}")
            return DEFAULT_RESULT.copy()


# ══════════════════════════════════════════════════════════════
# 3. 단독 실행 테스트 (python ai_analyzer.py)
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 60)
    print("AI 분석기 단독 테스트")
    print("=" * 60)

    analyzer = AIAnalyzer()

    if not analyzer.is_available:
        print("\n[오류] ANTHROPIC_API_KEY 미설정")
        print("→ .env 파일에 ANTHROPIC_API_KEY=sk-ant-... 를 추가해 주세요.")
    else:
        # 테스트용 가짜 뉴스 1건
        test_news = {
            "id":           "test001",
            "title":        "삼성전자, HBM4 양산 성공…엔비디아 납품 협상 급물살",
            "source":       "매일경제",
            "url":          "https://example.com",
            "description":  (
                "삼성전자가 4세대 고대역폭 메모리(HBM4) 양산 테스트를 통과하며 "
                "엔비디아의 AI 서버용 GPU에 탑재될 가능성이 높아졌다. "
                "업계는 3분기 내 공급 계약 체결을 예상한다."
            ),
            "published_at": "2024-08-20T09:30:00+09:00",
            "sector":       "반도체",
            "collected_at": "2024-08-20T10:00:00+09:00",
        }

        print(f"\n분석 대상: {test_news['title']}\n")
        result = analyzer.analyze(test_news)

        print("── 분석 결과 ─────────────────────────────")
        print(f"[요약]     {result['ai_summary']}")
        print(f"[감성]     {result['ai_sentiment']}")
        print(f"[인사이트]\n{result['ai_insight']}")
        print(f"[종목]     {result['ai_tickers']}")

        # JSON 파일로 저장 (확인용)
        enriched = {**test_news, **result}
        with open("ai_sample.json", "w", encoding="utf-8") as f:
            json.dump(enriched, f, ensure_ascii=False, indent=2)
        print("\n[저장] ai_sample.json 에 결과 저장 완료")
