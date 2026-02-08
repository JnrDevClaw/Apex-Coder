// Simple configuration service for client-side feature flags
class ConfigService {
	constructor() {
		this.initialized = false;
		this.config = {
			enhancedProcessing: false,
			aiGuidance: false,
			technicalInference: false,
			contextualHelp: false
		};
	}

	async initialize() {
		if (this.initialized) {
			return;
		}

		try {
			// Try to fetch config from backend
			const response = await fetch('/api/config/features');
			if (response.ok) {
				const data = await response.json();
				this.config = {
					enhancedProcessing: data.enhancedProcessing ?? false,
					aiGuidance: data.aiGuidance ?? false,
					technicalInference: data.technicalInference ?? false,
					contextualHelp: data.contextualHelp ?? false
				};
			}
		} catch (error) {
			console.warn('Failed to load config from backend, using defaults:', error);
		}

		this.initialized = true;
	}

	async isEnhancedProcessingEnabled() {
		await this.initialize();
		return this.config.enhancedProcessing;
	}

	async isAIGuidanceEnabled() {
		await this.initialize();
		return this.config.aiGuidance;
	}

	async isTechnicalInferenceEnabled() {
		await this.initialize();
		return this.config.technicalInference;
	}

	async isContextualHelpEnabled() {
		await this.initialize();
		return this.config.contextualHelp;
	}
}

// Export singleton instance
const configService = new ConfigService();
export default configService;
