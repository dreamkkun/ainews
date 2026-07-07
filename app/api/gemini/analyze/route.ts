import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 네이버 진정 주식 코드 검색
async function searchNaverStock(query: string): Promise<{ code: string; name: string; market: string } | null> {
  try {
    const res = await fetch(
      `https://ac.finance.naver.com/api/search?q=${encodeURIComponent(query)}&target=stock`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const items = data?.items?.[0];
    if (!items?.length) return null;
    const [code, name, , market] = items[0];
    return { code, name, market };
  } catch { return null; }
}

// 네이버 주식 실시간 정보 조회
async function fetchNaverStockBasic(code: string) {
  try {
    const res = await fetch(
      `https://m.stock.naver.com/api/stock/${code}/basic`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// 네이버 재무 요약 (PER, PBR 등)
async function fetchNaverFinanceSummary(code: string) {
  try {
    const res = await fetch(
      `https://m.stock.naver.com/api/stock/${code}/finance/summary`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function formatMarketCap(value: string | number): string {
  const n = Number(value);
  if (isNaN(n)) return "N/A";
  if (n >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(1)}조원`;
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(0)}억원`;
  return `${n.toLocaleString()}원`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const companyName: string = body.companyName || "";
    if (!companyName.trim()) {
      return NextResponse.json({ error: "회사명을 입력해주세요." }, { status: 400 });
    }

    // 1단계: 네이버에서 주식 코드 & 실시간 데이터 수집
    const stockInfo = await searchNaverStock(companyName);
    let naverData: {
      currentPrice: string;
      marketCap: string;
      per: string;
      pbr: string;
      high52: string;
      low52: string;
      stockCode: string;
      stockName: string;
    } | null = null;

    if (stockInfo) {
      const [basic, finance] = await Promise.all([
        fetchNaverStockBasic(stockInfo.code),
        fetchNaverFinanceSummary(stockInfo.code),
      ]);

      if (basic) {
        const price = Number(basic.closePrice || basic.currentPrice || 0);
        const marketValue = basic.marketValue || basic.marketCap || "0";
        const per  = finance?.per  ?? finance?.PER  ?? basic.per  ?? "N/A";
        const pbr  = finance?.pbr  ?? finance?.PBR  ?? basic.pbr  ?? "N/A";
        const high = basic.yearHigh ?? basic.high52  ?? "N/A";
        const low  = basic.yearLow  ?? basic.low52   ?? "N/A";

        naverData = {
          currentPrice: price ? `${price.toLocaleString()}원` : "N/A",
          marketCap:    formatMarketCap(marketValue),
          per:          per !== "N/A" ? `${Number(per).toFixed(1)}x` : "N/A",
          pbr:          pbr !== "N/A" ? `${Number(pbr).toFixed(2)}x` : "N/A",
          high52:       high !== "N/A" ? `${Number(high).toLocaleString()}원` : "N/A",
          low52:        low  !== "N/A" ? `${Number(low).toLocaleString()}원`  : "N/A",
          stockCode:    stockInfo.code,
          stockName:    stockInfo.name,
        };
      }
    }

    // 2단계: Claude에게 수치 + 분석 텍스트 요청
    const naverContext = naverData
      ? `
[네이버 증권 실시간 데이터]
- 종목코드: ${naverData.stockCode}
- 현재가: ${naverData.currentPrice}
- 시가총액: ${naverData.marketCap}
- PER: ${naverData.per} / PBR: ${naverData.pbr}
- 52주 최고: ${naverData.high52} / 최저: ${naverData.low52}

위 수치는 실제 데이터입니다. 이 수치를 currentPrice, marketCap, valuationComparison의 targetCompany PER/PBR에 반드시 반영하세요.`
      : `
[네이버 데이터 조회 실패 - 해외주 또는 연동 불가]
알려진 정보를 기반으로 최선을 다해 작성하되, 불확실한 수치는 "N/A"로 표기하세요.`;

    const prompt = `당신은 10년 경력의 주식 애널리스트입니다.
"${companyName}" 기업에 대해 아래 JSON 형식으로 분석 리포트를 작성하세요.

${naverContext}

반드시 아래 JSON 구조만 출력하세요 (다른 텍스트 없이):
{
  "companyName": "정식 기업명",
  "ticker": "티커 심볼",
  "bm": "비즈니스 모델 요약 (2-3문장)",
  "marketCap": "시가총액",
  "currentPrice": "현재가",
  "industryAnalysis": {
    "sectorName": "섹터명",
    "trends": "산업 트렌드 (2-3문장)",
    "position": "시장 포지션 (2-3문장)"
  },
  "recentIssues": {
    "bullish": ["강세 요인 1", "강세 요인 2", "강세 요인 3"],
    "bearish": ["약세 요인 1", "약세 요인 2", "약세 요인 3"]
  },
  "valuationComparison": {
    "targetCompany": { "name": "기업명", "per": 15.2, "pbr": 1.8 },
    "competitors": [
      { "name": "경쟁사1", "per": 18.5, "pbr": 2.1 },
      { "name": "경쟁사2", "per": 12.3, "pbr": 1.5 }
    ],
    "industryAverage": { "per": 16.0, "pbr": 1.9 },
    "evaluation": "밸류에이션 평가 코멘트 (2문장)"
  }
}`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON 파싱 실패");
    const analysis = JSON.parse(jsonMatch[0]);

    // 네이버 데이터가 있으면 주가/시충 실제값으로 덮어쓰기
    if (naverData) {
      analysis.currentPrice = naverData.currentPrice;
      analysis.marketCap    = naverData.marketCap;
      if (naverData.per !== "N/A") analysis.valuationComparison.targetCompany.per = parseFloat(naverData.per);
      if (naverData.pbr !== "N/A") analysis.valuationComparison.targetCompany.pbr = parseFloat(naverData.pbr);
    }

    return NextResponse.json({
      analysis,
      sources: naverData ? [{
        title: `${naverData.stockName} - 네이버 증권 실시간`,
        url: `https://finance.naver.com/item/main.nhn?code=${naverData.stockCode}`,
      }] : [],
      naverData,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Analyze Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
