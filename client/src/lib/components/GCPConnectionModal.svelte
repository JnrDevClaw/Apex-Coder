<script>
  import { createEventDispatcher } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  
  export let isOpen = false;
  export let isLoading = false;
  
  const dispatch = createEventDispatcher();
  
  let jsonKey = '';
  let error = null;
  
  function onClose() {
    dispatch('close');
  }
  
  function handleSubmit() {
    error = null;
    try {
      let parsedKey;
      try {
        parsedKey = JSON.parse(jsonKey);
      } catch (err) {
        throw new Error('Invalid JSON format. Please paste the entire JSON content.');
      }

      if (!parsedKey.project_id || !parsedKey.private_key || !parsedKey.client_email) {
        throw new Error('Missing required fields (project_id, private_key, client_email). Please use a valid Service Account Key.');
      }
      
      dispatch('connect', parsedKey);
      jsonKey = ''; // Clear on success (logic handled by parent usually, but safer here)
      
    } catch (err) {
      error = err.message;
    }
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm"
       transition:fade={{ duration: 200 }}>
       
    <div class="bg-bg-secondary w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden border border-border-primary"
         transition:scale={{ duration: 200, start: 0.95 }}>
         
      <!-- Header -->
      <div class="px-6 py-4 border-b border-border-primary flex justify-between items-center">
        <h2 class="text-xl font-semibold text-text-primary">Connect Google Cloud Platform</h2>
        <button class="text-text-secondary hover:text-text-primary transition-colors text-2xl leading-none" 
                on:click={onClose}>
          &times;
        </button>
      </div>

      <!-- Body -->
      <div class="p-6">
        <p class="text-text-secondary mb-4 text-sm">
          To enable automatic deployment to Cloud Run, please upload your Service Account JSON Key.<br>
          <span class="text-xs opacity-75">
            Ensure the Service Account has <strong>Cloud Build Editor</strong> and <strong>Cloud Run Admin</strong> roles.
          </span>
        </p>
        
        <form on:submit|preventDefault={handleSubmit}>
          <div class="mb-4">
            <label for="jsonKey" class="block text-sm font-medium text-text-primary mb-2">
              Service Account Key (JSON)
            </label>
            <textarea
              id="jsonKey"
              bind:value={jsonKey}
              placeholder='Paste your JSON key here: { "type": "service_account", ... }'
              rows="8"
              class="w-full px-4 py-3 bg-bg-tertiary border border-border-primary rounded-lg text-text-primary font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent resize-none"
              required
            ></textarea>
          </div>

          {#if error}
            <div class="mb-4 p-3 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          {/if}

          <div class="flex justify-end gap-3 mt-6">
            <button type="button" 
                    class="px-4 py-2 rounded-lg border border-border-primary text-text-secondary hover:bg-bg-tertiary transition-colors"
                    on:click={onClose}
                    disabled={isLoading}>
              Cancel
            </button>
            <button type="submit" 
                    class="px-4 py-2 rounded-lg bg-accent-primary text-white font-medium hover:bg-opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isLoading || !jsonKey}>
              {isLoading ? 'Connecting...' : 'Connect Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Use Tailwind classes via @apply if needed, but direct classes work in Svelte with Tailwind setup */
</style>
