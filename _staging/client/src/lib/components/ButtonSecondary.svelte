<script>
  export let disabled = false;
  export let type = "button";
</script>

<button
  {type}
  {disabled}
  on:click
  class="px-5 py-3 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
>
  <slot />
</button>
