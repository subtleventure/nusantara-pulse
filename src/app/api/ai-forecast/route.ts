// src/app/api/ai-forecast/route.ts
// EdgeOne Pages Function — AI Forecasting dengan DeepSeek via AI Gateway

export const runtime = 'edge';

interface ForecastRequest {
  type: 'weather' | 'fx' | 'gold';
  historicalData: number[];
  days: number;
  context?: string;
  location?: string;
}

interface ForecastResponse {
  forecast: number[];
  confidence: number;
  analysis: string;
  model: string;
}

function generateHistoricalData(baseValue: number, days: number, volatility: number): number[] {
  const data: number[] = [];
  let current = baseValue;
  for (let i = days - 1; i >= 0; i--) {
    const change = current * volatility * (Math.sin(i * 0.5) * 0.5);
    current = current - change;
    data.unshift(Math.round(current));
  }
  data[data.length - 1] = Math.round(baseValue);
  return data;
}

function forecastWithSMA(baseValue: number, days: number, volatility: number): number[] {
  const historical = generateHistoricalData(baseValue, 30, volatility);
  const forecast: number[] = [];
  const lastData = [...historical];
  for (let i = 0; i < days; i++) {
    const last3 = lastData.slice(-3);
    const sum = last3.reduce((a, b) => a + b, 0);
    const nextValue = Math.round(sum / 3);
    forecast.push(nextValue);
    lastData.push(nextValue);
  }
  return forecast;
}

function calculateConfidence(data: number[]): number {
  if (data.length < 2) return 0.5;
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;
  if (cv < 0.01) return 0.95;
  if (cv < 0.02) return 0.85;
  if (cv < 0.05) return 0.75;
  if (cv < 0.1) return 0.65;
  return 0.55;
}

async function aiAnalyze(
  data: number[],
  type: string,
  context: string,
  location: string = 'Indonesia'
): Promise<{ analysis: string; model: string; debug: string }> {
  const MAKERS_MODELS_KEY = process.env.MAKERS_MODELS_KEY;

  // DEBUG: Log key status (first 10 chars only for security)
  const keyStatus = MAKERS_MODELS_KEY 
    ? 'Key found: ' + MAKERS_MODELS_KEY.substring(0, 10) + '...'
    : 'Key NOT FOUND - using fallback';

  if (!MAKERS_MODELS_KEY) {
    return {
      analysis: generateFallbackAnalysis(data, type, context),
      model: 'fallback-sma',
      debug: keyStatus
    };
  }

  try {
    const lastValue = data[data.length - 1];
    const firstValue = data[0];
    const change = ((lastValue - firstValue) / firstValue) * 100;
    const trend = change > 0 ? 'NAIK' : 'TURUN';

    const prompt = 'Anda adalah analis ekonomi senior untuk UMKM Indonesia di kota ' + location + '.\n\n' +
      'Data ' + type + ' 30 hari terakhir: ' + JSON.stringify(data.slice(-30)) + '\n' +
      'Tren: ' + trend + ' ' + Math.abs(change).toFixed(2) + '%\n' +
      'Nilai terakhir: ' + lastValue + '\n' +
      'Konteks: ' + context + '\n\n' +
      'Berikan analisis strategis dalam Bahasa Indonesia yang mudah dipahami UMKM:\n\n' +
      '1. TREN UTAMA (2-3 kalimat)\n' +
      '2. RISIKO BAGI UMKM (3 poin bullet)\n' +
      '3. REKOMENDASI STRATEGIS (4 poin bullet dengan emoji)\n' +
      '4. LEVEL KEPERCAYAAN PREDIKSI\n\n' +
      'Gunakan format yang rapi dan actionable. Jangan pakai jargon teknis.';

    // Try BUILT-IN model first (free 500K tokens, no vendor key needed)
    // Model format: @makers/deepseek-v4-flash
    const response = await fetch('https://ai-gateway.edgeone.link/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + MAKERS_MODELS_KEY
      },
      body: JSON.stringify({
        model: '@makers/deepseek-v4-flash',
        messages: [
          { role: 'system', content: 'Anda adalah analis ekonomi untuk UMKM Indonesia. Berikan insight praktis dan actionable.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 800,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error('AI Gateway error ' + response.status + ': ' + errorText);
    }

    const result = await response.json();
    return {
      analysis: result.choices[0].message.content,
      model: 'deepseek-v4-flash (EdgeOne AI)',
      debug: keyStatus + ' | API call SUCCESS'
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('AI Analysis error:', errorMsg);
    return {
      analysis: generateFallbackAnalysis(data, type, context),
      model: 'fallback-sma',
      debug: keyStatus + ' | API call FAILED: ' + errorMsg
    };
  }
}

function generateFallbackAnalysis(data: number[], type: string, context: string): string {
  const lastValue = data[data.length - 1];
  const firstValue = data[0];
  const change = ((lastValue - firstValue) / firstValue) * 100;
  const trend = change > 0 ? 'NAIK' : 'TURUN';

  if (type === 'weather') {
    return '🧠 ANALISIS AI CUACA\n' +
      '═══════════════════════════════════════\n\n' +
      '📊 TREN: ' + trend + ' ' + Math.abs(change).toFixed(1) + '%\n\n' +
      'RISIKO UMKM:\n' +
      '• Cuaca ekstrem bisa ganggu operasional\n' +
      '• Demand barang musiman fluktuatif\n' +
      '• Delivery terganggu saat hujan deras\n\n' +
      'REKOMENDASI:\n' +
      '1. 🌦️ Monitor forecast harian\n' +
      '2. 📦 Stok barang musiman 3-5 hari sebelumnya\n' +
      '3. 🚚 Siapkan delivery backup\n' +
      '4. 💰 Promo cuaca panas/hujan sesuai kondisi';
  }

  if (type === 'fx') {
    let fxRisks: string;
    let fxRec1: string;
    let fxRec2: string;
    if (change > 0) {
      fxRisks = '• Importir: Bahan baku mahal, margin menipis\n• Harga barang import naik 2-3%\n• Pinjaman USD lebih mahal';
      fxRec1 = '🔒 Lock harga dengan supplier';
      fxRec2 = '💱 Hedging dengan forward contract';
    } else {
      fxRisks = '• Exportir: Produk lebih mahal di pasar global\n• Pendapatan export dalam IDR turun\n• Kompetitivitas menurun';
      fxRec1 = '📈 Tingkatkan produksi untuk export';
      fxRec2 = '🌍 Cari pasar baru yang stabil';
    }

    return '🧠 ANALISIS AI KURS USD/IDR\n' +
      '═══════════════════════════════════════\n\n' +
      '📊 TREN: ' + trend + ' ' + Math.abs(change).toFixed(2) + '%\n' +
      '• Saat ini: Rp ' + lastValue.toLocaleString('id-ID') + '\n\n' +
      'RISIKO UMKM:\n' +
      fxRisks + '\n\n' +
      'REKOMENDASI:\n' +
      '1. ' + fxRec1 + '\n' +
      '2. ' + fxRec2 + '\n' +
      '3. 📊 Review pricing strategy mingguan\n' +
      '4. 💵 Siapkan cash buffer 15-20%';
  }

  if (type === 'gold') {
    let goldRisks: string;
    let goldRec1: string;
    let goldRec2: string;
    if (change > 0) {
      goldRisks = '• Toko emas: Restock mahal, margin tertekan\n• Pembeli menunda pembelian\n• Demand perhiasan turun';
      goldRec1 = '💰 JUAL stok lama (untung 8-15%)';
      goldRec2 = '⏰ Tunda restock 1-2 minggu';
    } else {
      goldRisks = '• Toko emas: Stok lama rugi\n• Investor wait-and-see\n• Margin tipis saat rebound';
      goldRec1 = '🪙 BELI stok baru untuk persiapan';
      goldRec2 = '📈 Restock agresif untuk margin';
    }

    return '🧠 ANALISIS AI HARGA EMAS\n' +
      '═══════════════════════════════════════\n\n' +
      '📊 TREN: ' + trend + ' ' + Math.abs(change).toFixed(2) + '%\n' +
      '• Saat ini: $' + lastValue.toFixed(2) + '/oz\n\n' +
      'RISIKO UMKM:\n' +
      goldRisks + '\n\n' +
      'REKOMENDASI:\n' +
      '1. ' + goldRec1 + '\n' +
      '2. ' + goldRec2 + '\n' +
      '3. 💳 Promo cicilan menarik pembeli\n' +
      '4. 📰 Monitor berita geopolitik & kebijakan The Fed';
  }

  return 'Analisis tidak tersedia.';
}

export async function POST(request: Request) {
  try {
    const body: ForecastRequest = await request.json();
    const { type, historicalData, days, context = '', location = 'Indonesia' } = body;

    if (!historicalData || historicalData.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Need at least 2 data points' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const baseValue = historicalData[historicalData.length - 1];
    const volatility = type === 'fx' ? 0.005 : type === 'gold' ? 0.01 : 0.02;
    const forecast = forecastWithSMA(baseValue, days, volatility);
    const confidence = calculateConfidence(historicalData);

    const { analysis, model, debug } = await aiAnalyze(historicalData, type, context, location);

    const response: ForecastResponse = {
      forecast,
      confidence,
      analysis,
      model
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Debug': debug
      }
    });

  } catch (error) {
    console.error('Forecast error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
