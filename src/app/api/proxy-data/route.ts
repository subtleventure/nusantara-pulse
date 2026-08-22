// src/app/api/proxy-data/route.ts
// Ambil data cuaca/kurs/emas via helper dailyData (cache Supabase, wajib terkonfigurasi)

import { getDailyRawData } from '../../lib/dailyData';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const location = searchParams.get('location') || 'Jakarta';

  try {
    const data = await getDailyRawData(location);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('proxy-data error:', error?.message || error);
    return new Response(
      JSON.stringify({ weather: null, fx: null, gold: null, errors: [error?.message || 'Unknown error'] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
