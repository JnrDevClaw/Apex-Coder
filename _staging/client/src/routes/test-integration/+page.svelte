<script>
	import { onMount } from 'svelte';

	let serverStatus = $state('checking...');
	let pipelineStatus = $state(null);
	let testBuildResult = $state(null);
	let loading = $state(false);
	let error = $state(null);

	onMount(async () => {
		await checkServerStatus();
		await checkPipelineStatus();
	});

	async function checkServerStatus() {
		try {
			const response = await fetch('/api/test/ping');
			const data = await response.json();
			
			if (data.success) {
				serverStatus = 'connected';
			} else {
				serverStatus = 'error';
			}
		} catch (err) {
			console.error('Server status check failed:', err);
			serverStatus = 'disconnected';
		}
	}

	async function checkPipelineStatus() {
		try {
			const response = await fetch('/api/test/pipeline-status');
			const data = await response.json();
			
			if (data.success) {
				pipelineStatus = data;
			} else {
				error = data.error;
			}
		} catch (err) {
			console.error('Pipeline status check failed:', err);
			error = err.message;
		}
	}

	async function startTestBuild() {
		try {
			loading = true;
			error = null;
			testBuildResult = null;

			const response = await fetch('/api/test/simple-build', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					projectName: 'Integration Test Project'
				})
			});

			const data = await response.json();
			
			if (data.success) {
				testBuildResult = data;
				// Navigate to build page
				if (data.build?.buildId) {
					setTimeout(() => {
						window.location.href = `/build/${data.build.buildId}`;
					}, 2000);
				}
			} else {
				error = data.error;
			}
		} catch (err) {
			console.error('Test build failed:', err);
			error = err.message;
		} finally {
			loading = false;
		}
	}

	function getStatusColor(status) {
		switch (status) {
			case 'connected': return 'text-green-400';
			case 'checking...': return 'text-yellow-400';
			case 'disconnected':
			case 'error':
			default: return 'text-red-400';
		}
	}
</script>

<svelte:head>
	<title>Integration Test - AI App Builder</title>
</svelte:head>

<div class="min-h-screen bg-bg-primary py-8">
	<div class="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
		<div class="mb-8 text-center">
			<h1 class="text-3xl font-bold text-white">Frontend-Backend Integration Test</h1>
			<p class="mt-2 text-text-secondary">
				Verify that all components are working together
			</p>
		</div>

		<!-- Server Status -->
		<div class="mb-6 rounded-xl border border-white/10 bg-panel p-6">
			<h2 class="mb-4 text-xl font-semibold text-white">Server Status</h2>
			<div class="flex items-center space-x-3">
				<div class="h-3 w-3 rounded-full bg-current {getStatusColor(serverStatus)}"></div>
				<span class="text-white">Server: <span class="{getStatusColor(serverStatus)}">{serverStatus}</span></span>
			</div>
		</div>

		<!-- Pipeline Components -->
		{#if pipelineStatus}
			<div class="mb-6 rounded-xl border border-white/10 bg-panel p-6">
				<h2 class="mb-4 text-xl font-semibold text-white">Pipeline Components</h2>
				<div class="grid grid-cols-2 gap-4 md:grid-cols-4">
					{#each Object.entries(pipelineStatus.components) as [component, status]}
						<div class="flex items-center space-x-2">
							<div class="h-2 w-2 rounded-full {status ? 'bg-green-400' : 'bg-red-400'}"></div>
							<span class="text-sm text-white">{component}</span>
						</div>
					{/each}
				</div>

				{#if pipelineStatus.stageConfigs}
					<div class="mt-6">
						<h3 class="mb-3 text-lg font-medium text-white">Pipeline Stages</h3>
						<div class="space-y-2">
							{#each Object.entries(pipelineStatus.stageConfigs) as [stageNum, config]}
								<div class="flex items-center justify-between rounded-lg bg-white/5 p-3">
									<div>
										<span class="font-medium text-white">Stage {stageNum}: {config.name}</span>
										<p class="text-sm text-text-secondary">{config.description}</p>
									</div>
									{#if config.requiresAI}
										<div class="text-right">
											<div class="text-sm text-accent-primary">
												{config.provider || 'Multiple'}/{config.model || 'Multiple Models'}
											</div>
										</div>
									{:else}
										<div class="text-sm text-text-secondary">No AI</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Test Build -->
		<div class="mb-6 rounded-xl border border-white/10 bg-panel p-6">
			<h2 class="mb-4 text-xl font-semibold text-white">Test Build</h2>
			<p class="mb-4 text-text-secondary">
				Start a test build to verify the complete pipeline integration
			</p>

			<button
				onclick={startTestBuild}
				disabled={loading || serverStatus !== 'connected'}
				class="rounded-lg bg-accent-primary px-6 py-3 font-semibold text-black hover:shadow-neon transition-all disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if loading}
					<div class="flex items-center space-x-2">
						<div class="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent"></div>
						<span>Starting Test Build...</span>
					</div>
				{:else}
					Start Test Build
				{/if}
			</button>

			{#if testBuildResult}
				<div class="mt-4 rounded-lg bg-green-500/10 border border-green-500/30 p-4">
					<h3 class="font-semibold text-green-400">Test Build Started Successfully!</h3>
					<p class="mt-1 text-sm text-green-300">
						Build ID: {testBuildResult.build.buildId}
					</p>
					<p class="mt-1 text-sm text-green-300">
						Redirecting to build page in 2 seconds...
					</p>
				</div>
			{/if}
		</div>

		<!-- Error Display -->
		{#if error}
			<div class="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-6">
				<h2 class="mb-2 text-lg font-semibold text-red-400">Error</h2>
				<p class="text-red-300">{error}</p>
			</div>
		{/if}

		<!-- Navigation -->
		<div class="text-center">
			<a 
				href="/questionnaire" 
				class="inline-block rounded-lg border border-white/20 bg-white/10 px-6 py-3 font-semibold text-white hover:bg-white/20 transition-all"
			>
				← Back to Questionnaire
			</a>
		</div>
	</div>
</div>
