// src/app/api/cron/prewarm/route.ts
// Dipanggil oleh GitHub Actions, SEKALI PER KOTA (bukan loop 5 kota dalam 1 request).
// Alasan: edge/cloud function punya batas waktu eksekusi ketat — versi lama yang
// memproses 5 kota + retry+backoff sampai belasan detik per percobaan dalam SATU
// request menyebabkan platform mematikan function-nya (503 CLOUD_FUNCTION_SERVICE_UNAVAILABLE).
// Sekarang: retry & orkestrasi 5 kota dipindah ke GitHub Actions (runner-nya jauh
// lebih longgar batas waktunya), endpoint ini cuma proses 1 kota lalu langsung selesai.
//
// PENTING: endpoint ini HARUS dipanggil SETELAH /api/cron/prewarm-global sukses
// (lihat prewarm.yml) — forecast USD/Gold dibaca dari cache global yang sudah
// disiapkan step itu, generateForecastForCity TIDAK generate ulang forecast global.
//
// Dipanggil: GET /api/cron/prewarm?key=...&city=Jakarta&index=1&total=5

import { getTodayKeyWIB } from '../../../lib/dailyData';
import { generateForecastForCity } from '../../../lib/aiForecast';
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

  const city = searchParams.get('city') || '';
  const index = parseInt(searchParams.get('index') || '1', 10);
  const total = parseInt(searchParams.get('total') || '1', 10);

  if (!city) {
    return new Response(JSON.stringify({ error: 'Parameter city wajib diisi' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  await setSystemStatus({
    maintenance: true,
    progress: Math.round(((index - 1) / total) * 100),
    message: 'Memproses ' + city + ' (' + index + '/' + total + ')'
  });

  try {
    const result = await generateForecastForCity(city, true);
    const isLast = index >= total;

    await setSystemStatus({
      maintenance: !isLast,
      progress: Math.round((index / total) * 100),
      message: (result.ok ? city + ' selesai' : city + ' gagal: ' + result.summary) + ' (' + index + '/' + total + ')'
    });

    return new Response(JSON.stringify({ date: getTodayKeyWIB(), city, ok: result.ok, summary: result.summary }), {
      status: result.ok ? 200 : 502,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    const isLast = index >= total;
    await setSystemStatus({
      maintenance: !isLast,
      progress: Math.round((index / total) * 100),
      message: city + ' error: ' + (error?.message || 'unknown') + ' (' + index + '/' + total + ')'
    });
    return new Response(JSON.stringify({ error: error?.message || 'Unknown error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
