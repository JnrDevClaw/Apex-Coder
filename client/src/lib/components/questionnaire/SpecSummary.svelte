<script>
	let { 
		spec = {}, 
		canStartBuild = false, 
		onStartBuild = () => {},
		onEditSpec = () => {} 
	} = $props();
	
	function formatFeatureList(features) {
		return Object.entries(features)
			.filter(([key, value]) => value === true)
			.map(([key]) => key.charAt(0).toUpperCase() + key.slice(1))
			.join(', ') || 'None selected';
	}
	
	function formatConstraints(constraints) {
		const active = Object.entries(constraints)
			.filter(([key, value]) => value === true)
			.map(([key]) => key.toUpperCase());
		return active.length > 0 ? active.join(', ') : 'None';
	}
</script>

<div class="spec-summary bg-white shadow rounded-lg p-6">
	<h3 class="text-lg font-medium text-gray-900 mb-4">Project Summary</h3>
	
	<div class="space-y-4">
		<!-- Project Basics -->
		<div>
			<h4 class="text-sm font-medium text-gray-700">Project Name</h4>
			<p class="text-sm text-gray-900">{spec.projectName || 'Not specified'}</p>
		</div>
		
		<!-- Technology Stack -->
		<div>
			<h4 class="text-sm font-medium text-gray-700">Technology Stack</h4>
			<div class="text-sm text-gray-900">
				<p><strong>Frontend:</strong> {spec.stack?.frontend || 'Not selected'}</p>
				<p><strong>Backend:</strong> {spec.stack?.backend || 'Not selected'}</p>
				<p><strong>Database:</strong> {spec.stack?.database || 'Not selected'}</p>
			</div>
		</div>
		
		<!-- Features -->
		<div>
			<h4 class="text-sm font-medium text-gray-700">Features</h4>
			<p class="text-sm text-gray-900">{formatFeatureList(spec.features || {})}</p>
		</div>
		
		<!-- Hosting & Environment -->
		<div>
			<h4 class="text-sm font-medium text-gray-700">Hosting & Environment</h4>
			<div class="text-sm text-gray-900">
				<p><strong>Platform:</strong> {spec.envPrefs?.hosting || 'Not selected'}</p>
				<p><strong>CI/CD:</strong> {spec.envPrefs?.cicd ? 'Enabled' : 'Disabled'}</p>
				<p><strong>Monitoring:</strong> {spec.envPrefs?.monitoring ? 'Enabled' : 'Disabled'}</p>
				{#if spec.envPrefs?.costCap}
					<p><strong>Cost Cap:</strong> ${spec.envPrefs.costCap}/month</p>
				{/if}
			</div>
		</div>
		
		<!-- Compliance & Security -->
		<div>
			<h4 class="text-sm font-medium text-gray-700">Compliance & Security</h4>
			<p class="text-sm text-gray-900">{formatConstraints(spec.constraints || {})}</p>
		</div>
		
		<!-- Deployment -->
		<div>
			<h4 class="text-sm font-medium text-gray-700">Deployment</h4>
			<p class="text-sm text-gray-900">
				{spec.envPrefs?.autoDeploy ? 'Automatic deployment enabled' : 'Manual deployment required'}
			</p>
		</div>
	</div>
	
	<!-- Action Buttons -->
	<div class="mt-6 flex space-x-3">
		<button
			type="button"
			onclick={onEditSpec}
			class="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
		>
			Edit Specification
		</button>
		
		<button
			type="button"
			onclick={onStartBuild}
			disabled={!canStartBuild}
			class="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
		>
			{canStartBuild ? 'Start Build' : 'Complete All Stages First'}
		</button>
	</div>
</div>
