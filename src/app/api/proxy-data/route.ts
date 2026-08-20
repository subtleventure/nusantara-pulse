// src/app/api/proxy-data/route.ts
// Proxy untuk fetch data eksternal (fix CORS) — SELALU data real-time, tanpa fallback palsu

export const dynamic = 'force-dynamic';

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  Jakarta: { lat: -6.2088, lng: 106.8456 },
  Surabaya: { lat: -7.2575, lng: 112.7521 },
  Bandung: { lat: -6.9175, lng: 107.6191 },
  Medan: { lat: 3.5952, lng: 98.6722 },
  Makassar: { lat: -5.1477, lng: 119.4327 }
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const locationParam = searchParams.get('location') || 'Jakarta';
  const coords = CITY_COORDS[locationParam] || CITY_COORDS['Jakarta'];

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
