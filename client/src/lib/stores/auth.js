/**
 * Authentication Store
 * Manages user authentication state and tokens
 * Requirements: 7.2, 7.4
 */

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';

// Storage keys
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

/**
 * Load from localStorage (browser only)
 */
function loadFromStorage(key) {
  if (!browser) return null;
  
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch (error) {
    console.error(`Failed to load ${key} from storage:`, error);
    return null;
  }
}

/**
 * Save to localStorage (browser only)
 */
function saveToStorage(key, value) {
  if (!browser) return;
  
  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (error) {
    console.error(`Failed to save ${key} to storage:`, error);
  }
}

// Core auth stores
export const authToken = writable(loadFromStorage(TOKEN_KEY));
export const currentUser = writable(loadFromStorage(USER_KEY));
export const authError = writable(null);
export const isAuthenticating = writable(false);

// Derived stores
export const isAuthenticated = derived(
  [authToken, currentUser],
  ([$authToken, $currentUser]) => {
    return !!$authToken && !!$currentUser;
  }
);

export const userOrganizations = derived(
  currentUser,
  ($currentUser) => {
    return $currentUser?.organizations || [];
  }
);

export const defaultOrganization = derived(
  userOrganizations,
  ($userOrganizations) => {
    return $userOrganizations[0] || null;
  }
);

export const hasAdminAccess = derived(
  userOrganizations,
  ($userOrganizations) => {
    return $userOrganizations.some(org => 
      org.role === 'admin' || org.role === 'owner'
    );
  }
);

/**
 * Set authentication data
 */
export function setAuth(token, user) {
  authToken.set(token);
  currentUser.set(user);
  authError.set(null);
  
  // Persist to storage
  saveToStorage(TOKEN_KEY, token);
  saveToStorage(USER_KEY, user);
}

/**
 * Clear authentication data
 */
export function clearAuth() {
  authToken.set(null);
  currentUser.set(null);
  authError.set(null);
  
  // Clear storage
  saveToStorage(TOKEN_KEY, null);
  saveToStorage(USER_KEY, null);
}

/**
 * Set authentication error
 */
export function setAuthError(error) {
  authError.set(error);
}

/**
 * Update user data
 */
export function updateUser(updates) {
  currentUser.update(user => {
    if (!user) return user;
    
    const updatedUser = { ...user, ...updates };
    saveToStorage(USER_KEY, updatedUser);
    return updatedUser;
  });
}

/**
 * Check if user has access to organization
 */
export function hasOrganizationAccess(orgId, requiredRole = null) {
  const user = get(currentUser);
  if (!user || !user.organizations) return false;
  
  const membership = user.organizations.find(org => org.orgId === orgId);
  if (!membership) return false;
  
  if (requiredRole) {
    const roleHierarchy = { viewer: 1, dev: 2, admin: 3, owner: 4 };
    const userRoleLevel = roleHierarchy[membership.role] || 0;
    const requiredRoleLevel = roleHierarchy[requiredRole] || 0;
    return userRoleLevel >= requiredRoleLevel;
  }
  
  return true;
}

/**
 * Get user's role in organization
 */
export function getUserRole(orgId) {
  const user = get(currentUser);
  if (!user || !user.organizations) return null;
  
  const membership = user.organizations.find(org => org.orgId === orgId);
  return membership?.role || null;
}

/**
 * Subscribe to auth changes
 */
export function onAuthChange(callback) {
  return isAuthenticated.subscribe(callback);
}

/**
 * Initialize auth from storage on app load
 */
export function initAuth() {
  if (!browser) return;
  
  const token = loadFromStorage(TOKEN_KEY);
  const user = loadFromStorage(USER_KEY);
  
  if (token && user) {
    authToken.set(token);
    currentUser.set(user);
  }
}

// Auto-initialize on module load
if (browser) {
  initAuth();
}
