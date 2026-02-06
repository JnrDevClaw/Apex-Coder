<script>
  export let disabled = false;
  export let type = "button";
</script>

<button
  {type}
  {disabled}
  on:click
  class="px-5 py-3 rounded-lg bg-accent-primary text-black font-semibold shadow-neon hover:shadow-neonSoft hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
>
  <slot />
</button>
