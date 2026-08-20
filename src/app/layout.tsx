import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NusantaraPulse - Economic Intelligence for UMKM',
  description: 'AI-powered economic forecasting for Indonesian UMKM',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}
