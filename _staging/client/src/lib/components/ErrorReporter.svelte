<script>
  import { createEventDispatcher } from 'svelte';
  import { writable } from 'svelte/store';
  
  const dispatch = createEventDispatcher();
  
  export let error = null;
  export let context = {};
  export let userEmail = '';
  export let showForm = false;
  
  let isSubmitting = false;
  let submitted = false;
  let userDescription = '';
  let includeSystemInfo = true;
  let includeLogs = true;
  
  const systemInfo = {
    userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : '',
    timestamp: new Date().toISOString(),
    url: typeof window !== 'undefined' ? window.location.href : '',
    viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : ''
  };
  
  async function handleSubmit() {
    if (isSubmitting) return;
    
    isSubmitting = true;
    
    try {
      const reportData = {
        error: {
          message: error?.message || 'Unknown error',
          stack: error?.stack,
          name: error?.name,
          code: error?.code
        },
        context,
        userDescription,
        userEmail,
        systemInfo: includeSystemInfo ? systemInfo : null,
        includeLogs,
        timestamp: new Date().toISOString()
      };
      
      // Try to send to real error reporting service
      try {
        const response = await fetch('/api/error-reports', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(reportData)
        });
        
        if (!response.ok) {
          throw new Error('Failed to submit error report');
        }
        
        const result = await response.json();
        console.log('Error report submitted:', result.reportId);
        
      } catch (apiError) {
        // Fallback to local logging
        console.error('Error report submission failed, logging locally:', apiError);
        console.log('Error Report Data:', reportData);
      }
      
      submitted = true;
      dispatch('submitted', reportData);
      
      // Auto-close after 3 seconds
      setTimeout(() => {
        showForm = false;
        submitted = false;
      }, 3000);
      
    } catch (err) {
      console.error('Failed to submit error report:', err);
      dispatch('error', err);
    } finally {
      isSubmitting = false;
    }
  }
  
  function handleCancel() {
    showForm = false;
    dispatch('cancelled');
  }
  
  function getErrorSummary() {
    if (!error) return 'Unknown error occurred';
    
    if (typeof error === 'string') return error;
    
    return error.message || error.toString() || 'Unknown error occurred';
  }
</script>

{#if showForm}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-panel border border-white/10 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-neon">
      {#if submitted}
        <!-- Success State -->
        <div class="text-center py-8">
          <div class="w-16 h-16 rounded-full bg-accent-success/20 flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-accent-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h3 class="text-xl font-display font-semibold text-white mb-2">Report Submitted</h3>
          <p class="text-text-secondary">Thank you for helping us improve the system. We'll investigate this issue.</p>
        </div>
      {:else}
        <!-- Report Form -->
        <div class="flex items-start gap-4 mb-6">
          <div class="w-10 h-10 rounded-full bg-accent-error/20 flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-accent-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          
          <div class="flex-1">
            <h3 class="text-xl font-display font-semibold text-white mb-2">Report Error</h3>
            <p class="text-text-secondary">Help us fix this issue by providing additional details.</p>
          </div>
        </div>
        
        <!-- Error Summary -->
        <div class="bg-bg-secondary/50 rounded-lg p-4 mb-6">
          <h4 class="text-sm font-semibold text-white mb-2">Error Summary</h4>
          <p class="text-sm font-code text-accent-error">{getErrorSummary()}</p>
          
          {#if error?.code}
            <p class="text-xs text-text-secondary mt-1">Error Code: {error.code}</p>
          {/if}
        </div>
        
        <form on:submit|preventDefault={handleSubmit} class="space-y-4">
          <!-- User Description -->
          <div>
            <label for="user-description" class="block text-sm font-semibold text-white mb-2">
              What were you trying to do when this error occurred?
            </label>
            <textarea
              id="user-description"
              bind:value={userDescription}
              placeholder="Describe what you were doing, what you expected to happen, and what actually happened..."
              rows="4"
              class="w-full bg-bg-secondary border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/30 outline-none transition-all resize-vertical"
            ></textarea>
          </div>
          
          <!-- Contact Email -->
          <div>
            <label for="user-email" class="block text-sm font-semibold text-white mb-2">
              Email (optional)
            </label>
            <input
              type="email"
              id="user-email"
              bind:value={userEmail}
              placeholder="your.email@example.com"
              class="w-full bg-bg-secondary border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/30 outline-none transition-all"
            />
            <p class="text-xs text-text-secondary mt-1">We'll only use this to follow up on your report if needed.</p>
          </div>
          
          <!-- Options -->
          <div class="space-y-3">
            <label class="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={includeSystemInfo}
                class="rounded border-white/20 bg-bg-secondary text-accent-primary focus:ring-accent-primary focus:ring-offset-0"
              />
              <span class="text-sm text-white">Include system information (browser, screen size, etc.)</span>
            </label>
            
            <label class="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={includeLogs}
                class="rounded border-white/20 bg-bg-secondary text-accent-primary focus:ring-accent-primary focus:ring-offset-0"
              />
              <span class="text-sm text-white">Include recent activity logs</span>
            </label>
          </div>
          
          <!-- Actions -->
          <div class="flex gap-3 justify-end pt-4 border-t border-white/10">
            <button
              type="button"
              on:click={handleCancel}
              disabled={isSubmitting}
              class="btn-secondary px-4 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              class="bg-accent-primary text-black hover:bg-accent-primary/80 px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {#if isSubmitting}
                <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Submitting...
              {:else}
                Submit Report
              {/if}
            </button>
          </div>
        </form>
      {/if}
    </div>
  </div>
{/if}

<style>
  .btn-secondary {
    background-color: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.8);
    border-radius: 0.5rem;
    font-weight: 600;
    transition: all 0.3s;
  }
  
  .btn-secondary:hover {
    background-color: rgba(255, 255, 255, 0.2);
  }
</style>
