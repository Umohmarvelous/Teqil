const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const url = env.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/)[1];
const key = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1];
const supabase = createClient(url, key);
async function run() {
  const { data: conv, error: e1 } = await supabase.from('conversations').select('id').limit(1);
  const { data: msg, error: e2 } = await supabase.from('messages').select('id').limit(1);
  console.log("Conversations:", e1 || conv);
  console.log("Messages:", e2 || msg);
}
run();
