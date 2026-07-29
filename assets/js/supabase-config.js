// Configuração Supabase Pampatto Brasil
window.PAMPATTO_SUPABASE_URL = 'https://plglkgkssfwghlopugan.supabase.co';
window.PAMPATTO_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsZ2xrZ2tzc2Z3Z2hsb3B1Z2FuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3NzM3NDMsImV4cCI6MjEwMDM0OTc0M30.ret1-xr984epBnKorZcOCciCVRrW66MjZX3n9uslcsQ';
window.pampattoSupabase = null;

if (window.supabase && window.PAMPATTO_SUPABASE_URL && window.PAMPATTO_SUPABASE_ANON_KEY) {
  window.pampattoSupabase = window.supabase.createClient(
    window.PAMPATTO_SUPABASE_URL,
    window.PAMPATTO_SUPABASE_ANON_KEY
  );
}
