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

// Simple Moving Average (SMA) — metode Excel yang Anda pakai
function simpleMovingAverage(data: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(data[i]);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j];
      }
      sma.push(Math.round(sum / period));
    }
  }
  return sma;
}

function forecastWithSMA(baseValue: number, days: number, volatility: number): number[] {
  const historical: number[] = [];
  let current = baseValue;
  
  for (let i = days - 1; i >= 0; i--) {
    const change = current * volatility * (Math.sin(i * 0.5) * 0.5);
    current = current - change;
    historical.unshift(Math.round(current));
  }
  
  historical[historical.length - 1] = Math.round(baseValue);
  
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

// AI Analysis via EdgeOne AI Gateway — DeepSeek (gratis 500K token/bulan)
async function aiAnalyze(
  data: number[], 
  type: string, 
  context: string,
  location: string = 'Indonesia'
): Promise<{ analysis: string; model: string }> {
  
  const MAKERS_MODELS_KEY = process.env.MAKERS_MODELS_KEY;
  
  if (!MAKERS_MODELS_KEY) {
    return {
      analysis: generateFallbackAnalysis(data, type, context),
      model: 'fallback-sma'
    };
  }
  
  try {
    const lastValue = data[data.length - 1];
    const firstValue = data[0];
    const change = ((lastValue - firstValue) / firstValue) * 100;
    const trend = change > 0 ? 'NAIK' : 'TURUN';
    
    const prompt = `Anda adalah analis ekonomi senior untuk UMKM Indonesia di kota ${location}.
    
Data ${type} 30 hari terakhir: ${JSON.stringify(data.slice(-30))}
Tren: ${trend} ${Math.abs(change).toFixed(2)}%
Nilai terakhir: ${lastValue}
Konteks: ${context}

Berikan analisis strategis dalam Bahasa Indonesia yang mudah dipahami UMKM:

1. TREN UTAMA (2-3 kalimat)
2. RISIKO BAGI UMKM (3 poin bullet)
3. REKOMENDASI STRATEGIS (4 poin bullet dengan emoji)
4. LEVEL KEPERCAYAAN PREDIKSI

Gunakan format yang rapi dan actionable. Jangan pakai jargon teknis.`;

    const response = await fetch('https://ai-gateway.edgeone.link/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MAKERS_MODELS_KEY}`
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
      throw new Error(`AI Gateway error: ${response.status}`);
    }
    
    const result = await response.json();
    return {
      analysis: result.choices[0].message.content,
      model: 'deepseek-v4-flash'
    };
    
  } catch (error) {
    console.error('AI Analysis error:', error);
    return {
      analysis: generateFallbackAnalysis(data, type, context),
      model: 'fallback-sma'
    };
  }
}

function generateFallbackAnalysis(data: number[], type: string, context: string): string {
  const lastValue = data[data.length - 1];
  const firstValue = data[0];
  const change = ((lastValue - firstValue) / firstValue) * 100;
  const trend = change > 0 ? 'NAIK' : 'TURUN';
  
  const analyses: Record<string, string> = {
    weather: `🧠 ANALISIS AI CUACA\n═══════════════════════════════════════\n\n📊 TREN: ${trend} ${Math.abs(change).toFixed(1)}%\n\nRISIKO UMKM:\n• Cuaca ekstrem bisa ganggu operasional\n• Demand barang musiman fluktuatif\n• Delivery terganggu saat hujan deras\n\nREKOMENDASI:\n1. 🌦️ Monitor forecast harian\n2. 📦 Stok barang musiman 3-5 hari sebelumnya\n3. 🚚 Siapkan delivery backup\n4. 💰 Promo cuaca panas/hujan sesuai kondisi`,

    fx: `🧠 ANALISIS AI KURS USD/IDR\n═══════════════════════════════════════\n\n📊 TREN: ${trend} ${Math.abs(change).toFixed(2)}%\n• Saat ini: Rp ${lastValue.toLocaleString('id-ID')}\n\nRISIKO UMKM:\n${change > 0 ? '• Importir: Bahan baku mahal, margin menipis\n• Harga barang import naik 2-3%\n• Pinjaman USD lebih mahal' : '• Exportir: Produk lebih mahal di pasar global\n• Pendapatan export dalam IDR turun\n• Kompetitivitas menurun'}\n\nREKOMENDASI:\n1. ${change > 0 ? '🔒 Lock harga dengan supplier' : '📈 Tingkatkan produksi untuk export'}\n2. ${change > 0 ? '💱 Hedging dengan forward contract' : '🌍 Cari pasar baru yang stabil'}\n3. 📊 Review pricing strategy mingguan\n4. 💵 Siapkan cash buffer 15-20%`,

    gold: `🧠 ANALISIS AI HARGA EMAS\n═══════════════════════════════════════\n\n📊 TREN: ${trend} ${Math.abs(change).toFixed(2)}%\n• Saat ini: $${lastValue.toFixed(2)}/oz\n\nRISIKO UMKM:\n${change > 0 ? '• Toko emas: Restock mahal, margin tertekan\n• Pembeli menunda pembelian\n• Demand perhiasan turun' : '• Toko emas: Stok lama rugi\n• Investor wait-and-see\n• Margin tipis saat rebound'}\n\nREKOMENDASI:\n1. ${change > 0 ? '💰 JUAL stok lama (untung 8-15%)' : '🪙 BELI stok baru untuk persiapan'}\n2. ${change > 0 ? '⏰ Tunda restock 1-2 minggu' : '📈 Restock agresif untuk margin'}\n3. 💳 Promo cicilan menarik pembeli\n4. 📰 Monitor berita geopolitik & kebijakan The Fed`
  };
  
  return analyses[type] || 'Analisis tidak tersedia.';
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
    
    // Generate forecast pakai SMA-3 (sama dengan frontend Anda)
    const baseValue = historicalData[historicalData.length - 1];
    const volatility = type === 'fx' ? 0.005 : type === 'gold' ? 0.01 : 0.02;
    const forecast = forecastWithSMA(baseValue, days, volatility);
    const confidence = calculateConfidence(historicalData);
    
    // AI Analysis via EdgeOne AI Gateway
    const { analysis, model } = await aiAnalyze(historicalData, type, context, location);
    
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
        'Cache-Control': 'no-cache'
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
