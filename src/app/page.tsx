'use client';

import { useState, useEffect, useRef } from 'react';
import { Cloud, DollarSign, TrendingUp, MapPin, Sparkles, Wrench } from 'lucide-react';

interface WeatherDay {
  date: string;
  tempMax: number;
  rain: number;
  condition: string;
}

interface DayForecast {
  usd: number | null;
  gold: number | null;
  risk: 'low' | 'medium' | 'high';
}

interface CombinedDay extends WeatherDay {
  usd: number | null;
  gold: number | null;
  risk: 'low' | 'medium' | 'high' | null;
}

const CITIES = ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Makassar'];
const FRONTEND_FETCH_TIMEOUT_MS = 20000;

const weatherCodes: Record<number, string> = {
  0: 'Cerah', 1: 'Cerah Berawan', 2: 'Berawan', 3: 'Mendung',
  45: 'Berkabut', 48: 'Berkabut', 51: 'Gerimis', 53: 'Gerimis',
  55: 'Gerimis', 61: 'Hujan Ringan', 63: 'Hujan', 65: 'Hujan Lebat',
  80: 'Hujan Ringan', 81: 'Hujan', 82: 'Hujan Lebat', 95: 'Badai',
  96: 'Badai Petir', 99: 'Badai Petir'
};

const riskLabel: Record<string, { text: string; className: string }> = {
  low: { text: 'Rendah', className: 'bg-green-100 text-green-700' },
  medium: { text: 'Sedang', className: 'bg-amber-100 text-amber-700' },
  high: { text: 'Tinggi', className: 'bg-red-100 text-red-700' }
};

async function fetchWithTimeout(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export default function Home() {
  const [location, setLocation] = useState('Jakarta');
  const [checkingMaintenance, setCheckingMaintenance] = useState(true);
  const [maintenance, setMaintenance] = useState(false);
  const [maintenanceProgress, setMaintenanceProgress] = useState(0);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');

  const [baseLoading, setBaseLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [dataWarnings, setDataWarnings] = useState<string[]>([]);
  const [weatherDays, setWeatherDays] = useState<WeatherDay[]>([]);
  const [fxCurrent, setFxCurrent] = useState<number | null>(null);
  const [goldCurrent, setGoldCurrent] = useState<number | null>(null);
  const [aiForecast, setAiForecast] = useState<DayForecast[]>([]);
  const [aiSummary, setAiSummary] = useState('');
  const [aiError, setAiError] = useState('');

  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cek status maintenance dulu sebelum load apapun.
  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetchWithTimeout('/api/maintenance-status', 8000);
        const status = await res.json();
        if (cancelled) return;

        if (status.maintenance) {
          setMaintenance(true);
          setMaintenanceProgress(status.progress ?? 0);
          setMaintenanceMessage(status.message || 'Sedang memperbarui data...');
          setCheckingMaintenance(false);
          pollTimer = setTimeout(poll, 2000);
        } else {
          setMaintenance(false);
          setCheckingMaintenance(false);
        }
      } catch {
        // Gagal cek status = anggap tidak maintenance, jangan blokir user.
        if (!cancelled) setCheckingMaintenance(false);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
    };
  }, []);

  useEffect(() => {
    if (!checkingMaintenance && !maintenance) {
      fetchAllData(location);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkingMaintenance, maintenance]);

  function startTrickle(from: number, to: number) {
    if (trickleRef.current) clearInterval(trickleRef.current);
    setProgress(from);
    trickleRef.current = setInterval(() => {
      setProgress((p) => (p < to ? p + 1 : p));
    }, 120);
  }

  function stopTrickle(final: number) {
    if (trickleRef.current) clearInterval(trickleRef.current);
    setProgress(final);
  }

  function handleLocationChange(loc: string) {
    setLocation(loc);
    fetchAllData(loc);
  }

  async function fetchAllData(loc: string) {
    setBaseLoading(true);
    setError('');
    setDataWarnings([]);
    setWeatherDays([]);
    setFxCurrent(null);
    setGoldCurrent(null);
    setAiForecast([]);
    setAiSummary('');
    setAiError('');
    startTrickle(0, 45); // trickle 0 -> 45% selama nunggu data dasar

    try {
      const res = await fetchWithTimeout('/api/proxy-data?location=' + encodeURIComponent(loc), FRONTEND_FETCH_TIMEOUT_MS);
      if (!res.ok) throw new Error('Gagal fetch data (status ' + res.status + ')');
      const data = await res.json();

      if (data.errors && data.errors.length > 0) {
        setDataWarnings(data.errors);
      }

      let days: WeatherDay[] = [];
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

      if (data.fx?.rates && typeof data.fx.rates.IDR === 'number') {
        setFxCurrent(data.fx.rates.IDR);
      }
      if (data.gold && typeof data.gold.price === 'number') {
        setGoldCurrent(data.gold.price);
      }

      stopTrickle(50);
      setBaseLoading(false);

      const hasAnyData = (data.fx?.rates?.IDR ?? null) !== null || (data.gold?.price ?? null) !== null || days.length > 0;
      if (hasAnyData) {
        fetchAIRecommendations(loc);
      } else {
        setAiError('Semua sumber data real-time gagal diambil, AI tidak bisa dijalankan.');
        stopTrickle(100);
      }
    } catch (err: any) {
      const msg = err?.name === 'AbortError'
        ? 'Server tidak merespon dalam ' + (FRONTEND_FETCH_TIMEOUT_MS / 1000) + ' detik. Coba lagi.'
        : 'Gagal memuat data: ' + err.message;
      setError(msg);
      setBaseLoading(false);
      stopTrickle(0);
    }
  }

  async function fetchAIRecommendations(loc: string) {
    setAiLoading(true);
    setAiError('');
    startTrickle(50, 95); // trickle 50 -> 95% selama AI menganalisis
    try {
      const res = await fetchWithTimeout('/api/ai-recommendations', FRONTEND_FETCH_TIMEOUT_MS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: loc })
      });
      const result = await res.json();
      if (result.forecast && result.forecast.length > 0) {
        setAiForecast(result.forecast);
        setAiSummary(result.summary || '');
      } else {
        setAiError(result.summary || 'AI tidak memberikan rekomendasi');
      }
    } catch (err: any) {
      const msg = err?.name === 'AbortError'
        ? 'AI tidak merespon dalam ' + (FRONTEND_FETCH_TIMEOUT_MS / 1000) + ' detik.'
        : 'Gagal memuat AI: ' + err.message;
      setAiError(msg);
    } finally {
      setAiLoading(false);
      stopTrickle(100);
    }
  }

  const combinedDays: CombinedDay[] = weatherDays.map((day, i) => ({
    ...day,
    usd: aiForecast[i]?.usd ?? null,
    gold: aiForecast[i]?.gold ?? null,
    risk: aiForecast[i]?.risk ?? null
  }));

  // Layar maintenance — data disembunyikan, hanya progress bar yang ditampilkan.
  if (!checkingMaintenance && maintenance) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-bg text-ink">
        <div className="max-w-md w-full text-center">
          <Wrench size={32} className="text-primary mx-auto mb-3" />
          <h1 className="text-lg font-semibold mb-1">Website on Regular Maintenance</h1>
          <p className="text-sm text-gray-500 mb-6">{maintenanceMessage || 'Data sedang diperbarui otomatis, mohon tunggu sebentar.'}</p>
          <div className="w-full h-2.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
              style={{ width: maintenanceProgress + '%' }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">{maintenanceProgress}%</p>
        </div>
      </div>
    );
  }

  if (checkingMaintenance) {
    return <div className="min-h-screen bg-bg" />;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-6">
        <div>
          <h1 className="text-xl font-semibold text-red-600 mb-2">Error</h1>
          <p className="text-ink mb-4">{error}</p>
          <button
            onClick={() => fetchAllData(location)}
            className="px-4 py-2 rounded-lg bg-primary text-white font-medium"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Header */}
      <div className="bg-primary px-6 py-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-white">
          <TrendingUp size={26} />
          <div>
            <h1 className="text-lg font-semibold leading-tight">NusantaraPulse</h1>
            <p className="text-xs text-white/80 leading-tight">AI Economic Intelligence for Indonesian UMKM</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white/15 rounded-lg px-3 py-2">
          <MapPin size={16} className="text-white" />
          <select
            value={location}
            onChange={(e) => handleLocationChange(e.target.value)}
            className="bg-transparent text-white text-sm font-medium outline-none cursor-pointer"
          >
            {CITIES.map((city) => (
              <option key={city} value={city} className="text-ink">
                {city}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Progress bar sungguhan, bukan spinner tak berujung */}
        {(baseLoading || aiLoading) && (
          <div className="max-w-md mx-auto mb-6">
            <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-200 ease-out"
                style={{ width: progress + '%' }}
              />
            </div>
            <p className="text-xs text-gray-400 text-center mt-1.5">
              {baseLoading ? 'Mengambil cuaca, kurs & harga emas...' : 'Menyusun forecast AI 7 hari...'} ({progress}%)
            </p>
          </div>
        )}

        {dataWarnings.length > 0 && (
          <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 mb-4 text-amber-800 text-sm">
            <strong>⚠️ Sebagian data real-time gagal diambil:</strong>
            <ul className="list-disc ml-5 mt-1">
              {dataWarnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        {!baseLoading && (
          <>
            {/* Cards ringkasan */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="rounded-xl border-l-4 border-primary bg-white shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-ink">
                    <Cloud size={16} className="text-primary" /> Cuaca Hari Ini
                  </div>
                  <span className="text-[10px] bg-blue-50 text-primary px-2 py-0.5 rounded-full">Real-time</span>
                </div>
                {combinedDays[0] ? (
                  <>
                    <div className="text-2xl font-bold">{combinedDays[0].tempMax}°C</div>
                    <div className="text-xs text-gray-500 mt-1">{combinedDays[0].condition} | Hujan: {combinedDays[0].rain}mm</div>
                  </>
                ) : (
                  <div className="text-sm text-gray-400">Tidak tersedia</div>
                )}
              </div>

              <div className="rounded-xl border-l-4 border-secondary bg-white shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-ink">
                    <DollarSign size={16} className="text-secondary" /> USD/IDR
                  </div>
                  <span className="text-[10px] bg-orange-50 text-secondary px-2 py-0.5 rounded-full">Real-time</span>
                </div>
                {fxCurrent !== null ? (
                  <div className="text-2xl font-bold">Rp {fxCurrent.toLocaleString('id-ID')}</div>
                ) : (
                  <div className="text-sm text-gray-400">Tidak tersedia</div>
                )}
              </div>

              <div className="rounded-xl border-l-4 border-amber-400 bg-white shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-ink">
                    <TrendingUp size={16} className="text-amber-500" /> Harga Emas
                  </div>
                  <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">Real-time</span>
                </div>
                {goldCurrent !== null ? (
                  <div className="text-2xl font-bold">${goldCurrent.toFixed(2)}/oz</div>
                ) : (
                  <div className="text-sm text-gray-400">Tidak tersedia</div>
                )}
              </div>
            </div>

            {/* Forecast 7 hari gabungan: cuaca (real) + USD/Gold (AI) + Risk */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 mb-6 overflow-x-auto">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Sparkles size={16} className="text-primary" /> AI Forecast 7 Hari ke Depan — {location}
              </h2>
              {combinedDays.length > 0 ? (
                <table className="w-full text-sm min-w-[600px]">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-100">
                      <th className="py-2 pr-2 font-medium">Tanggal</th>
                      <th className="py-2 pr-2 font-medium">Cuaca</th>
                      <th className="py-2 pr-2 font-medium">Suhu</th>
                      <th className="py-2 pr-2 font-medium">Hujan</th>
                      <th className="py-2 pr-2 font-medium">USD/IDR</th>
                      <th className="py-2 pr-2 font-medium">Gold</th>
                      <th className="py-2 font-medium">Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {combinedDays.map((day, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 pr-2">{day.date}</td>
                        <td className="py-2 pr-2">{day.condition}</td>
                        <td className="py-2 pr-2">{day.tempMax}°C</td>
                        <td className="py-2 pr-2">{day.rain}mm</td>
                        <td className="py-2 pr-2">
                          {aiLoading && day.usd === null ? (
                            <span className="text-gray-300">...</span>
                          ) : day.usd !== null ? (
                            'Rp ' + Math.round(day.usd).toLocaleString('id-ID')
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-2">
                          {aiLoading && day.gold === null ? (
                            <span className="text-gray-300">...</span>
                          ) : day.gold !== null ? (
                            '$' + day.gold.toFixed(2)
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="py-2">
                          {day.risk ? (
                            <span className={'text-xs px-2 py-0.5 rounded-full ' + riskLabel[day.risk].className}>
                              {riskLabel[day.risk].text}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-gray-400">Data cuaca tidak tersedia saat ini</p>
              )}
            </div>

            {/* AI Impact Analysis */}
            <div className="rounded-xl border border-primary/20 bg-blue-50/40 p-4">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Sparkles size={16} className="text-primary" /> AI Impact Analysis
              </h2>
              {aiLoading ? (
                <p className="text-sm text-gray-500">AI sedang menganalisis data...</p>
              ) : aiError ? (
                <p className="text-sm text-red-600">{aiError}</p>
              ) : aiSummary ? (
                <p className="text-sm leading-relaxed">{aiSummary}</p>
              ) : (
                <p className="text-sm text-gray-400">Tidak ada rekomendasi AI</p>
              )}
              <div className="text-[11px] text-gray-400 mt-3 pt-3 border-t border-gray-100">
                Powered by EdgeOne AI · Data: Open-Meteo | Frankfurter | Gold-API
              </div>
            </div>
          </>
        )}

        <p className="text-center text-gray-400 text-xs mt-6">
          NusantaraPulse - Data real-time + AI Forecast
        </p>
      </div>
    </div>
  );
}
