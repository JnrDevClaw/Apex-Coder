<script>
  export let disabled = false;
  export let type = "button";
</script>

<button
  {type}
  {disabled}
  on:click
  class="px-5 py-3 rounded-lg bg-accent-error/20 text-accent-error border border-accent-error/30 hover:bg-accent-error/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
>
  <slot />
</button>
