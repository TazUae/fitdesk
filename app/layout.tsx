import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  // Include common weights used in the UI
  weight: ['300', '400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: {
    default: 'FitDesk',
    template: '%s · FitDesk',
  },
  description: 'PT business operating system — clients, sessions, invoices, payments.',
  robots: { index: false, follow: false }, // private SaaS app
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={dmSans.variable} suppressHydrationWarning>
      <head>
        {/*
          viewport-fit=cover: allow content behind iPhone notch
          maximum-scale=1: prevent iOS double-tap zoom on form inputs
        */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        {/* Status bar matches app background on iOS PWA */}
        <meta name="theme-color" content="#0F1117" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>
        {children}
        <Toaster
          richColors
          theme="dark"
          position="top-center"
          closeButton
          toastOptions={{
            style: {
              background: 'var(--fd-surface)',
              border: '1px solid var(--fd-border)',
              color: 'var(--fd-text)',
              fontFamily: 'var(--font-sans)',
            },
          }}
        />
      </body>
    </html>
  )
}
