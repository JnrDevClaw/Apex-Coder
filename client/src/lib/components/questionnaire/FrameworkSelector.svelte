<script>
	import { createEventDispatcher } from 'svelte';
	
	const dispatch = createEventDispatcher();
	
	let { 
		field, 
		value = '', 
		errors = [], 
		technicalBlueprint = {},
		onchange = () => {},
		onCompatibilityCheck = null
	} = $props();
	
	let showCompatibilityMatrix = false;
	let compatibilityWarnings = [];
	let recommendations = [];
	let isCheckingCompatibility = false;
	
	// Framework compatibility data
	const frameworkCompatibility = {
		frontend: {
			'svelte': {
				name: 'Svelte/SvelteKit',
				description: 'Modern, fast, minimal framework with excellent performance',
				pros: ['Small bundle size', 'Fast compilation', 'No virtual DOM overhead', 'Great developer experience'],
				cons: ['Smaller ecosystem', 'Less job market demand'],
				compatibleBackends: ['node-express', 'node-fastify', 'node-nestjs', 'python-fastapi', 'go-gin'],
				recommendedDatabases: ['postgres', 'sqlite', 'mongodb'],
				difficulty: 'Medium',
				popularity: 'Growing'
			},
			'react': {
				name: 'React',
				description: 'Popular library with large ecosystem and community support',
				pros: ['Huge ecosystem', 'Large community', 'Excellent tooling', 'High job demand'],
				cons: ['Larger bundle size', 'More complex setup', 'Frequent updates'],
				compatibleBackends: ['node-express', 'node-fastify', 'node-nestjs', 'python-fastapi', 'java-spring'],
				recommendedDatabases: ['postgres', 'mysql', 'mongodb', 'dynamodb'],
				difficulty: 'Medium',
				popularity: 'Very High'
			},
			'next.js': {
				name: 'Next.js',
				description: 'React framework with SSR/SSG and excellent performance',
				pros: ['Built-in SSR/SSG', 'Excellent performance', 'Great SEO', 'Vercel integration'],
				cons: ['React complexity', 'Opinionated structure', 'Learning curve'],
				compatibleBackends: ['node-express', 'node-fastify', 'serverless'],
				recommendedDatabases: ['postgres', 'mysql', 'dynamodb'],
				difficulty: 'Medium-Hard',
				popularity: 'Very High'
			},
			'vue': {
				name: 'Vue.js',
				description: 'Progressive framework that is approachable and versatile',
				pros: ['Easy to learn', 'Great documentation', 'Flexible', 'Good performance'],
				cons: ['Smaller ecosystem than React', 'Less job demand'],
				compatibleBackends: ['node-express', 'node-fastify', 'python-fastapi', 'go-gin'],
				recommendedDatabases: ['postgres', 'mysql', 'mongodb'],
				difficulty: 'Easy-Medium',
				popularity: 'High'
			},
			'angular': {
				name: 'Angular',
				description: 'Enterprise framework with TypeScript-first approach',
				pros: ['Enterprise ready', 'TypeScript built-in', 'Comprehensive tooling', 'Strong architecture'],
				cons: ['Steep learning curve', 'Heavy framework', 'Complex for simple apps'],
				compatibleBackends: ['node-nestjs', 'java-spring', 'python-django'],
				recommendedDatabases: ['postgres', 'mysql', 'mongodb'],
				difficulty: 'Hard',
				popularity: 'High'
			}
		},
		backend: {
			'node-express': {
				name: 'Node.js + Express',
				description: 'Simple, flexible, and widely used backend framework',
				pros: ['Simple setup', 'Large ecosystem', 'JavaScript everywhere', 'Fast development'],
				cons: ['Single-threaded', 'Callback complexity', 'Less structured'],
				compatibleDatabases: ['postgres', 'mysql', 'mongodb', 'sqlite', 'redis'],
				difficulty: 'Easy',
				popularity: 'Very High'
			},
			'node-fastify': {
				name: 'Node.js + Fastify',
				description: 'Fast and low overhead web framework for Node.js',
				pros: ['High performance', 'Low overhead', 'TypeScript support', 'Plugin ecosystem'],
				cons: ['Smaller community', 'Less middleware', 'Newer framework'],
				compatibleDatabases: ['postgres', 'mysql', 'mongodb', 'redis'],
				difficulty: 'Medium',
				popularity: 'Growing'
			},
			'python-fastapi': {
				name: 'Python + FastAPI',
				description: 'Modern, fast API framework with automatic documentation',
				pros: ['Automatic API docs', 'Type hints', 'High performance', 'Easy testing'],
				cons: ['Python deployment complexity', 'Async learning curve'],
				compatibleDatabases: ['postgres', 'mysql', 'mongodb', 'sqlite'],
				difficulty: 'Medium',
				popularity: 'Growing'
			},
			'go-gin': {
				name: 'Go + Gin',
				description: 'High performance HTTP web framework written in Go',
				pros: ['Excellent performance', 'Compiled binary', 'Low memory usage', 'Concurrent'],
				cons: ['Steeper learning curve', 'Less ecosystem', 'Verbose syntax'],
				compatibleDatabases: ['postgres', 'mysql', 'redis'],
				difficulty: 'Medium-Hard',
				popularity: 'Growing'
			}
		},
		database: {
			'postgres': {
				name: 'PostgreSQL',
				description: 'Powerful, standards-compliant relational database',
				pros: ['ACID compliant', 'Advanced features', 'JSON support', 'Excellent performance'],
				cons: ['More complex setup', 'Resource intensive'],
				difficulty: 'Medium',
				popularity: 'Very High'
			},
			'mysql': {
				name: 'MySQL',
				description: 'Popular, reliable relational database',
				pros: ['Wide adoption', 'Good performance', 'Easy setup', 'Great tooling'],
				cons: ['Less advanced features', 'Licensing considerations'],
				difficulty: 'Easy-Medium',
				popularity: 'Very High'
			},
			'mongodb': {
				name: 'MongoDB',
				description: 'Document-based NoSQL database',
				pros: ['Flexible schema', 'JSON-like documents', 'Horizontal scaling', 'Easy for developers'],
				cons: ['No ACID transactions (older versions)', 'Memory usage', 'Consistency trade-offs'],
				difficulty: 'Easy-Medium',
				popularity: 'High'
			}
		}
	};
	
	// Get framework info for current selection
	function getFrameworkInfo(category, frameworkValue) {
		return frameworkCompatibility[category]?.[frameworkValue] || null;
	}
	
	// Check compatibility between selected frameworks
	async function checkCompatibility() {
		if (!technicalBlueprint) return;
		
		isCheckingCompatibility = true;
		compatibilityWarnings = [];
		recommendations = [];
		
		try {
			const frontend = technicalBlueprint.frontend_framework;
			const backend = technicalBlueprint.backend_framework;
			const database = technicalBlueprint.database_engine;
			
			// Check frontend-backend compatibility
			if (frontend && backend) {
				const frontendInfo = getFrameworkInfo('frontend', frontend);
				if (frontendInfo && !frontendInfo.compatibleBackends.includes(backend)) {
					compatibilityWarnings.push({
						type: 'warning',
						message: `${frontendInfo.name} may have limited compatibility with ${getFrameworkInfo('backend', backend)?.name || backend}`
					});
				}
			}
			
			// Check backend-database compatibility
			if (backend && database) {
				const backendInfo = getFrameworkInfo('backend', backend);
				if (backendInfo && !backendInfo.compatibleDatabases.includes(database)) {
					compatibilityWarnings.push({
						type: 'warning',
						message: `${backendInfo.name} may require additional setup for ${getFrameworkInfo('database', database)?.name || database}`
					});
				}
			}
			
			// Generate recommendations
			if (frontend) {
				const frontendInfo = getFrameworkInfo('frontend', frontend);
				if (frontendInfo) {
					if (!backend) {
						recommendations.push({
							type: 'suggestion',
							message: `For ${frontendInfo.name}, we recommend: ${frontendInfo.compatibleBackends.slice(0, 2).map(b => getFrameworkInfo('backend', b)?.name || b).join(' or ')}`
						});
					}
					if (!database) {
						recommendations.push({
							type: 'suggestion',
							message: `Recommended databases: ${frontendInfo.recommendedDatabases.slice(0, 2).map(d => getFrameworkInfo('database', d)?.name || d).join(' or ')}`
						});
					}
				}
			}
			
			// Call external compatibility check if available
			if (onCompatibilityCheck) {
				const externalCheck = await onCompatibilityCheck(technicalBlueprint);
				if (externalCheck.warnings) {
					compatibilityWarnings.push(...externalCheck.warnings);
				}
				if (externalCheck.recommendations) {
					recommendations.push(...externalCheck.recommendations);
				}
			}
		} catch (error) {
			console.warn('Compatibility check failed:', error);
			compatibilityWarnings.push({
				type: 'error',
				message: 'Unable to check compatibility at this time'
			});
		} finally {
			isCheckingCompatibility = false;
		}
	}
	
	// Handle selection change
	function handleChange(event) {
		const newValue = event.target.value;
		onchange(newValue);
		
		// Auto-check compatibility when selection changes
		setTimeout(checkCompatibility, 100);
	}
	
	// Toggle compatibility matrix display
	function toggleCompatibilityMatrix() {
		showCompatibilityMatrix = !showCompatibilityMatrix;
		if (showCompatibilityMatrix) {
			checkCompatibility();
		}
	}
	
	// Get difficulty color class
	function getDifficultyColor(difficulty) {
		switch (difficulty) {
			case 'Easy': return 'text-green-600 bg-green-100';
			case 'Easy-Medium': return 'text-yellow-600 bg-yellow-100';
			case 'Medium': return 'text-blue-600 bg-blue-100';
			case 'Medium-Hard': return 'text-orange-600 bg-orange-100';
			case 'Hard': return 'text-red-600 bg-red-100';
			default: return 'text-gray-600 bg-gray-100';
		}
	}
	
	// Get popularity color class
	function getPopularityColor(popularity) {
		switch (popularity) {
			case 'Very High': return 'text-green-600 bg-green-100';
			case 'High': return 'text-blue-600 bg-blue-100';
			case 'Growing': return 'text-purple-600 bg-purple-100';
			default: return 'text-gray-600 bg-gray-100';
		}
	}
	
	// Get current framework info
	$: currentFrameworkInfo = getFrameworkInfo(field.category || 'frontend', value);
	
	// Auto-check compatibility when technical blueprint changes
	$effect(() => {
		if (technicalBlueprint && Object.keys(technicalBlueprint).length > 0) {
			checkCompatibility();
		}
	});
</script>

<div class="framework-selector">
	<label for={field.name} class="block text-sm font-medium text-gray-700 mb-2">
		{field.label}
		{#if field.required}
			<span class="text-red-500">*</span>
		{/if}
		
		<button
			type="button"
			onclick={toggleCompatibilityMatrix}
			class="ml-2 text-blue-600 hover:text-blue-800 text-xs"
			title="Show compatibility information"
		>
			🔍 Compatibility
		</button>
	</label>
	
	{#if field.description}
		<p class="text-sm text-gray-500 mb-2">{field.description}</p>
	{/if}
	
	<select
		id={field.name}
		name={field.name}
		value={value}
		required={field.required}
		onchange={handleChange}
		class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
		class:border-red-300={errors.length > 0}
	>
		<option value="">Select an option...</option>
		{#each field.options as option}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>
	
	<!-- Current Selection Info -->
	{#if currentFrameworkInfo}
		<div class="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-md">
			<div class="flex items-start justify-between mb-2">
				<h4 class="text-sm font-medium text-gray-900">{currentFrameworkInfo.name}</h4>
				<div class="flex gap-2">
					<span class="px-2 py-1 text-xs rounded-full {getDifficultyColor(currentFrameworkInfo.difficulty)}">
						{currentFrameworkInfo.difficulty}
					</span>
					<span class="px-2 py-1 text-xs rounded-full {getPopularityColor(currentFrameworkInfo.popularity)}">
						{currentFrameworkInfo.popularity}
					</span>
				</div>
			</div>
			
			<p class="text-sm text-gray-600 mb-2">{currentFrameworkInfo.description}</p>
			
			<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
				<div>
					<h5 class="text-xs font-medium text-green-700 mb-1">Pros:</h5>
					<ul class="text-xs text-green-600 space-y-1">
						{#each currentFrameworkInfo.pros as pro}
							<li>• {pro}</li>
						{/each}
					</ul>
				</div>
				<div>
					<h5 class="text-xs font-medium text-red-700 mb-1">Cons:</h5>
					<ul class="text-xs text-red-600 space-y-1">
						{#each currentFrameworkInfo.cons as con}
							<li>• {con}</li>
						{/each}
					</ul>
				</div>
			</div>
		</div>
	{/if}
	
	<!-- Compatibility Matrix -->
	{#if showCompatibilityMatrix}
		<div class="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-md">
			<div class="flex items-center justify-between mb-3">
				<h4 class="text-sm font-medium text-blue-900">Compatibility Analysis</h4>
				{#if isCheckingCompatibility}
					<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
				{:else}
					<button
						type="button"
						onclick={checkCompatibility}
						class="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
					>
						Refresh
					</button>
				{/if}
			</div>
			
			<!-- Compatibility Warnings -->
			{#if compatibilityWarnings.length > 0}
				<div class="mb-3">
					<h5 class="text-xs font-medium text-orange-700 mb-2">Compatibility Warnings:</h5>
					{#each compatibilityWarnings as warning}
						<div class="flex items-start gap-2 mb-1">
							<span class="text-orange-500 text-xs">⚠️</span>
							<p class="text-xs text-orange-700">{warning.message}</p>
						</div>
					{/each}
				</div>
			{/if}
			
			<!-- Recommendations -->
			{#if recommendations.length > 0}
				<div class="mb-3">
					<h5 class="text-xs font-medium text-green-700 mb-2">Recommendations:</h5>
					{#each recommendations as recommendation}
						<div class="flex items-start gap-2 mb-1">
							<span class="text-green-500 text-xs">💡</span>
							<p class="text-xs text-green-700">{recommendation.message}</p>
						</div>
					{/each}
				</div>
			{/if}
			
			<!-- Compatibility Matrix Grid -->
			{#if currentFrameworkInfo && (currentFrameworkInfo.compatibleBackends || currentFrameworkInfo.compatibleDatabases || currentFrameworkInfo.recommendedDatabases)}
				<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
					{#if currentFrameworkInfo.compatibleBackends}
						<div>
							<h5 class="text-xs font-medium text-blue-700 mb-1">Compatible Backends:</h5>
							<div class="flex flex-wrap gap-1">
								{#each currentFrameworkInfo.compatibleBackends as backend}
									<span class="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
										{getFrameworkInfo('backend', backend)?.name || backend}
									</span>
								{/each}
							</div>
						</div>
					{/if}
					
					{#if currentFrameworkInfo.recommendedDatabases}
						<div>
							<h5 class="text-xs font-medium text-blue-700 mb-1">Recommended Databases:</h5>
							<div class="flex flex-wrap gap-1">
								{#each currentFrameworkInfo.recommendedDatabases as database}
									<span class="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
										{getFrameworkInfo('database', database)?.name || database}
									</span>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}
			
			{#if compatibilityWarnings.length === 0 && recommendations.length === 0 && !isCheckingCompatibility}
				<div class="flex items-center gap-2 text-green-700">
					<span class="text-green-500">✅</span>
					<p class="text-xs">No compatibility issues detected</p>
				</div>
			{/if}
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
	{#if field.helpText}
		<p class="mt-1 text-xs text-gray-500">{field.helpText}</p>
	{/if}
</div>

<style>
	.framework-selector {
		position: relative;
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
