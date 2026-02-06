<script>
  import { translations$ } from '../utils/i18n.js';
  
  export let targetId = 'main-content';
  
  function handleSkip() {
    const target = document.getElementById(targetId);
    if (target) {
      target.setAttribute('tabindex', '-1');
      target.focus();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
</script>

<a
  href="#{targetId}"
  on:click|preventDefault={handleSkip}
  class="skip-to-content"
>
  {$translations$('a11y.skipToContent')}
</a>

<style>
  .skip-to-content {
    position: absolute;
    left: -9999px;
    z-index: 999;
    padding: 1rem 1.5rem;
    background-color: var(--accent-primary, #3AB8FF);
    color: var(--bg-primary, #0A0A0C);
    text-decoration: none;
    font-weight: 600;
    border-radius: 0.5rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
  }
  
  .skip-to-content:focus {
    left: 1rem;
    top: 1rem;
  }
</style>
