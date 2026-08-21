// src/app/api/proxy-data/route.ts
// Ambil data cuaca/kurs/emas via helper dailyData (sudah di-cache per kota per hari)

import { getDailyRawData } from '../../lib/dailyData';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const location = searchParams.get('location') || 'Jakarta';

  const data = await getDailyRawData(location);

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
