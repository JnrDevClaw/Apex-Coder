<script>
	import { fade } from 'svelte/transition';
	import { onMount } from 'svelte';
	// Check if marked is available, otherwise uses simple rendering or needs installation
	// For this environment, we'll assume marked is available or use a simple replacement
	// Since we can't easily install packages, I'll use a very simple display or assume a global MD renderer is not essential for the mock
	// But typically one would use 'marked'

	export let documentation = '';
	export let onApprove = () => {};
	export let isApproving = false;

	// Simple clean up of markdown for display if no renderer available
	// In a real app we'd use <div class="prose prose-invert" use:markdown={documentation} />

	function formatMarkdown(md) {
		if (!md) return '';
		return md
			.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mb-4 text-cyan-400">$1</h1>')
			.replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-6 mb-3 text-purple-400">$1</h2>')
			.replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold mt-4 mb-2 text-white">$1</h3>')
			.replace(/^\- (.*$)/gim, '<li class="ml-4 list-disc text-slate-300">$1</li>')
			.replace(/\*\*(.*)\*\*/gim, '<strong class="text-white">$1</strong>')
			.replace(
				/`([^`]+)`/gim,
				'<code class="bg-slate-800 px-1 py-0.5 rounded text-cyan-300 font-mono text-sm">$1</code>'
			)
			.replace(/\n/gim, '<br />');
	}
</script>

<div class="max-w-4xl mx-auto h-full flex flex-col" in:fade>
	<div class="flex items-center justify-between mb-6">
		<div>
			<h2 class="text-2xl font-bold text-white">Project Documentation</h2>
			<p class="text-slate-400">Review the generated specification before building</p>
		</div>

		<button
			on:click={onApprove}
			disabled={isApproving}
			class="px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-bold hover:from-green-500 hover:to-emerald-500 shadow-lg shadow-green-900/30 transform hover:scale-105 transition-all text-lg flex items-center gap-2"
		>
			{#if isApproving}
				<span class="animate-spin">⟳</span> Building...
			{:else}
				<span>🚀</span> Approve & Build
			{/if}
		</button>
	</div>

	<div
		class="flex-1 overflow-y-auto bg-slate-900/80 border border-slate-700 rounded-xl p-8 backdrop-blur-sm custom-scrollbar"
	>
		<div class="prose prose-invert max-w-none">
			{@html formatMarkdown(documentation)}
		</div>
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
