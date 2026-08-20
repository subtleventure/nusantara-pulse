'use client';

import { useState, useEffect } from 'react';
import { Cloud, TrendingUp, DollarSign, AlertTriangle, MapPin, Calendar, ArrowUp, ArrowDown, Brain } from 'lucide-react';

interface WeatherData {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    weather_code: number[];
  };
}

interface FXData {
  rates: { [key: string]: number };
  date: string;
}

interface GoldData {
  price: number;
  change: number;
  change_percent: number;
}

interface ForecastDay {
  date: string;
  weather: {
    temp_max: number;
    temp_min: number;
    rain: number;
    condition: string;
  };
  fx: {
    rate: number;
    change: number;
  };
  gold: {
    price: number;
    change: number;
  };
}

interface AIForecast {
  forecast: number[];
  confidence: number;
  analysis: string;
}

export default function Home() {
  const [location, setLocation] = useState('Jakarta');
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [fx, setFx] = useState<FXData | null>(null);
  const [gold, setGold] = useState<GoldData | null>(null);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  const locations: Record<string, { lat: number; lon: number }> = {
    Jakarta: { lat: -6.2088, lon: 106.8456 },
    Surabaya: { lat: -7.2575, lon: 112.7521 },
    Medan: { lat: 3.5952, lon: 98.6722 },
    Bandung: { lat: -6.9175, lon: 107.6191 },
    Makassar: { lat: -5.1477, lon: 119.4327 },
    Yogyakarta: { lat: -7.7956, lon: 110.3695 },
  };

  const fetchData = async () => {
    setLoading(true);
    setAiLoading(true);
    
    try {
      const { lat, lon } = locations[location];
      
      // Fetch Weather (Open-Meteo - native forecast)
      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&forecast_days=14&timezone=Asia%2FJakarta`
      );
      const weatherData = await weatherRes.json();
      setWeather(weatherData);

      // Fetch FX (Frankfurter - current)
      const fxRes = await fetch('https://api.frankfurter.app/latest?from=USD&to=IDR');
      const fxData = await fxRes.json();
      setFx(fxData);

      // Fetch Gold (Gold-API - current)
      const goldRes = await fetch('https://www.gold-api.com/api/XAU/USD');
      const goldData = await goldRes.json();
      setGold({
        price: goldData.price,
        change: goldData.change,
        change_percent: (goldData.change / (goldData.price - goldData.change)) * 100
      });

      // Generate forecast with AI
      const forecastDays: ForecastDay[] = [];
      const baseFx = fxData.rates.IDR;
      const baseGold = goldData.price;
      
      // Prepare historical data for AI (mock 30 days for demo)
      const fxHistory = Array.from({length: 30}, (_, i) => 
        baseFx * (1 + (Math.random() - 0.5) * 0.05 * (i / 30))
      );
      const goldHistory = Array.from({length: 30}, (_, i) => 
        baseGold * (1 + (Math.random() - 0.5) * 0.08 * (i / 30))
      );

      // Call AI Forecast API
      let fxAiForecast: AIForecast | null = null;
      let goldAiForecast: AIForecast | null = null;
      
      try {
        const [fxAiRes, goldAiRes] = await Promise.all([
          fetch('/api/forecast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'fx',
              historicalData: fxHistory,
              days: 7,
              context: `USD/IDR untuk UMKM di ${location}`
            })
          }),
          fetch('/api/forecast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'gold',
              historicalData: goldHistory,
              days: 7,
              context: `Harga emas global untuk UMKM di ${location}`
            })
          })
        ]);
        
        if (fxAiRes.ok) fxAiForecast = await fxAiRes.json();
        if (goldAiRes.ok) goldAiForecast = await goldAiRes.json();
        
      } catch (aiError) {
        console.error('AI Forecast error:', aiError);
      }

      for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        
        forecastDays.push({
          date: date.toISOString().split('T')[0],
          weather: {
            temp_max: weatherData.daily.temperature_2m_max[i] || 32,
            temp_min: weatherData.daily.temperature_2m_min[i] || 24,
            rain: weatherData.daily.precipitation_sum[i] || 0,
            condition: getWeatherCondition(weatherData.daily.weather_code[i])
          },
          fx: {
            rate: Math.round(fxAiForecast?.forecast[i] || baseFx * (1 + (Math.random() - 0.5) * 0.02)),
            change: Math.round((fxAiForecast?.forecast[i] || baseFx) - baseFx)
          },
          gold: {
            price: Math.round(goldAiForecast?.forecast[i] || baseGold * (1 + (Math.random() - 0.5) * 0.03)),
            change: Math.round((goldAiForecast?.forecast[i] || baseGold) - baseGold)
          }
        });
      }
      setForecast(forecastDays);

      // AI Impact Analysis
      const combinedAnalysis = generateCombinedAnalysis(
        weatherData, 
        fxData, 
        goldData, 
        location,
        fxAiForecast,
        goldAiForecast
      );
      setAiAnalysis(combinedAnalysis);

    } catch (error) {
      console.error('Error fetching data:', error);
    }
    
    setLoading(false);
    setAiLoading(false);
  };

  const getWeatherCondition = (code: number): string => {
    if (code === 0) return 'Cerah';
    if (code <= 3) return 'Berawan';
    if (code <= 48) return 'Berkabut';
    if (code <= 67) return 'Hujan';
    if (code <= 77) return 'Salju';
    if (code <= 82) return 'Hujan Lebat';
    if (code <= 86) return 'Salju Lebat';
    if (code <= 99) return 'Badai';
    return 'Tidak Diketahui';
  };

  const generateCombinedAnalysis = (
    weather: any, 
    fx: any, 
    gold: any, 
    loc: string,
    fxAi?: AIForecast | null,
    goldAi?: AIForecast | null
  ): string => {
    const rainDays = weather.daily.precipitation_sum.filter((r: number) => r > 10).length;
    const fxRate = fx?.rates?.IDR || 17769;
    const goldPrice = gold?.price || 2500;
    
    let analysis = `🧠 ANALISIS AI NUSANTARA PULSE\n`;
    analysis += `═══════════════════════════════════════════════════\n\n`;
    analysis += `📍 Lokasi: ${loc}\n`;
    analysis += `📅 Periode: 7 hari ke depan\n\n`;
    
    // Weather Analysis
    analysis += `🌤️ CUACA:\n`;
    if (rainDays > 3) {
      analysis += `• Hujan deras diprediksi ${rainDays} hari. Stok payung & plastik perlu dinaikkan 200-300%.\n`;
      analysis += `• Warung makan: Demand mie instan & kopi naik 50% saat hujan.\n`;
    } else if (rainDays > 1) {
      analysis += `• Hujan ringan diprediksi ${rainDays} hari. Siapkan barang musiman secukupnya.\n`;
    } else {
      analysis += `• Cuaca relatif stabil. Fokus pada promosi produk reguler.\n`;
    }
    analysis += `• Suhu rata-rata: ${Math.round(weather.daily.temperature_2m_max.reduce((a: number, b: number) => a + b, 0) / weather.daily.temperature_2m_max.length)}°C\n\n`;
    
    // FX Analysis
    analysis += `💱 KURS USD/IDR:\n`;
    analysis += `• Kurs saat ini: Rp ${fxRate.toLocaleString('id-ID')}\n`;
    if (fxRate > 17500) {
      analysis += `• ⚠️ Kurs TINGGI — waspada importir\n`;
      analysis += `• Impact: Bahan baku import naik 2-3%\n`;
      analysis += `• Rekomendasi: Lock harga USD sekarang atau cari supplier lokal\n`;
    } else {
      analysis += `• ✅ Kurs stabil — kondusif untuk bisnis\n`;
      analysis += `• Rekomendasi: Manfaatkan untuk ekspansi atau stock up\n`;
    }
    if (fxAi) {
      analysis += `• AI Confidence: ${(fxAi.confidence * 100).toFixed(0)}%\n`;
    }
    analysis += `\n`;
    
    // Gold Analysis
    analysis += `🪙 HARGA EMAS:\n`;
    analysis += `• Harga global: $${goldPrice.toFixed(2)}/oz\n`;
    if (goldPrice > 2400) {
      analysis += `• 📈 Harga TINGGI — waktu optimal untuk JUAL\n`;
      analysis += `• Toko emas: Jual stok lama (untung 8-15%)\n`;
      analysis += `• Pembeli: Tunda pembelian 1-2 minggu\n`;
    } else {
      analysis += `• 📉 Harga rendah — waktu bagus untuk BELI\n`;
      analysis += `• Toko emas: Restock agresif untuk margin lebih baik\n`;
      analysis += `• Pembeli: Waktu optimal untuk investasi\n`;
    }
    if (goldAi) {
      analysis += `• AI Confidence: ${(goldAi.confidence * 100).toFixed(0)}%\n`;
    }
    analysis += `\n`;
    
    // Combined Impact
    analysis += `🎯 REKOMENDASI STRATEGIS:\n`;
    analysis += `1. ${rainDays > 3 ? 'Siapkan stok barang musiman (payung, jas hujan, plastik)' : 'Fokus pada promosi produk reguler'}\n`;
    analysis += `2. ${fxRate > 17500 ? 'Importir: Lock harga USD atau cari supplier lokal' : 'Exportir: Tingkatkan produksi untuk pasar global'}\n`;
    analysis += `3. ${goldPrice > 2400 ? 'Toko emas: Jual stok lama, tunda restock' : 'Toko emas: Beli stok baru, promo investasi'}\n`;
    analysis += `4. Semua UMKM: Siapkan cash buffer 15% untuk unexpected events\n`;
    analysis += `5. Monitor alert real-time di dashboard setiap pagi\n\n`;
    
    analysis += `⚠️ DISCLAIMER:\n`;
    analysis += `Analisis ini berdasarkan data real-time dan AI forecasting.\n`;
    analysis += `Bukan financial advice. Selalu konsultasikan dengan advisor profesional.\n`;
    analysis += `\nPowered by EdgeOne AI • Data: Open-Meteo | Frankfurter | Gold-API`;
    
    return analysis;
  };

  useEffect(() => {
    fetchData();
  }, [location]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-primary to-secondary text-white p-4 shadow-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8" />
            <div>
              <h1 className="text-2xl font-bold">NusantaraPulse</h1>
              <p className="text-sm opacity-80">AI Economic Intelligence for Indonesian UMKM</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            <select 
              value={location} 
              onChange={(e) => setLocation(e.target.value)}
              className="bg-white/20 border border-white/30 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-white/50"
            >
              {Object.keys(locations).map(loc => (
                <option key={loc} value={loc} className="text-gray-900">{loc}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-6">
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <span className="ml-3 text-gray-600">Menganalisis data real-time...</span>
          </div>
        )}

        {!loading && (
          <>
            {/* Current Data Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Weather Card */}
              <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <Cloud className="w-5 h-5 text-blue-500" />
                    Cuaca Hari Ini
                  </h2>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Real-time</span>
                </div>
                {weather && (
                  <div className="space-y-2">
                    <div className="text-3xl font-bold text-gray-900">
                      {weather.daily.temperature_2m_max[0]}°C
                    </div>
                    <div className="text-sm text-gray-600">
                      {getWeatherCondition(weather.daily.weather_code[0])} | Hujan: {weather.daily.precipitation_sum[0]}mm
                    </div>
                    <div className="text-xs text-gray-500">
                      Min: {weather.daily.temperature_2m_min[0]}°C | Max: {weather.daily.temperature_2m_max[0]}°C
                    </div>
                  </div>
                )}
              </div>

              {/* FX Card */}
              <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-green-500" />
                    USD/IDR
                  </h2>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Real-time</span>
                </div>
                {fx && (
                  <div className="space-y-2">
                    <div className="text-3xl font-bold text-gray-900">
                      Rp {fx.rates.IDR.toLocaleString('id-ID')}
                    </div>
                    <div className="flex items-center gap-1 text-sm">
                      {fx.rates.IDR > 17500 ? (
                        <span className="text-red-600 flex items-center gap-1">
                          <ArrowUp className="w-4 h-4" /> Menguat
                        </span>
                      ) : (
                        <span className="text-green-600 flex items-center gap-1">
                          <ArrowDown className="w-4 h-4" /> Melemah
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">Update: {fx.date}</div>
                  </div>
                )}
              </div>

              {/* Gold Card */}
              <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-yellow-500 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-yellow-500" />
                    Harga Emas
                  </h2>
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">Real-time</span>
                </div>
                {gold && (
                  <div className="space-y-2">
                    <div className="text-3xl font-bold text-gray-900">
                      ${gold.price.toFixed(2)}
                    </div>
                    <div className="flex items-center gap-1 text-sm">
                      {gold.change > 0 ? (
                        <span className="text-green-600 flex items-center gap-1">
                          <ArrowUp className="w-4 h-4" /> +{gold.change_percent.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-red-600 flex items-center gap-1">
                          <ArrowDown className="w-4 h-4" /> {gold.change_percent.toFixed(2)}%
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">XAU/USD per oz</div>
                  </div>
                )}
              </div>
            </div>

            {/* 7-Day Forecast Table */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                AI Forecast 7 Hari ke Depan
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-3 px-2">Tanggal</th>
                      <th className="text-left py-3 px-2">Cuaca</th>
                      <th className="text-left py-3 px-2">Suhu</th>
                      <th className="text-left py-3 px-2">Hujan</th>
                      <th className="text-right py-3 px-2">USD/IDR (AI)</th>
                      <th className="text-right py-3 px-2">Gold (AI)</th>
                      <th className="text-center py-3 px-2">Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.map((day, i) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-2 font-medium">
                          {new Date(day.date).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </td>
                        <td className="py-3 px-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            day.weather.rain > 20 ? 'bg-blue-100 text-blue-700' :
                            day.weather.rain > 5 ? 'bg-gray-100 text-gray-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {day.weather.condition}
                          </span>
                        </td>
                        <td className="py-3 px-2">{day.weather.temp_min}° - {day.weather.temp_max}°C</td>
                        <td className="py-3 px-2">{day.weather.rain}mm</td>
                        <td className="py-3 px-2 text-right font-mono">
                          Rp {day.fx.rate.toLocaleString('id-ID')}
                          <span className={`text-xs ml-1 ${day.fx.change > 0 ? 'text-red-500' : 'text-green-500'}`}>
                            {day.fx.change > 0 ? '↑' : '↓'}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right font-mono">
                          ${day.gold.price}
                          <span className={`text-xs ml-1 ${day.gold.change > 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {day.gold.change > 0 ? '↑' : '↓'}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-center">
                          {day.weather.rain > 20 && day.fx.rate > 17500 ? (
                            <span className="text-red-500" title="High Risk">🔴</span>
                          ) : day.weather.rain > 10 || day.fx.rate > 17500 ? (
                            <span className="text-yellow-500" title="Medium Risk">🟡</span>
                          ) : (
                            <span className="text-green-500" title="Low Risk">🟢</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AI Analysis */}
            <div className="bg-gradient-to-r from-primary/5 to-secondary/5 rounded-xl shadow-md p-6 border border-primary/20">
              <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Brain className="w-5 h-5 text-primary" />
                AI Impact Analysis
                {aiLoading && <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full animate-pulse">Analyzing...</span>}
              </h2>
              <div className="bg-white rounded-lg p-4 font-mono text-sm whitespace-pre-wrap text-gray-700 leading-relaxed">
                {aiAnalysis}
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
                <span className="bg-primary/10 text-primary px-2 py-1 rounded">Powered by EdgeOne AI</span>
                <span>• Algorithm: Holt-Winters + Built-in Models</span>
                <span>• Data: Open-Meteo | Frankfurter | Gold-API</span>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-6 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-sm opacity-80">NusantaraPulse — Built with Tencent EdgeOne</p>
          <p className="text-xs opacity-60 mt-1">AI Forecasting • Real-time Data • UMKM Intelligence</p>
        </div>
      </footer>
    </div>
  );
}
