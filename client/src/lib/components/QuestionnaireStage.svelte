<script>
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	export let stage;
	export let fields;
	export let spec;
	export let errors = {};
	export let isComplete = false;

	// Debug logging - Log whenever fields prop changes
	$: if (import.meta.env.DEV && fields) {
		console.log('🔴 QuestionnaireStage: fields prop changed!', {
			length: fields.length,
			fieldNames: fields.map(f => f.name),
			fields: fields
		});
	}

	// Debug logging
	$: if (import.meta.env.DEV) {
		console.log('=== QuestionnaireStage Debug ===');
		console.log('Stage:', stage?.title);
		console.log('Fields count:', fields?.length);
		console.log('Fields:', fields);
		console.log('Required fields:', fields?.filter((f) => f.required).length);
		console.log('isComplete prop:', isComplete);

		// Check each required field
		const requiredFields = fields?.filter((f) => f.required) || [];
		const fieldStatus = requiredFields.map((f) => ({
			name: f.name,
			label: f.label,
			value: getFieldValue(f.name),
			filled: !!getFieldValue(f.name)
		}));
		console.log('Required field status:', fieldStatus);
		console.log(
			'All required filled:',
			fieldStatus.every((f) => f.filled)
		);
		console.log('=== End QuestionnaireStage Debug ===');
	}

	function handleFieldChange(fieldName, value) {
		console.log('🔵 QuestionnaireStage: handleFieldChange called', { fieldName, value });
		dispatch('fieldChange', { fieldName, value });
		console.log('🔵 QuestionnaireStage: fieldChange event dispatched');
	}

	function handleNext() {
		dispatch('next');
	}

	function handlePrevious() {
		dispatch('previous');
	}

	function getFieldValue(fieldName) {
		const value = fieldName.split('.').reduce((obj, key) => obj?.[key], spec);
		// Return the actual value, even if it's 0 or false
		// Only return empty string if value is null or undefined
		return value !== null && value !== undefined ? value : '';
	}
</script>

<div class="stage-container">
	<div class="mb-6">
		<h2 class="text-text-primary mb-2 text-2xl font-bold">{stage.title}</h2>
		<p class="text-text-secondary">{stage.description}</p>

		{#if import.meta.env.DEV}
			<div class="bg-accent-primary/10 border-accent-primary/30 mt-4 rounded-lg border p-3 text-xs">
				<div class="text-accent-primary font-medium">Debug Info:</div>
				<div class="mt-1 text-white/70">
					Fields to render: {fields?.length || 0} | Required fields: {fields?.filter(
						(f) => f.required
					).length || 0} | Complete: {isComplete ? 'Yes' : 'No'}
				</div>
			</div>
		{/if}
	</div>

	<div class="space-y-6">
		{#if fields && fields.length > 0}
			{#each fields as field, index}
				{@const _ = import.meta.env.DEV && console.log(`🎨 Rendering field ${index + 1}/${fields.length}:`, field.name, field.label)}
				<div class="field-group">
					<label for={field.name} class="text-text-primary mb-2 block text-sm font-semibold">
						{field.label}
						{#if field.required}
							<span class="text-accent-error">*</span>
							{#if !getFieldValue(field.name) && !isComplete}
								<span class="text-accent-error ml-2 text-xs">(required)</span>
							{/if}
						{/if}
						{#if import.meta.env.DEV}
							<span class="ml-2 text-xs text-white/40">({index + 1}/{fields.length})</span>
						{/if}
					</label>

					{#if field.type === 'text'}
						<input
							type="text"
							id={field.name}
							value={getFieldValue(field.name)}
							placeholder={field.placeholder || ''}
							class="bg-bg-secondary text-text-primary placeholder-text-secondary/50 focus:border-accent-primary focus:ring-accent-primary/30 w-full rounded-lg border px-4 py-3 transition-all outline-none focus:ring-2 {field.required &&
							!getFieldValue(field.name)
								? 'border-accent-error/50'
								: 'border-white/20'}"
							on:input={(e) => handleFieldChange(field.name, e.target.value)}
						/>
					{:else if field.type === 'textarea'}
						<textarea
							id={field.name}
							value={getFieldValue(field.name)}
							placeholder={field.placeholder || ''}
							rows="3"
							class="bg-bg-secondary text-text-primary placeholder-text-secondary/50 focus:border-accent-primary focus:ring-accent-primary/30 w-full resize-none rounded-lg border px-4 py-3 transition-all outline-none focus:ring-2 {field.required &&
							!getFieldValue(field.name)
								? 'border-accent-error/50'
								: 'border-white/20'}"
							on:input={(e) => handleFieldChange(field.name, e.target.value)}
						></textarea>
					{:else if field.type === 'select'}
						<select
							id={field.name}
							value={getFieldValue(field.name)}
							class="bg-bg-secondary text-text-primary focus:border-accent-primary focus:ring-accent-primary/30 [&>option]:bg-bg-secondary [&>option]:text-text-primary [&>option:first-child]:text-text-secondary w-full rounded-lg border px-4 py-3 transition-all outline-none focus:ring-2 {field.required &&
							!getFieldValue(field.name)
								? 'border-accent-error/50'
								: 'border-white/20'}"
							on:change={(e) => handleFieldChange(field.name, e.target.value)}
						>
							<option value="">Select an option...</option>
							{#each field.options as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					{:else if field.type === 'radio'}
						<div class="space-y-3">
							{#each field.options as option}
								<label
									class="hover:border-accent-primary/50 flex cursor-pointer items-start space-x-3 rounded-lg border border-white/10 p-3 transition-all hover:bg-white/5"
								>
									<input
										type="radio"
										name={field.name}
										value={option.value}
										checked={getFieldValue(field.name) === option.value}
										class="text-accent-primary focus:ring-accent-primary bg-bg-secondary mt-1 h-4 w-4 border-white/30"
										on:change={(e) => handleFieldChange(field.name, option.value)}
									/>
									<div>
										<div class="text-text-primary text-sm font-medium">{option.label}</div>
										{#if option.description}
											<div class="text-text-secondary text-sm">{option.description}</div>
										{/if}
									</div>
								</label>
							{/each}
						</div>
					{:else if field.type === 'range'}
						<div class="space-y-2">
							<input
								type="range"
								id={field.name}
								value={getFieldValue(field.name) || field.defaultValue || field.min || 1}
								min={field.min || 1}
								max={field.max || 10}
								step={field.step || 1}
								class="accent-accent-primary h-2 w-full cursor-pointer appearance-none rounded-lg bg-white/10"
								on:input={(e) => handleFieldChange(field.name, parseInt(e.target.value))}
							/>
							<div class="text-text-secondary flex justify-between text-xs">
								<span>{field.min || 1}</span>
								<span class="text-accent-primary font-semibold"
									>{getFieldValue(field.name) || field.defaultValue || field.min || 1}</span
								>
								<span>{field.max || 10}</span>
							</div>
						</div>
					{:else if field.type === 'color'}
						<input
							type="color"
							id={field.name}
							value={getFieldValue(field.name) || field.defaultValue || '#3B82F6'}
							class="bg-bg-secondary h-10 w-20 cursor-pointer rounded-lg border border-white/10"
							on:input={(e) => handleFieldChange(field.name, e.target.value)}
						/>
					{/if}

					{#if field.helpText}
						<p class="text-text-secondary/80 mt-1 text-sm">{field.helpText}</p>
					{/if}

					{#if errors[field.name]}
						<div class="text-accent-error mt-1 text-sm">
							{#each errors[field.name] as error}
								<div>{error}</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		{:else}
			<div class="bg-accent-error/10 border-accent-error/30 rounded-lg border p-4">
				<p class="text-accent-error">No fields to display! This is a bug.</p>
				<p class="mt-2 text-xs text-white/60">Fields array: {JSON.stringify(fields)}</p>
			</div>
		{/if}
	</div>

	<div class="mt-8">
		{#if !isComplete}
			<div class="bg-accent-error/10 border-accent-error/30 mb-4 rounded-lg border p-3">
				<p class="text-accent-error mb-2 text-sm font-medium">
					Please fill in all required fields to continue
				</p>
				{#if Object.keys(errors).length > 0}
					<ul class="text-accent-error/80 mt-2 space-y-1 text-xs">
						{#each Object.entries(errors) as [fieldName, fieldErrors]}
							{@const field = fields.find((f) => f.name === fieldName)}
							{#if field}
								<li>• {field.label}</li>
							{/if}
						{/each}
					</ul>
				{:else}
					<p class="text-accent-error/80 mt-2 text-xs">
						Some required fields are still empty. Please scroll up to complete them.
					</p>
				{/if}
			</div>
		{/if}

		<div class="flex justify-between">
			<button
				type="button"
				on:click={handlePrevious}
				class="text-text-primary rounded-lg border border-white/20 bg-white/10 px-5 py-3 font-medium transition hover:bg-white/20"
			>
				Previous
			</button>

			<button
				type="button"
				on:click={handleNext}
				disabled={!isComplete}
				class="bg-accent-primary shadow-neon hover:shadow-neonSoft rounded-lg px-6 py-3 font-semibold text-black transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
			>
				Next
			</button>
		</div>
	</div>
</div>
