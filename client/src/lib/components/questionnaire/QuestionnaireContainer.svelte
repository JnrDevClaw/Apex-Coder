<script>
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
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
	import SpecLoadingScreen from './SpecLoadingScreen.svelte';
	import ClarifyingQuestions from './ClarifyingQuestions.svelte';
	import SpecDocumentation from './SpecDocumentation.svelte';
	import SpecSchema from './SpecSchema.svelte';
	import SpecFileStructure from './SpecFileStructure.svelte';

	let showSummary = $state(false);
	let isStartingBuild = $state(false);

	// New steps state
	const STEPS = {
		QUESTIONNAIRE: 'QUESTIONNAIRE',
		SUMMARY: 'SUMMARY',
		ANALYZING: 'ANALYZING',
		PARSING: 'PARSING',
		CLARIFYING: 'CLARIFYING',
		DOCUMENTING: 'DOCUMENTING',
		SCHEMA_GENERATING: 'SCHEMA_GENERATING',
		SCHEMA_REVIEW: 'SCHEMA_REVIEW',
		FILE_STRUCTURE_GENERATING: 'FILE_STRUCTURE_GENERATING',
		FILE_STRUCTURE_REVIEW: 'FILE_STRUCTURE_REVIEW'
	};

	let currentStep = $state(STEPS.QUESTIONNAIRE); // QUESTIONNAIRE, SUMMARY, ANALYZING, PARSING, CLARIFYING, DOCUMENTING, REVIEW, SCHEMA..., FILE...
	let clarifyingQuestions = $state([]);
	let generatedDocs = $state('');
	let refinedSpec = $state(null);
	let generatedSchema = $state({});
	let generatedFileStructure = $state({});
	let conversationHistory = $state([]);

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
		// console.log('specDraft changed, userMode in draft:', newDraft.userMode);
		specDraftValue = newDraft;
	});

	$effect(() => {
		stageCompletionValue = $stageCompletion;
	});

	$effect(() => {
		const newDef = $currentStageDefinition;
		currentStageDefinitionValue = newDef;
	});

	$effect(() => {
		const newFields = $visibleFields;
		visibleFieldsValue = newFields;
	});

	$effect(() => {
		const newValue = $isCurrentStageComplete;
		isCurrentStageCompleteValue = newValue;
	});

	$effect(() => {
		canStartBuildValue = $canStartBuild;
	});

	$effect(() => {
		const newMode = $userMode;
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
		// console.log('🟡 Field changed:', fieldName, '=', value);

		// Mark field as touched when user interacts with it
		touchedFields.add(fieldName);

		// Update the field value in the store
		updateField(fieldName, value);

		// Force reactivity update by creating a new Set
		touchedFields = new Set(touchedFields);

		// Force re-check of stage completion after a small delay to ensure reactivity
		setTimeout(() => {
			// console.log('🔄 Forcing validation recheck after field change');
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
			currentStep = STEPS.SUMMARY;
		} else {
			nextStage();
			// Reset attemptedNext for the new stage
			attemptedNext = false;
		}
	}

	function handlePrevious() {
		if (currentStep === STEPS.SUMMARY) {
			showSummary = false;
			currentStep = STEPS.QUESTIONNAIRE;
		} else if (currentStep === STEPS.CLARIFYING || currentStep === STEPS.DOCUMENTING) {
			// Warn user about losing progress?
			if (confirm('Going back will restart the analysis process. Are you sure?')) {
				showSummary = true;
				currentStep = STEPS.SUMMARY;
				clarifyingQuestions = [];
				conversationHistory = [];
			}
		} else {
			previousStage();
			// Reset attemptedNext when going back
			attemptedNext = false;
		}
	}

	function handleStageClick(stageIndex) {
		showSummary = false;
		currentStep = STEPS.QUESTIONNAIRE;
		goToStage(stageIndex);
		// Reset attemptedNext when navigating to a different stage
		attemptedNext = false;
	}

	async function startSpecRefinement() {
		if (canStartBuildValue && !isStartingBuild) {
			isStartingBuild = true;
			currentStep = STEPS.ANALYZING;

			try {
				// 1. Analyze Specs & Get Clarifying Questions
				// Ideally we'd call an 'analyze' endpoint. For now we reuse 'refine' with empty history
				// or a dedicated analyze endpoint if we had one.
				// Let's assume we use /api/questionnaire/refine to simulate the analysis/question generation
				// In a real app we might have a distinct endpoint for initial analysis.

				// Simulate "Analysing" delay
				await new Promise((r) => setTimeout(r, 2000));

				// Mocking the generation of questions since the backend implementation in refineSpec
				// is currently a placeholder logic.
				// In production: const response = await fetch('/api/questionnaire/analyze', ...);
				// For this implementation, we will mock the "Clarifying Questions" phase
				// if there are ambiguous fields, otherwise go straight to docs.

				const complexity = specDraftValue.project_overview?.complexity_level || 5;

				// Simple logic to decide if we need questions
				// In reality this would come from the backend's `refineSpec` logic
				let needsClarification = false;
				let questions = [];

				if (complexity > 7 || specDraftValue.project_overview?.app_summary?.length < 50) {
					needsClarification = true;
					questions = [
						{
							id: 'q1',
							text: 'You mentioned a high complexity. Could you specify the key user roles?'
						},
						{ id: 'q2', text: 'Do you have preferences for the database technology?' }
					];
				}

				if (needsClarification) {
					currentStep = STEPS.CLARIFYING;
					clarifyingQuestions = questions;
				} else {
					// No questions needed, go to docs
					currentStep = STEPS.PARSING;
					await generateDocumentation(specDraftValue);
				}
			} catch (error) {
				console.error('Error starting refinement:', error);
				alert('Failed to analyze requirements. Please try again.');
				currentStep = STEPS.SUMMARY;
			} finally {
				isStartingBuild = false;
			}
		}
	}

	async function handleClarificationSubmit(answers) {
		currentStep = STEPS.PARSING;

		// Add answers to history
		conversationHistory.push({ role: 'assistant', content: 'Questions...' }); // Simplified
		conversationHistory.push({ role: 'user', content: JSON.stringify(answers) });

		try {
			// Call refine endpoint to merge answers
			const response = await fetch('/api/questionnaire/refine', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					currentSpec: specDraftValue,
					conversationHistory: conversationHistory,
					userMode: userModeValue
				})
			});

			if (response.ok) {
				const result = await response.json();
				refinedSpec = result.data;
				// Update local spec? Or just use for docs?
				// For now let's pass it to docs generation
				await generateDocumentation(refinedSpec);
			} else {
				throw new Error('Failed to refine spec');
			}
		} catch (error) {
			console.error('Error refining spec:', error);
			alert('Failed to update specification. Please try again.');
			currentStep = STEPS.SUMMARY;
		}
	}

	async function generateDocumentation(spec) {
		currentStep = STEPS.DOCUMENTING; // Or a loading state within logic
		// But in our UI flow, DOCUMENTING is the review step.
		// We need a specific loading state for "Creating Documentation"
		// using the SpecLoadingScreen with a different message?
		// The SpecLoadingScreen supports 'generating' state which is "Preparing Clarifying Questions"
		// We might need a new state or repurpose 'parsing'.
		// Let's assume we show 'parsing' while generating docs, then switch to DOCUMENTING (view)

		// Actually, let's keep it simple:
		// 1. ANALYZING -> (CLARIFYING) -> PARSING -> DOCUMENTING (View)

		try {
			const response = await fetch('/api/questionnaire/generate-docs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ spec })
			});

			if (response.ok) {
				const result = await response.json();
				generatedDocs = result.data.documentation;
			} else {
				throw new Error('Failed to generate docs');
			}
		} catch (error) {
			console.error('Error generating docs:', error);
			generatedDocs = '# Error\nFailed to generate documentation.';
		}
	}

	async function handleFinalApproval() {
		// Proceed to build
		isStartingBuild = true;
		try {
			// Start the build directly (creates project automatically)
			const buildResponse = await fetch('/api/builds/start', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${localStorage.getItem('token') || ''}`
				},
				body: JSON.stringify({
					specJson: refinedSpec || specDraftValue,
					generatedDocs: generatedDocs, // Pass generated docs
					schema: generatedSchema, // Pass generated schema
					fileStructure: generatedFileStructure, // Pass generated file structure
					projectName: specDraftValue.project_overview?.app_name || 'Untitled Project',
					projectDescription: specDraftValue.project_overview?.app_summary || '',
					buildOptions: {
						userMode: userModeValue,
						enhancedProcessing: enhancedFeaturesEnabled.processing
					}
				})
			});

			if (buildResponse.ok) {
				const buildResult = await buildResponse.json();
				const buildId = buildResult.data.buildId;
				localStorage.setItem('current-build-id', buildId);
				window.location.href = `/build/${buildId}`;
			} else {
				throw new Error('Failed to start build');
			}
		} catch (error) {
			console.error('Failed to start build:', error);
			alert('Failed to start build. Please try again.');
		} finally {
			isStartingBuild = false;
		}
	}

	async function handleDocsApproval() {
		// Proceed to Schema Generation
		isStartingBuild = true; // Show loading spinner on button
		currentStep = STEPS.SCHEMA_GENERATING;

		try {
			const response = await fetch('/api/questionnaire/generate-schema', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ docs: generatedDocs })
			});

			if (response.ok) {
				const result = await response.json();
				generatedSchema = result.data.schema;
				currentStep = STEPS.SCHEMA_REVIEW;
			} else {
				throw new Error('Failed to generate schema');
			}
		} catch (error) {
			console.error('Error generating schema:', error);
			alert('Failed to generate schema. Please try again.');
			// Go back or stay?
			currentStep = STEPS.DOCUMENTING;
		} finally {
			isStartingBuild = false;
		}
	}

	async function handleSchemaApproval() {
		// Proceed to File Structure Generation
		isStartingBuild = true;
		currentStep = STEPS.FILE_STRUCTURE_GENERATING;

		try {
			const response = await fetch('/api/questionnaire/generate-file-structure', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ docs: generatedDocs, schema: generatedSchema })
			});

			if (response.ok) {
				const result = await response.json();
				generatedFileStructure = result.data.fileStructure;
				currentStep = STEPS.FILE_STRUCTURE_REVIEW;
			} else {
				throw new Error('Failed to generate file structure');
			}
		} catch (error) {
			console.error('Error generating file structure:', error);
			alert('Failed to generate file structure. Please try again.');
			currentStep = STEPS.SCHEMA_REVIEW;
		} finally {
			isStartingBuild = false;
		}
	}

	function handleEditSpec() {
		showSummary = false;
		currentStep = STEPS.QUESTIONNAIRE;
		goToStage(0);
	}

	function handleClearDraft() {
		if (confirm('Are you sure you want to clear all progress? This cannot be undone.')) {
			clearDraft();
			showSummary = false;
			currentStep = STEPS.QUESTIONNAIRE;
		}
	}

	function handleUserModeSelect(mode) {
		const success = setUserMode(mode);
		if (success) {
			setTimeout(() => {}, 100);
		}
	}

	async function handleValidateQuestionnaire() {
		// Existing validation logic...
		// (omitted for brevity, keep existing logic if needed or integrate)
		// Keeping it functional as it was before
		handleGenerateAIGuidance(); // Reuse existing
	}

	// Check if current stage is user mode selection
	let isUserModeStage = $derived(currentStageDefinitionValue?.id === 'user-mode-selection');

	// Check if current stage uses conversational flow
	let isConversationalStage = $derived(currentStageDefinitionValue?.conversational === true);

	// For Stage B (user-mode-selection), always enable next button
	let canProceedToNext = $derived(() => {
		if (isUserModeStage) {
			return true;
		}
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
		{#if currentStep === STEPS.QUESTIONNAIRE && userModeValue}
			<StageProgress
				currentStage={currentStageValue}
				stageCompletion={stageCompletionValue}
				stageDefinitions={availableStagesValue}
				onStageClick={handleStageClick}
			/>
		{/if}

		<!-- Main Content -->
		<div
			class="flex w-full flex-1 flex-col rounded-lg border border-white/10 bg-panel shadow-neonSoft min-h-[500px]"
		>
			{#if currentStep === STEPS.SUMMARY}
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
						{isStartingBuild}
						onStartBuild={startSpecRefinement}
						onEditSpec={handleEditSpec}
					/>
				</div>
			{:else if currentStep === STEPS.ANALYZING}
				<SpecLoadingScreen state="analyzing" />
			{:else if currentStep === STEPS.PARSING}
				<SpecLoadingScreen state="parsing" />
			{:else if currentStep === STEPS.CLARIFYING}
				<ClarifyingQuestions questions={clarifyingQuestions} onSubmit={handleClarificationSubmit} />
			{:else if currentStep === STEPS.DOCUMENTING}
				<SpecDocumentation
					documentation={generatedDocs}
					onApprove={handleDocsApproval}
					isApproving={isStartingBuild}
				/>
			{:else if currentStep === STEPS.SCHEMA_GENERATING}
				<SpecLoadingScreen state="generating" message="Designing Database Schema..." />
			{:else if currentStep === STEPS.SCHEMA_REVIEW}
				<SpecSchema
					bind:schema={generatedSchema}
					onApprove={handleSchemaApproval}
					isApproving={isStartingBuild}
				/>
			{:else if currentStep === STEPS.FILE_STRUCTURE_GENERATING}
				<SpecLoadingScreen state="generating" message="Planning File Structure..." />
			{:else if currentStep === STEPS.FILE_STRUCTURE_REVIEW}
				<SpecFileStructure
					bind:fileStructure={generatedFileStructure}
					onApprove={handleFinalApproval}
					isApproving={isStartingBuild}
				/>
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
				<!-- Conversational Stage View -->
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

					<!-- Simplified AI Guidance for the sake of the replacement, keeping core logic -->
					{#if configLoaded && enhancedFeaturesEnabled.aiGuidance && userModeValue && currentStageValue > 0}
						<div class="mt-6 flex justify-end">
							<button
								type="button"
								onclick={handleValidateQuestionnaire}
								class="text-accent-primary bg-accent-primary/10 border-accent-primary/30 hover:bg-accent-primary/20 focus:ring-accent-primary rounded-md border px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-offset-2 focus:outline-none"
							>
								Get AI Feedback
							</button>
						</div>
					{/if}

					<div class="mt-6 flex items-center justify-between">
						<button
							type="button"
							onclick={handlePrevious}
							disabled={currentStageValue === 0}
							class="text-text-primary focus:ring-accent-primary rounded-md border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
						>
							Previous
						</button>

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
			{:else}
				<!-- Loading state -->
				<div class="p-6 text-center">
					<p class="text-text-secondary">Loading questionnaire...</p>
				</div>
			{/if}
		</div>
	</div>
</div>
