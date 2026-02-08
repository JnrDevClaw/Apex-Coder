<script>
	let { 
		field, 
		value = {}, 
		errors = [], 
		onchange = () => {} 
	} = $props();
	
	// Get nested value from spec object
	function getNestedValue(obj, path) {
		return path.split('.').reduce((current, key) => current?.[key], obj);
	}
	
	// Get current field value
	let fieldValue = $derived.by(() => {
		const val = getNestedValue(value, field.name);
		// Return the value as-is if it's a number (including 0) or boolean
		if (typeof val === 'number' || typeof val === 'boolean') {
			return val;
		}
		// For other types, use empty string as fallback
		return val || '';
	});
	
	function handleChange(newValue) {
		console.log('[TEST v2] HMR WORKING NOW! Field changed:', field.name, newValue);
		onchange(newValue);
	}
	
	function handleInputChange(event) {
		let newValue = event.target.value;
		
		// Convert string values to appropriate types
		if (field.type === 'number') {
			newValue = newValue === '' ? null : Number(newValue);
		} else if (field.type === 'checkbox') {
			newValue = event.target.checked;
		} else if (field.type === 'radio') {
			// Parse boolean values from radio buttons
			if (newValue === 'true') newValue = true;
			else if (newValue === 'false') newValue = false;
			// Parse number values from radio buttons
			else if (!isNaN(newValue) && newValue !== '') newValue = Number(newValue);
		}
		
		handleChange(newValue);
	}
</script>

<div class="form-field">
	<label for={field.name} class="block text-base font-medium text-white mb-3">
		{field.label}
		{#if field.required}
			<span class="text-accent-error ml-1">*</span>
		{/if}
	</label>
	
	{#if field.description}
		<p class="text-sm text-white/60 mb-3">{field.description}</p>
	{/if}
	
	{#if field.type === 'text'}
		<input
			type="text"
			id={field.name}
			name={field.name}
			value={fieldValue}
			placeholder={field.placeholder || ''}
			required={field.required}
			oninput={handleInputChange}
			class="mt-1 block w-full px-4 py-3.5 bg-bg-secondary border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-accent-primary text-base transition-all"
			class:border-accent-error={errors.length > 0}
		/>
	{:else if field.type === 'textarea'}
		<textarea
			id={field.name}
			name={field.name}
			value={fieldValue}
			placeholder={field.placeholder || ''}
			required={field.required}
			oninput={handleInputChange}
			rows="4"
			class="mt-1 block w-full px-4 py-3.5 bg-bg-secondary border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-accent-primary text-base transition-all resize-none"
			class:border-accent-error={errors.length > 0}
		></textarea>
	{:else if field.type === 'number'}
		<input
			type="number"
			id={field.name}
			name={field.name}
			value={fieldValue || ''}
			placeholder={field.placeholder || ''}
			required={field.required}
			min={field.validation?.min}
			max={field.validation?.max}
			oninput={handleInputChange}
			class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
			class:border-red-300={errors.length > 0}
		/>
	{:else if field.type === 'select'}
		<select
			id={field.name}
			name={field.name}
			value={fieldValue}
			required={field.required}
			onchange={handleInputChange}
			class="mt-1 block w-full px-4 py-3.5 bg-bg-secondary border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-accent-primary text-base transition-all cursor-pointer"
			class:border-accent-error={errors.length > 0}
		>
			<option value="" class="bg-bg-secondary text-white/60">Select an option...</option>
			{#each field.options as option}
				<option value={option.value} class="bg-bg-secondary text-white">{option.label}</option>
			{/each}
		</select>
	{:else if field.type === 'radio'}
		<!-- Check if this is a number scale (all options are numbers) -->
		{#if field.options.every(opt => typeof opt.value === 'number')}
			<!-- Number scale buttons -->
			<div class="mt-3 flex flex-wrap gap-2">
				{#each field.options as option}
					<label
						for="{field.name}-{option.value}"
						class="relative cursor-pointer"
					>
						<input
							type="radio"
							id="{field.name}-{option.value}"
							name={field.name}
							value={option.value}
							checked={fieldValue === option.value}
							required={field.required}
							onchange={handleInputChange}
							class="sr-only peer"
						/>
						<div class="w-11 h-11 flex items-center justify-center rounded-xl border-2 border-white/20 bg-bg-secondary text-white/70 font-semibold transition-all peer-checked:border-accent-primary peer-checked:bg-accent-primary/20 peer-checked:text-accent-primary hover:border-accent-primary/50 hover:bg-white/5">
							{option.label}
						</div>
					</label>
				{/each}
			</div>
		{:else}
			<!-- Regular radio buttons - card style for conversational feel -->
			<div class="mt-3 space-y-3">
				{#each field.options as option}
					<label
						for="{field.name}-{option.value}"
						class="flex items-start p-4 rounded-xl border-2 border-white/10 bg-bg-secondary/50 cursor-pointer transition-all hover:border-accent-primary/30 hover:bg-bg-secondary has-[:checked]:border-accent-primary has-[:checked]:bg-accent-primary/10"
					>
						<input
							type="radio"
							id="{field.name}-{option.value}"
							name={field.name}
							value={option.value}
							checked={fieldValue === option.value}
							required={field.required}
							onchange={handleInputChange}
							class="mt-0.5 h-4 w-4 text-accent-primary focus:ring-accent-primary border-white/30 bg-bg-secondary"
						/>
						<div class="ml-3">
							<span class="block text-base text-white font-medium">
								{option.label}
							</span>
							{#if option.description}
								<span class="block text-sm text-white/60 mt-1">{option.description}</span>
							{/if}
						</div>
					</label>
				{/each}
			</div>
		{/if}
	{:else if field.type === 'checkbox'}
		<div class="mt-2">
			<div class="flex items-center">
				<input
					type="checkbox"
					id={field.name}
					name={field.name}
					checked={fieldValue === true}
					required={field.required}
					onchange={handleInputChange}
					class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
				/>
				<label for={field.name} class="ml-2 block text-sm text-gray-900">
					{field.label}
				</label>
			</div>
		</div>
	{:else if field.type === 'range'}
		<div class="mt-2">
			<input
				type="range"
				id={field.name}
				name={field.name}
				value={fieldValue || field.defaultValue || field.min || 0}
				min={field.min || 0}
				max={field.max || 100}
				step={field.step || 1}
				required={field.required}
				oninput={handleInputChange}
				class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
			/>
			<div class="flex justify-between text-xs text-gray-500 mt-1">
				<span>{field.min || 0}</span>
				<span class="font-medium">Current: {fieldValue || field.defaultValue || field.min || 0}</span>
				<span>{field.max || 100}</span>
			</div>
		</div>
	{:else if field.type === 'color'}
		<div class="mt-2 flex items-center space-x-3">
			<input
				type="color"
				id={field.name}
				name={field.name}
				value={fieldValue || field.defaultValue || '#3B82F6'}
				required={field.required}
				onchange={handleInputChange}
				class="h-10 w-20 border border-gray-300 rounded cursor-pointer"
			/>
			<input
				type="text"
				value={fieldValue || field.defaultValue || '#3B82F6'}
				placeholder="#3B82F6"
				oninput={handleInputChange}
				class="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
				class:border-red-300={errors.length > 0}
			/>
		</div>
	{:else if field.type === 'multiselect'}
		<div class="mt-2 space-y-2 max-h-40 overflow-y-auto border border-gray-300 rounded-md p-2">
			{#each field.options as option}
				<div class="flex items-center">
					<input
						type="checkbox"
						id="{field.name}-{option.value}"
						name={field.name}
						value={option.value}
						checked={Array.isArray(fieldValue) && fieldValue.includes(option.value)}
						onchange={(e) => {
							let currentValues = Array.isArray(fieldValue) ? [...fieldValue] : [];
							if (e.target.checked) {
								if (!currentValues.includes(option.value)) {
									currentValues.push(option.value);
								}
							} else {
								currentValues = currentValues.filter(v => v !== option.value);
							}
							handleChange(currentValues);
						}}
						class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
					/>
					<label for="{field.name}-{option.value}" class="ml-2 block text-sm text-gray-900">
						{option.label}
					</label>
				</div>
			{/each}
		</div>
	{/if}
	
	{#if errors.length > 0}
		<div class="mt-2">
			{#each errors as error}
				<p class="text-sm text-accent-error">{error}</p>
			{/each}
		</div>
	{/if}
	
	{#if field.helpText}
		<p class="mt-2 text-sm text-white/50">{field.helpText}</p>
	{/if}
</div>

<style>
	.slider::-webkit-slider-thumb {
		appearance: none;
		height: 20px;
		width: 20px;
		border-radius: 50%;
		background: #3b82f6;
		cursor: pointer;
		border: 2px solid #ffffff;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}
	
	.slider::-moz-range-thumb {
		height: 20px;
		width: 20px;
		border-radius: 50%;
		background: #3b82f6;
		cursor: pointer;
		border: 2px solid #ffffff;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}
</style>
