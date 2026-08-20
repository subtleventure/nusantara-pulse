// src/app/api/proxy-data/route.ts
// Proxy untuk fetch data eksternal (fix CORS) — SELALU data real-time, tanpa fallback palsu

export const dynamic = 'force-dynamic';

export async function GET() {
  const errors: string[] = [];

  // 1. Fetch Cuaca (Open-Meteo) — Jakarta default
  let weatherData = null;
  try {
    const weatherRes = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=-6.2088&longitude=106.8456&daily=weather_code,temperature_2m_max,precipitation_sum&timezone=Asia/Jakarta&forecast_days=7'
    );
    if (!weatherRes.ok) throw new Error('Status ' + weatherRes.status);
    weatherData = await weatherRes.json();
  } catch (e: any) {
    console.error('Weather API error:', e?.message || e);
    errors.push('Cuaca: ' + (e?.message || 'gagal diambil'));
  }

  // 2. Fetch Kurs USD/IDR (Frankfurter) — via server (no CORS)
  let fxData = null;
  try {
    const fxRes = await fetch('https://api.frankfurter.app/latest?from=USD&to=IDR');
    if (!fxRes.ok) throw new Error('Status ' + fxRes.status);
    fxData = await fxRes.json();
  } catch (e: any) {
    console.error('FX API error:', e?.message || e);
    errors.push('Kurs: ' + (e?.message || 'gagal diambil'));
  }

  // 3. Fetch Emas (Gold-API) — endpoint resmi: api.gold-api.com/price/{symbol}
  let goldData = null;
  try {
    const goldRes = await fetch('https://api.gold-api.com/price/XAU');
    if (!goldRes.ok) throw new Error('Status ' + goldRes.status);
    goldData = await goldRes.json();
  } catch (e: any) {
    console.error('Gold API error:', e?.message || e);
    errors.push('Emas: ' + (e?.message || 'gagal diambil'));
  }

  return new Response(
    JSON.stringify({
      weather: weatherData,
      fx: fxData,
      gold: goldData,
      errors: errors.length > 0 ? errors : null
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
