// src/app/api/ai-recommendations/route.ts
// EdgeOne Pages Function — AI Recommendations berdasarkan forecast data

export const runtime = 'edge';

interface RecommendationsRequest {
  weather: {
    rainDays: number;
    tempMax: number;
    condition: string;
  };
  fx: {
    current: number;
    forecastStart: number;
    forecastEnd: number;
    trend: string;
  };
  gold: {
    current: number;
    forecastStart: number;
    forecastEnd: number;
    trend: string;
  };
  location: string;
}

export async function POST(request: Request) {
  try {
    const body: RecommendationsRequest = await request.json();
    const { weather, fx, gold, location } = body;

    const MAKERS_MODELS_KEY = process.env.MAKERS_MODELS_KEY;

    if (!MAKERS_MODELS_KEY) {
      return new Response(
        JSON.stringify({ recommendations: '' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const prompt = 'Anda adalah analis ekonomi senior untuk UMKM Indonesia di kota ' + location + '.\n\n' +
      'Berikut data forecast 7 hari ke depan:\n\n' +
      'CUACA:\n' +
      '- Kondisi: ' + weather.condition + '\n' +
      '- Suhu max: ' + weather.tempMax + 'C\n' +
      '- Hari hujan: ' + weather.rainDays + ' hari\n\n' +
      'KURS USD/IDR:\n' +
      '- Saat ini: Rp ' + fx.current.toLocaleString('id-ID') + '\n' +
      '- Forecast akhir: Rp ' + Math.round(fx.forecastEnd).toLocaleString('id-ID') + '\n' +
      '- Tren: ' + fx.trend + '\n\n' +
      'HARGA EMAS:\n' +
      '- Saat ini: $' + gold.current.toFixed(2) + '/oz\n' +
      '- Forecast akhir: $' + gold.forecastEnd.toFixed(2) + '/oz\n' +
      '- Tren: ' + gold.trend + '\n\n' +
      'Berdasarkan data di atas, berikan REKOMENDASI STRATEGIS spesifik untuk UMKM ' + location + '.\n\n' +
      'Format:\n' +
      '🎯 REKOMENDASI STRATEGIS UMKM (AI)\n' +
      '═══════════════════════════════════════\n\n' +
      '1. [Rekomendasi cuaca - barang apa yang harus distok/dijual]\n' +
      '2. [Rekomendasi kurs - importir/exportir harus apa]\n' +
      '3. [Rekomendasi emas - toko emas harus apa]\n' +
      '4. [Rekomendasi umum - cash flow, pricing, marketing]\n\n' +
      'Gunakan emoji, bahasa Indonesia, dan actionable. Tandai dengan (AI) di akhir.';

    const response = await fetch('https://ai-gateway.edgeone.link/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + MAKERS_MODELS_KEY
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Anda adalah analis ekonomi untuk UMKM Indonesia. Berikan rekomendasi praktis dan actionable.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 800,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      return new Response(
        JSON.stringify({ recommendations: '' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    const recommendations = result.choices[0].message.content;

    return new Response(
      JSON.stringify({ recommendations }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Recommendations error:', error);
    return new Response(
      JSON.stringify({ recommendations: '' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
