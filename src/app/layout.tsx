import type { Metadata } from 'next';
import './globals.css';
import SWRProvider from '@/components/SWRProvider';

export const metadata: Metadata = {
  title: 'Soccer Predictor',
  description: 'Pick a match and get a data-driven outcome prediction — home win, draw, or away win — with a written thesis.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-[#0a0f0c] text-white">
        <SWRProvider>{children}</SWRProvider>
      </body>
    </html>
  );
}
