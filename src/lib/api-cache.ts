/**
 * Simple in-memory cache for API responses.
 * Works in Vercel serverless functions — cache lives as long as the warm instance.
 * No external dependencies needed.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

// Clean up expired entries periodically (every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupIfNeeded() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  cache.forEach((entry, key) => {
    if (entry.expiresAt < now) {
      cache.delete(key);
    }
  });
}

/**
 * Get a cached value, or compute and cache it.
 *
 * @param key - Cache key (e.g. "admin-dashboard" or "user-dashboard:{userId}")
 * @param ttlMs - Time-to-live in milliseconds
 * @param fetcher - Async function to compute the value if not cached
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  cleanupIfNeeded();

  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;

  if (existing && existing.expiresAt > now) {
    return existing.data;
  }

  const data = await fetcher();
  cache.set(key, { data, expiresAt: now + ttlMs });
  return data;
}

/**
 * Invalidate a specific cache key.
 */
export function invalidateCache(key: string) {
  cache.delete(key);
}

/**
 * Invalidate all cache keys matching a prefix.
 */
export function invalidateCachePrefix(prefix: string) {
  const keysToDelete: string[] = [];
  cache.forEach((_, key) => {
    if (key.startsWith(prefix)) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach(key => cache.delete(key));
}
