/**
 * Authentication Service
 * Handles user authentication and session management
 * Requirements: 7.2, 7.4
 */

import { pipelineApi } from './pipelineApi.js';
import { 
  setAuth, 
  clearAuth, 
  setAuthError, 
  isAuthenticating,
  currentUser,
  authToken
} from '../stores/auth.js';
import { get } from 'svelte/store';
import { goto } from '$app/navigation';

/**
 * Authentication Service
 */
class AuthService {
  constructor() {
    this.refreshInterval = null;
    this.tokenRefreshTime = 20 * 60 * 1000; // 20 minutes
  }

  /**
   * Login user
   */
  async login(email, password) {
    isAuthenticating.set(true);
    setAuthError(null);

    try {
      const response = await pipelineApi.login(email, password);
      
      if (response.success && response.data) {
        const { token, user } = response.data;
        setAuth(token, user);
        
        // Start token refresh
        this.startTokenRefresh();
        
        return { success: true, user };
      } else {
        throw new Error(response.message || 'Login failed');
      }
    } catch (error) {
      const errorMessage = error.message || 'Login failed';
      setAuthError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      isAuthenticating.set(false);
    }
  }

  /**
   * Register new user
   */
  async register(userData) {
    isAuthenticating.set(true);
    setAuthError(null);

    try {
      const response = await pipelineApi.register(userData);
      
      if (response.success && response.data) {
        const { token, user } = response.data;
        setAuth(token, user);
        
        // Start token refresh
        this.startTokenRefresh();
        
        return { success: true, user };
      } else {
        throw new Error(response.message || 'Registration failed');
      }
    } catch (error) {
      const errorMessage = error.message || 'Registration failed';
      setAuthError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      isAuthenticating.set(false);
    }
  }

  /**
   * Logout user
   */
  async logout() {
    try {
      // Call logout endpoint
      await pipelineApi.logout();
    } catch (error) {
      console.error('Logout API call failed:', error);
    } finally {
      // Clear auth state regardless of API call result
      clearAuth();
      
      // Stop token refresh
      this.stopTokenRefresh();
      
      // Redirect to login
      if (typeof window !== 'undefined') {
        goto('/login');
      }
    }
  }

  /**
   * Verify authentication status
   */
  async verifyAuth() {
    const token = get(authToken);
    const user = get(currentUser);
    
    if (!token || !user) {
      return false;
    }

    try {
      const isValid = await pipelineApi.verifyAuth();
      
      if (!isValid) {
        clearAuth();
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Auth verification failed:', error);
      clearAuth();
      return false;
    }
  }

  /**
   * Get current user profile
   */
  async getProfile() {
    try {
      const response = await pipelineApi.getProfile();
      
      if (response.success && response.data) {
        // Update user in store
        currentUser.set(response.data);
        return response.data;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to fetch profile:', error);
      return null;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(updates) {
    try {
      const response = await pipelineApi.updateProfile(updates);
      
      if (response.success && response.data) {
        // Update user in store
        currentUser.set(response.data);
        return { success: true, user: response.data };
      }
      
      throw new Error(response.message || 'Profile update failed');
    } catch (error) {
      const errorMessage = error.message || 'Profile update failed';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Refresh authentication token
   */
  async refreshToken() {
    try {
      const response = await pipelineApi.post('/api/auth/refresh');
      
      if (response.success && response.data) {
        const { token } = response.data;
        authToken.set(token);
        
        // Persist to storage
        if (typeof window !== 'undefined') {
          localStorage.setItem('auth_token', JSON.stringify(token));
        }
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Token refresh failed:', error);
      
      // If refresh fails, logout user
      await this.logout();
      
      return false;
    }
  }

  /**
   * Start automatic token refresh
   */
  startTokenRefresh() {
    // Clear existing interval
    this.stopTokenRefresh();
    
    // Set up new interval
    this.refreshInterval = setInterval(() => {
      this.refreshToken();
    }, this.tokenRefreshTime);
  }

  /**
   * Stop automatic token refresh
   */
  stopTokenRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    const token = get(authToken);
    const user = get(currentUser);
    return !!token && !!user;
  }

  /**
   * Get current user
   */
  getCurrentUser() {
    return get(currentUser);
  }

  /**
   * Get auth token
   */
  getToken() {
    return get(authToken);
  }

  /**
   * Require authentication (redirect to login if not authenticated)
   */
  async requireAuth() {
    const isAuth = await this.verifyAuth();
    
    if (!isAuth) {
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname;
        goto(`/login?redirect=${encodeURIComponent(currentPath)}`);
      }
      return false;
    }
    
    return true;
  }

  /**
   * Check if user has organization access
   */
  hasOrganizationAccess(orgId, requiredRole = null) {
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
  getUserRole(orgId) {
    const user = get(currentUser);
    if (!user || !user.organizations) return null;
    
    const membership = user.organizations.find(org => org.orgId === orgId);
    return membership?.role || null;
  }
}

// Export singleton instance
export const authService = new AuthService();
