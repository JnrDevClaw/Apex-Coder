<script>
	import { onMount } from 'svelte';
	import {
		currentStage,
		specDraft,
		validationErrors,
		stageCompletion,
		stageDefinitions,
		availableStages,
		totalStages,
		currentStageDefinition,
		visibleFields,
		isCurrentStageComplete,
		isSpecValid,
		canStartBuild,
		userMode,
		sessionMetadata,
		aiGuidance,
		updateField,
		nextStage,
		previousStage,
		goToStage,
		loadDraftFromStorage,
		clearDraft,
		setUserMode,
		generateAIGuidance
	} from '../../stores/questionnaire.js';
	import { validateSpec, formatValidationErrors } from '../../schemas/spec.js';
	import configService from '../../services/config.js';

	import QuestionnaireStage from './QuestionnaireStage.svelte';
	import ConversationalStage from './ConversationalStage.svelte';
	import UserModeSelector from './UserModeSelector.svelte';
	import StageProgress from './StageProgress.svelte';
	import SpecSummary from './SpecSummary.svelte';

	let showSummary = $state(false);
	let isStartingBuild = $state(false);

	// Reactive values from stores
	let currentStageValue = $state(0);
	let specDraftValue = $state({});
	let stageCompletionValue = $state({});
	let currentStageDefinitionValue = $state(null);
	let visibleFieldsValue = $state([]);
	let isCurrentStageCompleteValue = $state(true); // Initialize to true since validation is disabled
	let canStartBuildValue = $state(false);
	let validationErrorsValue = $state({});
	let touchedFields = $state(new Set()); // Track which fields have been interacted with
	let attemptedNext = $state(false); // Track if user tried to proceed
	let userModeValue = $state('');
	let availableStagesValue = $state([]);
	let totalStagesValue = $state(0);
	let aiGuidanceValue = $state({
		isGenerating: false,
		suggestions: [],
		clarityCheck: '',
		missingInfoQuestions: []
	});
	let configLoaded = $state(false);
	let enhancedFeaturesEnabled = $state({
		processing: false,
		aiGuidance: false,
		technicalInference: false,
		contextualHelp: false
	});
	


	// Subscribe to store changes
	$effect(() => {
		currentStageValue = $currentStage;
	});

	$effect(() => {
		const newDraft = $specDraft;
		console.log('specDraft changed, userMode in draft:', newDraft.userMode);
		specDraftValue = newDraft;
	});

	$effect(() => {
		stageCompletionValue = $stageCompletion;
	});

	$effect(() => {
		const newDef = $currentStageDefinition;
		console.log('🔶 currentStageDefinition changed:', newDef);
		console.log('🔶 currentStageDefinition ID:', newDef?.id);
		console.log('🔶 currentStageDefinition fields:', newDef?.fields?.length);
		currentStageDefinitionValue = newDef;
	});

	$effect(() => {
		const newFields = $visibleFields;
		console.log('🟣 visibleFields changed:', {
			count: newFields.length,
			fieldNames: newFields.map(f => f.name),
			stage: currentStageDefinitionValue?.id,
			fullFields: newFields
		});
		visibleFieldsValue = newFields;
	});

	$effect(() => {
		const newValue = $isCurrentStageComplete;
		console.log('🔄 isCurrentStageComplete changed to:', newValue);
		console.log('🔄 Current stage:', currentStageDefinitionValue?.id);
		console.log('🔄 User mode:', userModeValue);
		console.log('🔄 specDraft:', specDraftValue);
		isCurrentStageCompleteValue = newValue;
	});

	$effect(() => {
		canStartBuildValue = $canStartBuild;
	});

	$effect(() => {
		const newMode = $userMode;
		console.log('userMode store changed to:', newMode);
		userModeValue = newMode;
	});

	$effect(() => {
		availableStagesValue = $availableStages;
	});

	$effect(() => {
		totalStagesValue = $totalStages;
	});

	$effect(() => {
		aiGuidanceValue = $aiGuidance;
	});

	// Update validation errors when spec changes, but only show for touched fields or after attempted next
	$effect(() => {
		const validation = validateSpec(specDraftValue);
		if (!validation.isValid) {
			const allErrors = formatValidationErrors(validation.errors);

			// Only show errors for fields that have been touched or if user attempted to proceed
			if (attemptedNext) {
				validationErrorsValue = allErrors;
			} else {
				const filteredErrors = {};
				for (const [fieldName, errors] of Object.entries(allErrors)) {
					if (touchedFields.has(fieldName)) {
						filteredErrors[fieldName] = errors;
					}
				}
				validationErrorsValue = filteredErrors;
			}
		} else {
			validationErrorsValue = {};
		}
	});

	onMount(async () => {
		// Initialize configuration service
		await configService.initialize();

		// Load feature flags
		enhancedFeaturesEnabled = {
			processing: await configService.isEnhancedProcessingEnabled(),
			aiGuidance: await configService.isAIGuidanceEnabled(),
			technicalInference: await configService.isTechnicalInferenceEnabled(),
			contextualHelp: await configService.isContextualHelpEnabled()
		};

		configLoaded = true;

		// Load any saved draft from localStorage
		loadDraftFromStorage();
	});

	function handleFieldChange(event) {
		const { fieldName, value } = event.detail;
		console.log('🟡 Field changed:', fieldName, '=', value);
		
		// Mark field as touched when user interacts with it
		touchedFields.add(fieldName);
		
		// Update the field value in the store
		updateField(fieldName, value);
		
		// Force reactivity update by creating a new Set
		touchedFields = new Set(touchedFields);
		
		// Force re-check of stage completion after a small delay to ensure reactivity
		setTimeout(() => {
			console.log('🔄 Forcing validation recheck after field change');
			// The $effect watching isCurrentStageComplete will automatically update
		}, 50);
	}

	function handleNext() {
		// Mark that user attempted to proceed (this will show all validation errors)
		attemptedNext = true;

		// Always proceed - validation disabled
		if (currentStageValue === availableStagesValue.length - 1) {
			// Last stage - show summary
			showSummary = true;
		} else {
			nextStage();
			// Reset attemptedNext for the new stage
			attemptedNext = false;
		}
	}

	function handlePrevious() {
		if (showSummary) {
			showSummary = false;
		} else {
			previousStage();
			// Reset attemptedNext when going back
			attemptedNext = false;
		}
	}

	function handleStageClick(stageIndex) {
		showSummary = false;
		goToStage(stageIndex);
		// Reset attemptedNext when navigating to a different stage
		attemptedNext = false;
	}

	async function handleStartBuild() {
		if (canStartBuildValue && !isStartingBuild) {
			isStartingBuild = true;
			try {
				// For non-developer users, first infer technical stack if feature is enabled
				let processedSpec = specDraftValue;

				if (userModeValue === 'non-developer' && enhancedFeaturesEnabled.technicalInference) {
					const techInferenceResponse = await fetch('/api/questionnaire/infer-tech', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							projectData: specDraftValue,
							options: {
								includeAlternatives: true,
								includeReasoning: true
							}
						})
					});

					if (techInferenceResponse.ok) {
						const techResult = await techInferenceResponse.json();
						console.log('Technical stack inferred:', techResult);

						// Add inferred technical stack to spec
						processedSpec = {
							...specDraftValue,
							technical_inference: techResult.data,
							inferred_technical_blueprint: techResult.data.recommendedStack
						};
					} else if (techInferenceResponse.status === 503) {
						// Feature disabled, continue without technical inference
						console.log('Technical inference disabled, proceeding without it');
					}
				}

				// Always use the enhanced processing endpoint
				// The backend will handle feature flags internally
				const endpoint = '/api/questionnaire/process';

				const response = await fetch(endpoint, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						questionnaireData: processedSpec,
						userMode: userModeValue,
						options: {
							allowIncomplete: false,
							includeAlternatives: true,
							generatePreview: true
						}
					})
				});

				if (response.ok) {
					const result = await response.json();
					console.log('Questionnaire processed successfully:', result);

					// Store the processed result for potential use
					localStorage.setItem('processed-questionnaire-result', JSON.stringify(result));

					// Start the build directly (creates project automatically)
					const buildResponse = await fetch('/api/builds/start', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
						},
						body: JSON.stringify({
							specJson: processedSpec,
							projectName: processedSpec.project_overview?.app_name || 'Untitled Project',
							projectDescription: processedSpec.project_overview?.app_summary || '',
							buildOptions: {
								userMode: userModeValue,
								enhancedProcessing: enhancedFeaturesEnabled.processing
							}
						})
					});

					if (buildResponse.ok) {
						const buildResult = await buildResponse.json();
						console.log('Build started successfully:', buildResult);

						// Store build info for later use
						const buildId = buildResult.data.buildId;
						const projectId = buildResult.data.projectId;
						localStorage.setItem('current-build-id', buildId);
						localStorage.setItem('current-build-info', JSON.stringify(buildResult.data));
						localStorage.setItem('current-project-id', projectId);

						// Navigate to build status page
						window.location.href = `/build/${buildId}`;
					} else {
						const buildError = await buildResponse.json();
						console.error('Failed to start build:', buildError);
						alert('Failed to start build. Please try again.');
					}
				} else if (response.status === 503) {
					// Enhanced processing disabled, show appropriate message
					alert(
						'Enhanced processing is currently unavailable. Please try again later or contact support.'
					);
				} else {
					const error = await response.json();
					console.error('Failed to process questionnaire:', error);
					alert('Failed to process questionnaire. Please check your responses and try again.');
				}
			} catch (error) {
				console.error('Error processing questionnaire:', error);
				alert('Network error occurred. Please try again.');
			} finally {
				isStartingBuild = false;
			}
		}
	}

	function handleEditSpec() {
		showSummary = false;
		goToStage(0);
	}

	function handleClearDraft() {
		if (confirm('Are you sure you want to clear all progress? This cannot be undone.')) {
			clearDraft();
			showSummary = false;
		}
	}

	function handleUserModeSelect(mode) {
		console.log('handleUserModeSelect called with mode:', mode);
		const success = setUserMode(mode);
		console.log('setUserMode returned:', success);
		console.log('isCurrentStageCompleteValue after setUserMode:', isCurrentStageCompleteValue);

		if (success) {
			// Force a small delay to ensure reactivity has propagated
			setTimeout(() => {
				console.log('isCurrentStageCompleteValue in timeout:', isCurrentStageCompleteValue);
				// Don't auto-advance, let user click the button
				// nextStage();
			}, 100);
		}
	}

	async function handleGenerateAIGuidance() {
		try {
			await generateAIGuidance();
		} catch (error) {
			console.error('Failed to generate AI guidance:', error);
		}
	}

	async function handleValidateQuestionnaire() {
		try {
			// Only proceed if enhanced validation is enabled
			if (!enhancedFeaturesEnabled.aiGuidance) {
				console.log('AI guidance disabled, skipping validation');
				return;
			}

			const response = await fetch('/api/questionnaire/validate', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					questionnaireData: specDraftValue,
					userMode: userModeValue,
					validationType: 'comprehensive'
				})
			});

			if (response.ok) {
				const result = await response.json();
				console.log('Questionnaire validation result:', result);

				// Update validation errors with server response
				if (result.data.validation && !result.data.validation.isValid) {
					validationErrorsValue = result.data.validation.errors || {};
				}

				// Show AI guidance if available
				if (result.data.guidance) {
					aiGuidanceValue = {
						...aiGuidanceValue,
						suggestions: result.data.guidance.suggestions || [],
						clarityCheck: result.data.guidance.clarity_assessment || '',
						missingInfoQuestions: result.data.guidance.follow_up_questions || []
					};
				}
			} else if (response.status === 503) {
				console.log('AI guidance service disabled');
			}
		} catch (error) {
			console.error('Failed to validate questionnaire:', error);
		}
	}

	// Check if current stage is user mode selection
	let isUserModeStage = $derived(currentStageDefinitionValue?.id === 'user-mode-selection');
	
	// Check if current stage uses conversational flow
	let isConversationalStage = $derived(currentStageDefinitionValue?.conversational === true);
	
	// For Stage B (user-mode-selection), always enable next button
	let canProceedToNext = $derived(() => {
		if (isUserModeStage) {
			// Stage B: Always allow proceeding (no validation needed)
			return true;
		}
		// Other stages: Use the completion check
		return isCurrentStageCompleteValue;
	});
</script>

<div class="questionnaire-container flex min-h-screen flex-col bg-bg-primary py-8">
	<div class="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 sm:px-6 lg:px-8">
		<!-- Header -->
		<div class="mb-8 text-center">
			<h1 class="text-text-primary text-3xl font-bold">AI App Builder</h1>
			<p class="text-text-secondary mt-2 text-lg">
				Tell us about your project and we'll build it for you
			</p>
		</div>

		<!-- Progress Indicator -->
		{#if !showSummary && userModeValue}
			<StageProgress
				currentStage={currentStageValue}
				stageCompletion={stageCompletionValue}
				stageDefinitions={availableStagesValue}
				onStageClick={handleStageClick}
			/>
		{/if}

		<!-- Main Content - No inner scroll, let page scroll naturally -->
		<div class="flex w-full flex-1 flex-col rounded-lg border border-white/10 bg-panel shadow-neonSoft">
			{#if showSummary}
				<!-- Summary View -->
				<div class="p-6">
					<div class="mb-6 flex items-center justify-between">
						<h2 class="text-text-primary text-2xl font-bold">Review Your Specification</h2>
						<button
							type="button"
							onclick={handleClearDraft}
							class="text-accent-error hover:text-accent-error/80 text-sm font-medium"
						>
							Clear All
						</button>
					</div>

					<SpecSummary
						spec={specDraftValue}
						canStartBuild={canStartBuildValue}
						isStartingBuild={isStartingBuild}
						onStartBuild={handleStartBuild}
						onEditSpec={handleEditSpec}
					/>

					<div class="mt-6 flex justify-between">
						<button
							type="button"
							onclick={handlePrevious}
							class="text-text-primary focus:ring-accent-primary rounded-md border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20 focus:ring-2 focus:ring-offset-2 focus:outline-none"
						>
							Back to Questionnaire
						</button>
					</div>
				</div>
			{:else if isUserModeStage}
				<!-- User Mode Selection -->
				<div class="p-6">
					<UserModeSelector selectedMode={userModeValue} onModeSelect={handleUserModeSelect} />

					<!-- Navigation for user mode stage -->
					<div class="mt-8 flex justify-center">
						<button
							type="button"
							onclick={handleNext}
							class="bg-accent-primary hover:shadow-neon focus:ring-accent-primary rounded-md border border-transparent px-6 py-3 text-sm font-semibold text-black transition-all focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
						>
							Continue with Developer Mode
						</button>
					</div>
				</div>
			{:else if isConversationalStage && currentStageDefinitionValue}
				<!-- Conversational Stage View (for stages C, D, G) -->
				<div class="p-6 w-full">
					<ConversationalStage
						stage={currentStageDefinitionValue}
						fields={visibleFieldsValue}
						spec={specDraftValue}
						errors={validationErrorsValue}
						isComplete={isCurrentStageCompleteValue}
						on:fieldChange={handleFieldChange}
						on:next={handleNext}
						on:previous={handlePrevious}
					/>
				</div>
			{:else if currentStageDefinitionValue}
				<!-- Regular Stage View -->
				<div class="p-6 w-full">
					<QuestionnaireStage
						stage={currentStageDefinitionValue}
						fields={visibleFieldsValue}
						spec={specDraftValue}
						errors={validationErrorsValue}
						isComplete={isCurrentStageCompleteValue}
						onfieldChange={handleFieldChange}
						onnext={handleNext}
						onprevious={handlePrevious}
					/>

					<!-- AI Guidance Panel -->
					{#if configLoaded && enhancedFeaturesEnabled.aiGuidance && userModeValue && (aiGuidanceValue.suggestions.length > 0 || aiGuidanceValue.missingInfoQuestions.length > 0)}
						<div class="bg-accent-primary/10 border-accent-primary/30 mt-6 rounded-lg border p-4">
							<div class="mb-3 flex items-center justify-between">
								<h3 class="text-accent-primary text-sm font-semibold">AI Guidance</h3>
								<button
									type="button"
									onclick={handleGenerateAIGuidance}
									disabled={aiGuidanceValue.isGenerating}
									class="text-accent-primary hover:text-accent-primary/80 text-xs font-medium disabled:opacity-50 flex items-center gap-2"
									aria-label={aiGuidanceValue.isGenerating ? 'Generating AI guidance' : 'Refresh AI guidance'}
								>
									{#if aiGuidanceValue.isGenerating}
										<div class="w-3 h-3 border border-accent-primary border-t-transparent rounded-full animate-spin"></div>
										<span>Generating...</span>
									{:else}
										<span>Refresh Guidance</span>
									{/if}
								</button>
							</div>

							{#if aiGuidanceValue.clarityCheck}
								<div class="mb-3">
									<h4 class="text-text-primary mb-1 text-xs font-semibold">Clarity Assessment</h4>
									<p class="text-text-secondary text-xs">{aiGuidanceValue.clarityCheck}</p>
								</div>
							{/if}

							{#if aiGuidanceValue.suggestions.length > 0}
								<div class="mb-3">
									<h4 class="text-text-primary mb-1 text-xs font-semibold">Suggestions</h4>
									<ul class="text-text-secondary space-y-1 text-xs">
										{#each aiGuidanceValue.suggestions as suggestion}
											<li class="flex items-start">
												<span class="text-accent-primary mr-1">•</span>
												{suggestion}
											</li>
										{/each}
									</ul>
								</div>
							{/if}

							{#if aiGuidanceValue.missingInfoQuestions.length > 0}
								<div>
									<h4 class="text-text-primary mb-1 text-xs font-semibold">
										Consider These Questions
									</h4>
									<ul class="text-text-secondary space-y-1 text-xs">
										{#each aiGuidanceValue.missingInfoQuestions as question}
											<li class="flex items-start">
												<span class="text-accent-primary mr-1">?</span>
												{question}
											</li>
										{/each}
									</ul>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Enhanced Navigation with Validation -->
					<div class="mt-6 flex items-center justify-between">
						<button
							type="button"
							onclick={handlePrevious}
							disabled={currentStageValue === 0}
							class="text-text-primary focus:ring-accent-primary rounded-md border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
						>
							Previous
						</button>

						<div class="flex space-x-2">
							{#if configLoaded && enhancedFeaturesEnabled.aiGuidance && userModeValue && currentStageValue > 0}
								<button
									type="button"
									onclick={handleValidateQuestionnaire}
									class="text-accent-primary bg-accent-primary/10 border-accent-primary/30 hover:bg-accent-primary/20 focus:ring-accent-primary rounded-md border px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-offset-2 focus:outline-none"
								>
									Get AI Feedback
								</button>
							{/if}

							<button
								type="button"
								onclick={handleNext}
								disabled={!canProceedToNext}
								class="bg-accent-primary hover:shadow-neon focus:ring-accent-primary rounded-md border border-transparent px-6 py-2 text-sm font-semibold text-black transition-all focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
							>
								{currentStageValue === availableStagesValue.length - 1 ? 'Review' : 'Next'}
							</button>
						</div>
					</div>
				</div>
			{:else}
				<!-- Loading state -->
				<div class="p-6 text-center">
					<p class="text-text-secondary">Loading questionnaire...</p>
				</div>
			{/if}
		</div>

		<!-- Debug Info (remove in production) -->
		{#if import.meta.env.DEV}
			<div class="bg-bg-secondary mt-8 rounded-lg border border-white/20 p-4 text-xs">
				<details>
					<summary class="text-text-primary cursor-pointer font-medium">Debug Info (Mock Mode)</summary>
					<pre class="text-text-secondary mt-2 overflow-auto">{JSON.stringify(
							{
								currentStage: currentStageValue,
								userMode: userModeValue,
								totalStages: totalStagesValue,
								isComplete: isCurrentStageCompleteValue,
								mockMode: true
							},
							null,
							2
						)}</pre>
				</details>
			</div>
		{/if}
	</div>
</div>

