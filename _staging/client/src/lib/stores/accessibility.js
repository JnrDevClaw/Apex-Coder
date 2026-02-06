/**
 * Accessibility Store
 * Manages accessibility preferences and settings
 */

import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

// Default accessibility settings
const defaultSettings = {
  reducedMotion: false,
  highContrast: false,
  screenReaderMode: false,
  keyboardNavigationEnabled: true,
  announceProgress: true,
  fontSize: 'medium', // 'small', 'medium', 'large', 'x-large'
  focusIndicatorStyle: 'default' // 'default', 'enhanced'
};

// Load settings from localStorage
function loadSettings() {
  if (!browser) return defaultSettings;
  
  try {
    const stored = localStorage.getItem('accessibility-settings');
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.error('Failed to load accessibility settings:', error);
  }
  
  // Check system preferences
  return {
    ...defaultSettings,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    highContrast: window.matchMedia('(prefers-contrast: high)').matches
  };
}

// Create the store
function createAccessibilityStore() {
  const { subscribe, set, update } = writable(loadSettings());
  
  return {
    subscribe,
    set,
    update,
    
    // Update a specific setting
    setSetting(key, value) {
      update(settings => {
        const newSettings = { ...settings, [key]: value };
        
        // Save to localStorage
        if (browser) {
          try {
            localStorage.setItem('accessibility-settings', JSON.stringify(newSettings));
          } catch (error) {
            console.error('Failed to save accessibility settings:', error);
          }
        }
        
        return newSettings;
      });
    },
    
    // Toggle a boolean setting
    toggleSetting(key) {
      update(settings => {
        const newSettings = { ...settings, [key]: !settings[key] };
        
        if (browser) {
          try {
            localStorage.setItem('accessibility-settings', JSON.stringify(newSettings));
          } catch (error) {
            console.error('Failed to save accessibility settings:', error);
          }
        }
        
        return newSettings;
      });
    },
    
    // Reset to defaults
    reset() {
      const newSettings = { ...defaultSettings };
      set(newSettings);
      
      if (browser) {
        try {
          localStorage.setItem('accessibility-settings', JSON.stringify(newSettings));
        } catch (error) {
          console.error('Failed to save accessibility settings:', error);
        }
      }
    },
    
    // Sync with system preferences
    syncWithSystem() {
      if (!browser) return;
      
      update(settings => ({
        ...settings,
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        highContrast: window.matchMedia('(prefers-contrast: high)').matches
      }));
    }
  };
}

export const accessibilitySettings = createAccessibilityStore();

// Derived stores for specific settings
export const reducedMotion = derived(
  accessibilitySettings,
  $settings => $settings.reducedMotion
);

export const highContrast = derived(
  accessibilitySettings,
  $settings => $settings.highContrast
);

export const screenReaderMode = derived(
  accessibilitySettings,
  $settings => $settings.screenReaderMode
);

export const keyboardNavigationEnabled = derived(
  accessibilitySettings,
  $settings => $settings.keyboardNavigationEnabled
);

export const announceProgress = derived(
  accessibilitySettings,
  $settings => $settings.announceProgress
);

// Listen for system preference changes
if (browser) {
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const highContrastQuery = window.matchMedia('(prefers-contrast: high)');
  
  reducedMotionQuery.addEventListener('change', (e) => {
    accessibilitySettings.setSetting('reducedMotion', e.matches);
  });
  
  highContrastQuery.addEventListener('change', (e) => {
    accessibilitySettings.setSetting('highContrast', e.matches);
  });
}
