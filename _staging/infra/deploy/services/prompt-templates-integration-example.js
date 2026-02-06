/**
 * Prompt Template Manager - Integration Example
 * 
 * This example shows how the prompt template manager integrates
 * with the pipeline orchestrator and stage handlers.
 */

const promptTemplateManager = require('./prompt-templates');

/**
 * Example: Stage 1 Handler - Clarifier
 * Uses HuggingFace chat model to refine specs
 */
async function handleClarifierStage(context) {
  const { specs, conversationHistory } = context;
  
  // Get the clarifier prompt template
  const prompt = promptTemplateManager.getTemplate('clarifier', {
    specs_json: JSON.stringify(specs, null, 2),
    conversation_history: conversationHistory || 'No previous conversation'
  });
  
  // Get template metadata to know which model to use
  const metadata = promptTemplateManager.getTemplateMetadata('clarifier');
  console.log(`Using ${metadata.model} (${metadata.modelName}) for stage ${metadata.stage}`);
  
  // In real implementation, this would call the HuggingFace provider
  // const response = await huggingfaceProvider.chat(prompt);
  
  return {
    prompt,
    metadata,
    // response would be here
  };
}

/**
 * Example: Stage 2 Handler - Docs Creator
 * Uses Llama 4 Scout to generate documentation
 */
async function handleDocsCreatorStage(context) {
  const { specsClean, clarificationHistory } = context;
  
  const prompt = promptTemplateManager.getTemplate('docs-creator', {
    specs_clean_json: JSON.stringify(specsClean, null, 2),
    clarification_history: clarificationHistory || ''
  });
  
  const metadata = promptTemplateManager.getTemplateMetadata('docs-creator');
  console.log(`Using ${metadata.model} (${metadata.modelName}) for stage ${metadata.stage}`);
  
  // In real implementation:
  // const docs = await llamaProvider.generate(prompt);
  
  return { prompt, metadata };
}

/**
 * Example: Stage 3 Handler - Schema Generator
 * Uses DeepSeek-V3 to generate database schema
 */
async function handleSchemaGeneratorStage(context) {
  const { docsMd } = context;
  
  const prompt = promptTemplateManager.getTemplate('schema-generator', {
    docs_md: docsMd
  });
  
  const metadata = promptTemplateManager.getTemplateMetadata('schema-generator');
  console.log(`Using ${metadata.model} (${metadata.modelName}) for stage ${metadata.stage}`);
  
  // In real implementation:
  // const schema = await deepseekProvider.generate(prompt);
  
  return { prompt, metadata };
}

/**
 * Example: Stage 7 Handler - Code Generation
 * Uses GPT-5 Mini to build prompts and Gemini-3 to generate code
 */
async function handleCodeGenerationStage(context) {
  const { validatedStructure, docsMd, schemaJson } = context;
  const generatedFiles = [];
  
  // Iterate through all files in validated structure
  for (const [filePath, filePurpose] of Object.entries(validatedStructure.files)) {
    // Step 1: Build prompt using GPT-5 Mini
    const promptBuilderTemplate = promptTemplateManager.getTemplate('prompt-builder', {
      file_path: filePath,
      file_purpose: filePurpose,
      docs_excerpt: extractRelevantDocs(docsMd, filePath),
      schema_excerpt: extractRelevantSchema(schemaJson, filePath)
    });
    
    // In real implementation:
    // const geminiPrompt = await gpt5MiniProvider.generate(promptBuilderTemplate);
    
    // Step 2: Generate code using Gemini-3
    const geminiCoderTemplate = promptTemplateManager.getTemplate('gemini-coder', {
      file_path: filePath,
      file_purpose: filePurpose,
      docs_excerpt: extractRelevantDocs(docsMd, filePath),
      schema_excerpt: extractRelevantSchema(schemaJson, filePath),
      coding_rules: getCodingRules(filePath)
    });
    
    // In real implementation:
    // const code = await geminiProvider.generate(geminiCoderTemplate);
    
    generatedFiles.push({
      filePath,
      promptBuilderTemplate,
      geminiCoderTemplate
      // code would be here
    });
  }
  
  return { generatedFiles };
}

/**
 * Example: Pipeline Orchestrator Integration
 * Shows how the orchestrator would use templates for all stages
 */
async function executePipeline(projectId, specs) {
  console.log(`Starting pipeline for project ${projectId}`);
  
  // Stage 0: Questionnaire (no AI)
  console.log('Stage 0: Questionnaire completed');
  
  // Stage 1: Clarifier
  const stage1Result = await handleClarifierStage({ specs, conversationHistory: '' });
  console.log('Stage 1: Clarifier completed');
  
  // Stage 1.5: Normalizer
  const normalizerPrompt = promptTemplateManager.getTemplate('normalizer', {
    specs_refined_json: stage1Result.specsRefined || specs
  });
  console.log('Stage 1.5: Normalizer completed');
  
  // Stage 2: Docs Creator
  const stage2Result = await handleDocsCreatorStage({
    specsClean: specs,
    clarificationHistory: ''
  });
  console.log('Stage 2: Docs Creator completed');
  
  // Stage 3: Schema Generator
  const stage3Result = await handleSchemaGeneratorStage({
    docsMd: 'Sample docs'
  });
  console.log('Stage 3: Schema Generator completed');
  
  // Stage 3.5: Structural Validator
  const structuralValidatorPrompt = promptTemplateManager.getTemplate('structural-validator', {
    docs_md: 'Sample docs',
    schema_json: JSON.stringify({})
  });
  console.log('Stage 3.5: Structural Validator completed');
  
  // Stage 4: File Structure Generator
  const fileStructurePrompt = promptTemplateManager.getTemplate('file-structure-generator', {
    docs_md: 'Sample docs',
    schema_json: JSON.stringify({})
  });
  console.log('Stage 4: File Structure Generator completed');
  
  // Stage 5: Validator
  const validatorPrompt = promptTemplateManager.getTemplate('validator', {
    docs_md: 'Sample docs',
    schema_json: JSON.stringify({}),
    file_structure_json: JSON.stringify({})
  });
  console.log('Stage 5: Validator completed');
  
  // Stage 6: Empty file creation (no AI)
  console.log('Stage 6: Empty files created');
  
  // Stage 7: Code Generation
  const stage7Result = await handleCodeGenerationStage({
    validatedStructure: { files: {} },
    docsMd: 'Sample docs',
    schemaJson: {}
  });
  console.log('Stage 7: Code Generation completed');
  
  // Stage 8: GitHub repo creation (no AI)
  console.log('Stage 8: GitHub repo created');
  
  return {
    success: true,
    stages: [
      stage1Result,
      stage2Result,
      stage3Result,
      stage7Result
    ]
  };
}

/**
 * Helper: Extract relevant docs for a file
 */
function extractRelevantDocs(docsMd, filePath) {
  // In real implementation, this would intelligently extract
  // relevant sections of docs based on file path
  return docsMd;
}

/**
 * Helper: Extract relevant schema for a file
 */
function extractRelevantSchema(schemaJson, filePath) {
  // In real implementation, this would extract relevant
  // schema entities based on file path
  return JSON.stringify(schemaJson, null, 2);
}

/**
 * Helper: Get coding rules based on file type
 */
function getCodingRules(filePath) {
  if (filePath.endsWith('.svelte')) {
    return 'Use Svelte 5 syntax with runes ($state, $derived, $effect)';
  } else if (filePath.endsWith('.js')) {
    return 'Use modern JavaScript (ES6+) with async/await';
  } else if (filePath.includes('routes')) {
    return 'Follow Fastify route handler patterns';
  }
  return 'Follow best practices and coding standards';
}

/**
 * Example: Validate all templates are available
 */
function validateTemplatesAvailable() {
  const requiredTemplates = [
    'clarifier',
    'normalizer',
    'docs-creator',
    'schema-generator',
    'structural-validator',
    'file-structure-generator',
    'validator',
    'prompt-builder',
    'gemini-coder'
  ];
  
  const missing = [];
  for (const templateName of requiredTemplates) {
    if (!promptTemplateManager.hasTemplate(templateName)) {
      missing.push(templateName);
    }
  }
  
  if (missing.length > 0) {
    throw new Error(`Missing required templates: ${missing.join(', ')}`);
  }
  
  console.log('✓ All required templates are available');
  return true;
}

// Export for use in pipeline orchestrator
module.exports = {
  handleClarifierStage,
  handleDocsCreatorStage,
  handleSchemaGeneratorStage,
  handleCodeGenerationStage,
  executePipeline,
  validateTemplatesAvailable
};

// Run example if executed directly
if (require.main === module) {
  console.log('=== Prompt Template Integration Example ===\n');
  
  // Validate templates
  validateTemplatesAvailable();
  
  // Show example pipeline execution
  console.log('\n=== Example Pipeline Execution ===\n');
  executePipeline('test-project-123', {
    projectName: 'MyApp',
    features: ['auth', 'api']
  }).then(() => {
    console.log('\n✓ Pipeline execution example completed');
  }).catch(err => {
    console.error('Pipeline execution failed:', err);
  });
}
