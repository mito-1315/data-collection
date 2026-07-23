import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'REC Student Location Form',
  description: 'Rajalakshmi Engineering College — Student boarding location data collection.',
  icons: {
    icon: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
