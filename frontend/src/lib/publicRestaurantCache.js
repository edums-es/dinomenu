const cacheKey = (slug) => `eg_restaurant_identity:${slug}`;

export function getCachedRestaurant(slug) {
  if (!slug) return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(slug));
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached?.restaurant || Date.now() - cached.savedAt > 5 * 60 * 1000) {
      sessionStorage.removeItem(cacheKey(slug));
      return null;
    }
    return cached.restaurant;
  } catch {
    return null;
  }
}

export function cacheRestaurant(slug, restaurant) {
  if (!slug || !restaurant) return;
  try {
    sessionStorage.setItem(cacheKey(slug), JSON.stringify({
      restaurant,
      savedAt: Date.now(),
    }));
  } catch {}
}
