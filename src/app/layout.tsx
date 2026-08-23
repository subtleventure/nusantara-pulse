import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NusantaraPulse - Economic Intelligence for UMKM',
  description: 'AI-powered economic forecasting for Indonesian UMKM',
  manifest: '/manifest.json',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id">
      <head>
        <meta name="theme-color" content="#0066FF" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body>{children}</body>
    </html>
  )
}
