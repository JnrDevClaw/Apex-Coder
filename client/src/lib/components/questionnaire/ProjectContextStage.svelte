<script>
	import { createEventDispatcher } from 'svelte';
	import FormField from './FormField.svelte';
	
	const dispatch = createEventDispatcher();
	
	let { 
		spec = {}, 
		errors = {},
		fields = [],
		onfieldChange = () => {}
	} = $props();
	
	function handleFieldChange(fieldName, value) {
		onfieldChange(fieldName, value);
	}
</script>

<div class="project-context-stage w-full">
	<div class="stage-header mb-6">
		<h3 class="text-lg font-semibold text-text-primary mb-2">Project Overview</h3>
		<p class="text-text-secondary">Tell us about your project vision and goals</p>
	</div>
	
	<div class="fields-container space-y-6 pb-8">
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

<style>
	.project-context-stage {
		min-height: fit-content;
	}
	
	.fields-container {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}
</style>
