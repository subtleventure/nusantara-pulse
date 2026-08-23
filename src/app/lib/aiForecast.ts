// src/app/lib/aiForecast.ts
// Logic generate forecast AI per kota — dipakai oleh route POST /api/ai-recommendations
// DAN oleh cron pre-warm. Dipisah dari route.ts karena Next.js tidak izinkan export
// custom di file route (hanya GET/POST/dst).

import { getDailyRawData, getCacheKey, getTodayKeyWIB } from './dailyData';
import { getSupabaseClient } from './supabase';
import { fetchWithTimeout, withTimeout } from './timeout';

export interface DayForecast {
  usd: number | null;
  gold: number | null;
  risk: 'low' | 'medium' | 'high';
}

export interface AIResult {
  forecast: DayForecast[]; // 7 entri, index 0 = hari ini
  summary: string;
}

const AI_GATEWAY_TIMEOUT_MS = 25000;
const SUPABASE_TIMEOUT_MS = 6000;

function safeNumber(val: any, digits: number = 0): string {
  if (typeof val !== 'number' || isNaN(val)) return 'N/A';
  if (digits > 0) return val.toFixed(digits);
  return Math.round(val).toLocaleString('id-ID');
}

function parseAIJson(raw: string): AIResult | null {
  try {
    let cleaned = raw.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.forecast) || typeof parsed.summary !== 'string') return null;
    return parsed as AIResult;
  } catch {
    return null;
  }
}

async function callAIGateway(location: string, raw: Awaited<ReturnType<typeof getDailyRawData>>): Promise<AIResult> {
  const fxRate: number | null = raw.fx?.rates?.IDR ?? null;
  const goldPrice: number | null = raw.gold?.price ?? null;

  if (fxRate === null && goldPrice === null && !raw.weather) {
    return { forecast: [], summary: 'Semua sumber data real-time gagal diambil, AI tidak bisa dijalankan.' };
  }

  const AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY || '';
  if (!AI_GATEWAY_API_KEY) {
    return { forecast: [], summary: 'AI tidak tersedia: API key tidak ditemukan.' };
  }

  const prompt =
    'Data ekonomi kota ' + location + ' hari ini: USD/IDR=' + safeNumber(fxRate) +
    ', Emas=$' + safeNumber(goldPrice, 2) + '/oz.' +
    ' Buat forecast 7 hari (array "forecast", index 0=hari ini..6=hari ke-7) berisi objek {usd:number,gold:number,risk:"low"|"medium"|"high"}.' +
    ' Tambahkan "summary": ringkasan rekomendasi strategis UMKM, maksimal 350 karakter, bahasa Indonesia, tanpa emoji.' +
    ' Balas HANYA JSON valid satu baris, tanpa markdown, tanpa teks lain: {"forecast":[...],"summary":"..."}';

  try {
    const response = await fetchWithTimeout('https://ai-gateway.edgeone.link/v1/chat/completions', AI_GATEWAY_TIMEOUT_MS, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + AI_GATEWAY_API_KEY
      },
      body: JSON.stringify({
        model: '@makers/deepseek-v4-flash',
        messages: [
          { role: 'system', content: 'Anda analis ekonomi UMKM Indonesia. Balas HANYA JSON valid, tanpa markdown, tanpa penjelasan, tanpa proses berpikir panjang.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 700,
        temperature: 0.6
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      return { forecast: [], summary: 'AI tidak tersedia: Gateway error ' + response.status };
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
      return { forecast: [], summary: 'AI tidak tersedia: jawaban kosong (finish_reason: ' + (finishReason || 'unknown') + ')' };
    }

    const parsed = parseAIJson(aiContent);
    if (!parsed) {
      console.error('AI JSON tidak valid:', aiContent);
      return { forecast: [], summary: 'AI tidak tersedia: format jawaban tidak valid.' };
    }

    return parsed;
  } catch (error: any) {
    console.error('Recommendations error:', error?.message || error);
    return { forecast: [], summary: 'AI tidak tersedia: ' + (error?.message || 'Unknown error') };
  }
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

  const aiResult = await callAIGateway(location, raw);
  const ok = aiResult.forecast.length > 0;

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
