import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const companyName: string = body.companyName || "";
    if (!companyName.trim()) {
      return NextResponse.json({ error: "회사명을 입력해주세요." }, { status: 400 });
    }

    const prompt = `당신은 10년 경력의 주식 애널리스트입니다.
"${companyName}" 기업에 대해 아래 JSON 형식으로 분석 리포트를 작성하세요.
실제 공개된 정보를 바탕으로 최대한 정확하게 작성하되, 불확실한 수치는 "N/A"로 표기하세요.

반드시 아래 JSON 구조만 출력하세요 (다른 텍스트 없이):
{
  "companyName": "정식 기업명",
  "ticker": "티커 심볼",
  "bm": "비즈니스 모델 요약 (2-3문장)",
  "marketCap": "시가총액 (예: 약 400조원)",
  "currentPrice": "현재 주가 (예: 75,000원)",
  "industryAnalysis": {
    "sectorName": "섹터명",
    "trends": "산업 트렌드 (2-3문장)",
    "position": "시장 내 포지션 (2-3문장)"
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

    return NextResponse.json({ analysis, sources: [] });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Analyze Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
