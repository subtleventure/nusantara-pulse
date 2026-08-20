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
    analysis += `🪙
