<script>
  export let value = "";
  export let placeholder = "";
  export let type = "text";
  export let disabled = false;
  export let required = false;
  export let label = "";
  export let id = "";
</script>

<div class="w-full">
  {#if label}
    <label for={id} class="block text-sm font-medium text-white/80 mb-2">
      {label}
      {#if required}
        <span class="text-accent-error">*</span>
      {/if}
    </label>
  {/if}
  
  <input
    {id}
    {type}
    {placeholder}
    {disabled}
    {required}
    bind:value
    class="w-full bg-bg-secondary border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/30 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
  />
</div>
