// src/app/api/cron/prewarm/route.ts
// Dipanggil oleh cron EKSTERNAL (cron-job.org / GitHub Actions) setiap hari jam 06:00 WIB.
// TIDAK dipanggil otomatis oleh EdgeOne — perlu dijadwalkan dari luar (lihat catatan di chat).
//
// Alur: set maintenance=true -> loop 5 kota, retry sampai 5x per kota kalau gagal
// (backoff 1s/2s/4s/8s/16s) -> update progress tiap kota selesai -> maintenance=false.
//
// Dilindungi CRON_SECRET supaya endpoint ini tidak bisa dipanggil sembarang orang.

import { getTodayKeyWIB } from '../../../lib/dailyData';
import { generateForecastForCity } from '../../../lib/aiForecast';
import { setSystemStatus } from '../../../lib/supabase';
import { sleep } from '../../../lib/timeout';

export const dynamic = 'force-dynamic';

const CITIES = ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Makassar'];
const MAX_ATTEMPTS = 5;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000];

async function prewarmCityWithRetry(city: string): Promise<{ city: string; ok: boolean; attempts: number; error?: string }> {
  let lastError = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await generateForecastForCity(city, true);
      if (result.ok) {
        return { city, ok: true, attempts: attempt };
      }
      lastError = result.summary;
    } catch (e: any) {
      lastError = e?.message || String(e);
    }
    if (attempt < MAX_ATTEMPTS) {
      await sleep(BACKOFF_MS[attempt - 1]);
    }
  }
  return { city, ok: false, attempts: MAX_ATTEMPTS, error: lastError };
}

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

  await setSystemStatus({ maintenance: true, progress: 0, message: 'Memulai pre-warm cache ' + getTodayKeyWIB() });

  const results: { city: string; ok: boolean; attempts: number; error?: string }[] = [];

  for (let i = 0; i < CITIES.length; i++) {
    const city = CITIES[i];
    await setSystemStatus({
      maintenance: true,
      progress: Math.round((i / CITIES.length) * 100),
      message: 'Memproses ' + city + ' (' + (i + 1) + '/' + CITIES.length + ')'
    });

    const result = await prewarmCityWithRetry(city);
    results.push(result);

    await setSystemStatus({
      maintenance: true,
      progress: Math.round(((i + 1) / CITIES.length) * 100),
      message: (result.ok ? city + ' selesai' : city + ' GAGAL setelah ' + MAX_ATTEMPTS + 'x percobaan') +
        ' (' + (i + 1) + '/' + CITIES.length + ')'
    });
  }

  const failedCities = results.filter((r) => !r.ok).map((r) => r.city);
  const finalMessage = failedCities.length > 0
    ? 'Selesai dengan sebagian gagal: ' + failedCities.join(', ') + ' (akan dicoba lagi besok)'
    : 'Semua kota berhasil di-cache';

  await setSystemStatus({ maintenance: false, progress: 100, message: finalMessage });

  return new Response(JSON.stringify({ date: getTodayKeyWIB(), results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
