<!-- Simple Recursive Helper Component for the Tree -->
<script context="module">
	import { createEventDispatcher } from 'svelte';

	// We can't define a component inside a component in standard Svelte 3/4 easily without context="module" or separate file.
	// Given the constraints, I'll create a separate component file for FileTreeNode in the next step
	// and import it here.
	// Wait, I can't easily multi-step this inside one tool call if I need it immediately.
	// I'll make a separate file `FileTreeNode.svelte` first then update this.
	// Or I can just render the JSON since I don't have the Tree Node component yet.
	// actually, I will write the FileTreeNode.svelte file in the next step,
	// so I will import it here optimistically.
</script>

<script>
	import { fade } from 'svelte/transition';
	import FileTreeNode from './FileTreeNode.svelte';

	export let fileStructure = {};
	export let onApprove = () => {};
	export let isApproving = false;

	let viewMode = 'tree'; // 'tree' | 'json'
	let isEditing = false;
	let jsonString = '';
	let error = '';

	// Initialize jsonString when structure changes or on mount
	$: {
		if (fileStructure && !isEditing) {
			try {
				jsonString = JSON.stringify(fileStructure, null, 2);
			} catch (e) {
				jsonString = '{}';
			}
		}
	}

	function toggleView() {
		if (isEditing) {
			handleSave(); // Auto save when switching view if editing
		}
		viewMode = viewMode === 'tree' ? 'json' : 'tree';
	}

	function handleEdit() {
		viewMode = 'json'; // Must be in JSON mode to edit
		isEditing = true;
	}

	function handleSave() {
		try {
			const parsed = JSON.parse(jsonString);
			fileStructure = parsed; // Update parent binding
			isEditing = false;
			error = '';
		} catch (e) {
			error = 'Invalid JSON: ' + e.message;
			// Stay in edit mode if error?
			// For now, we set error message
		}
	}

	function handleCancel() {
		// Revert to original schema
		jsonString = JSON.stringify(fileStructure, null, 2);
		isEditing = false;
		error = '';
	}

	function handleApproveClick() {
		if (isEditing) {
			// Try to save first
			try {
				const parsed = JSON.parse(jsonString);
				fileStructure = parsed;
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
			<h2 class="text-2xl font-bold text-white">Project File Structure</h2>
			<p class="text-slate-400">Review the generated file organization</p>
		</div>

		<div class="flex gap-3">
			<button
				on:click={toggleView}
				class="px-4 py-2 bg-slate-800 text-slate-300 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors text-sm"
			>
				{viewMode === 'tree' ? 'View/Edit JSON' : 'View Tree'}
			</button>

			{#if viewMode === 'json' && !isEditing}
				<button
					on:click={handleEdit}
					class="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors text-sm"
				>
					Edit
				</button>
			{/if}

			<button
				on:click={handleApproveClick}
				disabled={isApproving}
				class="px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-bold hover:from-green-500 hover:to-emerald-500 shadow-lg shadow-green-900/30 transform hover:scale-105 transition-all text-lg flex items-center gap-2"
			>
				{#if isApproving}
					<span class="animate-spin">⟳</span> Starting Build...
				{:else}
					<span>🚀</span> Approve & Start Build
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

		{#if viewMode === 'tree'}
			<div class="flex-1 overflow-y-auto custom-scrollbar pl-2">
				<!-- Recursive Tree View Component would go here, implementing a simple one inline or using a snippet if Svelte 5 (not sure of version) 
                     Using a simple recursive rendering approach for now. 
                -->
				<ul class="tree-root">
					<FileTreeNode node={fileStructure} name="root" />
				</ul>
			</div>
		{:else if isEditing}
			<div class="flex justify-between mb-2 text-sm text-slate-400">
				<span>Editing JSON...</span>
				<div class="flex gap-2">
					<button on:click={handleCancel} class="text-slate-400 hover:text-white">Cancel</button>
					<button on:click={handleSave} class="text-emerald-400 hover:text-emerald-300">Done</button
					>
				</div>
			</div>
			<textarea
				bind:value={jsonString}
				class="flex-1 w-full bg-slate-950 text-emerald-300 font-mono text-sm p-4 rounded border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none custom-scrollbar"
				spellcheck="false"
			></textarea>
		{:else}
			<div class="flex-1 overflow-y-auto custom-scrollbar">
				<pre class="text-sm font-mono text-emerald-300 whitespace-pre-wrap">{jsonString}</pre>
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

	.tree-root {
		list-style: none;
		padding-left: 0;
	}
</style>
