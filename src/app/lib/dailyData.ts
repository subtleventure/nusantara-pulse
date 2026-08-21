// src/app/lib/dailyData.ts
// Helper bersama: ambil data cuaca/kurs/emas, di-cache per kota per hari (WIB)
// Cache disimpan di Supabase (tabel ai_cache) — persisten, terbukti reliable.

import { getSupabaseClient } from './supabase';

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

// Tanggal WIB (UTC+7) — supaya cache reset jam 00:00 waktu Indonesia, bukan UTC
export function getTodayKeyWIB(): string {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10); // format: YYYY-MM-DD
}

export function getCacheKey(location: string): string {
  return location + '_' + getTodayKeyWIB();
}

async function fetchFreshRawData(location: string): Promise<DailyRawData> {
  const coords = CITY_COORDS[location] || CITY_COORDS['Jakarta'];
  const errors: string[] = [];

  let weatherData = null;
  try {
    const weatherRes = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=' + coords.lat + '&longitude=' + coords.lng + '&daily=weather_code,temperature_2m_max,precipitation_sum&timezone=Asia/Jakarta&forecast_days=7'
    );
    if (!weatherRes.ok) throw new Error('Status ' + weatherRes.status);
    weatherData = await weatherRes.json();
  } catch (e: any) {
    console.error('Weather API error:', e?.message || e);
    errors.push('Cuaca: ' + (e?.message || 'gagal diambil'));
  }

  let fxData = null;
  try {
    const fxRes = await fetch('https://api.frankfurter.app/latest?from=USD&to=IDR');
    if (!fxRes.ok) throw new Error('Status ' + fxRes.status);
    fxData = await fxRes.json();
  } catch (e: any) {
    console.error('FX API error:', e?.message || e);
    errors.push('Kurs: ' + (e?.message || 'gagal diambil'));
  }

  let goldData = null;
  try {
    const goldRes = await fetch('https://api.gold-api.com/price/XAU');
    if (!goldRes.ok) throw new Error('Status ' + goldRes.status);
    goldData = await goldRes.json();
  } catch (e: any) {
    console.error('Gold API error:', e?.message || e);
    errors.push('Emas: ' + (e?.message || 'gagal diambil'));
  }

  return {
    weather: weatherData,
    fx: fxData,
    gold: goldData,
    errors: errors.length > 0 ? errors : null
  };
}

// Ambil data mentah — cek cache Supabase dulu, kalau tidak ada baru fetch API luar
export async function getDailyRawData(location: string): Promise<DailyRawData> {
  const supabase = getSupabaseClient();
  const cacheKey = getCacheKey(location);

  // Kalau Supabase belum dikonfigurasi, langsung fetch fresh tanpa cache (tetap jalan)
  if (!supabase) {
    return fetchFreshRawData(location);
  }

  // 1. Cek apakah sudah ada cache untuk kota+hari ini
  const { data: existing, error: readError } = await supabase
    .from('ai_cache')
    .select('weather_data, fx_data, gold_data')
    .eq('cache_key', cacheKey)
    .maybeSingle();

  if (readError) {
    console.error('Supabase read error:', readError.message);
  }

  if (existing && existing.weather_data) {
    return {
      weather: existing.weather_data,
      fx: existing.fx_data,
      gold: existing.gold_data,
      errors: null
    };
  }

  // 2. Belum ada cache — fetch fresh, lalu simpan
  const fresh = await fetchFreshRawData(location);

  const { error: upsertError } = await supabase
    .from('ai_cache')
    .upsert({
      cache_key: cacheKey,
      location: location,
      cache_date: getTodayKeyWIB(),
      weather_data: fresh.weather,
      fx_data: fresh.fx,
      gold_data: fresh.gold,
      recommendations: '' // diisi belakangan oleh ai-recommendations
    }, { onConflict: 'cache_key' });

  if (upsertError) {
    console.error('Supabase upsert error:', upsertError.message);
  }

  return fresh;
}
