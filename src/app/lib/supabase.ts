// src/app/lib/supabase.ts
// Client Supabase — HANYA dipakai di server (route handlers), tidak pernah di browser.
// Pakai Secret Key supaya bisa baca/tulis tabel cache tanpa perlu setup RLS policy.

import { createClient } from '@supabase/supabase-js';
import { withTimeout } from './timeout';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || '';

export function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false }
  });
}

export interface SystemStatus {
  maintenance: boolean;
  progress: number;
  message: string | null;
}

// Gagal "aman" (fail-open): kalau tabel belum dibuat / Supabase belum terkonfigurasi,
// anggap TIDAK maintenance supaya website tidak ikut macet gara-gara fitur ini.
const DEFAULT_STATUS: SystemStatus = { maintenance: false, progress: 100, message: null };

export async function getSystemStatus(): Promise<SystemStatus> {
  const supabase = getSupabaseClient();
  if (!supabase) return DEFAULT_STATUS;

  try {
    const { data, error } = await withTimeout(
      Promise.resolve(supabase.from('system_status').select('maintenance, progress, message').eq('id', 'main').maybeSingle()),
      5000,
      'Supabase getSystemStatus'
    );
    if (error || !data) return DEFAULT_STATUS;
    return { maintenance: !!data.maintenance, progress: data.progress ?? 100, message: data.message ?? null };
  } catch {
    return DEFAULT_STATUS;
  }
}

export async function setSystemStatus(patch: Partial<SystemStatus>): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  try {
    await withTimeout(
      Promise.resolve(supabase.from('system_status').upsert({ id: 'main', ...patch, updated_at: new Date().toISOString() }, { onConflict: 'id' })),
      5000,
      'Supabase setSystemStatus'
    );
  } catch (e: any) {
    console.error('setSystemStatus gagal:', e?.message || e);
  }
}
