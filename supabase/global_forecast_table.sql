-- Jalankan di Supabase SQL Editor
create table if not exists global_forecast (
  cache_key text primary key,
  cache_date text not null,
  fx_data jsonb,
  gold_data jsonb,
  forecast jsonb not null,
  updated_at timestamptz default now()
);
