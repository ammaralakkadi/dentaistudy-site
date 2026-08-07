/*
  Optional Supabase helper for the future.
  Current build is intentionally manual and runs from static HTML/CSS/JS.

  When you are ready to connect real login/data:
  1) Add your Supabase project URL and anon key below.
  2) Load @supabase/supabase-js on login/dashboard/admin pages.
  3) Replace localStorage reads in partner-data.js with secured table reads/writes.

  No Paddle webhook, no affiliate automation, no complex tools.
*/
window.DentAIStudyPartnerSupabase = {
  enabled: false,
  supabaseUrl: "",
  supabaseAnonKey: "",
};
