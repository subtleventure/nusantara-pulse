'use client';

import { useState, useEffect } from 'react';

interface WeatherDay {
  date: string;
  tempMax: number;
  rain: number;
  condition: string;
}

interface ForecastData {
  weather: {
    rainDays: number;
    tempMax: number;
    condition: string;
  };
  fx: {
    current: number;
    forecastStart: number;
    forecastEnd: number;
    trend: string;
  };
  gold: {
    current: number;
    forecastStart: number;
    forecastEnd: number;
    trend: string;
  };
}

const weatherCodes: Record<number, string> = {
  0: 'Cerah', 1: 'Cerah Berawan', 2: 'Berawan', 3: 'Mendung',
  45: 'Berkabut', 48: 'Berkabut', 51: 'Gerimis', 53: 'Gerimis',
  55: 'Gerimis', 61: 'Hujan Ringan', 63: 'Hujan', 65: 'Hujan Lebat',
  80: 'Hujan Ringan', 81: 'Hujan', 82: 'Hujan Lebat', 95: 'Badai',
  96: 'Badai Petir', 99: 'Badai Petir'
};

export default function Home() {
  const [location, setLocation] = useState('Jakarta');
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');
  const [weatherDays, setWeatherDays] = useState<WeatherDay[]>([]);
  const [fxCurrent, setFxCurrent] = useState(0);
  const [goldCurrent, setGoldCurrent] = useState(0);
  const [aiRecs, setAiRecs] = useState('');
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    fetchAllData();
  }, []);

  async function fetchAllData() {
    setLoading(true);
    setError('');
    try {
      // Fetch semua data via proxy API (fix CORS)
      const res = await fetch('/api/proxy-data');
      if (!res.ok) throw new Error('Gagal fetch data');
      const data = await res.json();

      // Parse Weather
      const daily = data.weather.daily;
      const days: WeatherDay[] = [];
      let rainDays = 0;
      let maxTemp = 0;
      for (let i = 0; i < 7; i++) {
        const code = daily.weather_code[i];
        const rain = daily.precipitation_sum[i] || 0;
        const temp = daily.temperature_2m_max[i];
        if (rain > 0) rainDays++;
        if (temp > maxTemp) maxTemp = temp;
        days.push({
          date: daily.time[i],
          tempMax: temp,
          rain: rain,
          condition: weatherCodes[code] || 'Tidak Diketahui'
        });
      }
      setWeatherDays(days);

      // Parse FX
      const fxRate = data.fx.rates?.IDR || 15800;
      setFxCurrent(fxRate);

      // Parse Gold
      const goldPrice = data.gold.price || 2400;
      setGoldCurrent(goldPrice);

      // Hitung SMA-3 untuk data awal (sebelum AI)
      const fxSMA = calculateSMA([fxRate, fxRate * 0.995, fxRate * 1.005]);
      const goldSMA = calculateSMA([goldPrice, goldPrice * 0.99, goldPrice * 1.01]);

      // Kirim ke AI
      const forecastData: ForecastData = {
        weather: {
          rainDays,
          tempMax: maxTemp,
          condition: days[0].condition
        },
        fx: {
          current: fxRate,
          forecastStart: fxRate,
          forecastEnd: fxSMA,
          trend: fxSMA > fxRate ? 'NAIK' : 'TURUN'
        },
        gold: {
          current: goldPrice,
          forecastStart: goldPrice,
          forecastEnd: goldSMA,
          trend: goldSMA > goldPrice ? 'NAIK' : 'TURUN'
        }
      };

      await fetchAIRecommendations(forecastData, location);

    } catch (err: any) {
      setError('Gagal memuat data: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  function calculateSMA(values: number[]): number {
    const sum = values.reduce((a, b) => a + b, 0);
    return sum / values.length;
  }

  async function fetchAIRecommendations(data: ForecastData, loc: string) {
    setAiLoading(true);
    setAiError('');
    try {
      const res = await fetch('/api/ai-recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, location: loc })
      });
      const result = await res.json();
      if (result.recommendations) {
        setAiRecs(result.recommendations);
      } else {
        setAiError('AI tidak memberikan rekomendasi');
      }
    } catch (err: any) {
      setAiError('Gagal memuat AI: ' + err.message);
    } finally {
      setAiLoading(false);
    }
  }

  function handleLocationChange() {
    fetchAllData();
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Arial' }}>
        <h1>Memuat data...</h1>
        <p>Mohon tunggu sebentar</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Arial', color: 'red' }}>
        <h1>Error</h1>
        <p>{error}</p>
        <button onClick={fetchAllData}>Coba Lagi</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, fontFamily: 'Arial', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center' }}>NusantaraPulse</h1>
      <p style={{ textAlign: 'center', color: '#666' }}>Dashboard UMKM Indonesia</p>

      {/* Location Selector */}
      <div style={{ marginBottom: 20, textAlign: 'center' }}>
        <label>Lokasi: </label>
        <select 
          value={location} 
          onChange={(e) => setLocation(e.target.value)}
          style={{ padding: 8, fontSize: 16 }}
        >
          <option value="Jakarta">Jakarta</option>
          <option value="Surabaya">Surabaya</option>
          <option value="Bandung">Bandung</option>
          <option value="Medan">Medan</option>
          <option value="Makassar">Makassar</option>
        </select>
        <button 
          onClick={handleLocationChange}
          style={{ marginLeft: 10, padding: '8px 16px', fontSize: 16 }}
        >
          Update
        </button>
      </div>

      {/* Weather */}
      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <h2>Cuaca 7 Hari - {location}</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f0f0f0' }}>
              <th style={{ padding: 8, border: '1px solid #ddd' }}>Tanggal</th>
              <th style={{ padding: 8, border: '1px solid #ddd' }}>Kondisi</th>
              <th style={{ padding: 8, border: '1px solid #ddd' }}>Suhu Max</th>
              <th style={{ padding: 8, border: '1px solid #ddd' }}>Hujan (mm)</th>
            </tr>
          </thead>
          <tbody>
            {weatherDays.map((day, i) => (
              <tr key={i}>
                <td style={{ padding: 8, border: '1px solid #ddd' }}>{day.date}</td>
                <td style={{ padding: 8, border: '1px solid #ddd' }}>{day.condition}</td>
                <td style={{ padding: 8, border: '1px solid #ddd' }}>{day.tempMax}C</td>
                <td style={{ padding: 8, border: '1px solid #ddd' }}>{day.rain}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* FX */}
      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <h2>Kurs USD/IDR</h2>
        <p style={{ fontSize: 24, fontWeight: 'bold' }}>Rp {fxCurrent.toLocaleString('id-ID')}</p>
      </div>

      {/* Gold */}
      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <h2>Harga Emas</h2>
        <p style={{ fontSize: 24, fontWeight: 'bold' }}>${goldCurrent.toFixed(2)} / oz</p>
      </div>

      {/* AI Analysis */}
      <div style={{ border: '2px solid #4CAF50', borderRadius: 8, padding: 16, marginBottom: 16, background: '#f8fff8' }}>
        <h2>AI Impact Analysis</h2>
        {aiLoading ? (
          <p>AI sedang menganalisis data...</p>
        ) : aiError ? (
          <p style={{ color: 'red' }}>{aiError}</p>
        ) : aiRecs ? (
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'Arial', lineHeight: 1.6 }}>
            {aiRecs}
          </pre>
        ) : (
          <p>Tidak ada rekomendasi AI</p>
        )}
      </div>

      <p style={{ textAlign: 'center', color: '#999', fontSize: 12 }}>
        NusantaraPulse - Data real-time + AI Forecast
      </p>
    </div>
  );
}
