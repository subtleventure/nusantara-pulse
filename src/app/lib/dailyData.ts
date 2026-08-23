// src/app/lib/dailyData.ts
// Helper bersama: ambil data cuaca/kurs/emas, di-cache per kota per hari (WIB)
// Cache WAJIB disimpan di Supabase (tabel ai_cache) — tidak ada fallback tanpa cache.

import { getSupabaseClient } from './supabase';
import { fetchWithTimeout, withTimeout } from './timeout';

export interface DailyRawData {
  weather: any;
  fx: any;
  gold: any;
  errors: string[] | null;
}

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  Jakarta: { lat: -6.2088, lng: 106.8456 },
  Surabaya: { lat: -7.2575, lng: 112.7521 },
  Bandung: { lat: -6.9175, lng: 107.6191 },
  Medan: { lat: 3.5952, lng: 98.6722 },
  Makassar: { lat: -5.1477, lng: 119.4327 }
};

const EXTERNAL_API_TIMEOUT_MS = 8000;
const SUPABASE_TIMEOUT_MS = 6000;

// Tanggal WIB (UTC+7) — supaya cache reset jam 00:00 waktu Indonesia, bukan UTC
export function getTodayKeyWIB(): string {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10); // format: YYYY-MM-DD
}

export function getCacheKey(location: string): string {
  return location + '_' + getTodayKeyWIB();
}

// Ketiga fetch ini PARALEL (Promise.allSettled) dan MASING-MASING PUNYA TIMEOUT 8 detik.
// Ini memperbaiki bug utama: sebelumnya fetch tanpa timeout bisa menggantung SELAMANYA
// kalau salah satu API luar hang (bukan error, cuma gak pernah respon).
async function fetchFreshRawData(location: string): Promise<DailyRawData> {
  const coords = CITY_COORDS[location] || CITY_COORDS['Jakarta'];
  const errors: string[] = [];

  const [weatherResult, fxResult, goldResult] = await Promise.allSettled([
    fetchWithTimeout(
      'https://api.open-meteo.com/v1/forecast?latitude=' + coords.lat + '&longitude=' + coords.lng + '&daily=weather_code,temperature_2m_max,precipitation_sum&timezone=Asia/Jakarta&forecast_days=7',
      EXTERNAL_API_TIMEOUT_MS
    ).then(async (r) => {
      if (!r.ok) throw new Error('Status ' + r.status);
      return r.json();
    }),
    fetchWithTimeout('https://api.frankfurter.app/latest?from=USD&to=IDR', EXTERNAL_API_TIMEOUT_MS).then(async (r) => {
      if (!r.ok) throw new Error('Status ' + r.status);
      return r.json();
    }),
    fetchWithTimeout('https://api.gold-api.com/price/XAU', EXTERNAL_API_TIMEOUT_MS).then(async (r) => {
      if (!r.ok) throw new Error('Status ' + r.status);
      return r.json();
    })
  ]);

  let weatherData = null;
  if (weatherResult.status === 'fulfilled') {
    weatherData = weatherResult.value;
  } else {
    console.error('Weather API error:', weatherResult.reason?.message || weatherResult.reason);
    errors.push('Cuaca: ' + (weatherResult.reason?.message || 'gagal diambil'));
  }

  let fxData = null;
  if (fxResult.status === 'fulfilled') {
    fxData = fxResult.value;
  } else {
    console.error('FX API error:', fxResult.reason?.message || fxResult.reason);
    errors.push('Kurs: ' + (fxResult.reason?.message || 'gagal diambil'));
  }

  let goldData = null;
  if (goldResult.status === 'fulfilled') {
    goldData = goldResult.value;
  } else {
    console.error('Gold API error:', goldResult.reason?.message || goldResult.reason);
    errors.push('Emas: ' + (goldResult.reason?.message || 'gagal diambil'));
  }

  return {
    weather: weatherData,
    fx: fxData,
    gold: goldData,
    errors: errors.length > 0 ? errors : null
  };
}

// Ambil data mentah — cek cache Supabase dulu, kalau tidak ada baru fetch API luar.
// TIDAK ADA FALLBACK: kalau Supabase tidak terkonfigurasi, lempar error jelas.
// Semua panggilan Supabase dibungkus timeout supaya tidak ikut menggantung.
export async function getDailyRawData(location: string): Promise<DailyRawData> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase belum terkonfigurasi: SUPABASE_URL / SUPABASE_SECRET_KEY tidak ditemukan di environment variables.');
  }

  const cacheKey = getCacheKey(location);

  const { data: existing, error: readError } = await withTimeout(
    Promise.resolve(supabase.from('ai_cache').select('weather_data, fx_data, gold_data').eq('cache_key', cacheKey).maybeSingle()),
    SUPABASE_TIMEOUT_MS,
    'Supabase read ai_cache'
  );

  if (readError) {
    throw new Error('Supabase read error: ' + readError.message);
  }

  if (existing && existing.weather_data) {
    return {
      weather: existing.weather_data,
      fx: existing.fx_data,
      gold: existing.gold_data,
      errors: null
    };
  }

  const fresh = await fetchFreshRawData(location);

  const { error: upsertError } = await withTimeout(
    Promise.resolve(supabase.from('ai_cache').upsert({
      cache_key: cacheKey,
      location: location,
      cache_date: getTodayKeyWIB(),
      weather_data: fresh.weather,
      fx_data: fresh.fx,
      gold_data: fresh.gold,
      recommendations: ''
    }, { onConflict: 'cache_key' })),
    SUPABASE_TIMEOUT_MS,
    'Supabase upsert ai_cache'
  );

  if (upsertError) {
    throw new Error('Supabase upsert error: ' + upsertError.message);
  }

  return fresh;
}
