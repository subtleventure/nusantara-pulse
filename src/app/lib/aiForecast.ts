// src/app/lib/aiForecast.ts
// Logic generate forecast AI per kota — dipakai oleh route POST /api/ai-recommendations
// DAN oleh cron pre-warm. Dipisah dari route.ts karena Next.js tidak izinkan export
// custom di file route (hanya GET/POST/dst).
//
// PERUBAHAN PENTING: forecast USD/IDR dan Gold TIDAK lagi digenerate di sini.
// Angka itu global (sama untuk semua kota) dan sekarang digenerate 1x/hari oleh
// globalForecast.ts. File ini hanya generate "risk" per hari (dipengaruhi cuaca +
// kondisi ekonomi lokal) dan "summary" strategis untuk UMKM di kota tsb — lalu
// menggabungkannya dengan usd/gold dari global_forecast supaya bentuk output ke
// frontend (DayForecast{usd,gold,risk}) tetap sama seperti sebelumnya.

import { getDailyRawData, getCacheKey, getTodayKeyWIB } from './dailyData';
import { getSupabaseClient } from './supabase';
import { withTimeout } from './timeout';
import { callAIWithFallback, parseAIJson } from './aiClient';
import { generateGlobalForecast, GlobalDayForecast } from './globalForecast';

export interface DayForecast {
  usd: number | null;
  gold: number | null;
  risk: 'low' | 'medium' | 'high';
}

export interface AIResult {
  forecast: DayForecast[]; // 7 entri, index 0 = hari ini
  summary: string;
}

const SUPABASE_TIMEOUT_MS = 6000;
const CITY_MAX_TOKENS = 600; // diturunkan dari 800 — sekarang cuma minta risk[7] + summary, bukan usd/gold lagi

function safeNumber(val: any, digits: number = 0): string {
  if (typeof val !== 'number' || isNaN(val)) return 'N/A';
  if (digits > 0) return val.toFixed(digits);
  return Math.round(val).toLocaleString('id-ID');
}

interface CityAIResult {
  risk: ('low' | 'medium' | 'high')[]; // 7 entri
  summary: string;
}

function validateCityResult(parsed: any): CityAIResult | null {
  if (!parsed || !Array.isArray(parsed.risk) || typeof parsed.summary !== 'string') return null;
  if (parsed.risk.length === 0) return null;
  for (const r of parsed.risk) {
    if (r !== 'low' && r !== 'medium' && r !== 'high') return null;
  }
  return { risk: parsed.risk, summary: parsed.summary };
}

async function callCityAI(
  location: string,
  raw: Awaited<ReturnType<typeof getDailyRawData>>,
  globalForecast: GlobalDayForecast[]
): Promise<CityAIResult & { ok: boolean; failureSummary?: string }> {
  const fxRate: number | null = raw.fx?.rates?.IDR ?? null;
  const goldPrice: number | null = raw.gold?.price ?? null;

  const weatherSummary = raw.weather
    ? 'Data cuaca 7 hari tersedia (kode cuaca, suhu maks, curah hujan harian).'
    : 'Data cuaca tidak tersedia.';

  const globalSummary = globalForecast.length > 0
    ? globalForecast.map((d, i) => 'H' + i + ': USD=' + safeNumber(d.usd) + ' Gold=$' + safeNumber(d.gold, 2)).join(', ')
    : 'Forecast global tidak tersedia.';

  const systemPrompt = 'Anda analis ekonomi UMKM Indonesia. Balas HANYA JSON valid sesuai skema yang diminta, tanpa markdown, tanpa penjelasan.';
  const prompt =
    'Kota: ' + location + '. Data hari ini: USD/IDR=' + safeNumber(fxRate) + ', Emas=$' + safeNumber(goldPrice, 2) + '/oz. ' +
    weatherSummary + ' Forecast ekonomi nasional 7 hari ke depan (index 0=hari ini..6=hari ke-7): ' + globalSummary + '.' +
    ' Berdasarkan data di atas, buat array "risk" (7 entri, index 0=hari ini..6=hari ke-7) berisi tingkat risiko usaha UMKM' +
    ' di kota tsb tiap hari: "low"|"medium"|"high" (pertimbangkan cuaca ekstrem DAN volatilitas ekonomi).' +
    ' Tambahkan "summary": ringkasan rekomendasi strategis UMKM untuk kota ini, maksimal 350 karakter, bahasa Indonesia, tanpa emoji.' +
    ' Balas HANYA JSON valid satu baris, tanpa markdown, tanpa teks lain: {"risk":[...],"summary":"..."}';

  const geminiSchema = {
    type: 'OBJECT',
    properties: {
      risk: { type: 'ARRAY', items: { type: 'STRING', enum: ['low', 'medium', 'high'] } },
      summary: { type: 'STRING' }
    },
    required: ['risk', 'summary']
  };

  const result = await callAIWithFallback<CityAIResult>(
    prompt,
    systemPrompt,
    geminiSchema,
    validateCityResult,
    CITY_MAX_TOKENS
  );

  if (result.ok && result.data) {
    return { ...result.data, ok: true };
  }
  return { risk: [], summary: '', ok: false, failureSummary: result.failureSummary };
}

// Gabungkan usd/gold global dengan risk per kota jadi bentuk DayForecast[] yang
// dipakai frontend — supaya page.tsx TIDAK perlu berubah sama sekali.
function mergeForecast(globalForecast: GlobalDayForecast[], risk: ('low' | 'medium' | 'high')[]): DayForecast[] {
  const len = Math.max(globalForecast.length, risk.length);
  const merged: DayForecast[] = [];
  for (let i = 0; i < len; i++) {
    merged.push({
      usd: globalForecast[i]?.usd ?? null,
      gold: globalForecast[i]?.gold ?? null,
      risk: risk[i] || 'medium'
    });
  }
  return merged;
}

// forceRefresh=true dipakai cron supaya tidak baca cache lama, selalu generate ulang.
export async function generateForecastForCity(location: string, forceRefresh: boolean = false): Promise<AIResult & { ok: boolean }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { forecast: [], summary: 'Supabase belum terkonfigurasi.', ok: false };
  }

  const cacheKey = getCacheKey(location);
  const raw = await getDailyRawData(location);

  if (raw.errors && raw.errors.length > 0) {
    return { forecast: [], summary: 'Data dasar gagal diambil: ' + raw.errors.join(', '), ok: false };
  }

  if (!forceRefresh) {
    const { data: existing } = await withTimeout(
      Promise.resolve(supabase.from('ai_cache').select('recommendations').eq('cache_key', cacheKey).maybeSingle()),
      SUPABASE_TIMEOUT_MS,
      'Supabase read recommendations'
    );
    if (existing && existing.recommendations) {
      const cached = parseAIJson(existing.recommendations);
      if (cached) return { ...cached, ok: true };
    }
  }

  // PENTING: forceRefresh DI SINI cuma untuk cache per-KOTA, TIDAK diteruskan ke
  // forecast global. Forecast global sengaja SELALU dibaca dari cache (forceRefresh=false)
  // di titik ini — proses generate-ulangnya sudah diorkestrasi TERPISAH dan LEBIH DULU
  // oleh cron step "prewarm-global" (lihat api/cron/prewarm-global/route.ts), SEBELUM
  // 5 kota diproses. Kalau forceRefresh kota ini ikut diteruskan ke global, maka tiap
  // kota akan generate ulang forecast global 5x lagi — persis bug yang sedang diperbaiki.
  // Fallback: kalau cache global ternyata kosong (mis. hari pertama sebelum cron pernah
  // jalan sama sekali), generateGlobalForecast(false) akan generate sekali di sini juga.
  const globalResult = await generateGlobalForecast(false);
  const cityResult = await callCityAI(location, raw, globalResult.forecast);

  const ok = cityResult.ok && globalResult.ok;
  const aiResult: AIResult = {
    forecast: mergeForecast(globalResult.forecast, cityResult.risk),
    summary: cityResult.ok
      ? cityResult.summary
      : (cityResult.failureSummary || 'AI tidak tersedia: gagal generate risk/summary untuk ' + location + '.')
  };

  await withTimeout(
    Promise.resolve(supabase.from('ai_cache').upsert({
      cache_key: cacheKey,
      location: location,
      cache_date: getTodayKeyWIB(),
      weather_data: raw.weather,
      fx_data: raw.fx,
      gold_data: raw.gold,
      recommendations: JSON.stringify(aiResult)
    }, { onConflict: 'cache_key' })),
    SUPABASE_TIMEOUT_MS,
    'Supabase upsert recommendations'
  );

  return { ...aiResult, ok };
}
