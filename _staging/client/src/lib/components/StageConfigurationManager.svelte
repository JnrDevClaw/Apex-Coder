<script>
  import { onMount } from 'svelte';
  import { stageRegistry } from '../services/stageRegistry.js';
  import { stageValidator } from '../services/stageValidator.js';
  import { stageCompatibility } from '../services/stageCompatibility.js';
  import { payloadSchemaHandler } from '../services/payloadSchemaHandler.js';
  import StatusBadge from './StatusBadge.svelte';
  import ButtonPrimary from './ButtonPrimary.svelte';
  import ButtonSecondary from './ButtonSecondary.svelte';
  import ButtonDestructive from './ButtonDestructive.svelte';
  import FormInput from './FormInput.svelte';
  import ErrorDisplay from './ErrorDisplay.svelte';

  export let isOpen = false;
  export let onClose = null;

  let stages = [];
  let selectedStage = null;
  let editingStage = null;
  let validationResults = null;
  let compatibilityReport = null;
  let showAddStageForm = false;
  let showSchemaEditor = false;
  let activeTab = 'stages'; // 'stages', 'schemas', 'validation', 'compatibility'

  // Form data for new/edited stages
  let stageForm = {
    id: '',
    label: '',
    description: '',
    supportsMultipleEvents: false,
    allowedStatuses: ['pending', 'running', 'done', 'error', 'cancelled'],
    dependencies: [],
    timeout: 300000,
    retryable: true,
    critical: false,
    category: 'general',
    icon: 'default',
    expectedPayloadSchema: {}
  };

  let formErrors = {};
  let isLoading = false;

  onMount(async () => {
    await loadStages();
    await generateCompatibilityReport();
  });

  async function loadStages() {
    try {
      isLoading = true;
      await stageRegistry.initialize();
      stages = stageRegistry.getAllStages();
      
      // Run validation on all stages
      const validation = stageValidator.validatePipelineStages(stages);
      validationResults = stageValidator.getValidationSummary(stages);
    } catch (error) {
      console.error('Failed to load stages:', error);
    } finally {
      isLoading = false;
    }
  }

  async function generateCompatibilityReport() {
    try {
      compatibilityReport = stageCompatibility.createCompatibilityReport(stages);
    } catch (error) {
      console.error('Failed to generate compatibility report:', error);
    }
  }

  function selectStage(stage) {
    selectedStage = stage;
    editingStage = null;
    showAddStageForm = false;
  }

  function editStage(stage) {
    editingStage = stage;
    stageForm = {
      id: stage.id,
      label: stage.label,
      description: stage.description,
      supportsMultipleEvents: stage.supportsMultipleEvents,
      allowedStatuses: [...stage.allowedStatuses],
      dependencies: [...stage.dependencies],
      timeout: stage.timeout,
      retryable: stage.retryable,
      critical: stage.critical,
      category: stage.category || 'general',
      icon: stage.icon || 'default',
      expectedPayloadSchema: { ...stage.expectedPayloadSchema }
    };
    formErrors = {};
    showAddStageForm = true;
  }

  function startAddStage() {
    editingStage = null;
    stageForm = {
      id: '',
      label: '',
      description: '',
      supportsMultipleEvents: false,
      allowedStatuses: ['pending', 'running', 'done', 'error', 'cancelled'],
      dependencies: [],
      timeout: 300000,
      retryable: true,
      critical: false,
      category: 'general',
      icon: 'default',
      expectedPayloadSchema: {}
    };
    formErrors = {};
    showAddStageForm = true;
  }

  function cancelStageForm() {
    showAddStageForm = false;
    editingStage = null;
    formErrors = {};
  }

  async function saveStage() {
    try {
      // Validate form
      const validation = stageValidator.validateStageDefinition(stageForm);
      if (!validation.isValid) {
        formErrors = {};
        validation.errors.forEach(error => {
          formErrors[error.field] = error.message;
        });
        return;
      }

      // Register or update stage
      if (editingStage) {
        // Update existing stage
        stageRegistry.unregisterStage(editingStage.id);
      }
      
      stageRegistry.registerStage(stageForm);
      
      // Reload stages
      await loadStages();
      await generateCompatibilityReport();
      
      // Close form
      cancelStageForm();
      
    } catch (error) {
      formErrors.general = error.message;
    }
  }

  async function deleteStage(stage) {
    if (confirm(`Are you sure you want to delete stage "${stage.label}"?`)) {
      try {
        stageRegistry.unregisterStage(stage.id);
        await loadStages();
        await generateCompatibilityReport();
        
        if (selectedStage?.id === stage.id) {
          selectedStage = null;
        }
      } catch (error) {
        alert(`Failed to delete stage: ${error.message}`);
      }
    }
  }

  function addAllowedStatus() {
    stageForm.allowedStatuses = [...stageForm.allowedStatuses, ''];
  }

  function removeAllowedStatus(index) {
    stageForm.allowedStatuses = stageForm.allowedStatuses.filter((_, i) => i !== index);
  }

  function addDependency() {
    stageForm.dependencies = [...stageForm.dependencies, ''];
  }

  function removeDependency(index) {
    stageForm.dependencies = stageForm.dependencies.filter((_, i) => i !== index);
  }

  function getStagesByCategory() {
    const grouped = {};
    stages.forEach(stage => {
      const category = stage.category || 'general';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(stage);
    });
    return grouped;
  }

  function getSchemaSuggestions() {
    if (!stageForm.id) return [];
    return payloadSchemaHandler.getSchemaSuggestions(stageForm.id);
  }

  function applySchemaTemplate(schemaId) {
    const schema = payloadSchemaHandler.getSchema(schemaId);
    if (schema) {
      stageForm.expectedPayloadSchema = { ...schema };
    }
  }

  function handleClose() {
    if (onClose) {
      onClose();
    }
  }

  function formatTimeout(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60000)}m`;
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
    <div class="bg-bg-primary border border-white/10 rounded-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-white/10">
        <h2 class="text-xl font-display font-semibold text-white">Stage Configuration Manager</h2>
        <button
          type="button"
          on:click={handleClose}
          class="text-text-secondary hover:text-white transition-colors"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex border-b border-white/10">
        <button
          type="button"
          class="px-6 py-3 text-sm font-medium transition-colors {activeTab === 'stages' ? 'text-accent-primary border-b-2 border-accent-primary' : 'text-text-secondary hover:text-white'}"
          on:click={() => activeTab = 'stages'}
        >
          Stages ({stages.length})
        </button>
        <button
          type="button"
          class="px-6 py-3 text-sm font-medium transition-colors {activeTab === 'schemas' ? 'text-accent-primary border-b-2 border-accent-primary' : 'text-text-secondary hover:text-white'}"
          on:click={() => activeTab = 'schemas'}
        >
          Payload Schemas
        </button>
        <button
          type="button"
          class="px-6 py-3 text-sm font-medium transition-colors {activeTab === 'validation' ? 'text-accent-primary border-b-2 border-accent-primary' : 'text-text-secondary hover:text-white'}"
          on:click={() => activeTab = 'validation'}
        >
          Validation
          {#if validationResults?.totalErrors > 0}
            <span class="ml-1 px-2 py-1 text-xs bg-accent-error/20 text-accent-error rounded-full">
              {validationResults.totalErrors}
            </span>
          {/if}
        </button>
        <button
          type="button"
          class="px-6 py-3 text-sm font-medium transition-colors {activeTab === 'compatibility' ? 'text-accent-primary border-b-2 border-accent-primary' : 'text-text-secondary hover:text-white'}"
          on:click={() => activeTab = 'compatibility'}
        >
          Compatibility
          {#if compatibilityReport?.needsMigration > 0}
            <span class="ml-1 px-2 py-1 text-xs bg-accent-secondary/20 text-accent-secondary rounded-full">
              {compatibilityReport.needsMigration}
            </span>
          {/if}
        </button>
      </div>

      <!-- Content -->
      <div class="flex h-[calc(90vh-140px)]">
        <!-- Stages Tab -->
        {#if activeTab === 'stages'}
          <div class="flex-1 flex">
            <!-- Stage List -->
            <div class="w-1/3 border-r border-white/10 overflow-y-auto">
              <div class="p-4 border-b border-white/10">
                <ButtonPrimary on:click={startAddStage} class="w-full">
                  Add New Stage
                </ButtonPrimary>
              </div>

              {#if isLoading}
                <div class="p-4 text-center text-text-secondary">Loading stages...</div>
              {:else}
                {#each Object.entries(getStagesByCategory()) as [category, categoryStages]}
                  <div class="p-4">
                    <h3 class="text-sm font-semibold text-accent-primary mb-2 uppercase tracking-wide">
                      {category}
                    </h3>
                    <div class="space-y-2">
                      {#each categoryStages as stage}
                        <div
                          class="p-3 rounded-lg cursor-pointer transition-colors {selectedStage?.id === stage.id ? 'bg-accent-primary/20 border border-accent-primary/30' : 'bg-bg-secondary/50 hover:bg-bg-secondary'}"
                          on:click={() => selectStage(stage)}
                        >
                          <div class="flex items-center justify-between mb-1">
                            <span class="font-medium text-white text-sm">{stage.label}</span>
                            {#if stage.critical}
                              <span class="px-2 py-1 text-xs bg-accent-error/20 text-accent-error rounded-full">
                                Critical
                              </span>
                            {/if}
                          </div>
                          <div class="text-xs text-text-secondary truncate">{stage.description}</div>
                          <div class="flex items-center gap-2 mt-2">
                            <span class="text-xs text-text-secondary">ID: {stage.id}</span>
                            {#if stage.supportsMultipleEvents}
                              <span class="px-2 py-1 text-xs bg-accent-secondary/20 text-accent-secondary rounded-full">
                                Multi-event
                              </span>
                            {/if}
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/each}
              {/if}
            </div>

            <!-- Stage Details -->
            <div class="flex-1 overflow-y-auto">
              {#if showAddStageForm}
                <!-- Add/Edit Stage Form -->
                <div class="p-6">
                  <h3 class="text-lg font-semibold text-white mb-4">
                    {editingStage ? 'Edit Stage' : 'Add New Stage'}
                  </h3>

                  {#if formErrors.general}
                    <ErrorDisplay error={formErrors.general} class="mb-4" />
                  {/if}

                  <div class="space-y-4">
                    <!-- Basic Information -->
                    <div class="grid grid-cols-2 gap-4">
                      <FormInput
                        label="Stage ID"
                        bind:value={stageForm.id}
                        error={formErrors.id}
                        placeholder="e.g., creating_files"
                        disabled={!!editingStage}
                      />
                      <FormInput
                        label="Category"
                        bind:value={stageForm.category}
                        error={formErrors.category}
                        placeholder="e.g., generation"
                      />
                    </div>

                    <FormInput
                      label="Label"
                      bind:value={stageForm.label}
                      error={formErrors.label}
                      placeholder="Human-readable stage name"
                    />

                    <div>
                      <label class="block text-sm font-medium text-white mb-2">Description</label>
                      <textarea
                        bind:value={stageForm.description}
                        class="w-full bg-bg-secondary border border-white/10 rounded-lg px-4 py-3 text-white placeholder-text-secondary focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/30 outline-none transition-all"
                        rows="3"
                        placeholder="Detailed description of what this stage does"
                      ></textarea>
                      {#if formErrors.description}
                        <p class="text-accent-error text-sm mt-1">{formErrors.description}</p>
                      {/if}
                    </div>

                    <!-- Configuration -->
                    <div class="grid grid-cols-2 gap-4">
                      <div>
                        <label class="block text-sm font-medium text-white mb-2">Timeout (ms)</label>
                        <input
                          type="number"
                          bind:value={stageForm.timeout}
                          min="1000"
                          max="3600000"
                          class="w-full bg-bg-secondary border border-white/10 rounded-lg px-4 py-3 text-white focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/30 outline-none transition-all"
                        />
                        <p class="text-xs text-text-secondary mt-1">
                          Current: {formatTimeout(stageForm.timeout)}
                        </p>
                      </div>
                      <FormInput
                        label="Icon"
                        bind:value={stageForm.icon}
                        error={formErrors.icon}
                        placeholder="default"
                      />
                    </div>

                    <!-- Checkboxes -->
                    <div class="grid grid-cols-3 gap-4">
                      <label class="flex items-center gap-2">
                        <input
                          type="checkbox"
                          bind:checked={stageForm.supportsMultipleEvents}
                          class="rounded border-white/10 bg-bg-secondary text-accent-primary focus:ring-accent-primary/30"
                        />
                        <span class="text-sm text-white">Supports Multiple Events</span>
                      </label>
                      <label class="flex items-center gap-2">
                        <input
                          type="checkbox"
                          bind:checked={stageForm.retryable}
                          class="rounded border-white/10 bg-bg-secondary text-accent-primary focus:ring-accent-primary/30"
                        />
                        <span class="text-sm text-white">Retryable</span>
                      </label>
                      <label class="flex items-center gap-2">
                        <input
                          type="checkbox"
                          bind:checked={stageForm.critical}
                          class="rounded border-white/10 bg-bg-secondary text-accent-primary focus:ring-accent-primary/30"
                        />
                        <span class="text-sm text-white">Critical</span>
                      </label>
                    </div>

                    <!-- Allowed Statuses -->
                    <div>
                      <label class="block text-sm font-medium text-white mb-2">Allowed Statuses</label>
                      <div class="space-y-2">
                        {#each stageForm.allowedStatuses as status, index}
                          <div class="flex items-center gap-2">
                            <select
                              bind:value={stageForm.allowedStatuses[index]}
                              class="flex-1 bg-bg-secondary border border-white/10 rounded-lg px-3 py-2 text-white focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/30 outline-none transition-all"
                            >
                              <option value="pending">pending</option>
                              <option value="running">running</option>
                              <option value="done">done</option>
                              <option value="created">created</option>
                              <option value="passed">passed</option>
                              <option value="failed">failed</option>
                              <option value="error">error</option>
                              <option value="cancelled">cancelled</option>
                              <option value="pushed">pushed</option>
                              <option value="deployed">deployed</option>
                            </select>
                            <button
                              type="button"
                              on:click={() => removeAllowedStatus(index)}
                              class="text-accent-error hover:text-accent-error/80 transition-colors"
                            >
                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                              </svg>
                            </button>
                          </div>
                        {/each}
                        <ButtonSecondary on:click={addAllowedStatus} size="small">
                          Add Status
                        </ButtonSecondary>
                      </div>
                    </div>

                    <!-- Dependencies -->
                    <div>
                      <label class="block text-sm font-medium text-white mb-2">Dependencies</label>
                      <div class="space-y-2">
                        {#each stageForm.dependencies as dependency, index}
                          <div class="flex items-center gap-2">
                            <select
                              bind:value={stageForm.dependencies[index]}
                              class="flex-1 bg-bg-secondary border border-white/10 rounded-lg px-3 py-2 text-white focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/30 outline-none transition-all"
                            >
                              <option value="">Select stage...</option>
                              {#each stages as stage}
                                {#if stage.id !== stageForm.id}
                                  <option value={stage.id}>{stage.label} ({stage.id})</option>
                                {/if}
                              {/each}
                            </select>
                            <button
                              type="button"
                              on:click={() => removeDependency(index)}
                              class="text-accent-error hover:text-accent-error/80 transition-colors"
                            >
                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                              </svg>
                            </button>
                          </div>
                        {/each}
                        <ButtonSecondary on:click={addDependency} size="small">
                          Add Dependency
                        </ButtonSecondary>
                      </div>
                    </div>

                    <!-- Payload Schema -->
                    <div>
                      <div class="flex items-center justify-between mb-2">
                        <label class="text-sm font-medium text-white">Expected Payload Schema</label>
                        <div class="flex gap-2">
                          {#each getSchemaSuggestions() as suggestion}
                            <button
                              type="button"
                              on:click={() => applySchemaTemplate(suggestion.id)}
                              class="px-2 py-1 text-xs bg-accent-secondary/20 text-accent-secondary rounded hover:bg-accent-secondary/30 transition-colors"
                              title={suggestion.description}
                            >
                              {suggestion.id}
                            </button>
                          {/each}
                        </div>
                      </div>
                      <textarea
                        bind:value={stageForm.expectedPayloadSchema}
                        class="w-full bg-bg-secondary border border-white/10 rounded-lg px-4 py-3 text-white placeholder-text-secondary focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/30 outline-none transition-all font-mono text-sm"
                        rows="6"
                        placeholder="JSON schema for stage event payloads"
                        on:blur={() => {
                          try {
                            if (typeof stageForm.expectedPayloadSchema === 'string') {
                              stageForm.expectedPayloadSchema = JSON.parse(stageForm.expectedPayloadSchema);
                            }
                          } catch (e) {
                            // Keep as string if invalid JSON
                          }
                        }}
                      ></textarea>
                    </div>
                  </div>

                  <!-- Form Actions -->
                  <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-white/10">
                    <ButtonSecondary on:click={cancelStageForm}>
                      Cancel
                    </ButtonSecondary>
                    <ButtonPrimary on:click={saveStage}>
                      {editingStage ? 'Update Stage' : 'Create Stage'}
                    </ButtonPrimary>
                  </div>
                </div>
              {:else if selectedStage}
                <!-- Stage Details View -->
                <div class="p-6">
                  <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-semibold text-white">{selectedStage.label}</h3>
                    <div class="flex gap-2">
                      <ButtonSecondary on:click={() => editStage(selectedStage)} size="small">
                        Edit
                      </ButtonSecondary>
                      {#if !selectedStage.metadata?.builtIn}
                        <ButtonDestructive on:click={() => deleteStage(selectedStage)} size="small">
                          Delete
                        </ButtonDestructive>
                      {/if}
                    </div>
                  </div>

                  <div class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                      <div>
                        <label class="text-sm font-medium text-text-secondary">Stage ID</label>
                        <p class="text-white font-mono">{selectedStage.id}</p>
                      </div>
                      <div>
                        <label class="text-sm font-medium text-text-secondary">Category</label>
                        <p class="text-white">{selectedStage.category || 'general'}</p>
                      </div>
                    </div>

                    <div>
                      <label class="text-sm font-medium text-text-secondary">Description</label>
                      <p class="text-white">{selectedStage.description}</p>
                    </div>

                    <div class="grid grid-cols-3 gap-4">
                      <div>
                        <label class="text-sm font-medium text-text-secondary">Timeout</label>
                        <p class="text-white">{formatTimeout(selectedStage.timeout)}</p>
                      </div>
                      <div>
                        <label class="text-sm font-medium text-text-secondary">Retryable</label>
                        <StatusBadge status={selectedStage.retryable ? 'enabled' : 'disabled'} />
                      </div>
                      <div>
                        <label class="text-sm font-medium text-text-secondary">Critical</label>
                        <StatusBadge status={selectedStage.critical ? 'critical' : 'normal'} />
                      </div>
                    </div>

                    <div>
                      <label class="text-sm font-medium text-text-secondary">Allowed Statuses</label>
                      <div class="flex flex-wrap gap-2 mt-1">
                        {#each selectedStage.allowedStatuses as status}
                          <StatusBadge {status} />
                        {/each}
                      </div>
                    </div>

                    {#if selectedStage.dependencies?.length > 0}
                      <div>
                        <label class="text-sm font-medium text-text-secondary">Dependencies</label>
                        <div class="space-y-1 mt-1">
                          {#each selectedStage.dependencies as depId}
                            <p class="text-white font-mono text-sm">{depId}</p>
                          {/each}
                        </div>
                      </div>
                    {/if}

                    {#if selectedStage.expectedPayloadSchema && Object.keys(selectedStage.expectedPayloadSchema).length > 0}
                      <div>
                        <label class="text-sm font-medium text-text-secondary">Expected Payload Schema</label>
                        <pre class="bg-bg-secondary rounded-lg p-3 text-sm text-white overflow-x-auto mt-1">{JSON.stringify(selectedStage.expectedPayloadSchema, null, 2)}</pre>
                      </div>
                    {/if}
                  </div>
                </div>
              {:else}
                <div class="flex items-center justify-center h-full text-text-secondary">
                  Select a stage to view details
                </div>
              {/if}
            </div>
          </div>

        <!-- Validation Tab -->
        {:else if activeTab === 'validation'}
          <div class="flex-1 p-6 overflow-y-auto">
            <h3 class="text-lg font-semibold text-white mb-4">Validation Results</h3>
            
            {#if validationResults}
              <div class="grid grid-cols-3 gap-4 mb-6">
                <div class="bg-bg-secondary rounded-lg p-4">
                  <div class="text-2xl font-bold text-white">{validationResults.stageCount}</div>
                  <div class="text-sm text-text-secondary">Total Stages</div>
                </div>
                <div class="bg-bg-secondary rounded-lg p-4">
                  <div class="text-2xl font-bold text-accent-error">{validationResults.totalErrors}</div>
                  <div class="text-sm text-text-secondary">Errors</div>
                </div>
                <div class="bg-bg-secondary rounded-lg p-4">
                  <div class="text-2xl font-bold text-accent-secondary">{validationResults.totalWarnings}</div>
                  <div class="text-sm text-text-secondary">Warnings</div>
                </div>
              </div>

              {#if validationResults.suggestions?.length > 0}
                <div class="bg-accent-primary/10 border border-accent-primary/20 rounded-lg p-4 mb-6">
                  <h4 class="font-semibold text-accent-primary mb-2">Suggestions</h4>
                  <ul class="space-y-1">
                    {#each validationResults.suggestions as suggestion}
                      <li class="text-sm text-white">• {suggestion}</li>
                    {/each}
                  </ul>
                </div>
              {/if}

              {#if Object.keys(validationResults.errorsByStage).length > 0}
                <div class="space-y-4">
                  <h4 class="font-semibold text-white">Errors by Stage</h4>
                  {#each Object.entries(validationResults.errorsByStage) as [stageIndex, stageErrors]}
                    <div class="bg-accent-error/10 border border-accent-error/20 rounded-lg p-4">
                      <h5 class="font-medium text-accent-error mb-2">
                        {stageIndex === 'global' ? 'Global Errors' : `Stage ${parseInt(stageIndex) + 1}`}
                      </h5>
                      <ul class="space-y-1">
                        {#each stageErrors as error}
                          <li class="text-sm text-white">
                            <span class="font-mono text-accent-error">{error.field}:</span>
                            {error.message}
                          </li>
                        {/each}
                      </ul>
                    </div>
                  {/each}
                </div>
              {/if}
            {:else}
              <div class="text-center text-text-secondary">No validation results available</div>
            {/if}
          </div>

        <!-- Compatibility Tab -->
        {:else if activeTab === 'compatibility'}
          <div class="flex-1 p-6 overflow-y-auto">
            <h3 class="text-lg font-semibold text-white mb-4">Compatibility Report</h3>
            
            {#if compatibilityReport}
              <div class="grid grid-cols-2 gap-4 mb-6">
                <div class="bg-bg-secondary rounded-lg p-4">
                  <div class="text-2xl font-bold text-white">{compatibilityReport.totalStages}</div>
                  <div class="text-sm text-text-secondary">Total Stages</div>
                </div>
                <div class="bg-bg-secondary rounded-lg p-4">
                  <div class="text-2xl font-bold text-accent-secondary">{compatibilityReport.needsMigration}</div>
                  <div class="text-sm text-text-secondary">Need Migration</div>
                </div>
              </div>

              {#if Object.keys(compatibilityReport.migrationPaths).length > 0}
                <div class="mb-6">
                  <h4 class="font-semibold text-white mb-2">Migration Paths</h4>
                  <div class="space-y-2">
                    {#each Object.entries(compatibilityReport.migrationPaths) as [path, count]}
                      <div class="flex justify-between items-center bg-bg-secondary rounded-lg p-3">
                        <span class="text-white font-mono">{path}</span>
                        <span class="text-accent-secondary">{count} stages</span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if compatibilityReport.deprecationWarnings?.length > 0}
                <div class="mb-6">
                  <h4 class="font-semibold text-white mb-2">Deprecation Warnings</h4>
                  <div class="space-y-2">
                    {#each compatibilityReport.deprecationWarnings as warning}
                      <div class="bg-accent-secondary/10 border border-accent-secondary/20 rounded-lg p-3">
                        <p class="text-sm text-white">{warning}</p>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if compatibilityReport.recommendations?.length > 0}
                <div>
                  <h4 class="font-semibold text-white mb-2">Recommendations</h4>
                  <ul class="space-y-1">
                    {#each compatibilityReport.recommendations as recommendation}
                      <li class="text-sm text-white">• {recommendation}</li>
                    {/each}
                  </ul>
                </div>
              {/if}
            {:else}
              <div class="text-center text-text-secondary">No compatibility report available</div>
            {/if}
          </div>

        <!-- Schemas Tab -->
        {:else if activeTab === 'schemas'}
          <div class="flex-1 p-6 overflow-y-auto">
            <h3 class="text-lg font-semibold text-white mb-4">Payload Schemas</h3>
            
            <div class="grid grid-cols-1 gap-4">
              {#each Array.from(payloadSchemaHandler.getAllSchemas().entries()) as [schemaId, schema]}
                <div class="bg-bg-secondary rounded-lg p-4">
                  <h4 class="font-medium text-white mb-2">{schemaId}</h4>
                  <pre class="text-sm text-text-secondary overflow-x-auto">{JSON.stringify(schema, null, 2)}</pre>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
