// Configuração única do Supabase — Empório Pampatto Brasil
(() => {
  'use strict';
  if (window.pampattoSupabase) return;

  const SUPABASE_URL = 'https://plglkgkssfwghlopugan.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsZ2xrZ2tzc2Z3Z2hsb3B1Z2FuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3NzM3NDMsImV4cCI6MjEwMDM0OTc0M30.ret1-xr984epBnKorZcOCciCVRrW66MjZX3n9uslcsQ';

  if (!window.supabase?.createClient) {
    console.error('Biblioteca Supabase não carregada.');
    return;
  }

  window.pampattoSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 5 } }
  });
  window.supabaseClient = window.pampattoSupabase;
})();
