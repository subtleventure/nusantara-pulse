// src/app/api/ai-recommendations/route.ts
// Route tipis — logic sesungguhnya ada di lib/aiForecast.ts (dipakai bareng cron pre-warm).

import { generateForecastForCity } from '../../lib/aiForecast';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const location: string = body?.location || 'Jakarta';
    const result = await generateForecastForCity(location, false);
    return new Response(
      JSON.stringify({ forecast: result.forecast, summary: result.summary }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Recommendations error:', error?.message || error);
    return new Response(
      JSON.stringify({ forecast: [], summary: 'AI tidak tersedia: ' + (error?.message || 'Unknown error') }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
