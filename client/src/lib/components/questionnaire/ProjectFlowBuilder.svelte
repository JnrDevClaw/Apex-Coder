<script>
	import { createEventDispatcher } from 'svelte';
	
	const dispatch = createEventDispatcher();
	
	let { 
		field, 
		value = [], 
		errors = [], 
		onchange = () => {},
		onValidateFlow = null,
		showSuggestions = true
	} = $props();
	
	let draggedItem = null;
	let dragOverIndex = -1;
	let showFlowValidation = false;
	let validationResults = [];
	let isValidatingFlow = false;
	let showAddStageModal = false;
	let newStage = {
		stage_name: '',
		user_action: '',
		system_response: '',
		optional_data: '',
		next_stage: ''
	};
	
	// Common user journey templates
	const flowTemplates = [
		{
			name: 'E-commerce Flow',
			description: 'Standard online shopping experience',
			stages: [
				{ stage_name: 'Landing', user_action: 'Browse products', system_response: 'Display product catalog', optional_data: 'Search preferences', next_stage: 'Product View' },
				{ stage_name: 'Product View', user_action: 'View product details', system_response: 'Show product info and reviews', optional_data: 'Product ratings', next_stage: 'Add to Cart' },
				{ stage_name: 'Add to Cart', user_action: 'Add item to cart', system_response: 'Update cart and show total', optional_data: 'Cart contents', next_stage: 'Checkout' },
				{ stage_name: 'Checkout', user_action: 'Enter payment info', system_response: 'Process payment', optional_data: 'Payment details', next_stage: 'Confirmation' },
				{ stage_name: 'Confirmation', user_action: 'Review order', system_response: 'Send confirmation email', optional_data: 'Order details', next_stage: 'Complete' }
			]
		},
		{
			name: 'Social Media Flow',
			description: 'User engagement and content sharing',
			stages: [
				{ stage_name: 'Registration', user_action: 'Create account', system_response: 'Send welcome email', optional_data: 'Profile info', next_stage: 'Profile Setup' },
				{ stage_name: 'Profile Setup', user_action: 'Complete profile', system_response: 'Suggest connections', optional_data: 'Interests', next_stage: 'Feed' },
				{ stage_name: 'Feed', user_action: 'Browse content', system_response: 'Show personalized feed', optional_data: 'Engagement data', next_stage: 'Create Content' },
				{ stage_name: 'Create Content', user_action: 'Post content', system_response: 'Publish and notify followers', optional_data: 'Content metadata', next_stage: 'Engagement' },
				{ stage_name: 'Engagement', user_action: 'Like/comment/share', system_response: 'Update engagement metrics', optional_data: 'Social signals', next_stage: 'Feed' }
			]
		},
		{
			name: 'Learning Platform Flow',
			description: 'Educational content and progress tracking',
			stages: [
				{ stage_name: 'Course Discovery', user_action: 'Browse courses', system_response: 'Show course recommendations', optional_data: 'Learning preferences', next_stage: 'Course Enrollment' },
				{ stage_name: 'Course Enrollment', user_action: 'Enroll in course', system_response: 'Grant access to materials', optional_data: 'Enrollment data', next_stage: 'Learning' },
				{ stage_name: 'Learning', user_action: 'Complete lessons', system_response: 'Track progress and unlock content', optional_data: 'Progress data', next_stage: 'Assessment' },
				{ stage_name: 'Assessment', user_action: 'Take quiz/test', system_response: 'Provide feedback and scores', optional_data: 'Assessment results', next_stage: 'Certification' },
				{ stage_name: 'Certification', user_action: 'Complete course', system_response: 'Issue certificate', optional_data: 'Achievement data', next_stage: 'Next Course' }
			]
		}
	];
	
	// Initialize with empty stage if no value
	$effect(() => {
		if (!value || value.length === 0) {
			value = [{
				stage_name: '',
				user_action: '',
				system_response: '',
				optional_data: '',
				next_stage: ''
			}];
			onchange(value);
		}
	});
	
	// Add new stage
	function addStage() {
		const newStageData = {
			stage_name: '',
			user_action: '',
			system_response: '',
			optional_data: '',
			next_stage: ''
		};
		
		const updatedValue = [...value, newStageData];
		onchange(updatedValue);
	}
	
	// Remove stage
	function removeStage(index) {
		if (value.length <= 1) return; // Keep at least one stage
		
		const updatedValue = value.filter((_, i) => i !== index);
		onchange(updatedValue);
	}
	
	// Update stage field
	function updateStage(index, field, newValue) {
		const updatedValue = [...value];
		updatedValue[index] = { ...updatedValue[index], [field]: newValue };
		onchange(updatedValue);
	}
	
	// Apply flow template
	function applyTemplate(template) {
		onchange([...template.stages]);
		showAddStageModal = false;
	}
	
	// Drag and drop handlers
	function handleDragStart(event, index) {
		draggedItem = index;
		event.dataTransfer.effectAllowed = 'move';
	}
	
	function handleDragOver(event, index) {
		event.preventDefault();
		dragOverIndex = index;
	}
	
	function handleDragLeave() {
		dragOverIndex = -1;
	}
	
	function handleDrop(event, dropIndex) {
		event.preventDefault();
		
		if (draggedItem === null || draggedItem === dropIndex) {
			draggedItem = null;
			dragOverIndex = -1;
			return;
		}
		
		const updatedValue = [...value];
		const draggedStage = updatedValue[draggedItem];
		
		// Remove dragged item
		updatedValue.splice(draggedItem, 1);
		
		// Insert at new position
		const insertIndex = draggedItem < dropIndex ? dropIndex - 1 : dropIndex;
		updatedValue.splice(insertIndex, 0, draggedStage);
		
		onchange(updatedValue);
		
		draggedItem = null;
		dragOverIndex = -1;
	}
	
	// Validate flow logic
	async function validateFlow() {
		isValidatingFlow = true;
		validationResults = [];
		
		try {
			// Basic validation
			const results = [];
			
			// Check for empty stages
			value.forEach((stage, index) => {
				if (!stage.stage_name.trim()) {
					results.push({
						type: 'error',
						stage: index,
						message: 'Stage name is required'
					});
				}
				if (!stage.user_action.trim()) {
					results.push({
						type: 'error',
						stage: index,
						message: 'User action is required'
					});
				}
				if (!stage.system_response.trim()) {
					results.push({
						type: 'error',
						stage: index,
						message: 'System response is required'
					});
				}
			});
			
			// Check for circular references
			const stageNames = value.map(s => s.stage_name.toLowerCase().trim()).filter(Boolean);
			const duplicateNames = stageNames.filter((name, index) => stageNames.indexOf(name) !== index);
			if (duplicateNames.length > 0) {
				results.push({
					type: 'warning',
					message: `Duplicate stage names found: ${duplicateNames.join(', ')}`
				});
			}
			
			// Check flow connectivity
			value.forEach((stage, index) => {
				if (stage.next_stage && stage.next_stage !== 'Complete') {
					const nextStageExists = stageNames.some(name => 
						name === stage.next_stage.toLowerCase().trim()
					);
					if (!nextStageExists) {
						results.push({
							type: 'warning',
							stage: index,
							message: `Next stage "${stage.next_stage}" not found in flow`
						});
					}
				}
			});
			
			// Check for dead ends (stages with no next stage except the last one)
			value.forEach((stage, index) => {
				if (index < value.length - 1 && !stage.next_stage.trim()) {
					results.push({
						type: 'warning',
						stage: index,
						message: 'Stage has no next stage defined (potential dead end)'
					});
				}
			});
			
			// External validation if available
			if (onValidateFlow) {
				const externalResults = await onValidateFlow(value);
				if (externalResults && externalResults.length > 0) {
					results.push(...externalResults);
				}
			}
			
			// Generate suggestions
			if (results.filter(r => r.type === 'error').length === 0) {
				results.push({
					type: 'success',
					message: 'Flow structure looks good! Consider adding more detail to optional data fields.'
				});
			}
			
			validationResults = results;
		} catch (error) {
			console.warn('Flow validation failed:', error);
			validationResults = [{
				type: 'error',
				message: 'Unable to validate flow at this time'
			}];
		} finally {
			isValidatingFlow = false;
		}
	}
	
	// Toggle validation panel
	function toggleValidation() {
		showFlowValidation = !showFlowValidation;
		if (showFlowValidation) {
			validateFlow();
		}
	}
	
	// Get validation color class
	function getValidationColor(type) {
		switch (type) {
			case 'error': return 'text-red-600 bg-red-50 border-red-200';
			case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
			case 'success': return 'text-green-600 bg-green-50 border-green-200';
			default: return 'text-gray-600 bg-gray-50 border-gray-200';
		}
	}
	
	// Auto-validate when flow changes
	$effect(() => {
		if (showFlowValidation && value.length > 0) {
			const timeoutId = setTimeout(validateFlow, 500);
			return () => clearTimeout(timeoutId);
		}
	});
</script>

<div class="project-flow-builder">
	<div class="flex items-center justify-between mb-4">
		<label class="block text-sm font-medium text-gray-700">
			{field.label}
			{#if field.required}
				<span class="text-red-500">*</span>
			{/if}
		</label>
		
		<div class="flex gap-2">
			<button
				type="button"
				onclick={() => showAddStageModal = true}
				class="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
			>
				📋 Templates
			</button>
			<button
				type="button"
				onclick={toggleValidation}
				class="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700"
			>
				✓ Validate
			</button>
		</div>
	</div>
	
	{#if field.description}
		<p class="text-sm text-gray-500 mb-4">{field.description}</p>
	{/if}
	
	<!-- Flow Stages -->
	<div class="space-y-4">
		{#each value as stage, index (index)}
			<div
				class="flow-stage border border-gray-200 rounded-lg p-4 bg-white"
				class:border-blue-300={dragOverIndex === index}
				class:bg-blue-50={dragOverIndex === index}
				draggable="true"
				ondragstart={(e) => handleDragStart(e, index)}
				ondragover={(e) => handleDragOver(e, index)}
				ondragleave={handleDragLeave}
				ondrop={(e) => handleDrop(e, index)}
			>
				<div class="flex items-center justify-between mb-3">
					<div class="flex items-center gap-2">
						<span class="drag-handle cursor-move text-gray-400 hover:text-gray-600">⋮⋮</span>
						<h4 class="text-sm font-medium text-gray-900">Stage {index + 1}</h4>
					</div>
					
					<div class="flex gap-2">
						{#if value.length > 1}
							<button
								type="button"
								onclick={() => removeStage(index)}
								class="text-red-600 hover:text-red-800 text-sm"
								title="Remove stage"
							>
								🗑️
							</button>
						{/if}
					</div>
				</div>
				
				<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-1">
							Stage Name *
						</label>
						<input
							type="text"
							value={stage.stage_name}
							placeholder="e.g., User Registration"
							oninput={(e) => updateStage(index, 'stage_name', e.target.value)}
							class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
						/>
					</div>
					
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-1">
							Next Stage
						</label>
						<input
							type="text"
							value={stage.next_stage}
							placeholder="e.g., Profile Setup or Complete"
							oninput={(e) => updateStage(index, 'next_stage', e.target.value)}
							class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
						/>
					</div>
					
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-1">
							User Action *
						</label>
						<input
							type="text"
							value={stage.user_action}
							placeholder="e.g., Fill registration form"
							oninput={(e) => updateStage(index, 'user_action', e.target.value)}
							class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
						/>
					</div>
					
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-1">
							System Response *
						</label>
						<input
							type="text"
							value={stage.system_response}
							placeholder="e.g., Create account and send welcome email"
							oninput={(e) => updateStage(index, 'system_response', e.target.value)}
							class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
						/>
					</div>
					
					<div class="md:col-span-2">
						<label class="block text-xs font-medium text-gray-700 mb-1">
							Optional Data Collected
						</label>
						<input
							type="text"
							value={stage.optional_data}
							placeholder="e.g., Email, name, preferences"
							oninput={(e) => updateStage(index, 'optional_data', e.target.value)}
							class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
						/>
					</div>
				</div>
				
				<!-- Flow Arrow -->
				{#if index < value.length - 1}
					<div class="flex justify-center mt-3">
						<div class="text-gray-400">↓</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>
	
	<!-- Add Stage Button -->
	<div class="mt-4 flex justify-center">
		<button
			type="button"
			onclick={addStage}
			class="px-4 py-2 text-sm bg-gray-100 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
		>
			+ Add Stage
		</button>
	</div>
	
	<!-- Flow Validation Panel -->
	{#if showFlowValidation}
		<div class="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-md">
			<div class="flex items-center justify-between mb-3">
				<h4 class="text-sm font-medium text-gray-900">Flow Validation</h4>
				{#if isValidatingFlow}
					<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
				{:else}
					<button
						type="button"
						onclick={validateFlow}
						class="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
					>
						Re-validate
					</button>
				{/if}
			</div>
			
			{#if validationResults.length > 0}
				<div class="space-y-2">
					{#each validationResults as result}
						<div class="p-2 rounded border {getValidationColor(result.type)}">
							<div class="flex items-start gap-2">
								<span class="text-xs">
									{#if result.type === 'error'}❌
									{:else if result.type === 'warning'}⚠️
									{:else if result.type === 'success'}✅
									{:else}ℹ️{/if}
								</span>
								<div class="flex-1">
									<p class="text-xs">{result.message}</p>
									{#if result.stage !== undefined}
										<p class="text-xs opacity-75">Stage {result.stage + 1}</p>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else if !isValidatingFlow}
				<p class="text-sm text-gray-500">Click "Re-validate" to check your flow</p>
			{/if}
		</div>
	{/if}
	
	<!-- Template Modal -->
	{#if showAddStageModal}
		<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
			<div class="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
				<div class="flex items-center justify-between mb-4">
					<h3 class="text-lg font-medium text-gray-900">Flow Templates</h3>
					<button
						type="button"
						onclick={() => showAddStageModal = false}
						class="text-gray-400 hover:text-gray-600"
					>
						✕
					</button>
				</div>
				
				<div class="space-y-4">
					{#each flowTemplates as template}
						<div class="border border-gray-200 rounded-lg p-4">
							<div class="flex items-start justify-between mb-2">
								<div>
									<h4 class="text-sm font-medium text-gray-900">{template.name}</h4>
									<p class="text-xs text-gray-500">{template.description}</p>
								</div>
								<button
									type="button"
									onclick={() => applyTemplate(template)}
									class="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
								>
									Use Template
								</button>
							</div>
							
							<div class="text-xs text-gray-600">
								<strong>Stages:</strong> {template.stages.map(s => s.stage_name).join(' → ')}
							</div>
						</div>
					{/each}
				</div>
				
				<div class="mt-4 flex justify-end">
					<button
						type="button"
						onclick={() => showAddStageModal = false}
						class="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	{/if}
	
	<!-- Validation Errors -->
	{#if errors.length > 0}
		<div class="mt-2">
			{#each errors as error}
				<p class="text-sm text-red-600">{error}</p>
			{/each}
		</div>
	{/if}
	
	<!-- Field Help Text -->
	{#if field.helpText}
		<p class="mt-2 text-xs text-gray-500">{field.helpText}</p>
	{/if}
</div>

<style>
	.flow-stage {
		transition: all 0.2s ease;
	}
	
	.flow-stage:hover {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}
	
	.drag-handle {
		cursor: grab;
		user-select: none;
	}
	
	.drag-handle:active {
		cursor: grabbing;
	}
	
	/* Loading animation */
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	
	.animate-spin {
		animation: spin 1s linear infinite;
	}
</style>
