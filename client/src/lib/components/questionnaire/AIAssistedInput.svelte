<script>
	import { createEventDispatcher } from 'svelte';
	
	const dispatch = createEventDispatcher();
	
	let { 
		field, 
		value = '', 
		errors = [], 
		placeholder = '',
		disabled = false,
		aiSuggestions = [],
		isLoadingAI = false,
		showAIHelp = true,
		contextualHelp = '',
		onchange = () => {},
		onAIRequest = null
	} = $props();
	
	let inputElement;
	let showSuggestions = $state(false);
	let selectedSuggestionIndex = $state(-1);
	let aiHelpExpanded = $state(false);
	let debounceTimer;
	
	// Handle input changes with debounced AI assistance
	function handleInput(event) {
		const newValue = event.target.value;
		onchange(newValue);
		
		// Debounce AI suggestions request
		if (onAIRequest && newValue.length > 3) {
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				requestAISuggestions(newValue);
			}, 500);
		}
		
		// Hide suggestions when input is cleared
		if (newValue.length === 0) {
			showSuggestions = false;
		}
	}
	
	// Request AI suggestions for current input
	async function requestAISuggestions(inputValue) {
		if (!onAIRequest) return;
		
		try {
			await onAIRequest(inputValue, field);
		} catch (error) {
			console.warn('Failed to get AI suggestions:', error);
		}
	}
	
	// Apply selected AI suggestion
	function applySuggestion(suggestion) {
		onchange(suggestion);
		showSuggestions = false;
		selectedSuggestionIndex = -1;
		inputElement?.focus();
	}
	
	// Handle keyboard navigation for suggestions
	function handleKeydown(event) {
		if (!showSuggestions || aiSuggestions.length === 0) return;
		
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, aiSuggestions.length - 1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
				break;
			case 'Enter':
				event.preventDefault();
				if (selectedSuggestionIndex >= 0) {
					applySuggestion(aiSuggestions[selectedSuggestionIndex]);
				}
				break;
			case 'Escape':
				showSuggestions = false;
				selectedSuggestionIndex = -1;
				break;
		}
	}
	
	// Show suggestions when input is focused and has suggestions
	function handleFocus() {
		if (aiSuggestions.length > 0) {
			showSuggestions = true;
		}
	}
	
	// Hide suggestions when clicking outside
	function handleBlur(event) {
		// Delay hiding to allow clicking on suggestions
		setTimeout(() => {
			showSuggestions = false;
			selectedSuggestionIndex = -1;
		}, 150);
	}
	
	// Toggle AI help panel
	function toggleAIHelp() {
		aiHelpExpanded = !aiHelpExpanded;
	}
	
	// Request AI help for this field
	async function requestAIHelp() {
		if (onAIRequest) {
			try {
				await onAIRequest(value, field, 'help');
			} catch (error) {
				console.warn('Failed to get AI help:', error);
			}
		}
	}
	
	// Update suggestions visibility when aiSuggestions changes
	$effect(() => {
		if (aiSuggestions.length > 0 && document.activeElement === inputElement) {
			showSuggestions = true;
		}
	});
</script>

<div class="ai-assisted-input">
	<label for={field.name} class="block text-sm font-medium text-gray-700 mb-2">
		{field.label}
		{#if field.required}
			<span class="text-red-500">*</span>
		{/if}
		
		{#if showAIHelp}
			<button
				type="button"
				onclick={toggleAIHelp}
				class="ml-2 text-blue-600 hover:text-blue-800 text-xs"
				title="Get AI assistance"
			>
				🤖 AI Help
			</button>
		{/if}
	</label>
	
	{#if field.description}
		<p class="text-sm text-gray-500 mb-2">{field.description}</p>
	{/if}
	
	<div class="relative">
		{#if field.type === 'textarea'}
			<textarea
				bind:this={inputElement}
				id={field.name}
				name={field.name}
				value={value}
				placeholder={placeholder || field.placeholder || ''}
				required={field.required}
				disabled={disabled}
				oninput={handleInput}
				onfocus={handleFocus}
				onblur={handleBlur}
				onkeydown={handleKeydown}
				rows="3"
				class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm resize-vertical"
				class:border-red-300={errors.length > 0}
				class:border-blue-400={isLoadingAI}
				class:bg-blue-50={isLoadingAI}
			></textarea>
		{:else}
			<input
				bind:this={inputElement}
				type="text"
				id={field.name}
				name={field.name}
				value={value}
				placeholder={placeholder || field.placeholder || ''}
				required={field.required}
				disabled={disabled}
				oninput={handleInput}
				onfocus={handleFocus}
				onblur={handleBlur}
				onkeydown={handleKeydown}
				class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
				class:border-red-300={errors.length > 0}
				class:border-blue-400={isLoadingAI}
				class:bg-blue-50={isLoadingAI}
			/>
		{/if}
		
		<!-- AI Loading Indicator -->
		{#if isLoadingAI}
			<div class="absolute right-3 top-1/2 transform -translate-y-1/2">
				<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
			</div>
		{/if}
		
		<!-- AI Suggestions Dropdown -->
		{#if showSuggestions && aiSuggestions.length > 0}
			<div class="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
				<div class="px-3 py-2 text-xs text-gray-500 border-b border-gray-200 bg-gray-50">
					🤖 AI Suggestions
				</div>
				{#each aiSuggestions as suggestion, index}
					<button
						type="button"
						onclick={() => applySuggestion(suggestion)}
						class="w-full text-left px-3 py-2 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none text-sm border-b border-gray-100 last:border-b-0"
						class:bg-blue-100={index === selectedSuggestionIndex}
					>
						{suggestion}
					</button>
				{/each}
			</div>
		{/if}
	</div>
	
	<!-- AI Help Panel -->
	{#if showAIHelp && aiHelpExpanded}
		<div class="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
			<div class="flex items-start justify-between mb-2">
				<h4 class="text-sm font-medium text-blue-900">AI Assistant</h4>
				<button
					type="button"
					onclick={toggleAIHelp}
					class="text-blue-600 hover:text-blue-800"
				>
					✕
				</button>
			</div>
			
			{#if contextualHelp}
				<p class="text-sm text-blue-800 mb-2">{contextualHelp}</p>
			{/if}
			
			<div class="flex gap-2">
				<button
					type="button"
					onclick={requestAIHelp}
					disabled={isLoadingAI}
					class="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
				>
					Get Suggestions
				</button>
				
				{#if field.helpText}
					<span class="text-xs text-blue-700">{field.helpText}</span>
				{/if}
			</div>
		</div>
	{/if}
	
	<!-- Validation Errors -->
	{#if errors.length > 0}
		<div class="mt-1">
			{#each errors as error}
				<p class="text-sm text-red-600">{error}</p>
			{/each}
		</div>
	{/if}
	
	<!-- Field Help Text -->
	{#if field.helpText && !aiHelpExpanded}
		<p class="mt-1 text-xs text-gray-500">{field.helpText}</p>
	{/if}
</div>

<style>
	.ai-assisted-input {
		position: relative;
	}
	
	/* Custom scrollbar for suggestions dropdown */
	.ai-assisted-input :global(.overflow-auto::-webkit-scrollbar) {
		width: 6px;
	}
	
	.ai-assisted-input :global(.overflow-auto::-webkit-scrollbar-track) {
		background: #f1f1f1;
		border-radius: 3px;
	}
	
	.ai-assisted-input :global(.overflow-auto::-webkit-scrollbar-thumb) {
		background: #c1c1c1;
		border-radius: 3px;
	}
	
	.ai-assisted-input :global(.overflow-auto::-webkit-scrollbar-thumb:hover) {
		background: #a8a8a8;
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
