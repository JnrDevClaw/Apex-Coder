<script>
	let { 
		currentStage = 0, 
		stageCompletion = {}, 
		stageDefinitions = [],
		onStageClick = () => {} 
	} = $props();
	
	function handleStageClick(stageIndex) {
		// Only allow navigation to completed stages or current stage
		if (stageIndex <= currentStage || stageCompletion[stageIndex]) {
			onStageClick(stageIndex);
		}
	}
	
	function getStageStatus(stageIndex) {
		if (stageIndex < currentStage && stageCompletion[stageIndex]) {
			return 'completed';
		} else if (stageIndex === currentStage) {
			return 'current';
		} else {
			return 'pending';
		}
	}
</script>

<div class="stage-progress">
	<nav aria-label="Progress">
		<ol class="flex items-center">
			{#each stageDefinitions as stage, index}
				{@const status = getStageStatus(index)}
				{@const isClickable = index <= currentStage || stageCompletion[index]}
				
				<li class="relative {index !== stageDefinitions.length - 1 ? 'pr-8 sm:pr-20' : ''}">
					<!-- Connector line -->
					{#if index !== stageDefinitions.length - 1}
						<div class="absolute inset-0 flex items-center" aria-hidden="true">
							<div class="h-0.5 w-full {status === 'completed' ? 'bg-blue-600' : 'bg-gray-200'}"></div>
						</div>
					{/if}
					
					<!-- Stage indicator -->
					<button
						type="button"
						onclick={() => handleStageClick(index)}
						disabled={!isClickable}
						class="relative w-8 h-8 flex items-center justify-center rounded-full border-2 {
							status === 'completed' 
								? 'bg-blue-600 border-blue-600 hover:bg-blue-700' 
								: status === 'current'
								? 'border-blue-600 bg-white'
								: 'border-gray-300 bg-white hover:border-gray-400'
						} {isClickable ? 'cursor-pointer' : 'cursor-not-allowed'}"
						aria-current={status === 'current' ? 'step' : undefined}
					>
						{#if status === 'completed'}
							<!-- Check icon -->
							<svg class="w-5 h-5 text-white" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
							</svg>
						{:else}
							<span class="text-sm font-medium {
								status === 'current' ? 'text-blue-600' : 'text-gray-500'
							}">
								{String.fromCharCode(65 + index)}
							</span>
						{/if}
					</button>
					
					<!-- Stage label -->
					<div class="absolute top-10 left-1/2 transform -translate-x-1/2">
						<span class="text-xs font-medium {
							status === 'current' ? 'text-blue-600' : 'text-gray-500'
						}">
							Stage {String.fromCharCode(65 + index)}
						</span>
					</div>
				</li>
			{/each}
		</ol>
	</nav>
</div>

<style>
	.stage-progress {
		padding: 1rem 0 3rem 0;
	}
</style>
