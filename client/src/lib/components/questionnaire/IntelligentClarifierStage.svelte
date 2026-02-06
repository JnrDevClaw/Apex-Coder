<script>
	import { createEventDispatcher } from 'svelte';
	import FormField from './FormField.svelte';
	
	const dispatch = createEventDispatcher();
	
	let { 
		spec = {}, 
		errors = {},
		onfieldChange = () => {}
	} = $props();
	
	// Project clarification fields - helps AI understand project vision
	const clarifierFields = [
		{
			name: 'project_clarification.project_goals',
			label: 'What are your main goals for this project?',
			type: 'textarea',
			required: true,
			placeholder: 'I want to create a platform where musicians can share their work and connect with fans, helping independent artists gain exposure',
			helpText: 'Describe what you hope to achieve with this application'
		},
		{
			name: 'project_clarification.success_metrics',
			label: 'How will you measure success?',
			type: 'textarea',
			required: true,
			placeholder: 'Number of active users, songs uploaded per month, artist-fan connections made, user engagement time',
			helpText: 'What metrics or outcomes would indicate your app is successful?'
		},
		{
			name: 'project_clarification.unique_features',
			label: 'What makes your app unique?',
			type: 'textarea',
			required: true,
			placeholder: 'Focus on independent artists, direct fan-to-artist messaging, collaborative playlists, local music scene discovery',
			helpText: 'What will set your app apart from existing solutions?'
		}
	];
	
	function handleFieldChange(fieldName, value) {
		onfieldChange(fieldName, value);
	}
</script>

<div class="project-clarification-stage">
	<div class="stage-header mb-6">
		<h3 class="text-lg font-semibold text-gray-900 mb-2">Project Clarification</h3>
		<p class="text-gray-600">Help AI understand your project vision and goals</p>
	</div>
	
	<div class="fields-container space-y-6">
		{#each clarifierFields as field}
			<FormField 
				{field}
				value={spec}
				errors={errors[field.name] || []}
				onchange={(value) => handleFieldChange(field.name, value)}
			/>
		{/each}
	</div>
</div>
