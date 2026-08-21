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
    setAiLoading(true);
    setError('');
    setDataWarnings([]);
    setWeatherDays([]);
    setFxCurrent(null);
    setGoldCurrent(null);
    setAiRecs('');
    setAiError('');

    try {
      // ===== PARALLEL FETCH: proxy-data + ai-recommendations bersamaan =====
      const [proxyRes, aiRes] = await Promise.all([
        fetch('/api/proxy-data?location=' + encodeURIComponent(location)),
        fetch('/api/ai-recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location: location })
        })
      ]);

      // ===== Parse proxy-data =====
      if (!proxyRes.ok) throw new Error('Gagal fetch data (status ' + proxyRes.status + ')');
      const proxyData = await proxyRes.json();

      if (proxyData.errors && proxyData.errors.length > 0) {
        setDataWarnings(proxyData.errors);
      }

      let days: WeatherDay[] = [];

      if (proxyData.weather && proxyData.weather.daily) {
        const daily = proxyData.weather.daily;
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

      if (proxyData.fx && proxyData.fx.rates && typeof proxyData.fx.rates.IDR === 'number') {
        setFxCurrent(proxyData.fx.rates.IDR);
      }

      if (proxyData.gold && typeof proxyData.gold.price === 'number') {
        setGoldCurrent(proxyData.gold.price);
      }

      // ===== Parse AI recommendations =====
      setAiLoading(false);
      if (aiRes.ok) {
        const aiData = await aiRes.json();
        if (aiData.recommendations) {
          setAiRecs(aiData.recommendations);
        } else {
          setAiError('AI tidak memberikan rekomendasi');
        }
      } else {
        setAiError('Gagal memuat AI: status ' + aiRes.status);
      }

    } catch (err: any) {
      setError('Gagal memuat data: ' + err.message);
    } finally {
      setLoading(false);
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
