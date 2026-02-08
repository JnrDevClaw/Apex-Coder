/**
 * GCP API Service
 * API calls for Google Cloud Platform integration
 */

import { addNotification } from '../stores/notifications.js';

class GcpApiService {
    constructor() {
        this.baseUrl = '/api/gcp';
    }

    /**
     * Get authentication headers
     */
    getAuthHeaders() {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : '';
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
                // Ignore JSON parsing errors
            }
            throw new Error(errorMessage);
        }
        return response.json();
    }

    /**
     * Connect GCP Account
     * @param {Object} serviceAccountKey - The JSON key object
     */
    async connectGCP(serviceAccountKey) {
        try {
            const response = await fetch(`${this.baseUrl}/connect`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({ serviceAccountKey })
            });

            const data = await this.handleResponse(response);

            addNotification({
                type: 'success',
                message: 'GCP Account connected successfully!',
                duration: 3000
            });

            return data;
        } catch (error) {
            console.error('Error connecting GCP:', error);
            addNotification({
                type: 'error',
                message: `Failed to connect GCP: ${error.message}`,
                duration: 5000
            });
            throw error;
        }
    }

    /**
     * Get GCP Connection Status
     */
    async getGCPStatus() {
        try {
            const response = await fetch(`${this.baseUrl}/status`, {
                headers: this.getAuthHeaders()
            });

            const data = await this.handleResponse(response);
            return data;
        } catch (error) {
            console.error('Error fetching GCP status:', error);
            throw error;
        }
    }
}

export const gcpApi = new GcpApiService();
export default gcpApi;
