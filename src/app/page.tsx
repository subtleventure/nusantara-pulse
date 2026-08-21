'use client';

import { useState, useEffect } from 'react';

interface WeatherDay {
  date: string;
  tempMax: number;
  rain: number;
  condition: string;
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
  const [dataWarnings, setDataWarnings] = useState<string[]>([]);
  const [weatherDays, setWeatherDays] = useState<WeatherDay[]>([]);
  const [fxCurrent, setFxCurrent] = useState<number | null>(null);
  const [goldCurrent, setGoldCurrent] = useState<number | null>(null);
  const [aiRecs, setAiRecs] = useState('');
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    fetchAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchAllData() {
    setLoading(true);
    setError('');
    setDataWarnings([]);
    setWeatherDays([]);
    setFxCurrent(null);
    setGoldCurrent(null);

    try {
      // Fetch data cuaca/kurs/emas via proxy (di-cache server per kota per hari)
      const res = await fetch('/api/proxy-data?location=' + encodeURIComponent(location));
      if (!res.ok) throw new Error('Gagal fetch data (status ' + res.status + ')');
      const data = await res.json();

      if (data.errors && data.errors.length > 0) {
        setDataWarnings(data.errors);
      }

      let days: WeatherDay[] = [];

      // Parse Weather (kalau ada)
      if (data.weather && data.weather.daily) {
        const daily = data.weather.daily;
        for (let i = 0; i < 7; i++) {
          const code = daily.weather_code[i];
          const rain = daily.precipitation_sum[i] || 0;
          const temp = daily.temperature_2m_max[i];
          days.push({
            date: daily.time[i],
            tempMax: temp,
            rain: rain,
            condition: weatherCodes[code] || 'Tidak Diketahui'
          });
        }
        setWeatherDays(days);
      }

      // Parse FX (kalau ada)
      let fxRate: number | null = null;
      if (data.fx && data.fx.rates && typeof data.fx.rates.IDR === 'number') {
        fxRate = data.fx.rates.IDR;
        setFxCurrent(fxRate);
      }

      // Parse Gold (kalau ada)
      let goldPrice: number | null = null;
      if (data.gold && typeof data.gold.price === 'number') {
        goldPrice = data.gold.price;
        setGoldCurrent(goldPrice);
      }

      // Minta rekomendasi AI — server yang hitung & cache sendiri per kota per hari
      if (fxRate !== null || goldPrice !== null || days.length > 0) {
        await fetchAIRecommendations(location);
      } else {
        setAiError('Semua sumber data real-time gagal diambil, AI tidak bisa dijalankan.');
      }

    } catch (err: any) {
      setError('Gagal memuat data: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAIRecommendations(loc: string) {
    setAiLoading(true);
    setAiError('');
    try {
      const res = await fetch('/api/ai-recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: loc })
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

      {/* Data Warnings */}
      {dataWarnings.length > 0 && (
        <div style={{ border: '1px solid #f5c518', background: '#fffbea', borderRadius: 8, padding: 12, marginBottom: 16, color: '#8a6500' }}>
          <strong>⚠️ Sebagian data real-time gagal diambil:</strong>
          <ul style={{ margin: '8px 0 0 20px' }}>
            {dataWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

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
        {weatherDays.length > 0 ? (
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
        ) : (
          <p style={{ color: '#999' }}>Data cuaca tidak tersedia saat ini</p>
        )}
      </div>

      {/* FX */}
      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <h2>Kurs USD/IDR</h2>
        {fxCurrent !== null ? (
          <p style={{ fontSize: 24, fontWeight: 'bold' }}>Rp {fxCurrent.toLocaleString('id-ID')}</p>
        ) : (
          <p style={{ color: '#999' }}>Data kurs tidak tersedia saat ini</p>
        )}
      </div>

      {/* Gold */}
      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <h2>Harga Emas</h2>
        {goldCurrent !== null ? (
          <p style={{ fontSize: 24, fontWeight: 'bold' }}>${goldCurrent.toFixed(2)} / oz</p>
        ) : (
          <p style={{ color: '#999' }}>Data emas tidak tersedia saat ini</p>
        )}
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
        NusantaraPulse - Data real-time + AI Forecast (cache harian)
      </p>
    </div>
  );
}
