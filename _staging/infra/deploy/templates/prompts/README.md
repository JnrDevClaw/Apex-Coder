# Prompt Templates

This directory contains prompt templates for the Model Router's agent roles. Each template follows a consistent structure with the following sections:

## Template Structure

All templates follow the ROLE, TASK, INPUT, RULES, EXPECTED_OUTPUT format:

- **ROLE**: Defines the AI agent's identity and primary responsibility
- **TASK**: Describes the specific task to be performed
- **INPUT**: Lists the input data and variables (using {{variable}} syntax)
- **RULES**: Specifies constraints, guidelines, and requirements
- **EXPECTED_OUTPUT**: Describes the expected output format and content

## Variable Substitution

Templates use `{{variable}}` syntax for variable substitution. Variables can be:
- Simple values: `{{project_name}}`
- Nested objects: `{{user.name}}`
- Complex data: `{{specs_json}}` (will be JSON-stringified)

## Available Templates

### clarifier.txt
**Role**: Clarifier AI  
**Purpose**: Ask intelligent follow-up questions to refine project specifications  
**Variables**: `specs_json`, `conversation_history`

### normalizer.txt
**Role**: Spec Normalizer  
**Purpose**: Clean and standardize project specifications  
**Variables**: `specs_refined_json`

### docs-creator.txt
**Role**: Technical Writer  
**Purpose**: Generate master project documentation  
**Variables**: `specs_clean_json`, `clarification_history`

### schema-generator.txt
**Role**: Schema Designer  
**Purpose**: Generate database schemas and API shapes  
**Variables**: `docs_md`

### validator.txt
**Role**: Validator  
**Purpose**: Cross-validate docs, schema, and file structure  
**Variables**: `docs_md`, `schema_json`, `file_structure_json`

### code-generator.txt
**Role**: Code Generator  
**Purpose**: Generate production-ready code for specific files  
**Variables**: `file_path`, `file_purpose`, `docs_excerpt`, `schema_excerpt`, `coding_rules`, `framework`

### prompt-builder.txt
**Role**: Prompt Assembly Agent  
**Purpose**: Build prompts for the code generator  
**Variables**: `file_path`, `file_purpose`, `docs_excerpt`, `schema_excerpt`, `coding_rules`

### file-structure-generator.txt
**Role**: File Structure Generator  
**Purpose**: Generate complete file structure from docs and schema  
**Variables**: `docs_md`, `schema_json`, `framework`

## Usage

```javascript
const TemplateManager = require('../services/model-router/template-manager');

const templateManager = new TemplateManager();
await templateManager.initialize();

// Render a template with variables
const prompt = await templateManager.renderTemplate('clarifier', {
  specs_json: JSON.stringify(specs),
  conversation_history: history
});
```

## Hot Reloading

The template manager supports hot reloading. When templates are modified, they are automatically reloaded without requiring a server restart.

## Adding New Templates

1. Create a new `.txt` or `.md` file in this directory
2. Follow the ROLE, TASK, INPUT, RULES, EXPECTED_OUTPUT structure
3. Use `{{variable}}` syntax for dynamic content
4. The template will be automatically loaded (if hot reload is enabled)

## Template Validation

Templates are validated for:
- Matching opening and closing braces
- No empty placeholders
- No nested placeholders
- Required variables are provided when rendering
