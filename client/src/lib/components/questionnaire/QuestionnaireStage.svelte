<script>
	import { createEventDispatcher } from 'svelte';
	import FormField from './FormField.svelte';
	
	const dispatch = createEventDispatcher();
	
	let { 
		stage, 
		fields = [], 
		spec = {}, 
		errors = {},
		isComplete = false 
	} = $props();
	
	function handleFieldChange(fieldName, value) {
		dispatch('fieldChange', { fieldName, value });
	}
	
	function handleNext() {
		dispatch('next');
	}
	
	function handlePrevious() {
		dispatch('previous');
	}
</script>

<div class="questionnaire-stage">
	<div class="stage-header">
		<h2 class="text-2xl font-bold text-text-primary mb-2">{stage.title}</h2>
		<p class="text-text-secondary mb-6">{stage.description}</p>
	</div>
	
	<div class="stage-content">
		<div class="space-y-6">
			{#each fields as field (field.name)}
				<FormField 
					{field}
					value={spec}
					errors={errors[field.name] || []}
					onchange={(value) => handleFieldChange(field.name, value)}
				/>
			{/each}
		</div>
	</div>
	
	<!-- Navigation is now handled by QuestionnaireContainer -->
</div>

<style>
	.questionnaire-stage {
		max-width: 600px;
		margin: 0 auto;
		padding: 2rem;
	}
	
	.stage-content {
		min-height: fit-content;
	}
</style>
