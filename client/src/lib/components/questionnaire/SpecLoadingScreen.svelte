<script>
	import { fade } from 'svelte/transition';

	export let state = 'analyzing'; // 'analyzing', 'parsing', 'generating'

	const states = {
		analyzing: {
			title: 'Analysing User Requirements',
			description: 'Our AI is analyzing your answers to understand your project needs.'
		},
		parsing: {
			title: 'Parsing Updated Specification',
			description: 'incorporating your feedback into the technical specification.'
		},
		generating: {
			title: 'Preparing Clarifying Questions',
			description: 'Identifying areas that need more detail to ensure a perfect build.'
		}
	};

	$: currentState = states[state] || states.analyzing;
</script>

<div class="flex flex-col items-center justify-center h-96 space-y-8" in:fade>
	<div class="relative w-24 h-24">
		<div class="absolute inset-0 border-4 border-cyan-500/30 rounded-full animate-ping"></div>
		<div
			class="absolute inset-0 border-4 border-t-cyan-500 border-r-transparent border-b-purple-500 border-l-transparent rounded-full animate-spin"
		></div>
		<div class="absolute inset-4 bg-slate-800 rounded-full flex items-center justify-center">
			<span class="text-2xl">⚡</span>
		</div>
	</div>

	<div class="text-center space-y-2 max-w-md">
		<h3
			class="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-400"
		>
			{currentState.title}
		</h3>
		<p class="text-slate-400">
			{currentState.description}
		</p>
	</div>
</div>
