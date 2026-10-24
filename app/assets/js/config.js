/* Ovunque Accessibile – configurazione della web-app.
   Con supabaseUrl e supabaseKey vuoti l'app gira in "modalità prova": luoghi di esempio e account finti,
   salvati solo in questo browser. Per collegarla a Supabase vedi DOCUMENTAZIONE.md, "Configurare Supabase".

   supabaseKey è la chiave PUBBLICA del progetto ("publishable", sb_publishable_… oppure la vecchia "anon"):
   è fatta per stare nel browser, la sicurezza la fanno le regole RLS del database.
   MAI mettere qui la chiave "secret" / "service_role" né la password del database. */
window.OA_CONFIG = {
  supabaseUrl: 'https://fzqibkvdpywgvlejzeks.supabase.co',
  supabaseKey: 'sb_publishable_FvMVyUSlV8Oiprwh-Tqy1w_K7P0xCIo',
  privacyVersion: 'app-2026-10-v1'
};
