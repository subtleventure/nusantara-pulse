// src/app/api/proxy-data/route.ts
// Proxy untuk fetch data eksternal (fix CORS)

export async function GET() {
  try {
    // 1. Fetch Cuaca (Open-Meteo) — Jakarta default
    const weatherRes = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=-6.2088&longitude=106.8456&daily=weather_code,temperature_2m_max,precipitation_sum&timezone=Asia/Jakarta&forecast_days=7'
    );
    const weatherData = await weatherRes.json();

    // 2. Fetch Kurs USD/IDR (Frankfurter) — via server (no CORS)
    const fxRes = await fetch('https://api.frankfurter.app/latest?from=USD&to=IDR');
    const fxData = await fxRes.json();

    // 3. Fetch Emas (Gold-API)
    const goldRes = await fetch('https://www.gold-api.com/api/XAU/USD', {
      headers: { 'User-Agent': 'NusantaraPulse/1.0' }
    });
    let goldData = { price: 0, change: 0 };
    try {
      goldData = await goldRes.json();
    } catch (e) {
      console.log('Gold API error, using fallback');
      goldData = { price: 2400, change: 0 };
    }

    return new Response(
      JSON.stringify({
        weather: weatherData,
        fx: fxData,
        gold: goldData
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Proxy error:', error?.message || error);
    return new Response(
      JSON.stringify({ error: 'Gagal fetch data' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
