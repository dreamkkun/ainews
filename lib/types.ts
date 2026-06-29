/**
 * lib/types.ts — 공통 타입 정의
 */

export interface CompanyAnalysis {
  companyName: string;
  ticker: string;
  bm: string;
  marketCap: string;
  currentPrice: string;
  industryAnalysis: {
    sectorName: string;
    trends: string;
    position: string;
  };
  recentIssues: {
    bullish: string[];
    bearish: string[];
  };
  valuationComparison: {
    targetCompany: { name: string; per: number; pbr: number };
    competitors: { name: string; per: number; pbr: number }[];
    industryAverage: { per: number; pbr: number };
    evaluation: string;
  };
}

export interface GroundingSource {
  title: string;
  url: string;
}

export interface Recommendation {
  companyName: string;
  ticker: string;
  sector: string;
  currentPrice: string;
  quantScore: number;
  momentumScore: number;
  growthScore: number;
  recommendationReason: string;
  detailedAnalysis: string;
}

export interface MarketRecommendations {
  marketContext: string;
  recommendations: Recommendation[];
}

export interface TrackedStock {
  id: string;
  companyName: string;
  ticker?: string;
  purchasePrice: number;
  highestPrice: number;
  currentPrice: number;
  status: "Hold" | "Take-Profit" | "Cut-Loss";
  dropFromPeak: number;
  lossFromPurchase: number;
  bufferToStopLoss: number;
  updatedAt: string;
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  description: string;
  publishedAt: string;
  sector: string;
  collectedAt: string;
}

export interface SectorInsight {
  sector: string;
  summary: string;
  sentiment: "positive" | "negative" | "neutral";
}

export interface MarketReport {
  generatedAt: string;
  newsCount: number;
  sentiment: "positive" | "negative" | "neutral";
  marketSummary: string;
  sectorInsights: SectorInsight[];
  topInsights: string;
  topTickers: string[];
  riskFactors: string;
}
