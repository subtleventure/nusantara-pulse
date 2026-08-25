// src/app/api/cron/prewarm-global/route.ts
// Dipanggil oleh GitHub Actions SEBAGAI STEP PERTAMA, SEBELUM loop 5 kota.
// Generate forecast USD/IDR + Gold SATU KALI (bukan per kota) dan simpan di
// tabel `global_forecast`. Endpoint /api/cron/prewarm (per kota) sesudah ini
// akan MEMBACA hasilnya, bukan generate ulang — itulah yang membuat forecast
// USD/Gold konsisten sama untuk semua kota.
//
// Dipanggil: GET /api/cron/prewarm-global?key=...

import { getTodayKeyWIB } from '../../../lib/dailyData';
import { generateGlobalForecast } from '../../../lib/globalForecast';
import { setSystemStatus } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = request.headers.get('x-cron-secret') || searchParams.get('key') || '';
  const CRON_SECRET = process.env.CRON_SECRET || '';

  if (!CRON_SECRET || key !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  await setSystemStatus({
    maintenance: true,
    progress: 0,
    message: 'Memproses forecast global (USD/Gold)'
  });

  try {
    const result = await generateGlobalForecast(true);

    await setSystemStatus({
      maintenance: true,
      progress: 0,
      message: (result.ok ? 'Forecast global selesai' : 'Forecast global gagal: ' + result.summary) + ', lanjut per kota...'
    });

    return new Response(JSON.stringify({ date: getTodayKeyWIB(), ok: result.ok, summary: result.summary }), {
      status: result.ok ? 200 : 502,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    await setSystemStatus({
      maintenance: true,
      progress: 0,
      message: 'Forecast global error: ' + (error?.message || 'unknown')
    });
    return new Response(JSON.stringify({ error: error?.message || 'Unknown error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
