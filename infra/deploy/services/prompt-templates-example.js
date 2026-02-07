/**
 * Prompt Template Manager - Usage Examples
 * 
 * This file demonstrates how to use the prompt template manager
 * in the orchestration pipeline.
 */

const promptTemplateManager = require('./prompt-templates');

// Example 1: Get clarifier template for Stage 1
function getClarifierPrompt(specs, conversationHistory) {
  return promptTemplateManager.getTemplate('clarifier', {
    specs_json: JSON.stringify(specs, null, 2),
    conversation_history: conversationHistory || 'No previous conversation'
  });
}

// Example 2: Get normalizer template for Stage 1.5
function getNormalizerPrompt(specsRefined) {
  return promptTemplateManager.getTemplate('normalizer', {
    specs_refined_json: specsRefined
  });
}

// Example 3: Get docs creator template for Stage 2
function getDocsCreatorPrompt(specsClean, clarificationHistory) {
  return promptTemplateManager.getTemplate('docs-creator', {
    specs_clean_json: specsClean,
    clarification_history: clarificationHistory || ''
  });
}

// Example 4: Get schema generator template for Stage 3
function getSchemaGeneratorPrompt(docsMd) {
  return promptTemplateManager.getTemplate('schema-generator', {
    docs_md: docsMd
  });
}

// Example 5: Get structural validator template for Stage 3.5
function getStructuralValidatorPrompt(docsMd, schemaJson) {
  return promptTemplateManager.getTemplate('structural-validator', {
    docs_md: docsMd,
    schema_json: JSON.stringify(schemaJson, null, 2)
  });
}

// Example 6: Get file structure generator template for Stage 4
function getFileStructureGeneratorPrompt(docsMd, schemaJson) {
  return promptTemplateManager.getTemplate('file-structure-generator', {
    docs_md: docsMd,
    schema_json: JSON.stringify(schemaJson, null, 2)
  });
}

// Example 7: Get validator template for Stage 5
function getValidatorPrompt(docsMd, schemaJson, fileStructureJson) {
  return promptTemplateManager.getTemplate('validator', {
    docs_md: docsMd,
    schema_json: JSON.stringify(schemaJson, null, 2),
    file_structure_json: JSON.stringify(fileStructureJson, null, 2)
  });
}

// Example 8: Get prompt builder template for Stage 7
function getPromptBuilderPrompt(filePath, filePurpose, docsExcerpt, schemaExcerpt) {
  return promptTemplateManager.getTemplate('prompt-builder', {
    file_path: filePath,
    file_purpose: filePurpose,
    docs_excerpt: docsExcerpt,
    schema_excerpt: schemaExcerpt
  });
}

// Example 9: Get Gemini coder template for Stage 7
function getGeminiCoderPrompt(filePath, filePurpose, docsExcerpt, schemaExcerpt, codingRules) {
  return promptTemplateManager.getTemplate('gemini-coder', {
    file_path: filePath,
    file_purpose: filePurpose,
    docs_excerpt: docsExcerpt,
    schema_excerpt: schemaExcerpt,
    coding_rules: codingRules || 'Follow best practices and coding standards'
  });
}

// Example 10: List all available templates
function listAllTemplates() {
  const templates = promptTemplateManager.getAvailableTemplates();
  console.log('Available templates:', templates);
  
  templates.forEach(templateName => {
    const metadata = promptTemplateManager.getTemplateMetadata(templateName);
    console.log(`\n${templateName}:`);
    console.log(`  Stage: ${metadata.stage}`);
    console.log(`  Model: ${metadata.model} (${metadata.modelName})`);
    console.log(`  Description: ${metadata.description}`);
  });
}

// Example 11: Check if template exists before using
function safeGetTemplate(templateName, variables) {
  if (promptTemplateManager.hasTemplate(templateName)) {
    return promptTemplateManager.getTemplate(templateName, variables);
  } else {
    throw new Error(`Template ${templateName} not found`);
  }
}

// Example usage in pipeline orchestrator
async function examplePipelineUsage() {
  // Stage 1: Clarifier
  const specs = { projectName: 'MyApp', features: ['auth', 'api'] };
  const clarifierPrompt = getClarifierPrompt(specs, '');
  console.log('Clarifier Prompt:', clarifierPrompt.substring(0, 100) + '...');
  
  // Stage 2: Docs Creator
  const specsClean = { projectName: 'MyApp', features: ['auth', 'api'], stack: 'Svelte + Fastify' };
  const docsPrompt = getDocsCreatorPrompt(specsClean, 'User confirmed auth requirements');
  console.log('\nDocs Creator Prompt:', docsPrompt.substring(0, 100) + '...');
  
  // Stage 7: Gemini Coder
  const geminiPrompt = getGeminiCoderPrompt(
    'src/routes/api/auth.js',
    'Authentication API endpoints',
    'Auth endpoints should support login, logout, and token refresh',
    '{ "User": { "id": "string", "email": "string" } }',
    'Use Fastify and JWT'
  );
  console.log('\nGemini Coder Prompt:', geminiPrompt.substring(0, 100) + '...');
}

// Export functions for use in other modules
module.exports = {
  getClarifierPrompt,
  getNormalizerPrompt,
  getDocsCreatorPrompt,
  getSchemaGeneratorPrompt,
  getStructuralValidatorPrompt,
  getFileStructureGeneratorPrompt,
  getValidatorPrompt,
  getPromptBuilderPrompt,
  getGeminiCoderPrompt,
  listAllTemplates,
  safeGetTemplate,
  examplePipelineUsage
};

// Run example if executed directly
if (require.main === module) {
  console.log('=== Prompt Template Manager Examples ===\n');
  listAllTemplates();
  console.log('\n=== Pipeline Usage Example ===\n');
  examplePipelineUsage();
}
