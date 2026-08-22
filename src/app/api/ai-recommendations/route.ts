// src/app/api/ai-recommendations/route.ts
// Rekomendasi AI di-cache di Supabase per kota per hari (WIB). WAJIB Supabase, tanpa fallback.

import { getDailyRawData, getCacheKey, getTodayKeyWIB } from '../../lib/dailyData';
import { getSupabaseClient } from '../../lib/supabase';

const weatherCodes: Record<number, string> = {
  0: 'Cerah', 1: 'Cerah Berawan', 2: 'Berawan', 3: 'Mendung',
  45: 'Berkabut', 48: 'Berkabut', 51: 'Gerimis', 53: 'Gerimis',
  55: 'Gerimis', 61: 'Hujan Ringan', 63: 'Hujan', 65: 'Hujan Lebat',
  80: 'Hujan Ringan', 81: 'Hujan', 82: 'Hujan Lebat', 95: 'Badai',
  96: 'Badai Petir', 99: 'Badai Petir'
};

function safeNumber(val: any, digits: number = 0): string {
  if (typeof val !== 'number' || isNaN(val)) return 'N/A';
  if (digits > 0) return val.toFixed(digits);
  return Math.round(val).toLocaleString('id-ID');
}

function calculateSMA(values: number[]): number {
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

async function callAIGateway(location: string, raw: Awaited<ReturnType<typeof getDailyRawData>>): Promise<string> {
  let rainDays = 0;
  let maxTemp = 0;
  let firstCondition = 'N/A';

  if (raw.weather && raw.weather.daily) {
    const daily = raw.weather.daily;
    for (let i = 0; i < 7; i++) {
      const rain = daily.precipitation_sum[i] || 0;
      const temp = daily.temperature_2m_max[i];
      if (rain > 0) rainDays++;
      if (temp > maxTemp) maxTemp = temp;
      if (i === 0) firstCondition = weatherCodes[daily.weather_code[i]] || 'Tidak Diketahui';
    }
  }

  const fxRate: number | null = raw.fx?.rates?.IDR ?? null;
  const goldPrice: number | null = raw.gold?.price ?? null;

  if (fxRate === null && goldPrice === null && !raw.weather) {
    return '⚠️ Semua sumber data real-time gagal diambil, AI tidak bisa dijalankan.';
  }

  const fxSMA = fxRate !== null ? calculateSMA([fxRate, fxRate * 0.995, fxRate * 1.005]) : 0;
  const goldSMA = goldPrice !== null ? calculateSMA([goldPrice, goldPrice * 0.99, goldPrice * 1.01]) : 0;

  const AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY || '';

  if (!AI_GATEWAY_API_KEY) {
    return '⚠️ AI tidak tersedia: API key tidak ditemukan.';
  }

  const prompt =
    'Anda adalah analis ekonomi senior untuk UMKM Indonesia di kota ' + location + '.' + String.fromCharCode(10) + String.fromCharCode(10) +
    'Berikut data forecast 7 hari ke depan:' + String.fromCharCode(10) + String.fromCharCode(10) +
    'CUACA:' + String.fromCharCode(10) +
    '- Kondisi: ' + firstCondition + String.fromCharCode(10) +
    '- Suhu max: ' + safeNumber(maxTemp) + 'C' + String.fromCharCode(10) +
    '- Hari hujan: ' + safeNumber(rainDays) + ' hari' + String.fromCharCode(10) + String.fromCharCode(10) +
    'KURS USD/IDR:' + String.fromCharCode(10) +
    '- Saat ini: Rp ' + safeNumber(fxRate) + String.fromCharCode(10) +
    '- Forecast akhir: Rp ' + safeNumber(fxSMA) + String.fromCharCode(10) +
    '- Tren: ' + (fxSMA > (fxRate ?? 0) ? 'NAIK' : 'TURUN') + String.fromCharCode(10) + String.fromCharCode(10) +
    'HARGA EMAS:' + String.fromCharCode(10) +
    '- Saat ini: $' + safeNumber(goldPrice, 2) + '/oz' + String.fromCharCode(10) +
    '- Forecast akhir: $' + safeNumber(goldSMA, 2) + '/oz' + String.fromCharCode(10) +
    '- Tren: ' + (goldSMA > (goldPrice ?? 0) ? 'NAIK' : 'TURUN') + String.fromCharCode(10) + String.fromCharCode(10) +
    'TUGAS ANDA:' + String.fromCharCode(10) +
    '1. BUAT FORECAST 7 HARI untuk cuaca, kurs, dan emas menggunakan analisis AI (bukan SMA).' + String.fromCharCode(10) +
    '2. Berikan REKOMENDASI STRATEGIS spesifik untuk UMKM.' + String.fromCharCode(10) + String.fromCharCode(10) +
    'Format jawaban:' + String.fromCharCode(10) +
    '=======================================' + String.fromCharCode(10) +
    'AI FORECAST 7 HARI (AI)' + String.fromCharCode(10) +
    '=======================================' + String.fromCharCode(10) +
    'Cuaca: [prediksi AI]' + String.fromCharCode(10) +
    'Kurs USD/IDR: [prediksi AI]' + String.fromCharCode(10) +
    'Emas: [prediksi AI]' + String.fromCharCode(10) + String.fromCharCode(10) +
    '=======================================' + String.fromCharCode(10) +
    'REKOMENDASI STRATEGIS UMKM (AI)' + String.fromCharCode(10) +
    '=======================================' + String.fromCharCode(10) +
    '1. [Rekomendasi cuaca]' + String.fromCharCode(10) +
    '2. [Rekomendasi kurs]' + String.fromCharCode(10) +
    '3. [Rekomendasi emas]' + String.fromCharCode(10) +
    '4. [Rekomendasi umum]' + String.fromCharCode(10) + String.fromCharCode(10) +
    'Gunakan emoji, bahasa Indonesia, dan actionable.';

  try {
    const response = await fetch('https://ai-gateway.edgeone.link/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + AI_GATEWAY_API_KEY
      },
      body: JSON.stringify({
        model: '@makers/deepseek-v4-flash',
        messages: [
          { role: 'system', content: 'Anda adalah analis ekonomi untuk UMKM Indonesia. Berikan forecast dan rekomendasi praktis. Langsung jawab tanpa proses berpikir panjang.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 1500,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      return '⚠️ AI tidak tersedia: Gateway error ' + response.status;
    }

    const result = await response.json();
    const message = result.choices?.[0]?.message;
    const finishReason = result.choices?.[0]?.finish_reason;

    let aiContent = message?.content || '';
    if (!aiContent && message?.reasoning_content) {
      aiContent = message.reasoning_content;
    }

    if (!aiContent) {
      console.error('AI response kosong. finish_reason:', finishReason);
      return '⚠️ AI tidak tersedia: jawaban kosong (finish_reason: ' + (finishReason || 'unknown') + ')';
    }

    return aiContent;
  } catch (error: any) {
    console.error('Recommendations error:', error?.message || error);
    return '⚠️ AI tidak tersedia: ' + (error?.message || 'Unknown error');
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const location: string = body?.location || 'Jakarta';
    const supabase = getSupabaseClient();

    if (!supabase) {
      return new Response(
        JSON.stringify({ recommendations: '⚠️ Supabase belum terkonfigurasi: SUPABASE_URL / SUPABASE_SECRET_KEY tidak ditemukan.' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const cacheKey = getCacheKey(location);
    const raw = await getDailyRawData(location);

    const { data: existing, error: readError } = await supabase
      .from('ai_cache')
      .select('recommendations')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (readError) {
      console.error('Supabase read error:', readError.message);
    }

    if (existing && existing.recommendations) {
      return new Response(
        JSON.stringify({ recommendations: existing.recommendations, aiForecast: true, fromCache: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const recommendations = await callAIGateway(location, raw);

    const { error: upsertError } = await supabase
      .from('ai_cache')
      .upsert({
        cache_key: cacheKey,
        location: location,
        cache_date: getTodayKeyWIB(),
        weather_data: raw.weather,
        fx_data: raw.fx,
        gold_data: raw.gold,
        recommendations: recommendations
      }, { onConflict: 'cache_key' });

    if (upsertError) {
      console.error('Supabase upsert error:', upsertError.message);
    }

    return new Response(
      JSON.stringify({ recommendations, aiForecast: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Recommendations error:', error?.message || error);
    return new Response(
      JSON.stringify({ recommendations: '⚠️ AI tidak tersedia: ' + (error?.message || 'Unknown error') }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
