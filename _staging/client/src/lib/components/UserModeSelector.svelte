<script>
	let { selectedMode = $bindable(''), onModeSelect = () => {} } = $props();

	function selectMode(mode) {
		console.log('UserModeSelector.selectMode called with:', mode);
		console.log('Previous selectedMode:', selectedMode);
		selectedMode = mode;
		console.log('New selectedMode:', selectedMode);
		console.log('Calling onModeSelect...');
		onModeSelect(mode);
		console.log('onModeSelect completed');
	}

	// Debug effect to track selectedMode changes
	$effect(() => {
		console.log('UserModeSelector selectedMode changed to:', selectedMode);
	});
</script>

<div class="user-mode-selector">
	<div class="mb-12 text-center">
		<div class="bg-accent-primary shadow-neon mx-auto mb-6 h-1 w-16 rounded-full"></div>
		<h2 class="font-display mb-4 text-4xl font-bold text-white">
			Choose Your <span class="text-accent-primary">Experience</span>
		</h2>
		<p class="text-text-secondary font-body text-lg">
			Adaptive questionnaire based on technical expertise
		</p>
	</div>

	<div class="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
		<!-- Developer Mode -->
		<div
			class="cyber-panel neon-border cursor-pointer p-8 transition-all duration-200"
			class:border-accent-primary={selectedMode === 'developer'}
			class:shadow-neon={selectedMode === 'developer'}
			onclick={() => selectMode('developer')}
			onkeydown={(e) => e.key === 'Enter' && selectMode('developer')}
			role="button"
			tabindex="0"
		>
			<div class="mb-6 flex items-center">
				<div
					class="bg-accent-primary bg-opacity-10 border-accent-primary mr-4 flex h-12 w-12 items-center justify-center rounded-lg border"
				>
					<svg
						class="text-accent-primary h-6 w-6"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
						></path>
					</svg>
				</div>
				<h3 class="font-display text-2xl font-semibold text-white">Developer</h3>
			</div>

			<p class="text-text-secondary font-body mb-6">
				Full technical control over frameworks, databases, architecture, and deployment
				configuration
			</p>

			<div class="text-text-secondary font-body text-sm">
				<div class="font-display mb-3 font-semibold text-white">Configuration Access:</div>
				<ul class="space-y-2">
					<li class="flex items-start gap-2">
						<span class="text-accent-primary mt-0.5">▸</span>
						<span>Frontend & backend frameworks</span>
					</li>
					<li class="flex items-start gap-2">
						<span class="text-accent-primary mt-0.5">▸</span>
						<span>Database and architecture patterns</span>
					</li>
					<li class="flex items-start gap-2">
						<span class="text-accent-primary mt-0.5">▸</span>
						<span>Testing and deployment strategies</span>
					</li>
					<li class="flex items-start gap-2">
						<span class="text-accent-primary mt-0.5">▸</span>
						<span>Environment variables and utilities</span>
					</li>
				</ul>
			</div>
		</div>

		<!-- Non-Developer Mode -->
		<div
			class="cyber-panel neon-border cursor-pointer p-8 transition-all duration-200"
			class:border-success={selectedMode === 'non-developer'}
			class:shadow-neon={selectedMode === 'non-developer'}
			onclick={() => selectMode('non-developer')}
			onkeydown={(e) => e.key === 'Enter' && selectMode('non-developer')}
			role="button"
			tabindex="0"
		>
			<div class="mb-6 flex items-center">
				<div
					class="bg-success bg-opacity-10 border-success mr-4 flex h-12 w-12 items-center justify-center rounded-lg border"
				>
					<svg class="text-success h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
						></path>
					</svg>
				</div>
				<h3 class="font-display text-2xl font-semibold text-white">Non-Developer</h3>
			</div>

			<p class="text-text-secondary font-body mb-6">
				AI-guided experience with automated technical decisions and simplified configuration
			</p>

			<div class="text-text-secondary font-body text-sm">
				<div class="font-display mb-3 font-semibold text-white">Focus Areas:</div>
				<ul class="space-y-2">
					<li class="flex items-start gap-2">
						<span class="text-success mt-0.5">▸</span>
						<span>Application purpose and goals</span>
					</li>
					<li class="flex items-start gap-2">
						<span class="text-success mt-0.5">▸</span>
						<span>User experience and features</span>
					</li>
					<li class="flex items-start gap-2">
						<span class="text-success mt-0.5">▸</span>
						<span>Design preferences and branding</span>
					</li>
					<li class="flex items-start gap-2">
						<span class="text-success mt-0.5">▸</span>
						<span>Business objectives and metrics</span>
					</li>
				</ul>
			</div>
		</div>
	</div>
</div>
