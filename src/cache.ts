/**
 * localStorage-based cache for the shop state.
 * Gives instant data on app open while the real fetch happens in background.
 */

import type { ShopState } from './types';

const CACHE_KEY = 'sb_shop_state_v1';
const SHOP_KEY = 'sb_shop_meta_v1';

type ShopMeta = { id: string; name: string };

export function readCachedState(): ShopState | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ShopState;
  } catch {
    return null;
  }
}

export function writeCachedState(state: ShopState): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  } catch {
    // Storage quota exceeded — silently skip caching
  }
}

export function readCachedShop(): ShopMeta | null {
  try {
    const raw = localStorage.getItem(SHOP_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ShopMeta;
  } catch {
    return null;
  }
}

export function writeCachedShop(shop: ShopMeta): void {
  try {
    localStorage.setItem(SHOP_KEY, JSON.stringify(shop));
  } catch { /* ignore */ }
}

export function clearCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(SHOP_KEY);
  } catch { /* ignore */ }
}
