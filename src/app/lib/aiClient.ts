// src/app/lib/aiClient.ts
// Logic PANGGIL AI generik — diekstrak dari aiForecast.ts (sebelumnya cuma dipakai
// untuk forecast per kota). Sekarang dipakai bersama oleh:
//   - globalForecast.ts (forecast USD/IDR + Gold, 1x per hari)
//   - aiForecast.ts (forecast risk + summary per kota)
// supaya kedua tempat itu punya perilaku retry/fallback yang SAMA PERSIS, bukan
// duplikat kode yang bisa drift beda perilaku dari waktu ke waktu.

import { fetchWithTimeout } from './timeout';

const AI_GATEWAY_TIMEOUT_MS = 25000;
const GEMINI_TIMEOUT_MS = 20000;
const MAX_AI_ATTEMPTS = 3;

function tryParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Parser toleran, 3 lapis:
// 1. Coba langsung (kalau model sudah balas JSON murni)
// 2. Coba yang dibungkus ```json ... ``` code fence
// 3. Ambil substring dari '{' pertama sampai '}' terakhir (jaga-jaga kalau model
//    nulis kalimat pembuka/penutup di luar JSON meski sudah dilarang di prompt)
export function parseAIJson(raw: string): any | null {
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

function extractContent(result: any): { content: string; finishReason: string } {
  const message = result.choices?.[0]?.message;
  const finishReason = result.choices?.[0]?.finish_reason || 'unknown';
  let content = message?.content || '';
  if (!content && message?.reasoning_content) {
    content = message.reasoning_content;
  }
  return { content, finishReason };
}

async function attemptOnce(
  prompt: string,
  systemPrompt: string,
  apiKey: string,
  maxTokens: number,
  useNewParams: boolean
): Promise<{ parsed: any | null; rawPreview: string; finishReason: string }> {
  const body: any = {
    model: '@makers/deepseek-v4-flash',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    max_tokens: useNewParams ? maxTokens : maxTokens + 200,
    temperature: 0.6
  };

  if (useNewParams) {
    // Matikan mode "thinking" DeepSeek V4 — parameter resmi dari dokumentasi DeepSeek API.
    body.thinking = { type: 'disabled' };
    // JSON Mode standar OpenAI-compatible — memaksa balasan berupa JSON sintaksis valid
    // di level API (bukan cuma "diminta baik-baik" lewat teks system prompt).
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
    return { parsed: null, rawPreview: '', finishReason: 'gateway_error_' + response.status };
  }

  const result = await response.json();
  const { content, finishReason } = extractContent(result);
  if (!content) {
    console.error('AI response kosong. finish_reason:', finishReason);
    return { parsed: null, rawPreview: '', finishReason };
  }

  const parsed = parseAIJson(content);
  if (!parsed) {
    console.error('AI JSON tidak valid. finish_reason:', finishReason, '| raw:', content);
    return { parsed: null, rawPreview: content.slice(0, 120).replace(/\s+/g, ' '), finishReason };
  }

  return { parsed, rawPreview: '', finishReason };
}

// Provider FALLBACK, dipanggil LANGSUNG ke Google (bukan lewat EdgeOne) supaya
// benar-benar independen — kalau EdgeOne gateway-nya sendiri yang bermasalah,
// fallback ini tetap bisa jalan. geminiSchema dikirim per-caller karena bentuk
// JSON yang diminta beda antara forecast global dan forecast per kota.
async function callGeminiFallback(prompt: string, geminiSchema: object, maxTokens: number): Promise<any | null> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
  if (!GEMINI_API_KEY) {
    console.error('Gemini fallback dilewati: GEMINI_API_KEY tidak diset.');
    return null;
  }

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
            responseSchema: geminiSchema,
            temperature: 0.6,
            maxOutputTokens: maxTokens
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

export interface AICallResult<T> {
  ok: boolean;
  data: T | null;
  failureSummary: string;
}

// Jaring pengaman permanen, dipakai oleh SEMUA panggilan AI di project ini (global & per kota):
// 1) EdgeOne/DeepSeek dengan thinking:disabled + response_format:json_object, sampai 3x percobaan.
//    Kalau percobaan pertama gagal karena gateway menolak field baru itu sendiri (bukan AI
//    ngaco), otomatis coba sekali tanpa field itu sebelum dihitung sebagai gagal penuh.
// 2) Kalau 3x itu semua gagal → SEKALI coba provider fallback berbeda total (Gemini, dipanggil
//    langsung ke Google, independen dari infrastruktur EdgeOne), pakai responseSchema Gemini
//    yang memaksa bentuk JSON persis sesuai skema.
// 3) Kalau Gemini juga gagal/tidak dikonfigurasi → baru dilaporkan gagal ke pemanggil.
//
// validate() memastikan BENTUK json-nya (bukan cuma sintaks JSON valid) sesuai skema yang
// caller mau — response_format/responseSchema menjamin sintaks valid, TIDAK menjamin isinya
// persis sesuai field yang kita butuhkan.
export async function callAIWithFallback<T>(
  prompt: string,
  systemPrompt: string,
  geminiSchema: object,
  validate: (parsed: any) => T | null,
  maxTokens: number = 800
): Promise<AICallResult<T>> {
  const AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY || '';
  if (!AI_GATEWAY_API_KEY) {
    return { ok: false, data: null, failureSummary: 'AI tidak tersedia: API key tidak ditemukan.' };
  }

  let lastFailureSummary = 'AI tidak tersedia: percobaan gagal.';
  let gatewayRejectsNewParams = false;

  for (let attempt = 1; attempt <= MAX_AI_ATTEMPTS; attempt++) {
    try {
      const useNewParams = !gatewayRejectsNewParams;
      let { parsed, rawPreview, finishReason } = await attemptOnce(prompt, systemPrompt, AI_GATEWAY_API_KEY, maxTokens, useNewParams);

      // Kalau percobaan dengan parameter baru gagal DI PERCOBAAN PERTAMA, kemungkinan
      // gateway menolak field-nya (bukan cuma AI ngaco) — coba sekali lagi tanpa field itu
      // SEBELUM menghitungnya sebagai 1 percobaan gagal penuh.
      if (!parsed && useNewParams && attempt === 1) {
        console.error('Percobaan 1 gagal dengan thinking/response_format, coba tanpa parameter itu...');
        const retryResult = await attemptOnce(prompt, systemPrompt, AI_GATEWAY_API_KEY, maxTokens, false);
        parsed = retryResult.parsed;
        rawPreview = retryResult.rawPreview;
        finishReason = retryResult.finishReason;
        if (parsed) gatewayRejectsNewParams = true;
      }

      if (parsed) {
        const validated = validate(parsed);
        if (validated) {
          return { ok: true, data: validated, failureSummary: '' };
        }
        lastFailureSummary = 'AI tidak tersedia: JSON valid tapi bentuknya tidak sesuai skema (finish_reason: ' + finishReason + ').';
      } else {
        lastFailureSummary = 'AI tidak tersedia: format jawaban tidak valid (finish_reason: ' + finishReason + ').' +
          (rawPreview ? ' Cuplikan: ' + rawPreview : '');
      }
    } catch (error: any) {
      console.error('AI Gateway exception percobaan ' + attempt + ':', error?.message || error);
      lastFailureSummary = 'AI tidak tersedia: ' + (error?.message || 'Unknown error');
    }

    if (attempt < MAX_AI_ATTEMPTS) {
      console.error('Percobaan ' + attempt + '/' + MAX_AI_ATTEMPTS + ' gagal, mencoba lagi...');
    }
  }

  console.error('Semua ' + MAX_AI_ATTEMPTS + ' percobaan di EdgeOne/DeepSeek gagal, coba provider fallback (Gemini)...');
  const fallbackParsed = await callGeminiFallback(prompt, geminiSchema, maxTokens);
  if (fallbackParsed) {
    const validated = validate(fallbackParsed);
    if (validated) {
      console.error('Berhasil pakai Gemini fallback.');
      return { ok: true, data: validated, failureSummary: '' };
    }
    lastFailureSummary = 'AI tidak tersedia: Gemini fallback balas JSON tapi bentuknya tidak sesuai skema.';
  }

  console.error('Semua percobaan (EdgeOne + Gemini fallback) gagal.');
  return { ok: false, data: null, failureSummary: lastFailureSummary };
}
