import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const marketType: string = body.marketType || "ALL";
    const selectedTheme: string | undefined = body.selectedTheme;

    const marketLabel =
      marketType === "US" ? "미국 주식시장 (S&P 500, NASDAQ)" :
      marketType === "KOREA" ? "한국 주식시장 (KOSPI, KOSDAQ)" :
      "한국 및 미국 주식시장 전체";

    const themeStr = selectedTheme ? `테마: ${selectedTheme}` : "전체 섹터";

    const prompt = `당신은 10년 경력의 퀀트 투자 전문가입니다.
현재 시장 상황(2026년 기준)을 바탕으로 ${marketLabel}에서 ${themeStr} 중 투자 유망 종목 Top 3를 추천하세요.

반드시 아래 JSON 구조만 출력하세요 (다른 텍스트 없이):
{
  "marketContext": "현재 시장 상황 요약 (3-4문장)",
  "recommendations": [
    {
      "companyName": "기업명",
      "ticker": "티커",
      "sector": "섹터",
      "currentPrice": "현재가 (예: 75,000원)",
      "quantScore": 85,
      "momentumScore": 78,
      "growthScore": 82,
      "recommendationReason": "추천 이유 (2-3문장)",
      "detailedAnalysis": "상세 분석 (4-5문장, 리스크 포함)"
    }
  ]
}

퀀트/모멘텀/성장성 점수는 1-100 사이 정수로 표기하세요.`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON 파싱 실패");
    const data = JSON.parse(jsonMatch[0]);

    return NextResponse.json({ data, sources: [], isFallback: false });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Recommend Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
