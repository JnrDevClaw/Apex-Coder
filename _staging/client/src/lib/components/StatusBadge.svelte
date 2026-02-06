<script>
  import { getAccessibleStatusLabel } from '../utils/accessibility.js';
  
  export let status = "creating";
  
  const statusMap = {
    creating: "bg-accent-primary/20 text-accent-primary animate-pulseSoft",
    created: "bg-accent-success/20 text-accent-success",
    error: "bg-accent-error/20 text-accent-error",
    cancelled: "bg-white/10 text-white/60",
    pending: "bg-white/10 text-white/60",
    running: "bg-accent-primary/20 text-accent-primary animate-pulseSoft",
    done: "bg-accent-success/20 text-accent-success",
    passed: "bg-accent-success/20 text-accent-success",
    failed: "bg-accent-error/20 text-accent-error",
    pushed: "bg-accent-secondary/20 text-accent-secondary",
    deployed: "bg-accent-success/20 text-accent-success"
  };
  
  $: ariaLabel = getAccessibleStatusLabel(status);
</script>

<span 
  class={`px-3 py-1 rounded-full text-xs font-semibold ${statusMap[status] || statusMap.pending}`}
  role="status"
  aria-label={ariaLabel}
>
  {status.toUpperCase()}
</span>
