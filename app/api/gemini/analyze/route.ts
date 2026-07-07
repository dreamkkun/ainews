import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 콤마 제거 후 숫자 변환
function parsePrice(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v.replace(/,/g, ""));
  return NaN;
}

async function searchNaverStock(query: string): Promise<{ code: string; name: string } | null> {
  try {
    const res = await fetch(
      `https://ac.finance.naver.com/api/search?q=${encodeURIComponent(query)}&target=stock`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const items = data?.items?.[0];
    if (!items?.length) return null;
    const [code, name] = items[0];
    return { code, name };
  } catch { return null; }
}

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

// 시가총액 & PER/PBR
async function fetchNaverIntegration(code: string) {
  try {
    const res = await fetch(
      `https://m.stock.naver.com/api/stock/${code}/integration`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function formatMarketCap(won: number): string {
  if (isNaN(won) || won === 0) return "N/A";
  if (won >= 1_000_000_000_000) return `${(won / 1_000_000_000_000).toFixed(1)}조원`;
  if (won >= 100_000_000)       return `${Math.round(won / 100_000_000).toLocaleString()}억원`;
  return `${won.toLocaleString()}원`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const companyName: string = (body.companyName || "").trim();
    if (!companyName) {
      return NextResponse.json({ error: "회사명을 입력해주세요." }, { status: 400 });
    }

    // 1단계: 네이버 데이터 수집
    const stockInfo = await searchNaverStock(companyName);
    let naverData: {
      currentPrice: string; marketCap: string;
      per: string; pbr: string;
      stockCode: string; stockName: string;
    } | null = null;

    if (stockInfo) {
      const [basic, integration] = await Promise.all([
        fetchNaverStockBasic(stockInfo.code),
        fetchNaverIntegration(stockInfo.code),
      ]);

      if (basic) {
        // closePrice 예: "89,800" → 89800
        const price = parsePrice(basic.closePrice);

        // 시가총액: integration 또는 basic에서
        const marketValueRaw =
          integration?.marketValue ??
          integration?.totalMarketValue ??
          basic.marketValue ?? 0;
        const marketCap = parsePrice(marketValueRaw);

        // PER / PBR
        const perRaw = integration?.per ?? integration?.PER ?? basic.per ?? null;
        const pbrRaw = integration?.pbr ?? integration?.PBR ?? basic.pbr ?? null;
        const per = perRaw !== null ? parsePrice(perRaw) : NaN;
        const pbr = pbrRaw !== null ? parsePrice(pbrRaw) : NaN;

        naverData = {
          currentPrice: !isNaN(price)  ? `${price.toLocaleString()}원`  : "N/A",
          marketCap:    formatMarketCap(marketCap),
          per:          !isNaN(per)    ? `${per.toFixed(1)}x`            : "N/A",
          pbr:          !isNaN(pbr)    ? `${pbr.toFixed(2)}x`            : "N/A",
          stockCode:    stockInfo.code,
          stockName:    stockInfo.name,
        };
      }
    }

    // 2단계: Claude 분석
    const naverContext = naverData
      ? `[네이버 증권 실시간 데이터]\n- 종목코드: ${naverData.stockCode}\n- 현재가: ${naverData.currentPrice}\n- 시가완액: ${naverData.marketCap}\n- PER: ${naverData.per} / PBR: ${naverData.pbr}\n\n위 수치를 currentPrice, marketCap에 반드시 반영하세요.`
      : `[네이버 조회 실패 - 해외주 또는 연동 불가]\n알려진 정보 기반으로 최선을 다해 작성하되, 불확실한 수치는 "N/A"로 표기하세요.`;

    const prompt = `당신은 10년 경력의 주식 애널리스트입니다.\n"${companyName}" 기업에 대해 아래 JSON 형식으로 분석 리포트를 작성하세요.\n\n${naverContext}\n\n반드시 아래 JSON 구조만 출력하세요:\n{\n  "companyName": "정식 기업명",\n  "ticker": "티커 심볼",\n  "bm": "비즈니스 모델 요약 (2-3문장)",\n  "marketCap": "시가완액",\n  "currentPrice": "현재가",\n  "industryAnalysis": {\n    "sectorName": "섹터명",\n    "trends": "산업 트렌드 (2-3문장)",\n    "position": "시장 포지션 (2-3문장)"\n  },\n  "recentIssues": {\n    "bullish": ["강세 요인 1", "강세 요인 2", "강세 요인 3"],\n    "bearish": ["약세 요인 1", "약세 요인 2", "약세 요인 3"]\n  },\n  "valuationComparison": {\n    "targetCompany": { "name": "기업명", "per": 15.2, "pbr": 1.8 },\n    "competitors": [\n      { "name": "경쟁사1", "per": 18.5, "pbr": 2.1 },\n      { "name": "경쟁사2", "per": 12.3, "pbr": 1.5 }\n    ],\n    "industryAverage": { "per": 16.0, "pbr": 1.9 },\n    "evaluation": "밸류에이션 평가 코멘트 (2문장)"\n  }\n}`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON 파싱 실패");
    const analysis = JSON.parse(jsonMatch[0]);

    // 네이버 수치로 덮어쓰기
    if (naverData) {
      analysis.currentPrice = naverData.currentPrice;
      analysis.marketCap    = naverData.marketCap;
      if (naverData.per !== "N/A") {
        analysis.valuationComparison.targetCompany.per = parseFloat(naverData.per);
      }
      if (naverData.pbr !== "N/A") {
        analysis.valuationComparison.targetCompany.pbr = parseFloat(naverData.pbr);
      }
    }

    return NextResponse.json({
      analysis,
      sources: naverData ? [{
        title: `${naverData.stockName} - 네이버 증권`,
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
