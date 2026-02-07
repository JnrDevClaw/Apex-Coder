/**
 * Prompt Template Manager
 * 
 * Manages canonical prompt templates for the 8-stage AI orchestration pipeline.
 * Each template follows the ROLE, TASK, INPUT, RULES, EXPECTED OUTPUT envelope.
 * 
 * Templates are loaded from the canonical guide and support variable substitution.
 */

class PromptTemplateManager {
  constructor() {
    this.templates = this.loadTemplates();
  }

  /**
   * Get prompt template for a stage
   * @param {string} templateName - Template name (e.g., 'clarifier', 'normalizer')
   * @param {Object} variables - Template variables for substitution
   * @returns {string} Rendered prompt with variables substituted
   */
  getTemplate(templateName, variables = {}) {
    const template = this.templates.get(templateName);
    
    if (!template) {
      throw new Error(`Template '${templateName}' not found`);
    }

    return this.substituteVariables(template, variables);
  }

  /**
   * Substitute variables in template
   * @param {string} template - Template string with {{variable}} placeholders
   * @param {Object} variables - Variables to substitute
   * @returns {string} Template with variables substituted
   */
  substituteVariables(template, variables) {
    let result = template;

    // Replace all {{variable}} placeholders
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      const substitution = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
      result = result.replace(placeholder, substitution);
    }

    return result;
  }

  /**
   * Load all prompt templates from canonical guide
   * @returns {Map} Template name to template string
   */
  loadTemplates() {
    const templates = new Map();

    // Stage 1: Clarifier (HuggingFace chat model)
    templates.set('clarifier', `ROLE:
You are the Clarifier AI. Your job: read a partial project specification and ask the user intelligent follow-up questions to fill missing details. Ask exactly one question at a time. Avoid assumptions. Stop only when the spec is fully deterministic for engineers.

CONSTRAINTS:
- Do not produce final specs. Only ask clarifying questions.
- If you detect contradictions, ask clarifying questions referencing specific fields.

INPUT:
{{specs_json}}

CONVERSATION HISTORY:
{{conversation_history}}`);

    // Stage 1.5: Spec Normalizer (GPT-5 Mini)
    templates.set('normalizer', `ROLE:
You are a Spec Normalizer.

TASK:
Consume the clarifier output and produce a clean, deduplicated, machine-safe JSON object \`specs_clean.json\` that will be passed to doc generation models.

RULES:
- Remove empty fields and duplicates.
- Normalize naming (snake_case or camelCase — consistent project-wide).
- Remove references to non-documented features.
- Ensure types are explicit.

INPUT:
{{specs_refined_json}}

EXPECTED OUTPUT:
A single JSON blob, ready for the docs generator.`);

    // Stage 2: Docs Creator (Llama 4 Scout 17B Instruct)
    templates.set('docs-creator', `ROLE:
You are a senior system designer and technical writer.

TASK:
Generate the master documentation \`docs.md\` for the project using the cleaned specs.

DOCUMENT STRUCTURE (required):
- Overview
- User Stories
- Features
- Endpoints (HTTP + Worker triggers)
- Frontend pages and components
- Authentication & Authorization
- Database Entities (placeholder; schema will be inserted later)
- Flows & Edge Cases
- Non-functional requirements

RULES:
- Produce human-readable, engineer-ready docs with examples.
- Annotate any ambiguous area clearly.

INPUT:
{{specs_clean_json}}
{{clarification_history}}

EXPECTED OUTPUT:
A markdown file \`docs.md\`.`);

    // Stage 3: Schema Generator (DeepSeek-V3)
    templates.set('schema-generator', `ROLE:
You are an expert schema designer.

TASK:
Convert the docs into a precise \`schema.json\` for DB models, API shapes, validators, and types. Also append a 'Database Schema' section to \`docs.md\` (machine-generated, human-readable).

REQUIREMENTS:
- Normalized relational structures (or collections for document DBs), types, indices.
- Validation rules for each field.

INPUT:
{{docs_md}}

EXPECTED OUTPUT:
- \`schema.json\` (structured)
- \`docs.md\` updated with Schema section.`);

    // Stage 3.5: Structural Pre-Validator (GPT-5 Mini)
    templates.set('structural-validator', `ROLE:
You are a lightweight structural checker.

TASK:
Perform a quick scan: detect empty arrays, duplicated keys, missing route names, malformed paths.

INPUT:
{{docs_md}}
{{schema_json}}

OUTPUT:
A short JSON list of "issues" or \`[]\` if none.`);

    // Stage 4: File Structure Generator (GPT-4o)
    templates.set('file-structure-generator', `ROLE:
You are a file structure generator.

TASK:
From \`docs.md\` and \`schema.json\`, generate a deterministic \`file_structure.json\` describing directories, file paths, and a short purpose description for each file.

RULES:
- Output JSON only.
- Do not invent features.
- Follow framework best-practices (Svelte + Fastify + Node + Workers).

INPUT:
{{docs_md}}
{{schema_json}}`);

    // Stage 5: Validator (Claude 3.5 Haiku)
    templates.set('validator', `ROLE:
You are a validator.

TASK:
Cross-validate \`docs.md\`, \`schema.json\`, and \`file_structure.json\`. Produce \`validated_structure.json\` and list any required corrections.

RULES:
- Ensure every endpoint/feature described in docs has a file/controller in the structure.
- Ensure schema entities have corresponding persistence files.

INPUT:
{{docs_md}}
{{schema_json}}
{{file_structure_json}}`);

    // Stage 7: Prompt Builder (GPT-5 Mini)
    templates.set('prompt-builder', `ROLE:
You are a prompt assembly agent.

TASK:
Given a file path, file purpose, docs excerpt, and schema excerpt produce a final Gemini prompt file with the exact Role, Task, Input and ExpectedOutput envelope.

INPUT:
- File path: {{file_path}}
- File purpose: {{file_purpose}}
- Docs excerpt: {{docs_excerpt}}
- Schema excerpt: {{schema_excerpt}}

OUTPUT:
A text prompt (single string) ready to feed into Gemini.`);

    // Stage 7: Gemini-3 (File-level coding)
    templates.set('gemini-coder', `ROLE:
You are Gemini-3, a senior full-stack engineer.

TASK:
Generate the complete code for the exact file path provided. Overwrite the file content. Return code only.

INPUT:
- file path: {{file_path}}
- file purpose: {{file_purpose}}
- relevant docs excerpt: {{docs_excerpt}}
- relevant schema excerpt: {{schema_excerpt}}
- coding rules: {{coding_rules}}

RULES:
- Only return the full file content.
- Do not create or modify other files.
- Follow coding conventions in docs.

EXPECTED OUTPUT:
Full content of {{file_path}}`);

    return templates;
  }

  /**
   * Get all available template names
   * @returns {string[]} Array of template names
   */
  getAvailableTemplates() {
    return Array.from(this.templates.keys());
  }

  /**
   * Check if a template exists
   * @param {string} templateName - Template name to check
   * @returns {boolean} True if template exists
   */
  hasTemplate(templateName) {
    return this.templates.has(templateName);
  }

  /**
   * Get template metadata
   * @param {string} templateName - Template name
   * @returns {Object} Template metadata (stage, model, description)
   */
  getTemplateMetadata(templateName) {
    const metadata = {
      'clarifier': {
        stage: 1,
        model: 'huggingface',
        modelName: 'OpenHermes-2.5-Mistral-7B',
        description: 'HF Clarifier refines specs through conversation'
      },
      'normalizer': {
        stage: 1.5,
        model: 'zukijourney',
        modelName: 'gpt-5-mini',
        description: 'GPT-5 Mini normalizes specs'
      },
      'docs-creator': {
        stage: 2,
        model: 'github-models',
        modelName: 'meta-llama-4-scout-17b-16e-instruct',
        description: 'Llama 4 Scout generates docs'
      },
      'schema-generator': {
        stage: 3,
        model: 'deepseek',
        modelName: 'deepseek-v3',
        description: 'DeepSeek-V3 generates schema'
      },
      'structural-validator': {
        stage: 3.5,
        model: 'zukijourney',
        modelName: 'gpt-5-mini',
        description: 'GPT-5 Mini validates structure'
      },
      'file-structure-generator': {
        stage: 4,
        model: 'zukijourney',
        modelName: 'gpt-4o',
        description: 'GPT-4o generates file structure'
      },
      'validator': {
        stage: 5,
        model: 'zukijourney',
        modelName: 'claude-3.5-haiku',
        description: 'Claude 3.5 Haiku validates'
      },
      'prompt-builder': {
        stage: 7,
        model: 'zukijourney',
        modelName: 'gpt-5-mini',
        description: 'GPT-5 Mini builds prompts for Gemini'
      },
      'gemini-coder': {
        stage: 7,
        model: 'gemini',
        modelName: 'gemini-3-pro',
        description: 'Gemini-3 generates code'
      }
    };

    return metadata[templateName] || null;
  }
}

// Export singleton instance
const promptTemplateManager = new PromptTemplateManager();

module.exports = promptTemplateManager;
module.exports.PromptTemplateManager = PromptTemplateManager;
