import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 30;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const ticker: string = body.ticker || "";
    if (!ticker.trim()) {
      return NextResponse.json({ error: "티커를 입력해주세요." }, { status: 400 });
    }

    const prompt = `티커 "${ticker}" 종목의 최근 주가 정보를 알려주세요.
실제 공개 정보 기준으로 답하되, 정확한 실시간 데이터가 없으면 알려진 최근 범위를 추정해 주세요.

반드시 아래 JSON만 출력하세요 (다른 텍스트 없이):
{
  "currentPrice": 75000,
  "highestPrice": 88000,
  "currency": "KRW",
  "note": "추정 기준 설명 (한 문장)"
}

currentPrice와 highestPrice는 숫자(쉼표 없음)로만 입력하세요.`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON 파싱 실패");
    const result = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      currentPrice: Number(result.currentPrice),
      highestPrice: Number(result.highestPrice),
      currency: result.currency ?? "KRW",
      note: result.note ?? "",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("FetchPrice Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
