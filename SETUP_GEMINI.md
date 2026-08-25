# Setup Gemini Fallback

## 1. Dapatkan API key Gemini (gratis, tanpa kartu kredit)
1. Buka https://aistudio.google.com/apikey
2. Login pakai akun Google
3. Klik "Create API key"
4. Copy key-nya

## 2. Tambah environment variable di EdgeOne Pages Console
- `GEMINI_API_KEY` = key yang barusan kamu copy

## 3. Deploy
- Replace `src/app/lib/aiForecast.ts` dengan yang di folder ini
- Replace `.github/workflows/prewarm.yml` dengan `prewarm.yml` di folder ini (retry di GitHub Actions dikurangi dari 5x jadi 2x karena logika format-AI sekarang ditangani di dalam)
- Commit, push, redeploy

## Cara kerja fallback-nya
1. EdgeOne/DeepSeek dicoba sampai 3x (dengan thinking-disabled + JSON mode)
2. Kalau 3x itu semua gagal → sistem otomatis coba Gemini SEKALI (provider & infrastruktur
   berbeda total, dipanggil langsung ke Google, bukan lewat EdgeOne)
3. Kalau Gemini juga gagal ATAU `GEMINI_API_KEY` belum diisi → baru dilaporkan gagal,
   dan cron GitHub Actions akan retry kota itu (maksimal 2x lagi, jeda singkat)
4. Kalau masih gagal juga → dicoba lagi otomatis besok jam 06:00 WIB

Kalau `GEMINI_API_KEY` belum diisi, sistem TETAP JALAN NORMAL seperti sebelumnya
(cuma fallback-nya dilewati) — bukan error, tinggal isi env var-nya kapan saja kamu siap.
