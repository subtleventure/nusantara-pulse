// src/app/api/maintenance-status/route.ts
// Dicek oleh frontend saat pertama kali load. Fail-open: kalau Supabase/tabel belum
// siap, dianggap TIDAK maintenance supaya website tidak ikut macet gara-gara fitur ini.

import { getSystemStatus } from '../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = await getSystemStatus();
  return new Response(JSON.stringify(status), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
