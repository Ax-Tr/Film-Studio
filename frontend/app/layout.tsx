import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppProviders } from './providers';
import { SkipLink } from './components/SkipLink';
import { Header } from './components/Header';
import { OfflineBanner } from './components/OfflineBanner';
import { PwaRegister } from './components/PwaRegister';
import './styles.css';

export const metadata: Metadata = {
  title: 'Film Studio — Screenwriting & Film Production',
  description: 'Professional multi-lingual film development and production workspace.',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <html lang="te">
      <body>
        <AppProviders>
          <PwaRegister />
          <SkipLink />
          <OfflineBanner />
          <Header />
          <main id="main-content" role="main" className="app-main">
            {children}
          </main>
        </AppProviders>
      </body>
    </html>
  );
}
