// src/app/lib/globalForecast.ts
// Forecast USD/IDR dan Gold — GLOBAL, digenerate SATU KALI per hari (bukan per kota).
//
// ROOT CAUSE yang diperbaiki file ini: USD/IDR dan harga emas adalah data nasional/
// global, sama untuk semua kota. Sebelumnya, forecast 7 hari untuk kedua angka ini
// digenerate AI 5x TERPISAH (sekali per kota, di dalam aiForecast.ts). Karena AI itu
// probabilistik, 5 panggilan independen dengan input yang sama pun bisa menghasilkan
// angka forecast yang sedikit berbeda antar kota — padahal seharusnya identik.
//
// Fix permanen: generate forecast USD/Gold 1x per hari di sini, simpan di tabel
// Supabase `global_forecast` (1 baris per tanggal WIB), lalu SEMUA kota baca dari
// baris yang sama. Ini juga menghemat 4 dari 5 panggilan AI Gateway per hari untuk
// bagian USD/Gold.

import { getSupabaseClient } from './supabase';
import { fetchWithTimeout, withTimeout } from './timeout';
import { getTodayKeyWIB } from './dailyData';
import { callAIWithFallback, parseAIJson } from './aiClient';

export interface GlobalDayForecast {
  usd: number | null;
  gold: number | null;
}

export interface GlobalForecastResult {
  forecast: GlobalDayForecast[]; // 7 entri, index 0 = hari ini
}

const EXTERNAL_API_TIMEOUT_MS = 8000;
const SUPABASE_TIMEOUT_MS = 6000;
const GLOBAL_MAX_TOKENS = 500; // lebih kecil dari forecast per kota — cuma 7 angka usd + 7 angka gold, tanpa summary teks

function safeNumber(val: any, digits: number = 0): string {
  if (typeof val !== 'number' || isNaN(val)) return 'N/A';
  if (digits > 0) return val.toFixed(digits);
  return Math.round(val).toLocaleString('id-ID');
}

// Ambil data FX + Gold mentah HARI INI — tidak perlu per kota (beda dengan cuaca).
// Dipanggil terpisah dari getDailyRawData (yang per kota) supaya tidak numpang di
// cache salah satu kota secara implisit.
async function fetchFreshGlobalRaw(): Promise<{ fx: any; gold: any; errors: string[] | null }> {
  const errors: string[] = [];

  const [fxResult, goldResult] = await Promise.allSettled([
    fetchWithTimeout('https://api.frankfurter.app/latest?from=USD&to=IDR', EXTERNAL_API_TIMEOUT_MS).then(async (r) => {
      if (!r.ok) throw new Error('Status ' + r.status);
      return r.json();
    }),
    fetchWithTimeout('https://api.gold-api.com/price/XAU', EXTERNAL_API_TIMEOUT_MS).then(async (r) => {
      if (!r.ok) throw new Error('Status ' + r.status);
      return r.json();
    })
  ]);

  let fxData = null;
  if (fxResult.status === 'fulfilled') {
    fxData = fxResult.value;
  } else {
    console.error('FX API error (global):', fxResult.reason?.message || fxResult.reason);
    errors.push('Kurs: ' + (fxResult.reason?.message || 'gagal diambil'));
  }

  let goldData = null;
  if (goldResult.status === 'fulfilled') {
    goldData = goldResult.value;
  } else {
    console.error('Gold API error (global):', goldResult.reason?.message || goldResult.reason);
    errors.push('Emas: ' + (goldResult.reason?.message || 'gagal diambil'));
  }

  return { fx: fxData, gold: goldData, errors: errors.length > 0 ? errors : null };
}

function validateGlobalForecast(parsed: any): GlobalForecastResult | null {
  if (!parsed || !Array.isArray(parsed.forecast)) return null;
  if (parsed.forecast.length === 0) return null;
  for (const day of parsed.forecast) {
    if (typeof day.usd !== 'number' || typeof day.gold !== 'number') return null;
  }
  return { forecast: parsed.forecast };
}

async function callGlobalAI(fxRate: number | null, goldPrice: number | null): Promise<GlobalForecastResult & { ok: boolean; failureSummary?: string }> {
  if (fxRate === null && goldPrice === null) {
    return { forecast: [], ok: false, failureSummary: 'Data FX dan Gold gagal diambil, AI tidak bisa dijalankan.' };
  }

  const systemPrompt = 'Anda analis ekonomi makro. Balas HANYA JSON valid sesuai skema yang diminta, tanpa markdown, tanpa penjelasan.';
  const prompt =
    'Data hari ini: USD/IDR=' + safeNumber(fxRate) + ', Emas=$' + safeNumber(goldPrice, 2) + '/oz.' +
    ' Buat forecast 7 hari ke depan (array "forecast", index 0=hari ini..6=hari ke-7) berisi objek {usd:number,gold:number}' +
    ' — usd adalah proyeksi kurs USD/IDR, gold adalah proyeksi harga emas USD/oz.' +
    ' Balas HANYA JSON valid satu baris, tanpa markdown, tanpa teks lain: {"forecast":[...]}';

  const geminiSchema = {
    type: 'OBJECT',
    properties: {
      forecast: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            usd: { type: 'NUMBER' },
            gold: { type: 'NUMBER' }
          },
          required: ['usd', 'gold']
        }
      }
    },
    required: ['forecast']
  };

  const result = await callAIWithFallback<GlobalForecastResult>(
    prompt,
    systemPrompt,
    geminiSchema,
    validateGlobalForecast,
    GLOBAL_MAX_TOKENS
  );

  if (result.ok && result.data) {
    return { ...result.data, ok: true };
  }
  return { forecast: [], ok: false, failureSummary: result.failureSummary };
}

// forceRefresh=true dipakai cron (step pertama, SEBELUM loop 5 kota) supaya
// selalu generate ulang. Semua kota berikutnya baca hasilnya lewat forceRefresh=false.
export async function generateGlobalForecast(forceRefresh: boolean = false): Promise<GlobalForecastResult & { ok: boolean; summary: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { forecast: [], ok: false, summary: 'Supabase belum terkonfigurasi.' };
  }

  const dateKey = getTodayKeyWIB();

  if (!forceRefresh) {
    const { data: existing } = await withTimeout(
      Promise.resolve(supabase.from('global_forecast').select('forecast').eq('cache_key', dateKey).maybeSingle()),
      SUPABASE_TIMEOUT_MS,
      'Supabase read global_forecast'
    );
    if (existing && existing.forecast) {
      const cached = typeof existing.forecast === 'string' ? parseAIJson(existing.forecast) : existing.forecast;
      if (cached && Array.isArray(cached.forecast) && cached.forecast.length > 0) {
        return { forecast: cached.forecast, ok: true, summary: 'ok (cache)' };
      }
    }
  }

  const raw = await fetchFreshGlobalRaw();
  if (raw.errors && raw.errors.length > 0 && !raw.fx && !raw.gold) {
    return { forecast: [], ok: false, summary: 'Data dasar gagal diambil: ' + raw.errors.join(', ') };
  }

  const fxRate: number | null = raw.fx?.rates?.IDR ?? null;
  const goldPrice: number | null = raw.gold?.price ?? null;

  const aiResult = await callGlobalAI(fxRate, goldPrice);

  await withTimeout(
    Promise.resolve(supabase.from('global_forecast').upsert({
      cache_key: dateKey,
      cache_date: dateKey,
      fx_data: raw.fx,
      gold_data: raw.gold,
      forecast: JSON.stringify(aiResult.forecast)
    }, { onConflict: 'cache_key' })),
    SUPABASE_TIMEOUT_MS,
    'Supabase upsert global_forecast'
  );

  return {
    forecast: aiResult.forecast,
    ok: aiResult.ok,
    summary: aiResult.ok ? 'ok (fresh)' : (aiResult.failureSummary || 'AI tidak tersedia.')
  };
}
