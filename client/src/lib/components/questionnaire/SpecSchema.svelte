<script>
	import { fade } from 'svelte/transition';

	export let schema = {};
	export let onApprove = () => {};
	export let isApproving = false;

	let isEditing = false;
	let jsonString = '';
	let error = '';

	// Initialize jsonString when schema changes or on mount
	$: {
		if (schema && !isEditing) {
			try {
				jsonString = JSON.stringify(schema, null, 2);
			} catch (e) {
				jsonString = '{}';
			}
		}
	}

	function handleEdit() {
		isEditing = true;
	}

	function handleSave() {
		try {
			const parsed = JSON.parse(jsonString);
			schema = parsed; // Update parent binding
			isEditing = false;
			error = '';
		} catch (e) {
			error = 'Invalid JSON: ' + e.message;
		}
	}

	function handleCancel() {
		// Revert to original schema
		jsonString = JSON.stringify(schema, null, 2);
		isEditing = false;
		error = '';
	}

	function handleApproveClick() {
		if (isEditing) {
			// Try to save first
			try {
				const parsed = JSON.parse(jsonString);
				schema = parsed;
				isEditing = false;
				onApprove();
			} catch (e) {
				error = 'Please fix JSON errors before approving';
			}
		} else {
			onApprove();
		}
	}
</script>

<div class="max-w-4xl mx-auto h-full flex flex-col" in:fade>
	<div class="flex items-center justify-between mb-6">
		<div>
			<h2 class="text-2xl font-bold text-white">Database & API Schema</h2>
			<p class="text-slate-400">Review and edit the generated data structure</p>
		</div>

		<div class="flex gap-3">
			{#if !isEditing}
				<button
					on:click={handleEdit}
					class="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
				>
					Edit Schema
				</button>
			{/if}

			<button
				on:click={handleApproveClick}
				disabled={isApproving}
				class="px-8 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-bold hover:from-blue-500 hover:to-cyan-500 shadow-lg shadow-blue-900/30 transform hover:scale-105 transition-all text-lg flex items-center gap-2"
			>
				{#if isApproving}
					<span class="animate-spin">⟳</span> Generating Files...
				{:else}
					<span>📂</span> Approve & Generate Files
				{/if}
			</button>
		</div>
	</div>

	<div
		class="flex-1 flex flex-col overflow-hidden bg-slate-900/80 border border-slate-700 rounded-xl p-6 backdrop-blur-sm relative"
	>
		{#if error}
			<div
				class="absolute top-4 right-8 left-8 bg-red-900/90 text-red-200 px-4 py-2 rounded border border-red-700 z-10"
			>
				{error}
			</div>
		{/if}

		{#if isEditing}
			<div class="flex justify-between mb-2 text-sm text-slate-400">
				<span>Editing JSON...</span>
				<div class="flex gap-2">
					<button on:click={handleCancel} class="text-slate-400 hover:text-white">Cancel</button>
					<button on:click={handleSave} class="text-cyan-400 hover:text-cyan-300">Done</button>
				</div>
			</div>
			<textarea
				bind:value={jsonString}
				class="flex-1 w-full bg-slate-950 text-cyan-300 font-mono text-sm p-4 rounded border border-slate-700 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none resize-none custom-scrollbar"
				spellcheck="false"
			></textarea>
		{:else}
			<div class="flex-1 overflow-y-auto custom-scrollbar">
				<pre class="text-sm font-mono text-cyan-300 whitespace-pre-wrap">{jsonString}</pre>
			</div>
		{/if}
	</div>
</div>

<style>
	.custom-scrollbar::-webkit-scrollbar {
		width: 8px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: rgba(30, 41, 59, 0.5);
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: rgba(71, 85, 105, 0.8);
		border-radius: 4px;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background: rgba(100, 116, 139, 1);
	}
</style>
