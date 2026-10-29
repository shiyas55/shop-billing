import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://nwmuneczyopsekalfbyb.supabase.co';

export function getSupabaseConfig(): { url: string; key: string } {
  const envUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

  let localUrl = '';
  let localKey = '';
  try {
    localUrl = localStorage.getItem('shop_billing_supabase_url')?.trim() || '';
    localKey = localStorage.getItem('shop_billing_supabase_key')?.trim() || '';
  } catch {
    // Ignore localStorage access errors
  }

  const url = envUrl || localUrl || DEFAULT_SUPABASE_URL;
  const key = (envKey && envKey !== 'YOUR_SUPABASE_ANON_KEY_HERE' ? envKey : '') || localKey;

  return { url, key };
}

export function saveSupabaseConfig(key: string, url: string = DEFAULT_SUPABASE_URL) {
  try {
    localStorage.setItem('shop_billing_supabase_url', url.trim());
    localStorage.setItem('shop_billing_supabase_key', key.trim());
  } catch {
    // Ignore localStorage errors
  }
}

export function clearSupabaseConfig() {
  try {
    localStorage.removeItem('shop_billing_supabase_key');
  } catch {
    // Ignore
  }
}

const config = getSupabaseConfig();
export const isSupabaseConfigured = Boolean(config.url && config.key);
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(config.url, config.key)
  : null;

