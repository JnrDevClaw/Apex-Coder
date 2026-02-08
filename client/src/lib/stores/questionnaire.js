/**
 * Enhanced Questionnaire Store and Logic
 * Handles questionnaire flow, draft saving, and validation
 * Platform is developer-only (non-developer mode removed)
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { writable, derived } from 'svelte/store';
import { validateSpec, isSpecComplete, createEmptySpec } from '../schemas/spec.js';

// Current questionnaire stage
const _currentStage = writable(0);
export const currentStage = {
	subscribe: _currentStage.subscribe,
	set: (value) => {
		console.trace('🔥 currentStage.set() called with value:', value);
		_currentStage.set(value);
	},
	update: (fn) => {
		console.trace('🔥 currentStage.update() called');
		_currentStage.update(fn);
	}
};

// Draft spec data (saved incrementally)
export const specDraft = writable(createEmptySpec());

// User mode selection (developer only now)
export const userMode = writable('');

// Validation errors for current stage
export const validationErrors = writable({});

// Loading states
export const isLoading = writable(false);
export const isSaving = writable(false);

// AI guidance state
export const aiGuidance = writable({
	isGenerating: false,
	suggestions: [],
	clarityCheck: '',
	missingInfoQuestions: []
});

// Stage completion tracking
export const stageCompletion = writable({});

// Session metadata
export const sessionMetadata = writable({
	sessionId: null,
	createdAt: null,
	lastModified: null,
	userModeSelected: false
});


/**
 * Stage definitions for developer platform
 * Note: Platform is now developer-only, non-developer mode has been removed
 */
export const stageDefinitions = [
	// Stage 0: User Mode Selection (auto-selects developer)
	{
		id: 'user-mode-selection',
		title: 'Welcome to AI App Builder',
		description: "Build your application with AI-powered assistance",
		showForModes: ['all'],
		fields: [
			{
				name: 'userMode',
				label: 'Platform Mode',
				type: 'radio',
				required: true,
				options: [
					{
						value: 'developer',
						label: 'Developer Platform',
						description: 'Define your project vision and let AI help you build it'
					}
				],
				helpText: 'AI will help infer technical details based on your project requirements'
			}
		]
	},

	// Stage 1: Project Basics (first 3 fields)
	{
		id: 'project-basics',
		title: 'Project Basics',
		description: "Let's start with the essentials - what are you building?",
		showForModes: ['developer'],
		conversational: true,
		fields: [
			{
				name: 'project_overview.app_name',
				label: 'What would you like to call your project?',
				type: 'text',
				required: true,
				placeholder: 'MusicWave',
				validation: {
					minLength: 1,
					maxLength: 100,
					pattern: /^[a-zA-Z0-9\s\-_]+$/
				},
				helpText: 'Choose a memorable name for your application'
			},
			{
				name: 'project_overview.app_summary',
				label: 'Describe your app in one sentence',
				type: 'textarea',
				required: true,
				placeholder: 'A neon-style music streaming web app that connects artists with fans',
				validation: {
					minLength: 10,
					maxLength: 200
				},
				helpText: 'Keep it simple - what does your app do?'
			},
			{
				name: 'project_overview.app_details',
				label: 'What features will your app have?',
				type: 'textarea',
				required: true,
				placeholder: 'User authentication, music streaming, playlist creation, artist profiles, social sharing, discovery features',
				validation: {
					minLength: 20,
					maxLength: 1000
				},
				helpText: 'List the main features and capabilities'
			}
		]
	},

	// Stage 2: Project Details (last 4 fields)
	{
		id: 'project-details',
		title: 'Project Details',
		description: 'Help us understand your audience and scope',
		showForModes: ['developer'],
		conversational: true,
		fields: [
			{
				name: 'project_overview.niche',
				label: 'What category best fits your app?',
				type: 'select',
				required: true,
				options: [
					{ value: 'music', label: 'Music & Audio' },
					{ value: 'social-media', label: 'Social Media & Networking' },
					{ value: 'education', label: 'Education & Learning' },
					{ value: 'finance', label: 'Finance & Banking' },
					{ value: 'healthcare', label: 'Healthcare & Medical' },
					{ value: 'ecommerce', label: 'E-commerce & Shopping' },
					{ value: 'productivity', label: 'Productivity & Tools' },
					{ value: 'entertainment', label: 'Entertainment & Games' },
					{ value: 'business', label: 'Business & Enterprise' },
					{ value: 'other', label: 'Other' }
				],
				helpText: 'This helps AI tailor the architecture to your industry'
			},
			{
				name: 'project_overview.potential_users',
				label: 'Who will use your app?',
				type: 'text',
				required: true,
				placeholder: 'Musicians, music lovers, content creators, indie artists',
				validation: {
					minLength: 5,
					maxLength: 200
				},
				helpText: 'Describe your target audience'
			},
			{
				name: 'project_overview.estimated_user_count',
				label: 'How many users do you expect?',
				type: 'select',
				required: true,
				options: [
					{ value: '1-100', label: '1-100 users (Personal/Small Community)' },
					{ value: '100-1000', label: '100-1,000 users (Growing Community)' },
					{ value: '1000-10000', label: '1,000-10,000 users (Large Community)' },
					{ value: '10000+', label: '10,000+ users (Enterprise Scale)' }
				],
				helpText: 'This helps us recommend appropriate infrastructure'
			},
			{
				name: 'project_overview.complexity_level',
				label: 'How complex is your project?',
				type: 'radio',
				required: true,
				options: [
					{ value: 1, label: '1' },
					{ value: 2, label: '2' },
					{ value: 3, label: '3' },
					{ value: 4, label: '4' },
					{ value: 5, label: '5' },
					{ value: 6, label: '6' },
					{ value: 7, label: '7' },
					{ value: 8, label: '8' },
					{ value: 9, label: '9' },
					{ value: 10, label: '10' }
				],
				helpText: '1 = Simple landing page, 5 = Standard web app, 10 = Complex enterprise system'
			}
		]
	},

	// Stage 2: User Journey & Flow (Conversational)
	{
		id: 'user-journey',
		title: 'User Experience & Flow',
		description: 'Map out how users will interact with your application',
		showForModes: ['developer'],
		conversational: true, // Enable conversational mode for this stage
		fields: [
			{
				name: 'user_flow.overview_flow',
				label: 'Walk me through the main user journey',
				type: 'textarea',
				required: true,
				placeholder: 'Users discover the app, sign up with email, explore music recommendations, create personalized playlists, follow favorite artists, and share music with friends',
				validation: {
					minLength: 20,
					maxLength: 500
				},
				helpText: 'Describe the typical path a user takes through your app from start to finish'
			},
			{
				name: 'user_flow.key_user_actions',
				label: 'What are the key actions users will take?',
				type: 'textarea',
				required: true,
				placeholder: 'Browse music, create playlists, follow artists, share tracks, rate songs, discover new music',
				validation: {
					minLength: 10,
					maxLength: 300
				},
				helpText: 'List the main actions users will perform in your app'
			}
		]
	},

	// Stage 3: App Structure & Authentication (Conversational)
	{
		id: 'app-structure',
		title: 'App Structure & Access',
		description: 'Define how your app will be structured and accessed',
		showForModes: ['developer'],
		conversational: true, // Enable conversational mode for this stage
		fields: [
			{
				name: 'app_structure.app_type',
				label: 'What type of application are you building?',
				type: 'select',
				required: true,
				options: [
					{ value: 'web-app', label: 'Web Application (Desktop/Laptop focused)' },
					{ value: 'mobile-first', label: 'Mobile-First Web App' },
					{ value: 'pwa', label: 'Progressive Web App (Works offline, installable)' },
					{ value: 'desktop', label: 'Desktop Application' },
					{ value: 'api-only', label: 'API/Backend Service Only' }
				],
				helpText: 'Choose the primary platform for your application'
			},
			{
				name: 'app_structure.authentication_needed',
				label: 'Will users need to create accounts?',
				type: 'radio',
				required: true,
				options: [
					{ value: true, label: 'Yes, users need accounts to access features' },
					{ value: false, label: 'No, anonymous access is sufficient' }
				],
				helpText: 'Determine if users need to create accounts and log in'
			},
			{
				name: 'app_structure.roles_or_permissions',
				label: 'What different types of users will you have?',
				type: 'textarea',
				required: false,
				placeholder: 'Regular users, premium users, artists, administrators',
				validation: {
					maxLength: 300
				},
				helpText: 'Define different user types and their access levels (if applicable)'
			},
			{
				name: 'app_structure.deployment_preference',
				label: 'Where would you like to host your app?',
				type: 'select',
				required: true,
				options: [
					{ value: 'aws', label: 'Amazon Web Services (AWS) - Enterprise grade' },
					{ value: 'vercel', label: 'Vercel - Great for modern web apps' },
					{ value: 'netlify', label: 'Netlify - Perfect for static sites' },
					{ value: 'heroku', label: 'Heroku - Simple deployment' },
					{ value: 'gcp', label: 'Google Cloud Platform' },
					{ value: 'azure', label: 'Microsoft Azure' },
					{ value: 'self-hosted', label: 'Self-hosted/VPS' }
				],
				helpText: 'Where would you like to host your application?'
			}
		]
	},


	// Stage 4: Data Flow & Privacy (Conversational)
	{
		id: 'data-privacy',
		title: 'Data & Privacy',
		description: 'Define how your app will handle and protect user data',
		showForModes: ['developer'],
		conversational: true, // Enable conversational mode for this stage
		fields: [
			{
				name: 'data_flow.data_sources',
				label: 'What types of data will your app collect?',
				type: 'textarea',
				required: true,
				placeholder: 'User profiles, music metadata, playlists, listening history, social connections',
				validation: {
					minLength: 10,
					maxLength: 300
				},
				helpText: 'List all the data your app will collect or use'
			},
			{
				name: 'data_flow.data_privacy',
				label: 'What level of data protection do you need?',
				type: 'select',
				required: true,
				options: [
					{ value: 'public', label: 'Public - No sensitive personal data' },
					{ value: 'private', label: 'Private - User data needs protection' },
					{ value: 'enterprise', label: 'Enterprise - Business-critical data' },
					{ value: 'healthcare', label: 'Healthcare - HIPAA compliance required' }
				],
				helpText: 'This determines the security measures AI will implement'
			},
			{
				name: 'data_flow.user_data_storage',
				label: 'How should user data be stored?',
				type: 'select',
				required: true,
				options: [
					{ value: 'cloud', label: 'Cloud database (recommended for most apps)' },
					{ value: 'local', label: 'Local storage only (browser-based)' },
					{ value: 'hybrid', label: 'Both cloud and local storage' },
					{ value: 'none', label: 'No persistent data storage needed' }
				],
				helpText: 'Choose where and how data will be persisted'
			},
			{
				name: 'data_flow.user_data_editable',
				label: 'Can users edit their own data?',
				type: 'radio',
				required: true,
				options: [
					{ value: true, label: 'Yes, users can edit and manage their data' },
					{ value: false, label: 'No, data is read-only for users' }
				],
				helpText: 'Determines if users have control over their information'
			},
			{
				name: 'data_flow.data_shared_publicly',
				label: 'Will any user data be visible to others?',
				type: 'radio',
				required: true,
				options: [
					{ value: true, label: 'Yes, some data is shared publicly (profiles, posts)' },
					{ value: false, label: 'No, all user data remains private' }
				],
				helpText: 'Affects privacy settings and data visibility controls'
			},
			{
				name: 'data_flow.analytics_or_tracking',
				label: 'Do you want usage analytics?',
				type: 'radio',
				required: true,
				options: [
					{ value: true, label: 'Yes, include analytics for insights' },
					{ value: false, label: 'No, privacy-focused with no tracking' }
				],
				helpText: 'Analytics help you understand user behavior'
			}
		]
	},

	// Stage 5: Design Preferences
	{
		id: 'design-style',
		title: 'Design & Visual Style',
		description: 'Define the look and feel of your application',
		showForModes: ['developer'],
		fields: [
			{
				name: 'design_preferences.theme_style',
				label: 'Design Theme',
				type: 'select',
				required: true,
				options: [
					{ value: 'minimal', label: 'Minimal & Clean - Simple, uncluttered design' },
					{ value: 'modern', label: 'Modern & Sleek - Contemporary, polished look' },
					{ value: 'dark', label: 'Dark Mode - Dark backgrounds, light text' },
					{ value: 'neon', label: 'Neon & Vibrant - Bright, electric colors' },
					{ value: 'classic', label: 'Classic & Traditional - Timeless, conservative style' },
					{ value: 'colorful', label: 'Colorful & Playful - Bright, fun colors' },
					{ value: 'professional', label: 'Professional & Corporate - Business-appropriate design' }
				],
				helpText: 'Choose the overall visual style that matches your brand'
			},
			{
				name: 'design_preferences.accent_color',
				label: 'Primary Brand Color',
				type: 'color',
				required: true,
				defaultValue: '#3B82F6',
				helpText: 'This will be used for buttons, links, and key interface elements'
			},
			{
				name: 'design_preferences.secondary_colors',
				label: 'Additional Colors (Optional)',
				type: 'text',
				required: false,
				placeholder: '#10B981, #F59E0B, #EF4444',
				validation: {
					maxLength: 100
				},
				helpText: 'Enter additional hex colors separated by commas (e.g., #10B981, #F59E0B)'
			},
			{
				name: 'design_preferences.general_vibe',
				label: 'Overall Personality',
				type: 'select',
				required: true,
				options: [
					{ value: 'playful', label: 'Playful & Fun - Lighthearted and engaging' },
					{ value: 'serious', label: 'Serious & Professional - Focused and authoritative' },
					{ value: 'elegant', label: 'Elegant & Sophisticated - Refined and upscale' },
					{ value: 'energetic', label: 'Energetic & Dynamic - Active and exciting' },
					{ value: 'calm', label: 'Calm & Peaceful - Relaxing and soothing' },
					{ value: 'bold', label: 'Bold & Striking - Confident and attention-grabbing' },
					{ value: 'friendly', label: 'Friendly & Approachable - Welcoming and warm' }
				],
				helpText: 'What personality should your app convey to users?'
			}
		]
	},

	// Stage 6: Project Clarification (AI-assisted project understanding) - Conversational
	{
		id: 'project-clarification',
		title: 'Project Clarification',
		description: 'Help AI understand your project vision and goals',
		showForModes: ['developer'],
		conversational: true, // Enable conversational mode for this stage
		fields: [
			{
				name: 'project_clarification.project_goals',
				label: 'What are your main goals for this project?',
				type: 'textarea',
				required: true,
				placeholder: 'I want to create a platform where musicians can share their work and connect with fans, helping independent artists gain exposure',
				validation: {
					minLength: 20,
					maxLength: 500
				},
				helpText: 'Describe what you hope to achieve with this application'
			},
			{
				name: 'project_clarification.success_metrics',
				label: 'How will you measure success?',
				type: 'textarea',
				required: true,
				placeholder: 'Number of active users, songs uploaded per month, artist-fan connections made, user engagement time',
				validation: {
					minLength: 10,
					maxLength: 300
				},
				helpText: 'What metrics or outcomes would indicate your app is successful?'
			},
			{
				name: 'project_clarification.similar_apps',
				label: 'Are there similar apps you admire?',
				type: 'text',
				required: false,
				placeholder: 'Spotify for discovery, SoundCloud for sharing, Bandcamp for artist support',
				validation: {
					maxLength: 200
				},
				helpText: 'Mention apps with features or designs you like (helps AI understand your vision)'
			},
			{
				name: 'project_clarification.unique_features',
				label: 'What will make your app stand out?',
				type: 'textarea',
				required: true,
				placeholder: 'Focus on independent artists, direct fan-to-artist messaging, collaborative playlists, local music scene discovery',
				validation: {
					minLength: 15,
					maxLength: 400
				},
				helpText: 'What will set your app apart from existing solutions?'
			}
		]
	},

	// Stage 7: Final Review & Confirmation
	{
		id: 'final-review',
		title: 'Review & Generate',
		description: 'Review your project details and generate your application specification',
		showForModes: ['developer'],
		fields: [
			{
				name: 'review_confirmation',
				label: 'Project Review Complete',
				type: 'checkbox',
				required: true,
				options: [
					{
						value: 'confirmed',
						label: 'I have reviewed my project details and am ready to generate the specification'
					}
				],
				helpText: 'Check this box to confirm you are ready to proceed with generating your app'
			}
		]
	}
];


/**
 * Get available stages based on user mode
 */
export const availableStages = derived(userMode, ($userMode) => {
	if (!$userMode) {
		// Only show user mode selection stage if no mode selected
		return stageDefinitions.filter((stage) => stage.id === 'user-mode-selection');
	}

	return stageDefinitions.filter(
		(stage) => stage.showForModes.includes($userMode) || stage.showForModes.includes('all')
	);
});

/**
 * Get the current stage definition
 */
export const currentStageDefinition = derived(
	[currentStage, availableStages],
	([$currentStage, $availableStages]) => {
		return $availableStages[$currentStage] || null;
	}
);

/**
 * Check if current spec is complete and valid
 */
export const isSpecValid = derived(specDraft, ($specDraft) => {
	const validation = validateSpec($specDraft);
	return validation.isValid;
});

/**
 * Get visible fields for current stage (considering conditional logic)
 */
export const visibleFields = derived(
	[currentStageDefinition, specDraft],
	([$currentStageDefinition, $specDraft]) => {
		if (!$currentStageDefinition) return [];

		const filtered = $currentStageDefinition.fields.filter((field) => {
			if (!field.conditional) return true;
			return field.conditional($specDraft);
		});

		return filtered;
	}
);

/**
 * Get total number of stages for current user mode
 */
export const totalStages = derived(availableStages, ($availableStages) => $availableStages.length);

/**
 * Check if current stage is complete
 */
export const isCurrentStageComplete = derived(
	[currentStageDefinition, specDraft, visibleFields, userMode],
	([$currentStageDefinition, $specDraft, $visibleFields, $userMode]) => {
		if (!$currentStageDefinition) {
			return false;
		}

		// Special handling for user mode selection stage
		if ($currentStageDefinition.id === 'user-mode-selection') {
			return !!$userMode;
		}

		// Check if all required fields in visible fields are filled
		const incompleteFields = $visibleFields.filter((field) => {
			if (!field.required) return false;
			const value = getNestedValue($specDraft, field.name);
			return value === undefined || value === null || value === '';
		});

		return incompleteFields.length === 0;
	}
);

/**
 * Utility function to get nested object values
 */
function getNestedValue(obj, path) {
	return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Utility function to set nested object values
 */
function setNestedValue(obj, path, value) {
	const keys = path.split('.');
	const lastKey = keys.pop();
	const result = { ...obj };

	let current = result;
	for (const key of keys) {
		current[key] = { ...current[key] };
		current = current[key];
	}

	current[lastKey] = value;
	return result;
}

/**
 * Update a field value in the spec draft
 */
export function updateField(fieldName, value) {
	specDraft.update((draft) => {
		const newDraft = setNestedValue(draft, fieldName, value);

		// Special handling for user mode selection
		if (fieldName === 'userMode') {
			userMode.set(value);
			stageCompletion.set({});
			sessionMetadata.update((meta) => ({
				...meta,
				userModeSelected: true,
				lastModified: new Date().toISOString()
			}));
		}

		sessionMetadata.update((meta) => ({
			...meta,
			lastModified: new Date().toISOString()
		}));

		saveDraftToStorage(newDraft);
		return newDraft;
	});
}

/**
 * Set user mode with validation and persistence
 */
export function setUserMode(mode) {
	// Only developer mode is supported now
	if (mode !== 'developer') {
		console.warn('Invalid user mode:', mode, '- only developer mode is supported');
		return false;
	}

	userMode.set(mode);

	specDraft.update((draft) => {
		const newDraft = { ...draft };
		newDraft.userMode = mode;
		saveDraftToStorage(newDraft);
		return newDraft;
	});

	sessionMetadata.update((meta) => ({
		...meta,
		userModeSelected: true,
		lastModified: new Date().toISOString()
	}));

	stageCompletion.set({});
	return true;
}

/**
 * Navigate to next stage
 */
export function nextStage() {
	currentStage.update((stage) => {
		let nextStageIndex;
		availableStages.subscribe((stages) => {
			nextStageIndex = Math.min(stage + 1, stages.length - 1);
		})();

		stageCompletion.update((completion) => ({
			...completion,
			[stage]: true
		}));

		return nextStageIndex;
	});
}

/**
 * Navigate to previous stage
 */
export function previousStage() {
	currentStage.update((stage) => Math.max(stage - 1, 0));
}

/**
 * Jump to specific stage
 */
export function goToStage(stageIndex) {
	let maxStages;
	availableStages.subscribe((stages) => {
		maxStages = stages.length;
	})();

	if (stageIndex >= 0 && stageIndex < maxStages) {
		currentStage.set(stageIndex);
	}
}


/**
 * Save draft to localStorage
 */
function saveDraftToStorage(draft) {
	try {
		let currentStageCompletion, currentSessionMetadata;
		stageCompletion.subscribe((completion) => {
			currentStageCompletion = completion;
		})();
		sessionMetadata.subscribe((metadata) => {
			currentSessionMetadata = metadata;
		})();

		const draftWithMetadata = {
			...draft,
			_metadata: {
				savedAt: new Date().toISOString(),
				version: '2.0',
				userMode: draft.userMode,
				sessionId: currentSessionMetadata.sessionId,
				createdAt: currentSessionMetadata.createdAt,
				lastModified: new Date().toISOString(),
				stageCompletion: currentStageCompletion,
				userModeSelected: currentSessionMetadata.userModeSelected,
				availableStageIds: getAvailableStageIds(draft.userMode),
				currentStageIndex: getCurrentStageIndex(),
				schemaVersion: 'enhanced-v2.0',
				autoSaveEnabled: true
			}
		};

		localStorage.setItem('enhanced-questionnaire-draft', JSON.stringify(draftWithMetadata));

		const backupKey = `enhanced-questionnaire-backup-${Date.now()}`;
		localStorage.setItem(backupKey, JSON.stringify(draftWithMetadata));

		cleanupOldBackups();
	} catch (error) {
		console.warn('Failed to save draft to localStorage:', error);
	}
}

/**
 * Get available stage IDs for a given user mode
 */
function getAvailableStageIds(userModeValue) {
	if (!userModeValue) return ['user-mode-selection'];

	return stageDefinitions
		.filter((stage) => stage.showForModes.includes(userModeValue) || stage.showForModes.includes('all'))
		.map((stage) => stage.id);
}

/**
 * Get current stage index
 */
function getCurrentStageIndex() {
	let index = 0;
	currentStage.subscribe((stage) => {
		index = stage;
	})();
	return index;
}

/**
 * Clean up old backup drafts (keep only last 5)
 */
function cleanupOldBackups() {
	try {
		const backupKeys = [];
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key && key.startsWith('enhanced-questionnaire-backup-')) {
				backupKeys.push(key);
			}
		}

		backupKeys.sort((a, b) => {
			const timestampA = parseInt(a.split('-').pop());
			const timestampB = parseInt(b.split('-').pop());
			return timestampB - timestampA;
		});

		if (backupKeys.length > 5) {
			for (let i = 5; i < backupKeys.length; i++) {
				localStorage.removeItem(backupKeys[i]);
			}
		}
	} catch (error) {
		console.warn('Failed to cleanup old backups:', error);
	}
}

/**
 * Load draft from localStorage
 */
export function loadDraftFromStorage() {
	try {
		let saved = localStorage.getItem('enhanced-questionnaire-draft');
		let draft = null;
		let metadata = null;

		if (saved) {
			const savedData = JSON.parse(saved);
			draft = { ...savedData };

			if (draft._metadata) {
				metadata = draft._metadata;
				delete draft._metadata;
			}
		} else {
			saved = localStorage.getItem('questionnaire-draft');
			if (saved) {
				draft = JSON.parse(saved);
			}
		}

		if (draft) {
			specDraft.set(draft);

			if (draft.userMode) {
				userMode.set(draft.userMode);
			}

			if (metadata) {
				sessionMetadata.update((meta) => ({
					...meta,
					sessionId: metadata.sessionId || meta.sessionId,
					createdAt: metadata.createdAt || meta.createdAt,
					lastModified: metadata.lastModified || new Date().toISOString(),
					userModeSelected: metadata.userModeSelected || !!draft.userMode
				}));

				if (metadata.stageCompletion) {
					stageCompletion.set(metadata.stageCompletion);
				}

				if (metadata.currentStageIndex !== undefined) {
					const availableStageIds = getAvailableStageIds(draft.userMode);
					if (metadata.currentStageIndex < availableStageIds.length) {
						currentStage.set(metadata.currentStageIndex);
					}
				}
			}

			return { draft, metadata };
		}
	} catch (error) {
		console.warn('Failed to load draft from localStorage:', error);
	}
	return null;
}

/**
 * Clear draft from localStorage
 */
export function clearDraft(options = {}) {
	try {
		const { keepBackups = false, clearLegacy = true } = options;

		localStorage.removeItem('enhanced-questionnaire-draft');

		if (clearLegacy) {
			localStorage.removeItem('questionnaire-draft');
		}

		if (!keepBackups) {
			const backupKeys = [];
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (key && key.startsWith('enhanced-questionnaire-backup-')) {
					backupKeys.push(key);
				}
			}
			backupKeys.forEach((key) => localStorage.removeItem(key));
		}

		specDraft.set(createEmptySpec());
		userMode.set('');
		currentStage.set(0);
		stageCompletion.set({});
		validationErrors.set({});
		aiGuidance.set({
			isGenerating: false,
			suggestions: [],
			clarityCheck: '',
			missingInfoQuestions: []
		});
		sessionMetadata.set({
			sessionId: generateSessionId(),
			createdAt: new Date().toISOString(),
			lastModified: new Date().toISOString(),
			userModeSelected: false
		});

		return true;
	} catch (error) {
		console.warn('Failed to clear draft:', error);
		return false;
	}
}

/**
 * Generate a unique session ID
 */
function generateSessionId() {
	return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Initialize session metadata
 */
export function initializeSession() {
	sessionMetadata.update((meta) => ({
		...meta,
		sessionId: meta.sessionId || generateSessionId(),
		createdAt: meta.createdAt || new Date().toISOString(),
		lastModified: new Date().toISOString()
	}));
}

/**
 * Check if questionnaire is ready for spec generation
 */
export const canGenerateSpec = derived(
	[isSpecValid, stageCompletion, availableStages, userMode],
	([$isSpecValid, $stageCompletion, $availableStages, $userMode]) => {
		if (!$userMode) return false;

		const requiredStages = $availableStages.length;
		const completedStages = Object.keys($stageCompletion).filter(
			(key) => $stageCompletion[key]
		).length;

		return completedStages >= requiredStages - 1;
	}
);

/**
 * Check if ready to start building
 */
export const canStartBuild = canGenerateSpec;

/**
 * Get progress percentage
 */
export const progressPercentage = derived(
	[stageCompletion, availableStages, currentStage],
	([$stageCompletion, $availableStages, $currentStage]) => {
		const totalStagesCount = $availableStages.length;
		if (totalStagesCount === 0) return 0;

		const completedCount = Object.keys($stageCompletion).filter(
			(key) => $stageCompletion[key]
		).length;
		return Math.round((completedCount / totalStagesCount) * 100);
	}
);

/**
 * Generate AI guidance for current project state
 */
export async function generateAIGuidance() {
	aiGuidance.update((state) => ({ ...state, isGenerating: true }));

	try {
		let currentSpec;
		specDraft.subscribe((draft) => {
			currentSpec = draft;
		})();

		const response = await fetch('/api/questionnaire/guidance', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				spec: currentSpec,
				userMode: currentSpec.userMode
			})
		});

		if (response.ok) {
			const guidance = await response.json();

			aiGuidance.update((state) => ({
				...state,
				isGenerating: false,
				suggestions: guidance.suggestions || [],
				clarityCheck: guidance.clarityCheck || '',
				missingInfoQuestions: guidance.missingInfoQuestions || []
			}));

			return guidance;
		} else {
			throw new Error('Failed to generate AI guidance');
		}
	} catch (error) {
		console.error('Error generating AI guidance:', error);

		aiGuidance.update((state) => ({
			...state,
			isGenerating: false,
			suggestions: ['Unable to generate AI guidance at this time. Please continue with your current inputs.'],
			clarityCheck: 'AI guidance temporarily unavailable',
			missingInfoQuestions: []
		}));

		return null;
	}
}
