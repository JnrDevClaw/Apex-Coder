<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import FormField from './FormField.svelte';
	
	const dispatch = createEventDispatcher();
	
	let { 
		stage, 
		fields = [], 
		spec = {}, 
		errors = {},
		isComplete = false 
	} = $props();
	
	// Track which sub-question we're on within this stage
	let currentSubStep = $state(0);
	let isTransitioning = $state(false);
	let showingReason = $state(true);
	
	// Get the current field to display
	let currentField = $derived(fields[currentSubStep] || null);
	let totalSubSteps = $derived(fields.length);
	let isLastSubStep = $derived(currentSubStep >= totalSubSteps - 1);
	let isFirstSubStep = $derived(currentSubStep === 0);
	
	// Check if current field has a value
	let currentFieldHasValue = $derived.by(() => {
		if (!currentField) return false;
		const value = getNestedValue(spec, currentField.name);
		if (value === undefined || value === null || value === '') return false;
		if (Array.isArray(value) && value.length === 0) return false;
		return true;
	});
	
	// Conversational context for each field - explains WHY we're asking
	const fieldReasons = {
		// User Journey stage (C)
		'user_flow.overview_flow': {
			icon: '🗺️',
			reason: "Understanding the user journey helps AI map out all the screens, navigation, and data flow your app needs.",
			tip: "Think about it like telling a story: what happens from the moment someone opens your app?"
		},
		'user_flow.key_user_actions': {
			icon: '⚡',
			reason: "These actions become the core features AI will build. Each action typically needs UI components, API endpoints, and database operations.",
			tip: "List the verbs - what will users DO in your app?"
		},
		
		// App Structure stage (D)
		'app_structure.app_type': {
			icon: '📱',
			reason: "This determines the technical architecture - responsive layouts, offline capabilities, and platform-specific optimizations.",
			tip: "Consider where your users will primarily access your app."
		},
		'app_structure.authentication_needed': {
			icon: '🔐',
			reason: "Authentication affects almost everything: database design, API security, user sessions, and privacy compliance.",
			tip: "Even simple apps often benefit from user accounts for personalization."
		},
		'app_structure.roles_or_permissions': {
			icon: '👥',
			reason: "Different user types need different access levels. AI uses this to build proper authorization logic.",
			tip: "Think about who uses your app and what each group should be able to do."
		},
		'app_structure.deployment_preference': {
			icon: '☁️',
			reason: "Your hosting choice affects costs, scalability, and deployment complexity. AI optimizes the code for your chosen platform.",
			tip: "Not sure? Vercel is great for most web apps, AWS for enterprise scale."
		},
		
		// Data & Privacy stage (E)
		'data_flow.data_sources': {
			icon: '📦',
			reason: "Knowing what data you collect helps AI design the right database schema, API endpoints, and storage solutions.",
			tip: "Think about everything users will input or generate: profiles, content, preferences, activity logs."
		},
		'data_flow.data_privacy': {
			icon: '🛡️',
			reason: "Privacy level determines encryption, access controls, audit logging, and compliance features AI will implement.",
			tip: "When in doubt, choose 'Private' - it's easier to relax security than add it later."
		},
		'data_flow.user_data_storage': {
			icon: '💾',
			reason: "Storage choice affects app architecture, offline capabilities, sync logic, and infrastructure costs.",
			tip: "Cloud is best for most apps. Local-only works for simple tools. Hybrid gives the best of both."
		},
		'data_flow.user_data_editable': {
			icon: '✏️',
			reason: "This determines if AI builds edit forms, update APIs, and data validation for user-controlled content.",
			tip: "Most apps let users edit their own data - it's expected for profiles, settings, and content."
		},
		'data_flow.data_shared_publicly': {
			icon: '👁️',
			reason: "Public data needs different handling: privacy controls, visibility settings, and content moderation features.",
			tip: "Social features usually mean some public data. Consider what users would want others to see."
		},
		'data_flow.analytics_or_tracking': {
			icon: '📈',
			reason: "Analytics help you understand users, but require additional code, privacy notices, and data handling.",
			tip: "Analytics are valuable for improving your app, but respect user privacy preferences."
		},
		
		// Project Clarification stage (G)
		'project_clarification.project_goals': {
			icon: '🎯',
			reason: "Clear goals help AI prioritize features and make smart trade-offs when building your app.",
			tip: "What problem are you solving? What does success look like?"
		},
		'project_clarification.success_metrics': {
			icon: '📊',
			reason: "Metrics guide AI in adding analytics, tracking, and the right data structures to measure what matters.",
			tip: "How will you know if your app is working? What numbers matter?"
		},
		'project_clarification.similar_apps': {
			icon: '💡',
			reason: "References help AI understand your vision faster - it can borrow proven patterns from apps you admire.",
			tip: "What apps do you wish yours was like? What do they do well?"
		},
		'project_clarification.unique_features': {
			icon: '✨',
			reason: "This is your competitive edge. AI will ensure these differentiators are prominently built into your app.",
			tip: "What will make users choose YOUR app over alternatives?"
		}
	};
	
	// Get reason for current field
	let currentReason = $derived(fieldReasons[currentField?.name] || {
		icon: '💬',
		reason: "This helps us understand your project better.",
		tip: ""
	});
	
	function getNestedValue(obj, path) {
		if (!path) return undefined;
		return path.split('.').reduce((current, key) => current?.[key], obj);
	}
	
	function handleFieldChange(fieldName, value) {
		dispatch('fieldChange', { fieldName, value });
	}
	
	async function handleSubStepNext() {
		if (isLastSubStep) {
			// Move to next main stage
			dispatch('next');
		} else {
			// Animate transition to next sub-step
			isTransitioning = true;
			showingReason = false;
			
			await new Promise(r => setTimeout(r, 200));
			currentSubStep++;
			
			await new Promise(r => setTimeout(r, 100));
			showingReason = true;
			isTransitioning = false;
		}
	}
	
	async function handleSubStepPrevious() {
		if (isFirstSubStep) {
			// Move to previous main stage
			dispatch('previous');
		} else {
			isTransitioning = true;
			showingReason = false;
			
			await new Promise(r => setTimeout(r, 200));
			currentSubStep--;
			
			await new Promise(r => setTimeout(r, 100));
			showingReason = true;
			isTransitioning = false;
		}
	}
	
	function handleSkip() {
		// Allow skipping optional fields
		if (!currentField?.required) {
			handleSubStepNext();
		}
	}
	
	// Reset sub-step when stage changes
	$effect(() => {
		if (stage?.id) {
			currentSubStep = 0;
			showingReason = true;
		}
	});
	
	// Find first unanswered question on mount
	onMount(() => {
		const firstUnanswered = fields.findIndex(field => {
			const value = getNestedValue(spec, field.name);
			return value === undefined || value === null || value === '';
		});
		if (firstUnanswered > 0) {
			currentSubStep = firstUnanswered;
		}
	});
</script>

<div class="conversational-stage">
	<!-- Stage Header with Progress -->
	<div class="stage-header mb-6">
		<div class="flex items-center justify-between mb-2">
			<h2 class="text-2xl font-bold text-text-primary">{stage.title}</h2>
			<div class="flex items-center gap-2 text-sm text-white/60">
				<span>Question {currentSubStep + 1} of {totalSubSteps}</span>
			</div>
		</div>
		
		<!-- Sub-step progress bar -->
		<div class="w-full h-1 bg-white/10 rounded-full overflow-hidden">
			<div 
				class="h-full bg-accent-primary transition-all duration-500 ease-out"
				style="width: {((currentSubStep + 1) / totalSubSteps) * 100}%"
			></div>
		</div>
	</div>
	
	<!-- Conversational Content -->
	<div class="stage-content min-h-[400px] flex flex-col">
		{#if currentField}
			<!-- Reason Card - Why we're asking -->
			<div 
				class="reason-card mb-6 p-4 rounded-xl bg-accent-primary/5 border border-accent-primary/20 transition-all duration-300"
				class:opacity-0={!showingReason}
				class:translate-y-2={!showingReason}
			>
				<div class="flex items-start gap-3">
					<span class="text-2xl">{currentReason.icon}</span>
					<div>
						<p class="text-white/80 text-sm leading-relaxed">
							{currentReason.reason}
						</p>
						{#if currentReason.tip}
							<p class="text-accent-primary/80 text-xs mt-2 italic">
								💡 {currentReason.tip}
							</p>
						{/if}
					</div>
				</div>
			</div>
			
			<!-- Question Card -->
			<div 
				class="question-card flex-1 transition-all duration-300"
				class:opacity-0={isTransitioning}
				class:translate-x-4={isTransitioning}
			>
				<FormField 
					field={currentField}
					value={spec}
					errors={errors[currentField.name] || []}
					onchange={(value) => handleFieldChange(currentField.name, value)}
				/>
			</div>
			
			<!-- Navigation -->
			<div class="navigation mt-8 flex items-center justify-between">
				<button
					type="button"
					onclick={handleSubStepPrevious}
					class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white/70 hover:text-white transition-colors"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
					</svg>
					{isFirstSubStep ? 'Previous Stage' : 'Back'}
				</button>
				
				<div class="flex items-center gap-3">
					{#if !currentField.required && !currentFieldHasValue}
						<button
							type="button"
							onclick={handleSkip}
							class="px-4 py-2 text-sm font-medium text-white/50 hover:text-white/70 transition-colors"
						>
							Skip for now
						</button>
					{/if}
					
					<button
						type="button"
						onclick={handleSubStepNext}
						disabled={currentField.required && !currentFieldHasValue}
						class="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-lg transition-all
							   bg-accent-primary text-black hover:shadow-neon
							   disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none"
					>
						{isLastSubStep ? 'Continue to Next Section' : 'Next Question'}
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
						</svg>
					</button>
				</div>
			</div>
			
			<!-- Quick Jump (for returning users) -->
			{#if totalSubSteps > 2}
				<div class="quick-jump mt-6 pt-4 border-t border-white/10">
					<p class="text-xs text-white/40 mb-2">Jump to question:</p>
					<div class="flex flex-wrap gap-2">
						{#each fields as field, index}
							{@const hasValue = (() => {
								const val = getNestedValue(spec, field.name);
								return val !== undefined && val !== null && val !== '';
							})()}
							<button
								type="button"
								onclick={() => { currentSubStep = index; }}
								class="w-8 h-8 rounded-full text-xs font-medium transition-all
									   {index === currentSubStep 
										 ? 'bg-accent-primary text-black' 
										 : hasValue 
										   ? 'bg-accent-success/20 text-accent-success border border-accent-success/30' 
										   : 'bg-white/5 text-white/40 hover:bg-white/10'}"
								title={field.label}
							>
								{index + 1}
							</button>
						{/each}
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.conversational-stage {
		max-width: 600px;
		margin: 0 auto;
		padding: 2rem;
	}
	
	.reason-card {
		animation: fadeSlideIn 0.4s ease-out;
	}
	
	.question-card {
		animation: fadeSlideIn 0.3s ease-out 0.1s both;
	}
	
	@keyframes fadeSlideIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
