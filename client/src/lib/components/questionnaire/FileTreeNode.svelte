<script>
	import { slide } from 'svelte/transition';
	export let node;
	export let name = 'root';
	export let depth = 0;

	let expanded = true;

	// Determine type: Object = Directory, String = File (usually description)
	$: isDirectory = typeof node === 'object' && node !== null;
	$: isFile = !isDirectory;
	$: displayName = name;
	$: description = isFile ? node : '';

	// Get children if directory
	$: children = isDirectory ? Object.entries(node) : [];

	function toggle() {
		if (isDirectory) {
			expanded = !expanded;
		}
	}
</script>

<li class="relative">
	<button
		type="button"
		class="flex items-center gap-2 py-1 px-2 rounded hover:bg-white/5 cursor-pointer select-none transition-colors w-full text-left focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
		style="padding-left: {depth > 0 ? '0.5rem' : '0.5rem'}"
		on:click|stopPropagation={toggle}
		on:keydown={(e) => (e.key === 'Enter' || e.key === ' ' ? toggle() : null)}
	>
		<!-- Icon -->
		<span class="text-lg opacity-80 w-6 text-center">
			{#if isDirectory}
				{#if expanded}📂{:else}📁{/if}
			{:else}
				📄
			{/if}
		</span>

		<!-- Name -->
		<span class="{isDirectory ? 'font-bold text-emerald-200' : 'text-slate-300'} text-sm font-mono">
			{displayName}
		</span>

		<!-- Description (if file) -->
		{#if isFile && description}
			<span class="text-xs text-slate-500 italic ml-2 truncate max-w-md">
				// {description}
			</span>
		{/if}
	</button>

	<!-- Children -->
	{#if isDirectory && expanded}
		<ul transition:slide|local={{ duration: 200 }} class="ml-4 border-l border-white/10">
			{#each children as [childName, childNode]}
				<svelte:self node={childNode} name={childName} depth={depth + 1} />
			{/each}
		</ul>
	{/if}
</li>
