/**
 * Service Worker Registration and Management
 * Handles service worker lifecycle and caching strategies
 */

let registration = null;

/**
 * Register service worker
 * DISABLED - CDN handles all caching
 */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.log('Service Worker not supported');
    return null;
  }
  
  try {
    // Unregister any existing service workers
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const reg of registrations) {
      await reg.unregister();
      console.log('[Service Worker] Unregistered:', reg.scope);
    }
    
    // Clear all caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      console.log('[Service Worker] All caches cleared');
    }
    
    console.log('[Service Worker] Disabled - CDN handles caching');
    return null;
  } catch (error) {
    console.error('Service Worker cleanup failed:', error);
    return null;
  }
}

/**
 * Unregister service worker
 */
export async function unregisterServiceWorker() {
  if (!registration) {
    return false;
  }
  
  try {
    const success = await registration.unregister();
    console.log('Service Worker unregistered:', success);
    registration = null;
    return success;
  } catch (error) {
    console.error('Service Worker unregistration failed:', error);
    return false;
  }
}

/**
 * Clear all caches
 */
export async function clearAllCaches() {
  if (!('caches' in window)) {
    return false;
  }
  
  try {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map(name => caches.delete(name))
    );
    
    console.log('All caches cleared');
    
    // Notify service worker
    if (registration && registration.active) {
      registration.active.postMessage({ type: 'CLEAR_CACHE' });
    }
    
    return true;
  } catch (error) {
    console.error('Failed to clear caches:', error);
    return false;
  }
}

/**
 * Cache build data in service worker
 */
export function cacheBuildData(buildId, data) {
  if (!registration || !registration.active) {
    return false;
  }
  
  try {
    registration.active.postMessage({
      type: 'CACHE_BUILD',
      buildId,
      data
    });
    
    return true;
  } catch (error) {
    console.error('Failed to cache build data:', error);
    return false;
  }
}

/**
 * Check if service worker is active
 */
export function isServiceWorkerActive() {
  return registration && registration.active;
}

/**
 * Get service worker registration
 */
export function getServiceWorkerRegistration() {
  return registration;
}

/**
 * Update service worker
 */
export async function updateServiceWorker() {
  if (!registration) {
    return false;
  }
  
  try {
    await registration.update();
    console.log('Service Worker update check completed');
    return true;
  } catch (error) {
    console.error('Service Worker update failed:', error);
    return false;
  }
}

/**
 * Check for service worker updates periodically
 */
export function startUpdateCheck(intervalMs = 60000) {
  if (!registration) {
    return null;
  }
  
  const intervalId = setInterval(() => {
    updateServiceWorker();
  }, intervalMs);
  
  return intervalId;
}

/**
 * Stop update check
 */
export function stopUpdateCheck(intervalId) {
  if (intervalId) {
    clearInterval(intervalId);
  }
}
