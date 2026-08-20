// cloud-functions/forecast-ai.ts
// EdgeOne Cloud Function untuk AI Forecasting

interface ForecastRequest {
  type: 'weather' | 'fx' | 'gold';
  historicalData: number[];
  days: number;
  context?: string;
}

interface ForecastResponse {
  forecast: number[];
  confidence: number;
  analysis: string;
}

// Holt-Winters Exponential Smoothing (simplified)
function holtWintersForecast(data: number[], days: number): number[] {
  const alpha = 0.3; // Level smoothing
  const beta = 0.1;  // Trend smoothing
  
  const n = data.length;
  if (n < 2) return Array(days).fill(data[0] || 0);
  
  // Initialize
  let level = data[0];
  let trend = data[1] - data[0];
  
  // Train
  for (let i = 1; i < n; i++) {
    const prevLevel = level;
    level = alpha * data[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  
  // Forecast
  const forecast: number[] = [];
  for (let i = 1; i <= days; i++) {
    forecast.push(level + i * trend);
  }
  
  return forecast;
}

// Confidence calculation based on volatility
function calculateConfidence(data: number[]): number {
  if (data.length < 2) return 0.5;
  
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean; // Coefficient of variation
  
  // Lower CV = higher confidence
  if (cv < 0.01) return 0.95;
  if (cv < 0.02) return 0.85;
  if (cv < 0.05) return 0.75;
  if (cv < 0.1) return 0.65;
  return 0.55;
}

// EdgeOne Built-in Models integration
async function aiAnalyze(data: number[], type: string, context: string): Promise<string> {
  try {
    // Check if EdgeOne AI Models is available
    const modelEndpoint = process.env.EDGEONE_MODEL_ENDPOINT;
    const modelKey = process.env.EDGEONE_MODEL_API_KEY;
    
    if (!modelEndpoint || !modelKey) {
      return generateFallbackAnalysis(data, type, context);
    }
    
    const prompt = `
Anda adalah analis ekonomi senior untuk UMKM Indonesia.
Analisis data ${type} berikut dan berikan insight strategis:

Data 30 hari terakhir: ${JSON.stringify(data.slice(-30))}
Tren: ${data[data.length - 1] > data[0] ? 'NAIK' : 'TURUN'}
Konteks: ${context}

Berikan analisis dalam format:
1. Tren utama (2-3 kalimat)
2. Risiko bagi UMKM (2-3 poin)
3. Rekomendasi strategis (3-4 poin)
4. Level kepercayaan prediksi

Gunakan Bahasa Indonesia yang mudah dipahami UMKM.
`;

    const response = await fetch(modelEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${modelKey}`
      },
      body: JSON.stringify({
        model: 'hunyuan-lite',
        messages: [
          { role: 'system', content: 'Anda adalah analis ekonomi untuk UMKM Indonesia.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 500,
        temperature: 0.7
      })
    });
    
    if (!response.ok) throw new Error('AI Model error');
    
    const result = await response.json();
    return result.choices[0].message.content;
    
  } catch (error) {
    console.error('AI Analysis error:', error);
    return generateFallbackAnalysis(data, type, context);
  }
}

// Fallback analysis kalau AI tidak tersedia
function generateFallbackAnalysis(data: number[], type: string, context: string): string {
  const lastValue = data[data.length - 1];
  const firstValue = data[0];
  const change = ((lastValue - firstValue) / firstValue) * 100;
  const trend = change > 0 ? 'NAIK' : 'TURUN';
  
  const analyses: Record<string, string> = {
    weather: `TREN CUACA: ${trend} ${Math.abs(change).toFixed(1)}%

Analisis:
• Suhu rata-rata menunjukkan tren ${trend.toLowerCase()} selama periode terakhir
• ${change > 0 ? 'Panas berpotensi meningkatkan demand minuman dingin' : 'Hujan berpotensi meningkatkan demand payung & jas hujan'}

Risiko UMKM:
1. Stok barang musiman perlu disesuaikan
2. Delivery bisa terganggu saat hujan deras
3. Demand produk tertentu bisa fluktuatif

Rekomendasi:
1. Monitor forecast harian untuk planning stok
2. Siapkan barang musiman 3-5 hari sebelum event cuaca
3. Pertimbangkan delivery service untuk mitigasi hujan
4. Buat promo "cuaca panas" atau "cuaca hujan" sesuai kondisi`,

    fx: `TREN KURS USD/IDR: ${trend} ${Math.abs(change).toFixed(2)}%

Analisis:
• Kurs saat ini: Rp ${lastValue.toLocaleString('id-ID')}
• Tren ${trend.toLowerCase()} ${Math.abs(change).toFixed(2)}% dari periode sebelumnya

Risiko UMKM:
1. ${change > 0 ? 'Importir: Bahan baku naik, margin menipis' : 'Exportir: Produk lebih mahal di pasar global'}
2. ${change > 0 ? 'Harga barang import naik 2-3%' : 'Pendapatan export dalam IDR turun'}
3. Pinjaman dalam USD menjadi lebih ${change > 0 ? 'mahal' : 'murah'}

Rekomendasi:
1. ${change > 0 ? 'Importir: Lock harga dengan supplier atau cari alternatif lokal' : 'Exportir: Tingkatkan produksi untuk pasar global'}
2. ${change > 0 ? 'Hedging: Pertimbangkan forward contract' : 'Manfaatkan momentum untuk ekspansi'}
3. Review pricing strategy setiap minggu
4. Siapkan cash buffer 15-20% untuk fluktuasi`,

    gold: `TREN HARGA EMAS: ${trend} ${Math.abs(change).toFixed(2)}%

Analisis:
• Harga saat ini: $${lastValue.toFixed(2)}/oz
• Tren ${trend.toLowerCase()} ${Math.abs(change).toFixed(2)}% dari periode sebelumnya

Risiko UMKM:
1. ${change > 0 ? 'Toko emas: Stok lama untung besar, tapi restock mahal' : 'Toko emas: Stok lama rugi, tapi restock murah'}
2. ${change > 0 ? 'Pembeli: Tunda pembelian kalau tidak urgent' : 'Pembeli: Waktu bagus untuk investasi'}
3. Perhiasan: Demand bisa ${change > 0 ? 'turun' : 'naik'} karena harga ${change > 0 ? 'mahal' : 'murah'}

Rekomendasi:
1. ${change > 0 ? 'JUAL stok lama sekarang (untung 8-15%)' : 'BELI stok baru untuk persiapan musim tinggi'}
2. ${change > 0 ? 'Tunda restock 1-2 minggu' : 'Restock agresif untuk margin lebih baik'}
3. Promo cicilan untuk menarik pembeli
4. Monitor geopolitical news (Middle East, Fed policy)`
  };
  
  return analyses[type] || 'Analisis tidak tersedia.';
}

// Main handler
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const body: ForecastRequest = await request.json();
    const { type, historicalData, days, context = '' } = body;
    
    // Validate
    if (!historicalData || historicalData.length < 2) {
      return new Response(JSON.stringify({ 
        error: 'Need at least 2 data points' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Generate forecast
    const forecast = holtWintersForecast(historicalData, days);
    const confidence = calculateConfidence(historicalData);
    
    // AI Analysis
    const analysis = await aiAnalyze(historicalData, type, context);
    
    const response: ForecastResponse = {
      forecast,
      confidence,
      analysis
    };
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600'
      }
    });
    
  } catch (error) {
    console.error('Forecast error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
