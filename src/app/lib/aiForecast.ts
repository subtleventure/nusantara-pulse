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
const GEMINI_TIMEOUT_MS = 20000;
const SUPABASE_TIMEOUT_MS = 6000;

function safeNumber(val: any, digits: number = 0): string {
  if (typeof val !== 'number' || isNaN(val)) return 'N/A';
  if (digits > 0) return val.toFixed(digits);
  return Math.round(val).toLocaleString('id-ID');
}

function tryParse(text: string): AIResult | null {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.forecast) || typeof parsed.summary !== 'string') return null;
    return parsed as AIResult;
  } catch {
    return null;
  }
}

// Parser toleran, 3 lapis:
// 1. Coba langsung (kalau model sudah balas JSON murni)
// 2. Coba yang dibungkus ```json ... ``` code fence
// 3. Ambil substring dari '{' pertama sampai '}' terakhir (jaga-jaga kalau model
//    nulis kalimat pembuka/penutup di luar JSON meski sudah dilarang di prompt)
function parseAIJson(raw: string): AIResult | null {
  const cleaned = raw.trim();

  const direct = tryParse(cleaned);
  if (direct) return direct;

  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    const fromFence = tryParse(fenceMatch[1].trim());
    if (fromFence) return fromFence;
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const fromBraces = tryParse(cleaned.slice(firstBrace, lastBrace + 1));
    if (fromBraces) return fromBraces;
  }

  return null;
}

// Satu kali percobaan panggil AI Gateway + parse hasilnya.
// Mengembalikan null kalau format/gateway gagal (supaya bisa di-retry oleh caller),
// bukan langsung mengembalikan AIResult "gagal" — best-effort dipisah dari final-give-up.
async function attemptOnce(prompt: string, apiKey: string, useNewParams: boolean): Promise<AIResult | null> {
  const body: any = {
    model: '@makers/deepseek-v4-flash',
    messages: [
      { role: 'system', content: 'Anda analis ekonomi UMKM Indonesia. Balas HANYA JSON valid sesuai skema yang diminta, tanpa markdown, tanpa penjelasan.' },
      { role: 'user', content: prompt }
    ],
    max_tokens: useNewParams ? 800 : 1000,
    temperature: 0.6
  };

  if (useNewParams) {
    // Matikan mode "thinking" DeepSeek V4 — parameter resmi dari dokumentasi DeepSeek API.
    body.thinking = { type: 'disabled' };
    // JSON Mode standar OpenAI-compatible — memaksa balasan berupa JSON sintaksis valid
    // di level API (bukan cuma "diminta baik-baik" lewat teks system prompt).
    // CATATAN: ini menjamin JSON-nya valid secara SINTAKS, TIDAK menjamin isinya persis
    // sesuai skema {forecast, summary} yang kita mau — makanya tetap perlu validasi +
    // retry di luar, bukan cuma andalkan parameter ini sendirian.
    body.response_format = { type: 'json_object' };
  }

  const response = await fetchWithTimeout('https://ai-gateway.edgeone.link/v1/chat/completions', AI_GATEWAY_TIMEOUT_MS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('AI Gateway error (useNewParams=' + useNewParams + '):', response.status, errorText);
    return null;
  }

  const result = await response.json();
  return finishParsing(result);
}

const MAX_AI_ATTEMPTS = 3;

// Provider FALLBACK, dipanggil LANGSUNG ke Google (bukan lewat EdgeOne) supaya
// benar-benar independen — kalau EdgeOne gateway-nya sendiri yang bermasalah,
// fallback ini tetap bisa jalan karena tidak lewat infrastruktur yang sama.
// Gemini punya responseSchema yang memaksa bentuk JSON persis sesuai skema kita
// di level API — lebih kuat daripada response_format json_object biasa.
async function callGeminiFallback(prompt: string): Promise<AIResult | null> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
  if (!GEMINI_API_KEY) {
    console.error('Gemini fallback dilewati: GEMINI_API_KEY tidak diset.');
    return null;
  }

  const schema = {
    type: 'OBJECT',
    properties: {
      forecast: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            usd: { type: 'NUMBER' },
            gold: { type: 'NUMBER' },
            risk: { type: 'STRING', enum: ['low', 'medium', 'high'] }
          },
          required: ['usd', 'gold', 'risk']
        }
      },
      summary: { type: 'STRING' }
    },
    required: ['forecast', 'summary']
  };

  try {
    const response = await fetchWithTimeout(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_API_KEY,
      GEMINI_TIMEOUT_MS,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: schema,
            temperature: 0.6,
            maxOutputTokens: 800
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini fallback error:', response.status, errorText);
      return null;
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) {
      console.error('Gemini fallback: jawaban kosong.');
      return null;
    }

    const parsed = parseAIJson(text);
    if (!parsed) {
      console.error('Gemini fallback: JSON tidak valid meski responseSchema dipakai:', text);
      return null;
    }
    return parsed;
  } catch (error: any) {
    console.error('Gemini fallback exception:', error?.message || error);
    return null;
  }
}

// PENTING — ini jaring pengaman permanen, bukan tebak-tebakan "hari ini kebetulan berhasil":
// AI itu probabilistik, response_format/thinking-disabled MENGURANGI kemungkinan gagal
// tapi TIDAK menjamin 100% selamanya. Urutan pertahanan:
// 1) EdgeOne/DeepSeek dengan parameter baru, sampai 3x percobaan.
// 2) Kalau 3x itu semua gagal → SEKALI coba provider lain (Gemini, infrastruktur beda
//    sepenuhnya) — bukan mengulang model yang sama yang sudah terbukti gagal 3x.
// 3) Kalau Gemini juga gagal/tidak dikonfigurasi → baru dilaporkan gagal ke pemanggil
//    (cron akan retry seluruh kota ini lagi nanti, tapi jarang sampai situ).
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

  let lastFailureSummary = 'AI tidak tersedia: percobaan gagal.';
  let gatewayRejectsNewParams = false; // kalau ketahuan gateway tolak field baru, langsung skip di percobaan berikutnya

  for (let attempt = 1; attempt <= MAX_AI_ATTEMPTS; attempt++) {
    try {
      const useNewParams = !gatewayRejectsNewParams;
      let result = await attemptOnce(prompt, AI_GATEWAY_API_KEY, useNewParams);

      // Kalau percobaan dengan parameter baru gagal DI PERCOBAAN PERTAMA, kemungkinan
      // gateway menolak field-nya (bukan cuma AI ngaco) — coba sekali lagi tanpa field itu
      // SEBELUM menghitungnya sebagai 1 percobaan gagal penuh.
      if (!result && useNewParams && attempt === 1) {
        console.error('Percobaan 1 gagal dengan thinking/response_format, coba tanpa parameter itu...');
        result = await attemptOnce(prompt, AI_GATEWAY_API_KEY, false);
        if (result) gatewayRejectsNewParams = true; // ingat untuk percobaan berikutnya
      }

      if (result && result.forecast.length > 0) {
        return result;
      }
      if (result) lastFailureSummary = result.summary;
    } catch (error: any) {
      console.error('AI Gateway exception percobaan ' + attempt + ':', error?.message || error);
      lastFailureSummary = 'AI tidak tersedia: ' + (error?.message || 'Unknown error');
    }

    if (attempt < MAX_AI_ATTEMPTS) {
      console.error('Percobaan ' + attempt + '/' + MAX_AI_ATTEMPTS + ' gagal untuk ' + location + ', mencoba lagi...');
    }
  }

  console.error(location + ': semua ' + MAX_AI_ATTEMPTS + ' percobaan di EdgeOne/DeepSeek gagal, coba provider fallback (Gemini)...');
  const fallbackResult = await callGeminiFallback(prompt);
  if (fallbackResult && fallbackResult.forecast.length > 0) {
    console.error(location + ': berhasil pakai Gemini fallback.');
    return fallbackResult;
  }

  console.error(location + ': semua percobaan (EdgeOne + Gemini fallback) gagal.');
  return { forecast: [], summary: lastFailureSummary };
}

function finishParsing(result: any): AIResult {
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
    console.error('AI JSON tidak valid. finish_reason:', finishReason, '| raw:', aiContent);
    const preview = aiContent.slice(0, 120).replace(/\s+/g, ' ');
    return { forecast: [], summary: 'AI tidak tersedia: format jawaban tidak valid (finish_reason: ' + (finishReason || 'unknown') + '). Cuplikan: ' + preview };
  }

  return parsed;
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
