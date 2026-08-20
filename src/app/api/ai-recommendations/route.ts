// src/app/api/ai-recommendations/route.ts

interface ForecastData {
  weather: { rainDays: number; tempMax: number; condition: string; };
  fx: { current: number; forecastStart: number; forecastEnd: number; trend: string; };
  gold: { current: number; forecastStart: number; forecastEnd: number; trend: string; };
  location: string;
}

export async function POST(request: Request) {
  try {
    const body: ForecastData = await request.json();
    const { weather, fx, gold, location } = body;

    const AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY || '';

    if (!AI_GATEWAY_API_KEY) {
      return new Response(
        JSON.stringify({ recommendations: '⚠️ AI tidak tersedia: API key tidak ditemukan.' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const safeNumber = (val: any, digits: number = 0): string => {
      if (typeof val !== 'number' || isNaN(val)) return 'N/A';
      if (digits > 0) return val.toFixed(digits);
      return Math.round(val).toLocaleString('id-ID');
    };

    const prompt = 
      'Anda adalah analis ekonomi senior untuk UMKM Indonesia di kota ' + (location || 'Indonesia') + '.' + String.fromCharCode(10) + String.fromCharCode(10) +
      'Berikut data forecast 7 hari ke depan:' + String.fromCharCode(10) + String.fromCharCode(10) +
      'CUACA:' + String.fromCharCode(10) +
      '- Kondisi: ' + (weather?.condition || 'N/A') + String.fromCharCode(10) +
      '- Suhu max: ' + safeNumber(weather?.tempMax) + 'C' + String.fromCharCode(10) +
      '- Hari hujan: ' + safeNumber(weather?.rainDays) + ' hari' + String.fromCharCode(10) + String.fromCharCode(10) +
      'KURS USD/IDR:' + String.fromCharCode(10) +
      '- Saat ini: Rp ' + safeNumber(fx?.current) + String.fromCharCode(10) +
      '- Forecast akhir: Rp ' + safeNumber(fx?.forecastEnd) + String.fromCharCode(10) +
      '- Tren: ' + (fx?.trend || 'N/A') + String.fromCharCode(10) + String.fromCharCode(10) +
      'HARGA EMAS:' + String.fromCharCode(10) +
      '- Saat ini: $' + safeNumber(gold?.current, 2) + '/oz' + String.fromCharCode(10) +
      '- Forecast akhir: $' + safeNumber(gold?.forecastEnd, 2) + '/oz' + String.fromCharCode(10) +
      '- Tren: ' + (gold?.trend || 'N/A') + String.fromCharCode(10) + String.fromCharCode(10) +
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

    const response = await fetch('https://ai-gateway.edgeone.link/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + AI_GATEWAY_API_KEY
      },
      body: JSON.stringify({
        model: '@makers/gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Anda adalah analis ekonomi untuk UMKM Indonesia. Berikan forecast dan rekomendasi praktis.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 1200,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      return new Response(
        JSON.stringify({ recommendations: '⚠️ AI tidak tersedia: Gateway error ' + response.status }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    const aiContent = result.choices?.[0]?.message?.content || '';

    return new Response(
      JSON.stringify({ recommendations: aiContent, aiForecast: true }),
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
