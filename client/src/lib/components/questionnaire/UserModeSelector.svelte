<script>
	import { createEventDispatcher, onMount } from 'svelte';
	
	const dispatch = createEventDispatcher();
	
	let { 
		selectedMode = '',
		isRequired = true,
		onModeSelect = () => {}
	} = $props();
	
	// Auto-select developer mode on mount since it's the only option now
	onMount(() => {
		if (!selectedMode) {
			handleModeSelect('developer');
		}
	});
	
	function handleModeSelect(mode) {
		selectedMode = mode;
		onModeSelect(mode);
		dispatch('modeSelected', { mode });
	}
</script>

<div class="user-mode-selector">
	<div class="text-center mb-8">
		<h2 class="text-3xl font-bold text-gray-900 mb-4">Welcome to AI App Builder</h2>
		<p class="text-lg text-gray-600 max-w-2xl mx-auto">
			Build your application with AI-powered assistance. We'll guide you through 
			defining your project goals and requirements.
		</p>
	</div>
	
	<div class="mode-card-container max-w-2xl mx-auto">
		<div 
			class="mode-card relative cursor-pointer transition-all duration-200 transform hover:scale-[1.02] selected"
			onclick={() => handleModeSelect('developer')}
			role="button"
			tabindex="0"
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					handleModeSelect('developer');
				}
			}}
		>
			<div class="card-content bg-white rounded-xl shadow-lg border-2 border-blue-500 p-8">
				<div class="selected-indicator absolute -top-2 -right-2 bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center">
					<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
					</svg>
				</div>
				
				<div class="text-center mb-6">
					<div class="mode-icon text-5xl mb-4">🚀</div>
					<h3 class="text-2xl font-bold text-gray-900 mb-3">Developer Platform</h3>
					<p class="text-gray-600 leading-relaxed">
						Define your project vision and let AI help you build it. 
						We'll ask about your goals, success metrics, and what makes your app unique.
					</p>
				</div>
				
				<div class="features-list">
					<h4 class="text-sm font-semibold text-gray-700 mb-4 text-center">What you'll define:</h4>
					<ul class="grid grid-cols-2 gap-3">
						<li class="flex items-start text-sm text-gray-600">
							<svg class="w-4 h-4 text-green-500 mt-0.5 mr-2 shrink-0" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
							</svg>
							Project goals & vision
						</li>
						<li class="flex items-start text-sm text-gray-600">
							<svg class="w-4 h-4 text-green-500 mt-0.5 mr-2 shrink-0" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
							</svg>
							Success metrics
						</li>
						<li class="flex items-start text-sm text-gray-600">
							<svg class="w-4 h-4 text-green-500 mt-0.5 mr-2 shrink-0" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
							</svg>
							Unique features
						</li>
						<li class="flex items-start text-sm text-gray-600">
							<svg class="w-4 h-4 text-green-500 mt-0.5 mr-2 shrink-0" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
							</svg>
							User experience flow
						</li>
						<li class="flex items-start text-sm text-gray-600">
							<svg class="w-4 h-4 text-green-500 mt-0.5 mr-2 shrink-0" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
							</svg>
							Design preferences
						</li>
						<li class="flex items-start text-sm text-gray-600">
							<svg class="w-4 h-4 text-green-500 mt-0.5 mr-2 shrink-0" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
							</svg>
							Data & privacy needs
						</li>
					</ul>
				</div>
			</div>
		</div>
	</div>
	
	<div class="help-text text-center mt-8">
		<p class="text-sm text-gray-500">
			AI will help infer technical details based on your project requirements
		</p>
	</div>
</div>

<style>
	.mode-card {
		transition: all 0.2s ease-in-out;
	}
	
	.mode-card:hover .card-content {
		border-color: #3B82F6;
		box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
	}
	
	.mode-card.selected .card-content {
		border-color: #3B82F6;
		background-color: #F8FAFF;
		box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.15), 0 10px 10px -5px rgba(59, 130, 246, 0.1);
	}
	
	.mode-card:focus {
		outline: none;
	}
	
	.mode-card:focus .card-content {
		border-color: #3B82F6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}
	
	.selected-indicator {
		animation: scaleIn 0.2s ease-out;
	}
	
	@keyframes scaleIn {
		from {
			transform: scale(0);
		}
		to {
			transform: scale(1);
		}
	}
</style>
