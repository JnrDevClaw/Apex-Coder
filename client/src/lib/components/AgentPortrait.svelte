<script>
  export let agent = "llama"; // llama, deepseek, gpt, claude, gemini, huggingface, system
  export let size = "md"; // sm, md, lg
  export let isActive = false; // Add animated indicator for active stages
  export let showLabel = true; // Option to hide label
  
  const sizeClasses = {
    sm: "w-8 h-8 text-lg",
    md: "w-12 h-12 text-2xl",
    lg: "w-16 h-16 text-3xl"
  };
  
  const agentConfig = {
    llama: {
      color: "text-accent-secondary",
      icon: "🔥",
      name: "Llama 4 Scout",
      glow: "shadow-[0_0_12px_rgba(164,107,255,0.4)]",
      role: "Docs Creator"
    },
    deepseek: {
      color: "text-accent-primary",
      icon: "🧠",
      name: "DeepSeek-V3",
      glow: "shadow-[0_0_12px_rgba(58,184,255,0.4)]",
      role: "Schema Generator"
    },
    gpt: {
      color: "text-yellow-400",
      icon: "⚡",
      name: "GPT-4o",
      glow: "shadow-[0_0_12px_rgba(250,204,21,0.4)]",
      role: "Structure Planner"
    },
    claude: {
      color: "text-white",
      icon: "✨",
      name: "Claude 3.5",
      glow: "shadow-[0_0_12px_rgba(255,255,255,0.4)]",
      role: "Validator"
    },
    gemini: {
      color: "text-accent-success",
      icon: "💎",
      name: "Gemini-3",
      glow: "shadow-[0_0_12px_rgba(123,255,178,0.4)]",
      role: "Code Generator"
    },
    huggingface: {
      color: "text-accent-primary",
      icon: "🤗",
      name: "HuggingFace",
      glow: "shadow-[0_0_12px_rgba(58,184,255,0.4)]",
      role: "Clarifier"
    },
    system: {
      color: "text-white",
      icon: "⚙️",
      name: "System",
      glow: "shadow-[0_0_12px_rgba(255,255,255,0.3)]",
      role: "Orchestrator"
    }
  };
  
  const config = agentConfig[agent] || agentConfig.system;
</script>

<div class="flex items-center gap-3">
  <div 
    class={`${sizeClasses[size]} rounded-lg bg-panel border border-white/10 flex items-center justify-center ${config.glow} transition-all hover:scale-110 relative`}
    class:animate-pulse-glow={isActive}
  >
    <span class={config.color}>{config.icon}</span>
    
    {#if isActive}
      <div class="absolute -top-1 -right-1 w-3 h-3 bg-accent-primary rounded-full animate-ping"></div>
      <div class="absolute -top-1 -right-1 w-3 h-3 bg-accent-primary rounded-full"></div>
    {/if}
  </div>
  
  {#if showLabel}
    <div class="flex flex-col">
      <span class="text-sm font-semibold text-white">{config.name}</span>
      <span class="text-xs text-text-secondary font-code">{config.role}</span>
    </div>
  {/if}
</div>

<style>
  @keyframes pulse-glow {
    0%, 100% {
      box-shadow: 0 0 12px var(--glow-color, rgba(58,184,255,0.4));
    }
    50% {
      box-shadow: 0 0 20px var(--glow-color, rgba(58,184,255,0.6));
    }
  }
  
  .animate-pulse-glow {
    animation: pulse-glow 2s ease-in-out infinite;
  }
</style>
