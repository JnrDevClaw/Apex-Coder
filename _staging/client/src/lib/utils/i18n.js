/**
 * Internationalization (i18n) Utilities
 * Provides multi-language support for the application
 */

import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

// Supported languages
export const SUPPORTED_LANGUAGES = {
  en: { code: 'en', name: 'English', nativeName: 'English' },
  es: { code: 'es', name: 'Spanish', nativeName: 'Español' },
  fr: { code: 'fr', name: 'French', nativeName: 'Français' },
  de: { code: 'de', name: 'German', nativeName: 'Deutsch' },
  zh: { code: 'zh', name: 'Chinese', nativeName: '中文' },
  ja: { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  pt: { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  ru: { code: 'ru', name: 'Russian', nativeName: 'Русский' }
};

// Default language
const DEFAULT_LANGUAGE = 'en';

// Translation dictionaries
const translations = {
  en: {
    // Common
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.success': 'Success',
    'common.cancel': 'Cancel',
    'common.confirm': 'Confirm',
    'common.save': 'Save',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.close': 'Close',
    'common.back': 'Back',
    'common.next': 'Next',
    'common.previous': 'Previous',
    'common.search': 'Search',
    'common.filter': 'Filter',
    'common.sort': 'Sort',
    'common.refresh': 'Refresh',
    
    // Pipeline Dashboard
    'pipeline.dashboard.title': 'Pipeline Dashboard',
    'pipeline.dashboard.subtitle': 'Monitor and manage your AI application build pipelines',
    'pipeline.dashboard.newPipeline': 'New Pipeline',
    'pipeline.dashboard.filters': 'Filters',
    'pipeline.dashboard.search': 'Search pipelines...',
    'pipeline.dashboard.noPipelines': 'No Pipelines Found',
    'pipeline.dashboard.createFirst': 'Get started by creating your first pipeline.',
    'pipeline.dashboard.viewDetails': 'View Details',
    
    // Pipeline Status
    'pipeline.status.pending': 'Pending',
    'pipeline.status.running': 'Running',
    'pipeline.status.completed': 'Completed',
    'pipeline.status.failed': 'Failed',
    'pipeline.status.cancelled': 'Cancelled',
    'pipeline.status.created': 'Created',
    'pipeline.status.done': 'Done',
    'pipeline.status.passed': 'Passed',
    'pipeline.status.error': 'Error',
    'pipeline.status.deployed': 'Deployed',
    'pipeline.status.pushed': 'Pushed',
    
    // Pipeline Stats
    'pipeline.stats.total': 'Total',
    'pipeline.stats.running': 'Running',
    'pipeline.stats.completed': 'Completed',
    'pipeline.stats.failed': 'Failed',
    'pipeline.stats.pending': 'Pending',
    
    // Pipeline Detail
    'pipeline.detail.overallProgress': 'Overall Progress',
    'pipeline.detail.stages': 'Pipeline Stages',
    'pipeline.detail.logs': 'Event Logs',
    'pipeline.detail.showLogs': 'Show Logs',
    'pipeline.detail.hideLogs': 'Hide Logs',
    'pipeline.detail.resources': 'Generated Resources',
    'pipeline.detail.duration': 'Duration',
    'pipeline.detail.created': 'Created',
    'pipeline.detail.estimatedTime': 'remaining',
    'pipeline.detail.cancelPipeline': 'Cancel Pipeline',
    'pipeline.detail.retryPipeline': 'Retry Pipeline',
    'pipeline.detail.cancelConfirm': 'Are you sure you want to cancel this pipeline? All progress will be lost and this action cannot be undone.',
    
    // Stages
    'stage.creating_specs': 'Creating specs.json',
    'stage.creating_docs': 'Creating docs',
    'stage.creating_schema': 'Creating schema',
    'stage.creating_workspace': 'Creating workspace',
    'stage.creating_files': 'Creating files',
    'stage.coding_file': 'Coding file',
    'stage.running_tests': 'Running tests',
    'stage.creating_repo': 'Creating repository',
    'stage.repo_created': 'Repository created',
    'stage.pushing_files': 'Pushing files',
    'stage.deploying': 'Deploying',
    'stage.deployment_complete': 'App deployed',
    
    // Accessibility
    'a11y.skipToContent': 'Skip to main content',
    'a11y.openMenu': 'Open menu',
    'a11y.closeMenu': 'Close menu',
    'a11y.toggleTheme': 'Toggle theme',
    'a11y.gridView': 'Grid view',
    'a11y.listView': 'List view',
    'a11y.expandStage': 'Expand stage details',
    'a11y.collapseStage': 'Collapse stage details',
    'a11y.progressAnnouncement': '{context} {progress}% complete',
    'a11y.stageComplete': 'Stage {stage} completed',
    'a11y.stageFailed': 'Stage {stage} failed',
    'a11y.pipelineComplete': 'Pipeline completed successfully',
    'a11y.pipelineFailed': 'Pipeline failed with errors',
    
    // Errors
    'error.generic': 'An error occurred. Please try again.',
    'error.network': 'Network error. Please check your connection.',
    'error.notFound': 'Resource not found.',
    'error.unauthorized': 'You are not authorized to perform this action.',
    'error.validation': 'Validation error. Please check your input.',
    
    // Resources
    'resource.type.repository': 'Repository',
    'resource.type.deployment': 'Deployment',
    'resource.type.s3': 'S3 Bucket',
    'resource.type.database': 'Database',
    'resource.type.lambda': 'Lambda Function',
    'resource.type.api': 'API Gateway',
    'resource.copyUrl': 'Copy URL',
    'resource.openInNewTab': 'Open in new tab',
    'resource.validate': 'Validate',
    'resource.validating': 'Validating...',
    'resource.valid': 'Valid',
    'resource.invalid': 'Invalid'
  },
  
  es: {
    'common.loading': 'Cargando...',
    'common.error': 'Error',
    'common.success': 'Éxito',
    'common.cancel': 'Cancelar',
    'common.confirm': 'Confirmar',
    'pipeline.dashboard.title': 'Panel de Pipelines',
    'pipeline.dashboard.subtitle': 'Monitorea y gestiona tus pipelines de construcción de aplicaciones AI',
    'pipeline.status.running': 'En ejecución',
    'pipeline.status.completed': 'Completado',
    'pipeline.status.failed': 'Fallido'
  },
  
  fr: {
    'common.loading': 'Chargement...',
    'common.error': 'Erreur',
    'common.success': 'Succès',
    'common.cancel': 'Annuler',
    'common.confirm': 'Confirmer',
    'pipeline.dashboard.title': 'Tableau de bord des pipelines',
    'pipeline.dashboard.subtitle': 'Surveillez et gérez vos pipelines de construction d\'applications AI',
    'pipeline.status.running': 'En cours',
    'pipeline.status.completed': 'Terminé',
    'pipeline.status.failed': 'Échoué'
  }
};

// Get browser language
function getBrowserLanguage() {
  if (!browser) return DEFAULT_LANGUAGE;
  
  const browserLang = navigator.language.split('-')[0];
  return SUPPORTED_LANGUAGES[browserLang] ? browserLang : DEFAULT_LANGUAGE;
}

// Load language from localStorage or browser
function loadLanguage() {
  if (!browser) return DEFAULT_LANGUAGE;
  
  try {
    const stored = localStorage.getItem('language');
    if (stored && SUPPORTED_LANGUAGES[stored]) {
      return stored;
    }
  } catch (error) {
    console.error('Failed to load language preference:', error);
  }
  
  return getBrowserLanguage();
}

// Create language store
function createLanguageStore() {
  const { subscribe, set } = writable(loadLanguage());
  
  return {
    subscribe,
    
    setLanguage(lang) {
      if (!SUPPORTED_LANGUAGES[lang]) {
        console.warn(`Unsupported language: ${lang}`);
        return;
      }
      
      set(lang);
      
      if (browser) {
        try {
          localStorage.setItem('language', lang);
          document.documentElement.lang = lang;
        } catch (error) {
          console.error('Failed to save language preference:', error);
        }
      }
    },
    
    reset() {
      const browserLang = getBrowserLanguage();
      set(browserLang);
      
      if (browser) {
        try {
          localStorage.removeItem('language');
          document.documentElement.lang = browserLang;
        } catch (error) {
          console.error('Failed to reset language preference:', error);
        }
      }
    }
  };
}

export const currentLanguage = createLanguageStore();

// Translation function
export function translate(key, params = {}, lang = null) {
  // Get current language from store if not provided
  let currentLang = lang;
  if (!currentLang && browser) {
    currentLanguage.subscribe(value => {
      currentLang = value;
    })();
  }
  currentLang = currentLang || DEFAULT_LANGUAGE;
  
  // Get translation
  const langTranslations = translations[currentLang] || translations[DEFAULT_LANGUAGE];
  let translation = langTranslations[key];
  
  // Fallback to English if translation not found
  if (!translation && currentLang !== DEFAULT_LANGUAGE) {
    translation = translations[DEFAULT_LANGUAGE][key];
  }
  
  // Fallback to key if still not found
  if (!translation) {
    console.warn(`Translation not found for key: ${key}`);
    return key;
  }
  
  // Replace parameters
  Object.keys(params).forEach(param => {
    translation = translation.replace(`{${param}}`, params[param]);
  });
  
  return translation;
}

// Shorthand for translate
export const t = translate;

// Derived store for translations
export const translations$ = derived(
  currentLanguage,
  $lang => (key, params = {}) => translate(key, params, $lang)
);

// Add translation to a language
export function addTranslation(lang, key, value) {
  if (!translations[lang]) {
    translations[lang] = {};
  }
  translations[lang][key] = value;
}

// Add multiple translations
export function addTranslations(lang, translationsObj) {
  if (!translations[lang]) {
    translations[lang] = {};
  }
  Object.assign(translations[lang], translationsObj);
}

// Get all translations for a language
export function getTranslations(lang) {
  return translations[lang] || {};
}

// Check if translation exists
export function hasTranslation(key, lang = null) {
  const currentLang = lang || loadLanguage();
  const langTranslations = translations[currentLang] || translations[DEFAULT_LANGUAGE];
  return !!langTranslations[key];
}

// Format number according to locale
export function formatNumber(number, lang = null) {
  const currentLang = lang || loadLanguage();
  return new Intl.NumberFormat(currentLang).format(number);
}

// Format date according to locale
export function formatDate(date, options = {}, lang = null) {
  const currentLang = lang || loadLanguage();
  return new Intl.DateTimeFormat(currentLang, options).format(new Date(date));
}

// Format relative time
export function formatRelativeTime(date, lang = null) {
  const currentLang = lang || loadLanguage();
  const rtf = new Intl.RelativeTimeFormat(currentLang, { numeric: 'auto' });
  
  const now = new Date();
  const then = new Date(date);
  const diffInSeconds = Math.floor((then - now) / 1000);
  
  const units = [
    { unit: 'year', seconds: 31536000 },
    { unit: 'month', seconds: 2592000 },
    { unit: 'week', seconds: 604800 },
    { unit: 'day', seconds: 86400 },
    { unit: 'hour', seconds: 3600 },
    { unit: 'minute', seconds: 60 },
    { unit: 'second', seconds: 1 }
  ];
  
  for (const { unit, seconds } of units) {
    if (Math.abs(diffInSeconds) >= seconds) {
      const value = Math.floor(diffInSeconds / seconds);
      return rtf.format(value, unit);
    }
  }
  
  return rtf.format(0, 'second');
}
