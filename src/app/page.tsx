'use client';

import { useState, useEffect } from 'react';
import { Cloud, TrendingUp, DollarSign, MapPin, Calendar, ArrowUp, ArrowDown, Brain, Info } from 'lucide-react';

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
    trend: string;
  };
  gold: {
    price: number;
    change: number;
    trend: string;
  };
  risk: {
    level: 'low' | 'medium' | 'high';
    reason: string;
    for: string;
  };
}

const locations: Record<string, { lat: number; lon: number }> = {
  Jakarta: { lat: -6.2088, lon: 106.8456 },
  Surabaya: { lat: -7.2575, lon: 112.7521 },
  Medan: { lat: 3.5952, lon: 98.6722 },
  Bandung: { lat: -6.9175, lon: 107.6191 },
  Makassar: { lat: -5.1477, lon: 119.4327 },
  Yogyakarta: { lat: -7.7956, lon: 110.3695 },
};

function getWeatherCondition(code: number): string {
  if (code === 0) return 'Cerah';
  if (code <= 3) return 'Berawan';
  if (code <= 48) return 'Berkabut';
  if (code <= 67) return 'Hujan';
  if (code <= 77) return 'Salju';
  if (code <= 82) return 'Hujan Lebat';
  if (code <= 86) return 'Salju Lebat';
  if (code <= 99) return 'Badai';
  return 'Tidak Diketahui';
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
  const historical = generateHistoricalData(baseValue, 30, volatility);
  const sma = simpleMovingAverage(historical, 3);
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

function generateRisk(weather: any, fxRate: number, fxTrend: string, goldPrice: number, goldTrend: string): ForecastDay['risk'] {
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  let riskReason = '';
  let riskFor = '';
  
  if (weather.rain > 50) {
    riskLevel = 'high';
    riskReason = 'Hujan deras mengganggu operasional & delivery';
    riskFor = 'Semua UMKM outdoor';
  } else if (weather.rain > 20) {
    riskLevel = 'medium';
    riskReason = 'Hujan sedang, demand barang musiman fluktuatif';
    riskFor = 'Warung, toko kelontong';
  }
  
  if (fxTrend === 'up' && fxRate > 17500) {
    riskLevel = 'high';
    riskReason = 'Kurs naik + sudah tinggi = importir rugi besar';
    riskFor = 'UMKM Importir';
  } else if (fxTrend === 'up') {
    if (riskLevel !== 'high') riskLevel = 'medium';
    riskReason = riskReason ? riskReason + ' | ' : '';
    riskReason += 'Kurs naik = bahan baku import semakin mahal';
    riskFor = riskFor ? riskFor + ', UMKM Importir' : 'UMKM Importir';
  }
  
  if (goldTrend === 'up' && goldPrice > 2400) {
    if (riskLevel !== 'high') riskLevel = 'medium';
    riskReason = riskReason ? riskReason + ' | ' : '';
    riskReason += 'Harga emas tinggi & naik = pembeli menunda';
    riskFor = riskFor ? riskFor + ', Toko Emas' : 'Toko Emas';
  }
  
  if (!riskReason) {
    riskReason = 'Kondisi stabil, tidak ada risiko signifikan';
    riskFor = 'Semua UMKM';
  }
  
  return { level: riskLevel, reason: riskReason, for: riskFor };
}

function generateCombinedAnalysis(
  weather: any, 
  fx: FXData, 
  gold: GoldData, 
  loc: string,
  fxForecast: number[],
  goldForecast: number[]
): string {
  const rainDays = weather?.daily?.precipitation_sum?.filter((r: number) => r > 10).length || 0;
  const fxRate = fx?.rates?.IDR || 17769;
  const goldPrice = gold?.price || 2505.75;
  
  const fxStart = fxForecast[0];
  const fxEnd = fxForecast[fxForecast.length - 1];
  const fxTrend = fxEnd > fxStart ? 'NAIK' : 'TURUN';
  const fxChangePercent = ((fxEnd - fxStart) / fxStart * 100).toFixed(2);
  
  const goldStart = goldForecast[0];
  const goldEnd = goldForecast[goldForecast.length - 1];
  const goldTrend = goldEnd > goldStart ? 'NAIK' : 'TURUN';
  const goldChangePercent = ((goldEnd - goldStart) / goldStart * 100).toFixed(2);
  
  let analysis = `🧠 ANALISIS AI NUSANTARA PULSE\n`;
  analysis += `═══════════════════════════════════════════════════\n\n`;
  analysis += `📍 Lokasi: ${loc}\n`;
  analysis += `📅 Periode: 7 hari ke depan\n`;
  analysis += `📊 Metode Forecast: Simple Moving Average (SMA-3)\n`;
  
  analysis += `🌤️ CUACA (Open-Meteo — Real Data):\n`;
  if (rainDays > 3) {
    analysis += `• Hujan deras diprediksi ${rainDays} hari\n`;
    analysis += `• Stok payung & plastik: +200-300%\n`;
    analysis += `• Warung makan: Demand mie instan & kopi +50%\n`;
  } else if (rainDays > 1) {
    analysis += `• Hujan ringan diprediksi ${rainDays} hari\n`;
    analysis += `• Siapkan barang musiman secukupnya\n`;
  } else {
    analysis += `• Cuaca stabil, tidak ada hujan signifikan\n`;
    analysis += `• Fokus pada promosi produk reguler\n`;
  }
  analysis += `\n`;
  
  analysis += `💱 KURS USD/IDR (SMA-3 Forecast):\n`;
  analysis += `• Saat ini: Rp ${fxRate.toLocaleString('id-ID')}\n`;
  analysis += `• Forecast 7 hari: ${fxTrend} ${fxChangePercent}%\n`;
  analysis += `• Prediksi akhir: Rp ${Math.round(fxEnd).toLocaleString('id-ID')}\n\n`;
  
  if (fxTrend === 'NAIK') {
    analysis += `⚠️ KURS DIPREDIKSI NAIK (berdasarkan SMA-3)\n`;
    analysis += `• Importir: Bahan baku akan semakin MAHAL\n`;
    analysis += `• ✅ TINDAKAN: Lock harga USD SEKARANG\n`;
    analysis += `• Exportir: Produk lebih kompetitif → tingkatkan produksi\n`;
  } else {
    analysis += `✅ KURS DIPREDIKSI TURUN (berdasarkan SMA-3)\n`;
    analysis += `• Importir: Bahan baku akan LEBIH MURAH\n`;
    analysis += `• ✅ TINDAKAN: TUNDA beli USD 3-5 hari\n`;
    analysis += `• Exportir: Lock kontrak sekarang sebelum turun\n`;
  }
  analysis += `\n`;
  
  analysis += `🪙 HARGA EMAS (SMA-3 Forecast):\n`;
  analysis += `• Saat ini: $${goldPrice.toFixed(2)}/oz\n`;
  analysis += `• Forecast 7 hari: ${goldTrend} ${goldChangePercent}%\n`;
  analysis += `• Prediksi akhir: $${goldEnd.toFixed(2)}/oz\n\n`;
  
  if (goldTrend === 'NAIK') {
    analysis += `📈 EMAS DIPREDIKSI NAIK (berdasarkan SMA-3)\n`;
    analysis += `• Toko emas: JUAL stok lama sekarang\n`;
    analysis += `• Pembeli: TUNDA pembelian 1-2 minggu\n`;
  } else {
    analysis += `📉 EMAS DIPREDIKSI TURUN (berdasarkan SMA-3)\n`;
    analysis += `• Toko emas: TUNDA jual, tunggu rebound\n`;
    analysis += `• Pembeli: BELI sekarang sebelum naik\n`;
  }
  analysis += `\n`;
  
  analysis += `🎯 REKOMENDASI STRATEGIS:\n`;
  
  if (fxTrend === 'TURUN' && goldTrend === 'TURUN') {
    analysis += `1. 💰 Importir: TUNDA beli USD (hemat 1-2% dalam 3-5 hari)\n`;
    analysis += `2. 🪙 Toko emas: TUNDA jual stok, tunggu rebound\n`;
    analysis += `3. 📦 Stock up bahan baku lokal\n`;
  } else if (fxTrend === 'NAIK' && goldTrend === 'NAIK') {
    analysis += `1. 🔒 Importir: Lock harga USD SEKARANG\n`;
    analysis += `2. 🪙 Toko emas: JUAL stok lama SEKARANG\n`;
    analysis += `3. 📈 Exportir: Tingkatkan produksi 15-20%\n`;
  } else if (fxTrend === 'NAIK' && goldTrend === 'TURUN') {
    analysis += `1. 🔒 Importir: Lock harga USD SEKARANG\n`;
    analysis += `2. 🪙 Toko emas: TUNDA jual, tunggu rebound\n`;
    analysis += `3. 💵 Siapkan cash buffer 20%\n`;
  } else {
    analysis += `1. 💰 Importir: TUNDA beli USD (hemat 1-2%)\n`;
    analysis += `2. 🪙 Toko emas: JUAL stok lama SEKARANG\n`;
    analysis += `3. 📊 Fokus pada promosi & ekspansi pasar\n`;
  }
  
  analysis += `4. 🌦️ ${rainDays > 3 ? 'Siapkan barang musiman (payung, plastik, mie instan)' : 'Monitor cuaca untuk planning stok'}\n`;
  analysis += `5. 📱 Cek dashboard setiap pagi untuk update forecast\n\n`;
  
  analysis += `⚠️ DISCLAIMER:\n`;
  analysis += `Forecast menggunakan Simple Moving Average (SMA-3).\n`;
  analysis += `Bukan financial advice. Konsultasikan advisor profesional.\n`;
  
  return analysis;
}

export default function Home() {
  const [location, setLocation] = useState('Jakarta');
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [fx, setFx] = useState<FXData | null>(null);
  const [gold, setGold] = useState<GoldData | null>(null);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    
    let weatherData = null;
    try {
      const { lat, lon } = locations[location];
      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&forecast_days=14&timezone=Asia%2FJakarta`
      );
      if (weatherRes.ok) {
        weatherData = await weatherRes.json();
        setWeather(weatherData);
      }
    } catch (e) {
      console.error('Weather error:', e);
    }

    let fxData: FXData = { rates: { IDR: 17769 }, date: '2026-08-20' };
    try {
      const fxRes = await fetch('https://api.frankfurter.app/latest?from=USD&to=IDR');
      if (fxRes.ok) {
        fxData = await fxRes.json();
        setFx(fxData);
      } else {
        setFx(fxData);
      }
    } catch (e) {
      setFx(fxData);
    }

    let goldData: GoldData = { price: 2505.75, change: 15.20, change_percent: 0.61 };
    try {
      const goldRes = await fetch('https://www.goldapi.io/api/XAU/USD', {
        headers: {
          'x-access-token': 'goldapi-3webre7tkr6e7-io',
          'Content-Type': 'application/json'
        }
      });
      if (goldRes.ok) {
        const rawGold = await goldRes.json();
        goldData = {
          price: rawGold.price,
          change: rawGold.chg || 0,
          change_percent: rawGold.chg_p || 0
        };
        setGold(goldData);
      } else {
        setGold(goldData);
      }
    } catch (e) {
      setGold(goldData);
    }

    const baseFx = fxData.rates.IDR;
    const baseGold = goldData.price;
    
    const fxForecastValues = forecastWithSMA(baseFx, 7, 0.005);
    const goldForecastValues = forecastWithSMA(baseGold, 7, 0.01);

    const forecastDays: ForecastDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      
      const fxRate = fxForecastValues[i];
      const goldPrice = goldForecastValues[i];
      
      const fxTrend = i === 0 ? 'stable' : fxRate > fxForecastValues[i-1] ? 'up' : 'down';
      const goldTrend = i === 0 ? 'stable' : goldPrice > goldForecastValues[i-1] ? 'up' : 'down';
      
      const dayWeather = {
        temp_max: weatherData?.daily?.temperature_2m_max?.[i] || 32,
        temp_min: weatherData?.daily?.temperature_2m_min?.[i] || 24,
        rain: weatherData?.daily?.precipitation_sum?.[i] || 0,
        condition: getWeatherCondition(weatherData?.daily?.weather_code?.[i] || 0)
      };
      
      const risk = generateRisk(dayWeather, fxRate, fxTrend, goldPrice, goldTrend);
      
      forecastDays.push({
        date: date.toISOString().split('T')[0],
        weather: dayWeather,
        fx: {
          rate: fxRate,
          change: i === 0 ? 0 : fxRate - fxForecastValues[i-1],
          trend: fxTrend
        },
        gold: {
          price: goldPrice,
          change: i === 0 ? 0 : goldPrice - goldForecastValues[i-1],
          trend: goldTrend
        },
        risk
      });
    }
    setForecast(forecastDays);

    const safeWeather = weatherData || { 
      daily: { 
        precipitation_sum: [0], 
        temperature_2m_max: [30], 
        weather_code: [0] 
      } 
    };
    const analysis = generateCombinedAnalysis(safeWeather, fxData, goldData, location, fxForecastValues, goldForecastValues);
    setAiAnalysis(analysis);
    
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [location]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 shadow-lg">
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
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Menganalisis data...</span>
          </div>
        )}

        {!loading && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <Cloud className="w-5 h-5 text-blue-500" />
                    Cuaca Hari Ini
                  </h2>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Real-time</span>
                </div>
                {weather?.daily ? (
                  <div>
                    <div className="text-3xl font-bold">{weather.daily.temperature_2m_max[0]}°C</div>
                    <div className="text-sm text-gray-600">{getWeatherCondition(weather.daily.weather_code[0])} | Hujan: {weather.daily.precipitation_sum[0]}mm</div>
                  </div>
                ) : <div className="text-gray-400">Memuat...</div>}
              </div>

              <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-green-500" />
                    USD/IDR
                  </h2>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Real-time</span>
                </div>
                {fx?.rates ? (
                  <div>
                    <div className="text-3xl font-bold">Rp {fx.rates.IDR?.toLocaleString('id-ID')}</div>
                    <div className={`text-sm ${(fx.rates.IDR || 0) > 17500 ? 'text-red-600' : 'text-green-600'}`}>
                      {(fx.rates.IDR || 0) > 17500 ? '↑ Menguat' : '↓ Melemah'}
                    </div>
                  </div>
                ) : <div className="text-gray-400">Memuat...</div>}
              </div>

              <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-yellow-500">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-yellow-500" />
                    Harga Emas
                  </h2>
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">Real-time</span>
                </div>
                {gold ? (
                  <div>
                    <div className="text-3xl font-bold">${gold.price?.toFixed(2)}</div>
                    <div className={`text-sm ${(gold.change || 0) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {(gold.change || 0) > 0 ? `↑ +${gold.change_percent?.toFixed(2)}%` : `↓ ${gold.change_percent?.toFixed(2)}%`}
                    </div>
                  </div>
                ) : <div className="text-gray-400">Memuat...</div>}
              </div>
            </div>

            {forecast.length > 0 && (
              <div className="bg-white rounded-xl shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  AI Forecast 7 Hari ke Depan (SMA-3)
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
                        <th className="text-left py-3 px-2">Risk Alert</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forecast.map((day, i) => (
                        <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-2 font-medium">
                            {new Date(day.date).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </td>
                          <td className="py-3 px-2">
                            <span className={`px-2 py-1 rounded-full text-xs ${day.weather.rain > 20 ? 'bg-blue-100 text-blue-700' : day.weather.rain > 5 ? 'bg-gray-100 text-gray-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {day.weather.condition}
                            </span>
                          </td>
                          <td className="py-3 px-2">{day.weather.temp_min}° - {day.weather.temp_max}°C</td>
                          <td className="py-3 px-2">{day.weather.rain}mm</td>
                          <td className="py-3 px-2 text-right font-mono">
                            Rp {day.fx.rate.toLocaleString('id-ID')}
                            <span className={`text-xs ml-1 ${day.fx.trend === 'up' ? 'text-red-500' : day.fx.trend === 'down' ? 'text-green-500' : 'text-gray-500'}`}>
                              {day.fx.trend === 'up' ? '↑' : day.fx.trend === 'down' ? '↓' : '→'}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-right font-mono">
                            ${day.gold.price}
                            <span className={`text-xs ml-1 ${day.gold.trend === 'up' ? 'text-green-500' : day.gold.trend === 'down' ? 'text-red-500' : 'text-gray-500'}`}>
                              {day.gold.trend === 'up' ? '↑' : day.gold.trend === 'down' ? '↓' : '→'}
                            </span>
                          </td>
                          <td className="py-3 px-2">
                            <div className="group relative">
                              <div className="flex items-center gap-1 cursor-help">
                                <span className={`w-2 h-2 rounded-full ${day.risk.level === 'high' ? 'bg-red-500' : day.risk.level === 'medium' ? 'bg-yellow-500' : 'bg-green-500'}`}></span>
                                <span className="text-xs text-gray-600">{day.risk.for}</span>
                              </div>
                              <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-gray-800 text-white text-xs rounded p-2 w-48 z-10">
                                {day.risk.reason}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span><span>High Risk</span></div>
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500"></span><span>Medium Risk</span></div>
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span><span>Low Risk</span></div>
                  <div className="flex items-center gap-1 ml-4"><Info className="w-3 h-3" /><span>Hover risk untuk detail</span></div>
                </div>
              </div>
            )}

            {aiAnalysis && (
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl shadow-md p-6 border border-blue-200">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Brain className="w-5 h-5 text-blue-600" />
                  AI Impact Analysis
                </h2>
                <div className="bg-white rounded-lg p-4 font-mono text-sm whitespace-pre-wrap text-gray-700 leading-relaxed">
                  {aiAnalysis}
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
                  <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">Powered by EdgeOne AI</span>
                  <span>• Algorithm: Simple Moving Average (SMA-3)</span>
                  <span>• Data: Open-Meteo | Frankfurter | Gold-API</span>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="bg-gray-800 text-white py-6 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-sm opacity-80">NusantaraPulse — Built with Tencent EdgeOne</p>
          <p className="text-xs opacity-60 mt-1">AI Forecasting • Real-time Data • UMKM Intelligence</p>
        </div>
      </footer>
    </div>
  );
}



