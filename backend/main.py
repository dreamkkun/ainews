"""
main.py — FastAPI 백엔드 서버
=====================================
역할:
  Next.js 프론트엔드에서 호출하는 REST API 서버.
  뉴스 수집 / AI 분석 / DB 조회 결과를 JSON으로 반환.

[엔드포인트]
  GET  /api/health           — 서버 상태 확인
  GET  /api/stats            — KPI 통계
  GET  /api/report/latest    — 최신 AI 종합 리포트
  GET  /api/report/history   — 리포트 생성 이력
  GET  /api/news             — 뉴스 목록 (필터 지원)
  GET  /api/sectors          — 섹터별 뉴스 분포
  POST /api/pipeline/run     — 뉴스 수집 + AI 분석 실행
"""

import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import FastAPI, BackgroundTasks, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# 환경변수 로드
load_dotenv(override=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("main")

KST = timezone(timedelta(hours=9))

# ── FastAPI 앱 초기화 ─────────────────────────────────────────
app = FastAPI(
    title="AI 경제뉴스 인사이트 API",
    description="경제뉴스 수집 · AI 분석 · 투자 인사이트 제공",
    version="1.0.0",
)

# ── CORS 설정 — Vercel 프론트엔드 허용 ────────────────────────
ALLOWED_ORIGINS = [
    "http://localhost:3000",           # 로컬 개발
    "https://*.vercel.app",            # Vercel 배포
    os.getenv("FRONTEND_URL", ""),     # 환경변수로 추가 도메인 지정
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],               # 배포 시 ALLOWED_ORIGINS 로 교체
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── DB 인스턴스 (앱 시작 시 1회 초기화) ──────────────────────
from database import NewsDatabase, run_pipeline as _run_pipeline
db = NewsDatabase()

# 파이프라인 실행 상태 (중복 실행 방지)
pipeline_status = {
    "is_running": False,
    "last_run":   None,
    "last_result": None,
}


# ══════════════════════════════════════════════════════════════
# 1. 헬스체크
# ══════════════════════════════════════════════════════════════

@app.get("/api/health")
def health_check():
    """서버 상태 및 API 키 설정 여부 확인"""
    return {
        "status":    "ok",
        "timestamp": datetime.now(KST).isoformat(),
        "anthropic_key_set": bool(os.getenv("ANTHROPIC_API_KEY")),
        "naver_key_set":     bool(os.getenv("NAVER_CLIENT_ID")),
    }


# ══════════════════════════════════════════════════════════════
# 2. 통계 / KPI
# ══════════════════════════════════════════════════════════════

@app.get("/api/stats")
def get_stats():
    """대시보드 KPI 카드용 통계 반환"""
    try:
        stats   = db.get_news_stats()
        history = db.get_report_history(limit=1)
        latest  = db.get_latest_report()

        return {
            "total_news":    int(stats.get("total",   0) or 0),
            "sectors":       int(stats.get("sectors", 0) or 0),
            "last_update":   stats.get("last_update", ""),
            "report_count":  len(db.get_report_history(limit=999)),
            "last_sentiment": latest.get("sentiment", "neutral") if latest else "neutral",
            "pipeline_running": pipeline_status["is_running"],
        }
    except Exception as e:
        logger.error(f"통계 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════
# 3. 리포트
# ══════════════════════════════════════════════════════════════

@app.get("/api/report/latest")
def get_latest_report():
    """최신 AI 종합 리포트 반환"""
    try:
        report = db.get_latest_report()
        if not report:
            return {"report": None, "message": "생성된 리포트 없음"}
        return {"report": report}
    except Exception as e:
        logger.error(f"리포트 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/report/history")
def get_report_history(limit: int = Query(10, ge=1, le=50)):
    """리포트 생성 이력 반환"""
    try:
        history = db.get_report_history(limit=limit)
        return {"history": history}
    except Exception as e:
        logger.error(f"리포트 이력 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════
# 4. 뉴스
# ══════════════════════════════════════════════════════════════

@app.get("/api/news")
def get_news(
    limit:    int            = Query(50, ge=1, le=200),
    sector:   Optional[str]  = Query(None),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    keyword:   Optional[str] = Query(None),
):
    """
    뉴스 목록 반환.
    필터: sector, date_from, date_to, keyword
    """
    try:
        news = db.get_news(
            limit          = limit,
            sector         = sector,
            date_from      = date_from,
            date_to        = date_to,
            search_keyword = keyword,
        )
        return {
            "news":  news,
            "total": len(news),
        }
    except Exception as e:
        logger.error(f"뉴스 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sectors")
def get_sectors():
    """섹터별 뉴스 분포 반환 (차트용)"""
    try:
        dist = db.get_sector_distribution()
        return {"sectors": dist}
    except Exception as e:
        logger.error(f"섹터 분포 조회 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════
# 5. 파이프라인 실행
# ══════════════════════════════════════════════════════════════

def _run_pipeline_task():
    """백그라운드에서 파이프라인 실행"""
    pipeline_status["is_running"] = True
    try:
        result = _run_pipeline(
            naver_items_per_query=10,
            use_rss_fallback=True,
        )
        pipeline_status["last_result"] = result
        pipeline_status["last_run"]    = datetime.now(KST).isoformat()
        logger.info(f"파이프라인 완료: {result}")
    except Exception as e:
        logger.error(f"파이프라인 오류: {e}")
        pipeline_status["last_result"] = {"error": str(e)}
    finally:
        pipeline_status["is_running"] = False


@app.post("/api/pipeline/run")
def run_pipeline(background_tasks: BackgroundTasks):
    """
    뉴스 수집 + AI 분석 파이프라인 실행.
    백그라운드로 실행되며 즉시 응답 반환.
    실행 상태는 GET /api/stats 의 pipeline_running 으로 확인.
    """
    if pipeline_status["is_running"]:
        return {
            "status":  "already_running",
            "message": "파이프라인이 이미 실행 중입니다.",
        }

    background_tasks.add_task(_run_pipeline_task)
    return {
        "status":  "started",
        "message": "파이프라인 시작됨. /api/stats 에서 진행 상태를 확인하세요.",
    }


@app.get("/api/pipeline/status")
def get_pipeline_status():
    """파이프라인 실행 상태 확인"""
    return {
        "is_running":  pipeline_status["is_running"],
        "last_run":    pipeline_status["last_run"],
        "last_result": pipeline_status["last_result"],
    }


# ══════════════════════════════════════════════════════════════
# 6. 로컬 실행
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
