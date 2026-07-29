// Preencha com os dados do seu projeto Supabase.
window.PAMPATTO_SUPABASE_URL = '';
window.PAMPATTO_SUPABASE_ANON_KEY = '';
window.pampattoSupabase = null;
if (window.PAMPATTO_SUPABASE_URL && window.PAMPATTO_SUPABASE_ANON_KEY && window.supabase) {
  window.pampattoSupabase = window.supabase.createClient(window.PAMPATTO_SUPABASE_URL, window.PAMPATTO_SUPABASE_ANON_KEY);
}
