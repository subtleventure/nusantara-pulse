# Setup Scheduled Pre-warm (jam 06:00 WIB tiap hari)

## 1. Tambah environment variable baru di EdgeOne Pages Console
- `CRON_SECRET` = string acak panjang, contoh: buat sendiri password panjang min 32 karakter
  (jangan pakai contoh dari sini — buat sendiri, jangan share ke siapapun)

## 2. Jalankan SQL ini di Supabase SQL Editor (tabel baru untuk status maintenance)
```sql
create table if not exists system_status (
  id text primary key default 'main',
  maintenance boolean not null default false,
  progress int not null default 100,
  message text,
  updated_at timestamptz default now()
);

insert into system_status (id, maintenance, progress, message)
values ('main', false, 100, 'Idle')
on conflict (id) do nothing;
```

## 3. Deploy dulu kode ini (commit + push + redeploy di EdgeOne)

## 4. Jadwalkan pemanggilan endpoint dari luar
Endpoint: `https://nusantara-pulse.edgeone.dev/api/cron/prewarm?key=ISI_CRON_SECRET_DISINI`

Jam 06:00 WIB = 23:00 UTC (hari sebelumnya). Pilih salah satu:

### Opsi A — cron-job.org (paling gampang, gratis, tanpa perlu kode)
1. Daftar di https://cron-job.org
2. Buat cronjob baru:
   - URL: `https://nusantara-pulse.edgeone.dev/api/cron/prewarm?key=ISI_CRON_SECRET_DISINI`
   - Schedule: setiap hari jam 23:00 UTC (cron-job.org biasanya pakai UTC, cek timezone setting-nya, sesuaikan supaya jatuh di 06:00 WIB)
   - Method: GET

### Opsi B — GitHub Actions (kalau kamu sudah pakai GitHub)
Buat file `.github/workflows/prewarm.yml` di repo:
```yaml
name: Daily Prewarm
on:
  schedule:
    - cron: '0 23 * * *'  # 23:00 UTC = 06:00 WIB
  workflow_dispatch: {}
jobs:
  prewarm:
    runs-on: ubuntu-latest
    steps:
      - name: Call prewarm endpoint
        run: |
          curl -f "https://nusantara-pulse.edgeone.dev/api/cron/prewarm" \
            -H "x-cron-secret: ${{ secrets.CRON_SECRET }}"
```
Lalu tambahkan `CRON_SECRET` sebagai GitHub Actions secret (Settings → Secrets and variables → Actions) dengan nilai yang SAMA persis dengan yang kamu isi di EdgeOne env vars.

## 5. Cara tes manual (tanpa nunggu jam 06:00)
Buka browser atau Postman, akses:
`https://nusantara-pulse.edgeone.dev/api/cron/prewarm?key=ISI_CRON_SECRET_DISINI`

Selama proses jalan (bisa 1-3 menit untuk 5 kota), buka website utama di tab lain —
harusnya muncul layar "Website on Regular Maintenance" dengan progress bar jalan.

## Catatan penting
- Endpoint ini akan memanggil AI Gateway 5x setiap hari (1x per kota) otomatis,
  terlepas dari ada pengunjung atau tidak.
- Kalau satu kota gagal setelah 5x percobaan (backoff 1s-16s), kota itu dilewati
  dan otomatis dicoba lagi besok — bukan infinite retry supaya fungsi cron tidak
  timeout dan tidak boros biaya kalau API luar down seharian.
