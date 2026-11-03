/* Compass Ed configuration. Edit this file only. */
window.CE_CONFIG = {
  // Your Supabase project (Project Settings > API). The publishable/anon key is safe to ship in the page:
  // every table is locked down and only the ed_* functions can be called.
  supabaseUrl: "https://eqaxgofniwyhvwmdzwsm.supabase.co",
  supabaseKey: "sb_publishable_vTiRujcTfiNs8QhtC2z0DQ_wLsFljBV",

  // Preview mode: a built-in sample campus kept in this browser only, so the site can be tried without the database.
  // It switches on automatically on localhost or with ?demo=1; set to false to disable entirely.
  allowDemo: true,

  // Deadline reminders (v2.9): the public half of the Web Push key pair. The private half is a Supabase secret, never here.
  vapidPublicKey: "BKyKGNMaYRadvsfHxqfu5vfdWYEcj8vISM5OSu3-7UJ_RPC8sT-5vTcxE5_yMLtJzkXXkKWVv9YID5lUNK34lSw"
};
