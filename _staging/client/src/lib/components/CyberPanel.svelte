<script>
  export let hover = true;
</script>

<div class={`bg-panel border border-white/5 rounded-xl p-5 shadow-neonSoft transition-all duration-300 ${hover ? 'hover:shadow-neon hover:border-accent-primary/30' : ''}`}>
  <slot />
</div>
