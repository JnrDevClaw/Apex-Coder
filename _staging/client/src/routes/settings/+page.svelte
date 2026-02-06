<script>
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { gcpApi } from '$lib/services/gcpApi.js';
	import GCPConnectionModal from '$lib/components/GCPConnectionModal.svelte';

	let gcpStatus = {
		connected: false,
		projectId: null,
		connectedAt: null,
		loading: true
	};

	let isModalOpen = false;
	let isConnecting = false;

	onMount(async () => {
		await fetchGCPStatus();
	});

	async function fetchGCPStatus() {
		try {
			const data = await gcpApi.getGCPStatus();
			gcpStatus = {
				connected: data.connected,
				projectId: data.projectId,
				connectedAt: data.connectedAt,
				loading: false
			};
		} catch (error) {
			console.error('Failed to fetch GCP status:', error);
			gcpStatus = { ...gcpStatus, loading: false };
		}
	}

	async function handleConnect(event) {
		const key = event.detail;
		isConnecting = true;
		try {
			await gcpApi.connectGCP(key);
			await fetchGCPStatus();
			isModalOpen = false;
		} catch (error) {
			// Error handled in API service / Modal
		} finally {
			isConnecting = false;
		}
	}
</script>

<div class="container mx-auto px-4 py-8 max-w-4xl" in:fade>
	<h1 class="text-3xl font-bold text-text-primary mb-8">Settings</h1>

	<!-- Cloud Provider Settings -->
	<section class="mb-12">
		<h2 class="text-xl font-semibold text-text-primary mb-4 pb-2 border-b border-border-primary">
			Cloud Providers
		</h2>

		<div class="grid gap-6">
			<!-- Google Cloud Platform Card -->
			<div
				class="bg-bg-secondary rounded-xl border border-border-primary p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
			>
				<div>
					<div class="flex items-center gap-3 mb-2">
						<!-- GCP Logo Placeholder (SVG) -->
						<svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path
								d="M23.64 12.204c0-.638-.057-1.252-.164-1.841H12v3.481h6.522c-.281 1.516-1.139 2.766-2.427 3.633v3.018h3.931c2.299-2.116 3.626-5.232 3.626-8.291z"
								fill="#4285F4"
							/>
							<path
								d="M12 24c3.273 0 6.016-1.085 8.019-2.936l-3.931-3.018c-1.085.727-2.473 1.157-4.088 1.157-3.158 0-5.833-2.133-6.788-5.001H1.196v3.138C3.197 21.326 7.283 24 12 24z"
								fill="#34A853"
							/>
							<path
								d="M5.212 14.202c-.242-.727-.381-1.516-.381-2.316 0-.8.139-1.589.381-2.316V6.432H1.196C.432 7.954 0 9.688 0 12c0 2.312.432 4.046 1.196 5.568l4.016-3.366z"
								fill="#FBBC05"
							/>
							<path
								d="M12 4.757c1.78 0 3.377.612 4.632 1.811l3.473-3.473C17.96 1.05 15.222 0 12 0 7.283 0 3.197 2.674 1.196 6.432l4.016 3.366c.955-2.868 3.63-5.001 6.788-5.001z"
								fill="#EA4335"
							/>
						</svg>
						<h3 class="text-lg font-medium text-text-primary">Google Cloud Platform</h3>
					</div>
					<p class="text-text-secondary text-sm max-w-lg">
						Connect your GCP account to enable automatic deployment to Cloud Run.
					</p>
				</div>

				<div class="flex flex-col items-end gap-2">
					{#if gcpStatus.loading}
						<div class="h-10 w-32 bg-bg-tertiary animate-pulse rounded-lg"></div>
					{:else if gcpStatus.connected}
						<div class="flex items-center gap-2 mb-1">
							<span class="w-2 h-2 rounded-full bg-green-500"></span>
							<span class="text-sm font-medium text-green-400">Connected</span>
						</div>
						<div class="text-xs text-text-secondary mb-3">
							Project: {gcpStatus.projectId}
						</div>
						<button
							class="px-4 py-2 text-sm bg-bg-tertiary border border-border-primary text-text-primary rounded-lg hover:bg-opacity-80 transition-colors"
							on:click={() => (isModalOpen = true)}
						>
							Reconfigure
						</button>
					{:else}
						<div class="flex items-center gap-2 mb-2">
							<span class="w-2 h-2 rounded-full bg-gray-500"></span>
							<span class="text-sm text-text-secondary">Not Connected</span>
						</div>
						<button
							class="px-4 py-2 text-sm bg-accent-primary text-white rounded-lg hover:bg-opacity-90 transition-colors shadow-lg shadow-accent-primary/20"
							on:click={() => (isModalOpen = true)}
						>
							Connect
						</button>
					{/if}
				</div>
			</div>
		</div>
	</section>

	<!-- Other Settings (Placeholder) -->
	<section>
		<h2 class="text-xl font-semibold text-text-primary mb-4 pb-2 border-border-primary opacity-50">
			Account Settings (Coming Soon)
		</h2>
	</section>
</div>

<GCPConnectionModal
	isOpen={isModalOpen}
	isLoading={isConnecting}
	on:close={() => (isModalOpen = false)}
	on:connect={handleConnect}
/>
