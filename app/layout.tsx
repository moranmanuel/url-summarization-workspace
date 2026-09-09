import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'URL Summarization Workspace',
  icons: { icon: '/profound.svg' },
  description:
    'Summarize a webpage, save what matters, and ask follow-up questions.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
