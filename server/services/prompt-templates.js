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
You are the Clarifier AI. Your job: read the specs.json containing project specification and ask the user intelligent follow-up questions to fill missing details. Ask exactly one question at a time. Avoid assumptions. Stop only when the spec is fully deterministic for engineers.

CONSTRAINTS:
- Do not produce final specs. Only ask clarifying questions.
- If you detect contradictions, ask clarifying questions referencing specific fields.

INPUT:
{{specs_json}}

CONVERSATION HISTORY:
{{conversation_history}}`);

    // Stage 1: Refinement Consolidation (Refinement Stage Final Step)
    templates.set('refinement-consolidation', `ROLE:
You are a Specification Refiner. Your task is to consolidate the conversation history and initial specs into a single, clean, structured JSON specification.

TASK:
Take the initial 'specs.json' and the 'conversation_history' (Q&A) and produce a 'refined_specs.json'.
- All answers from the conversation must be integrated into the JSON structure as proper fields (e.g., "Blue theme" -> "theme": "blue").
- Remove Q&A format.
- Ensure the output is a valid JSON object representing the full application specification.

INPUT SPECS:
{{specs_json}}

CONVERSATION HISTORY:
{{conversation_history}}

EXPECTED OUTPUT:
A single valid JSON object containing the refined specifications.`);

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

    // Stage 3: Schema Generator (DeepSeek R1)
    templates.set('schema-generator', `ROLE:
You are an expert System Architect and Database Designer.

TASK:
Analyze the provided 'docs.md' and generate a comprehensive specification for the data layer. You must define:
1. **Database Schema**: Tables/Collections, columns/fields, types, primary/foreign keys, and indexes.
2. **Resource Schemas**: API resource representations.
3. **Response Schemas**: Standardized JSON responses for API endpoints.
4. **User Object Schemas**: Shapes for user-facing data entities.

INPUT:
{{docs_md}}

REQUIREMENTS:
- Use standard JSON Schema format where applicable.
- Relational integrity should be enforced (Foreign Keys).
- Define unique constraints and default values.
- **Output must be valid JSON** containing these sections.

EXPECTED OUTPUT:
A single JSON object with keys: "database", "resources", "responses".`);

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
    // GPT-5 Mini creates a detailed, context-rich prompt for Gemini
    templates.set('prompt-builder', `ROLE:
You are a Senior Technical Lead preparing detailed coding instructions for a junior developer (Gemini). Your job is to provide ALL the context Gemini needs to write production-ready code for a specific file, without Gemini needing any other information.

TASK:
Create a comprehensive, detailed prompt that tells Gemini exactly how to implement the file below. Be thorough - Gemini will ONLY see your prompt, not the full documentation or schema. Include:

1. **Project Context**: What is this project? What technologies does it use? How does this file fit into the bigger picture?

2. **File Purpose**: What is the exact responsibility of this file? What problem does it solve? 

3. **Dependencies & Imports**: What other files/modules does this file depend on? What should be imported and from where?

4. **Functions/Components to Implement**: List EVERY function, method, class, or component that should be in this file. For each:
   - Name and signature
   - What it does (step by step logic)
   - Input parameters and their types
   - Return values and types
   - Error cases to handle

5. **Database/Schema Context**: If this file interacts with data, explain the exact schema, table structure, relationships, and field types.

6. **API Contracts**: If this is an API file, specify exact endpoints, HTTP methods, request/response formats, status codes.

7. **Integration Points**: How does this file interact with other parts of the system? What functions/data does it provide to other files?

8. **Coding Standards**: Framework conventions, naming patterns, error handling approach, logging requirements.

9. **Edge Cases & Validation**: What input validation is needed? What edge cases should be handled?

INPUT:
- File to implement: {{file_path}}
- File purpose: {{file_purpose}}
- Project documentation: 
{{docs_excerpt}}
- Database/API Schema:
{{schema_excerpt}}

OUTPUT:
Write a detailed, narrative prompt (NOT JSON) that gives Gemini everything it needs. Write as if you're explaining to a developer who knows the tech stack but has never seen this project before. Be specific with names, types, and logic flows.`);

    // Stage 8: Gemini-3 (File-level coding)
    // Gemini receives the rich prompt and generates complete code
    templates.set('gemini-coder', `ROLE:
You are Gemini-3, an expert full-stack software engineer. You write clean, production-ready code that follows best practices.

TASK:
Generate the COMPLETE, WORKING code for the file described below. Your output will be written directly to this file, so it must be complete and ready to run.

FILE TO CREATE: {{file_path}}

INSTRUCTIONS FROM LEAD DEVELOPER:
{{docs_excerpt}}

ADDITIONAL CONTEXT:
- Purpose: {{file_purpose}}
- Schema/Types: {{schema_excerpt}}

REQUIREMENTS:
1. Generate the COMPLETE file content - every line of code needed
2. Include ALL imports at the top of the file
3. Implement EVERY function/component described in the instructions
4. Add proper error handling and input validation
5. Include JSDoc comments for main functions
6. Follow the coding conventions specified (naming, structure)
7. Make the code production-ready, not placeholder

CODING RULES:
{{coding_rules}}

CRITICAL:
- Do NOT output just comments or placeholders
- Do NOT output partial implementations
- Do NOT output markdown code blocks, just raw code
- The file must be immediately runnable/importable

OUTPUT:
The complete source code for {{file_path}} with no additional text or explanation.`);

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
      'refinement-consolidation': {
        stage: 1,
        model: 'openrouter',
        modelName: 'mistralai/mistral-7b-instruct',
        description: 'Consolidates Q&A into refined specs'
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
