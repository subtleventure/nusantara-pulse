// src/app/lib/supabase.ts
// Client Supabase — HANYA dipakai di server (route handlers), tidak pernah di browser.
// Pakai Secret Key supaya bisa baca/tulis tabel cache tanpa perlu setup RLS policy.

import { createClient } from '@supabase/supabase-js';

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
