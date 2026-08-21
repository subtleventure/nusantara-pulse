// src/app/api/ai-recommendations/route.ts
// Rekomendasi AI di-cache per kota per hari (WIB) di SUPABASE — AI Gateway hanya dipanggil
// 1x per kota per hari, sisanya pakai hasil cache dari database. Hemat kuota token.

import { getCachedAIRecommendations, setCachedAIRecommendations } from '../../lib/dailyData';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const location: string = body?.location || 'Jakarta';

    // ===== LANGKAH 1: CEK CACHE SUPABASE DULU =====
    // Kalau sudah ada di database, langsung return — 0 token, 0 fetch API
    const cached = await getCachedAIRecommendations(location);
    if (cached !== null) {
      return new Response(
        JSON.stringify({ recommendations: cached, aiForecast: true, cached: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ===== LANGKAH 2: Belum ada cache — generate baru =====
    // Import getDailyRawData hanya di sini (lazy import) supaya kalau cache hit, tidak perlu load
    const { getDailyRawData } = await import('../../lib/dailyData');

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

    const raw = await getDailyRawData(location);

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
      return new Response(
        JSON.stringify({ recommendations: '⚠️ Semua sumber data real-time gagal diambil, AI tidak bisa dijalankan.', aiForecast: false }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const fxSMA = fxRate !== null ? calculateSMA([fxRate, fxRate * 0.995, fxRate * 1.005]) : 0;
    const goldSMA = goldPrice !== null ? calculateSMA([goldPrice, goldPrice * 0.99, goldPrice * 1.01]) : 0;

    const AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY || '';

    if (!AI_GATEWAY_API_KEY) {
      return new Response(
        JSON.stringify({ recommendations: '⚠️ AI tidak tersedia: API key tidak ditemukan.', aiForecast: false }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
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
          max_tokens: 3000,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI Gateway error:', response.status, errorText);
        return new Response(
          JSON.stringify({ recommendations: '⚠️ AI tidak tersedia: Gateway error ' + response.status, aiForecast: false }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
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
        return new Response(
          JSON.stringify({ recommendations: '⚠️ AI tidak tersedia: jawaban kosong (finish_reason: ' + (finishReason || 'unknown') + ')', aiForecast: false }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // ===== LANGKAH 3: SIMPAN HASIL KE SUPABASE CACHE =====
      await setCachedAIRecommendations(location, aiContent);

      return new Response(
        JSON.stringify({ recommendations: aiContent, aiForecast: true, cached: false }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

    } catch (error: any) {
      console.error('Recommendations error:', error?.message || error);
      return new Response(
        JSON.stringify({ recommendations: '⚠️ AI tidak tersedia: ' + (error?.message || 'Unknown error'), aiForecast: false }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

  } catch (error: any) {
    console.error('Recommendations error:', error?.message || error);
    return new Response(
      JSON.stringify({ recommendations: '⚠️ AI tidak tersedia: ' + (error?.message || 'Unknown error'), aiForecast: false }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
