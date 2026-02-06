<script>
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  export let isOpen = false;
  
  let expandedItems = new Set();
  
  const faqItems = [
    {
      id: 'build-time',
      question: 'How long does a typical build take?',
      answer: 'Build times vary by complexity: Simple projects (15-25 min), Medium projects (25-40 min), Complex projects (40-60 min). The "Coding Files" stage is typically the longest.'
    },
    {
      id: 'close-browser',
      question: 'Can I close my browser during a build?',
      answer: 'Yes! Your build continues running on our servers. You can return to this page anytime using the build URL or from your dashboard to check progress.'
    },
    {
      id: 'internet-disconnect',
      question: 'What happens if my internet disconnects?',
      answer: 'The build continues on our servers. When you reconnect, the page will automatically show the current status and resume real-time updates.'
    },
    {
      id: 'stage-stuck',
      question: 'My build seems stuck on a stage. What should I do?',
      answer: 'Some stages take time, especially "Coding Files" (10-30 min). Wait 5-10 minutes, then check your connection. If still stuck after 15 minutes, try canceling and retrying the build.'
    },
    {
      id: 'stage-failed',
      question: 'A stage failed. How do I fix it?',
      answer: 'Click on the failed stage to see error details. Try "Retry Stage" first. If that fails, try "Try Alternative Model" which uses a different AI. For persistent issues, use "Report Issue".'
    },
    {
      id: 'modify-code',
      question: 'Can I modify the generated code?',
      answer: 'Absolutely! Once your repository is created, you own all the code and can modify it however you like. The generated code is your starting point.'
    },
    {
      id: 'multiple-builds',
      question: 'Can I run multiple builds at the same time?',
      answer: 'Yes, you can have multiple builds running simultaneously. Each build has its own unique ID and progress tracking.'
    },
    {
      id: 'change-requirements',
      question: 'Can I change my requirements mid-build?',
      answer: 'You\'ll need to cancel the current build and start a new one with updated requirements. The questionnaire allows you to modify your specifications.'
    },
    {
      id: 'websocket-issues',
      question: 'I see "Real-time updates disconnected". What does this mean?',
      answer: 'This means the live update connection was lost. Your build continues normally. Click "Reconnect" or refresh the page to restore real-time updates.'
    },
    {
      id: 'deployment-failed',
      question: 'My deployment failed. What should I do?',
      answer: 'Check that your AWS credentials are configured correctly and you have the necessary permissions. You can retry just the deployment stage without rebuilding the entire application.'
    },
    {
      id: 'build-history',
      question: 'How long are my builds kept?',
      answer: 'Build history and logs are kept for 30 days. Your generated repositories on GitHub are yours permanently and won\'t be deleted.'
    },
    {
      id: 'usage-limits',
      question: 'Are there any usage limits?',
      answer: 'Usage limits depend on your account type. Check your account settings or contact support for information about your specific limits and quotas.'
    }
  ];
  
  function toggleItem(itemId) {
    if (expandedItems.has(itemId)) {
      expandedItems.delete(itemId);
    } else {
      expandedItems.add(itemId);
    }
    expandedItems = expandedItems; // Trigger reactivity
  }
  
  function toggleFAQ() {
    isOpen = !isOpen;
    dispatch('toggle', { isOpen });
  }
  
  function closeFAQ() {
    isOpen = false;
    dispatch('close');
  }
  
  // Close on escape key
  function handleKeydown(event) {
    if (event.key === 'Escape' && isOpen) {
      closeFAQ();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- FAQ Toggle Button -->
<button
  type="button"
  on:click={toggleFAQ}
  class="fixed bottom-4 right-4 z-40 bg-accent-primary text-black p-3 rounded-full shadow-lg hover:shadow-neon transition-all duration-300 md:bottom-6 md:right-6"
  aria-label="Toggle FAQ"
  aria-expanded={isOpen}
>
  {#if isOpen}
    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
    </svg>
  {:else}
    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
    </svg>
  {/if}
</button>

<!-- FAQ Panel -->
{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
    <div class="bg-panel border border-white/10 rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between p-4 md:p-6 border-b border-white/10">
        <h2 class="text-xl md:text-2xl font-bold text-white">Frequently Asked Questions</h2>
        <button
          type="button"
          on:click={closeFAQ}
          class="text-white/60 hover:text-white transition-colors p-2 -m-2"
          aria-label="Close FAQ"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
      
      <!-- FAQ Content -->
      <div class="overflow-y-auto max-h-[calc(80vh-80px)] p-4 md:p-6">
        <div class="space-y-3">
          {#each faqItems as item}
            <div class="border border-white/5 rounded-lg overflow-hidden">
              <button
                type="button"
                on:click={() => toggleItem(item.id)}
                class="w-full text-left p-4 bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-between"
                aria-expanded={expandedItems.has(item.id)}
                aria-controls="faq-{item.id}"
              >
                <span class="font-medium text-white text-sm md:text-base pr-4">{item.question}</span>
                <svg 
                  class="w-5 h-5 text-white/60 transition-transform duration-200 flex-shrink-0 {expandedItems.has(item.id) ? 'rotate-180' : ''}"
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </button>
              
              {#if expandedItems.has(item.id)}
                <div 
                  id="faq-{item.id}"
                  class="p-4 bg-white/2 border-t border-white/5"
                  role="region"
                  aria-labelledby="faq-{item.id}-question"
                >
                  <p class="text-white/80 text-sm md:text-base leading-relaxed">{item.answer}</p>
                </div>
              {/if}
            </div>
          {/each}
        </div>
        
        <!-- Additional Help -->
        <div class="mt-6 p-4 bg-accent-primary/10 border border-accent-primary/20 rounded-lg">
          <h3 class="font-semibold text-white mb-2">Still need help?</h3>
          <p class="text-white/80 text-sm mb-3">
            If your question isn't answered here, you can:
          </p>
          <ul class="text-white/80 text-sm space-y-1 list-disc list-inside">
            <li>Use the "Report Issue" button on failed stages</li>
            <li>Check the detailed user guide in the documentation</li>
            <li>Contact support through the main navigation</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Smooth animations for FAQ items */
  .faq-item {
    transition: all 0.2s ease-in-out;
  }
  
  /* Ensure FAQ panel is above other elements */
  .faq-panel {
    z-index: 1000;
  }
</style>
