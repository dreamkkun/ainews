import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI 투자 인사이트 터미널',
  description: '실시간 경제 뉴스 · AI 분석 · 투자 인사이트',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
