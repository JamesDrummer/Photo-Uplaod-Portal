import { createClient } from '@supabase/supabase-js';

// Get env variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Create client (will be invalid if env vars not set, but won't crash the app)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Export helper to check if Supabase is configured
export const isSupabaseConfigured = () => {
  return supabaseUrl && 
         supabaseAnonKey && 
         !supabaseUrl.includes('YOUR_') && 
         !supabaseAnonKey.includes('YOUR_');
};

