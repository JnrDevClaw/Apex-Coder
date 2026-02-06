/**
 * Pipeline API Service
 * Centralized API calls for pipeline management
 * Requirements: 7.2, 7.4
 */

import { updatePipeline, removePipeline } from '../stores/pipeline.js';
import { addNotification } from '../stores/notifications.js';

class PipelineApiService {
  constructor() {
    this.baseUrl = '/api/pipelines';
  }

  /**
   * Get authentication headers
   */
  getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Handle API response
   */
  async handleResponse(response) {
    if (!response.ok) {
      let errorMessage = `Request failed with status ${response.status}`;
      
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        // Ignore JSON parsing errors for error responses
      }

      if (response.status === 401) {
        errorMessage = 'Authentication required. Please log in again.';
      } else if (response.status === 403) {
        errorMessage = 'You do not have permission to perform this action.';
      } else if (response.status === 404) {
        errorMessage = 'Resource not found.';
      }

      throw new Error(errorMessage);
    }

    return response.json();
  }

  /**
   * Get all pipelines for the current user
   */
  async getAllPipelines() {
    try {
      const response = await fetch(this.baseUrl, {
        headers: this.getAuthHeaders()
      });

      const data = await this.handleResponse(response);
      
      // Update store with all pipelines
      if (data.pipelines && Array.isArray(data.pipelines)) {
        data.pipelines.forEach(pipeline => {
          updatePipeline(pipeline);
        });
      }

      return data.pipelines || [];
    } catch (error) {
      console.error('Error fetching pipelines:', error);
      addNotification({
        type: 'error',
        message: `Failed to load pipelines: ${error.message}`,
        duration: 5000
      });
      throw error;
    }
  }

  /**
   * Get a specific pipeline by ID
   */
  async getPipeline(pipelineId) {
    try {
      const response = await fetch(`${this.baseUrl}/${pipelineId}`, {
        headers: this.getAuthHeaders()
      });

      const data = await this.handleResponse(response);
      
      // Update store with pipeline data
      if (data.pipeline) {
        updatePipeline(data.pipeline);
      }

      return data.pipeline;
    } catch (error) {
      console.error(`Error fetching pipeline ${pipelineId}:`, error);
      addNotification({
        type: 'error',
        message: `Failed to load build: ${error.message}`,
        duration: 5000
      });
      throw error;
    }
  }

  /**
   * Cancel a pipeline
   */
  async cancelPipeline(pipelineId) {
    try {
      const response = await fetch(`${this.baseUrl}/${pipelineId}/cancel`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });

      const data = await this.handleResponse(response);
      
      addNotification({
        type: 'success',
        message: 'Build cancelled successfully',
        duration: 3000
      });

      // Refresh pipeline data
      await this.getPipeline(pipelineId);
      
      return data;
    } catch (error) {
      console.error(`Error cancelling pipeline ${pipelineId}:`, error);
      addNotification({
        type: 'error',
        message: `Failed to cancel build: ${error.message}`,
        duration: 5000
      });
      throw error;
    }
  }

  /**
   * Retry a failed pipeline
   */
  async retryPipeline(pipelineId) {
    try {
      const response = await fetch(`${this.baseUrl}/${pipelineId}/retry`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });

      const data = await this.handleResponse(response);
      
      addNotification({
        type: 'success',
        message: 'Build retry initiated',
        duration: 3000
      });

      return data;
    } catch (error) {
      console.error(`Error retrying pipeline ${pipelineId}:`, error);
      addNotification({
        type: 'error',
        message: `Failed to retry build: ${error.message}`,
        duration: 5000
      });
      throw error;
    }
  }

  /**
   * Retry a specific stage
   */
  async retryStage(pipelineId, stageId, options = {}) {
    try {
      const response = await fetch(`${this.baseUrl}/${pipelineId}/stages/${stageId}/retry`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          useAlternativeModel: options.useAlternativeModel || false,
          attemptNumber: options.attemptNumber || 1
        })
      });

      const data = await this.handleResponse(response);
      
      const message = options.useAlternativeModel 
        ? 'Retrying stage with alternative model...'
        : 'Retrying stage...';
      
      addNotification({
        type: 'success',
        message,
        duration: 3000
      });

      // Refresh pipeline data
      await this.getPipeline(pipelineId);
      
      return data;
    } catch (error) {
      console.error(`Error retrying stage ${stageId}:`, error);
      addNotification({
        type: 'error',
        message: `Failed to retry stage: ${error.message}`,
        duration: 5000
      });
      throw error;
    }
  }

  /**
   * Delete a pipeline
   */
  async deletePipeline(pipelineId) {
    try {
      const response = await fetch(`${this.baseUrl}/${pipelineId}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });

      await this.handleResponse(response);
      
      // Remove from store
      removePipeline(pipelineId);
      
      addNotification({
        type: 'success',
        message: 'Build deleted successfully',
        duration: 3000
      });

      return true;
    } catch (error) {
      console.error(`Error deleting pipeline ${pipelineId}:`, error);
      addNotification({
        type: 'error',
        message: `Failed to delete build: ${error.message}`,
        duration: 5000
      });
      throw error;
    }
  }

  /**
   * Get pipeline events/logs
   */
  async getPipelineEvents(pipelineId) {
    try {
      const response = await fetch(`${this.baseUrl}/${pipelineId}/events`, {
        headers: this.getAuthHeaders()
      });

      const data = await this.handleResponse(response);
      return data.events || [];
    } catch (error) {
      console.error(`Error fetching pipeline events ${pipelineId}:`, error);
      // Don't show notification for events - this might be called frequently
      throw error;
    }
  }

  /**
   * Create a new pipeline
   */
  async createPipeline(projectData) {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(projectData)
      });

      const data = await this.handleResponse(response);
      
      addNotification({
        type: 'success',
        message: 'Build started successfully',
        duration: 3000
      });

      // Update store with new pipeline
      if (data.pipeline) {
        updatePipeline(data.pipeline);
      }

      return data;
    } catch (error) {
      console.error('Error creating pipeline:', error);
      addNotification({
        type: 'error',
        message: `Failed to start build: ${error.message}`,
        duration: 5000
      });
      throw error;
    }
  }

  /**
   * Update pipeline metadata
   */
  async updatePipelineMetadata(pipelineId, metadata) {
    try {
      const response = await fetch(`${this.baseUrl}/${pipelineId}`, {
        method: 'PATCH',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(metadata)
      });

      const data = await this.handleResponse(response);
      
      // Update store with updated pipeline
      if (data.pipeline) {
        updatePipeline(data.pipeline);
      }

      return data.pipeline;
    } catch (error) {
      console.error(`Error updating pipeline ${pipelineId}:`, error);
      addNotification({
        type: 'error',
        message: `Failed to update build: ${error.message}`,
        duration: 5000
      });
      throw error;
    }
  }

  /**
   * Get pipeline statistics
   */
  async getPipelineStats() {
    try {
      const response = await fetch(`${this.baseUrl}/stats`, {
        headers: this.getAuthHeaders()
      });

      const data = await this.handleResponse(response);
      return data.stats || {};
    } catch (error) {
      console.error('Error fetching pipeline stats:', error);
      // Don't show notification for stats - this is background data
      throw error;
    }
  }

  /**
   * Login user
   */
  async login(email, password) {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const data = await this.handleResponse(response);
      return data;
    } catch (error) {
      console.error('Error logging in:', error);
      throw error;
    }
  }

  /**
   * Register user
   */
  async register(userData) {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(userData)
      });

      const data = await this.handleResponse(response);
      return data;
    } catch (error) {
      console.error('Error registering:', error);
      throw error;
    }
  }

  /**
   * Logout user
   */
  async logout() {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: this.getAuthHeaders()
      });

      // Don't throw on logout errors - just log them
      if (!response.ok) {
        console.warn('Logout API call failed, but continuing with local cleanup');
      }

      return true;
    } catch (error) {
      console.error('Error logging out:', error);
      // Don't throw - allow local cleanup to proceed
      return false;
    }
  }

  /**
   * Get user profile
   */
  async getProfile() {
    try {
      const response = await fetch('/api/auth/profile', {
        headers: this.getAuthHeaders()
      });

      const data = await this.handleResponse(response);
      return data;
    } catch (error) {
      console.error('Error fetching profile:', error);
      throw error;
    }
  }
}

// Create singleton instance
export const pipelineApi = new PipelineApiService();

export default pipelineApi;