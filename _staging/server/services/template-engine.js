/**
 * TemplateEngine Service
 * 
 * Provides template-based code generation as a fallback when LLM is unavailable.
 * Includes templates for common stacks (Express, FastAPI, Gin, etc.)
 * 
 * Requirements: 3.3, 6.3
 */

class TemplateEngine {
  constructor() {
    this.templates = {
      express: this._getExpressTemplates(),
      fastapi: this._getFastAPITemplates(),
      svelte: this._getSvelteTemplates(),
      react: this._getReactTemplates()
    };
  }

  /**
   * Get template by ID
   * 
   * @param {string} templateId - Template identifier (e.g., 'express-app')
   * @returns {Object|null} Template object or null if not found
   */
  getTemplate(templateId) {
    const [stack, type] = templateId.split('-');
    
    if (!this.templates[stack]) {
      return null;
    }
    
    return this.templates[stack][type] || null;
  }

  /**
   * Check if template exists
   * 
   * @param {string} templateId - Template identifier
   * @returns {boolean} True if template exists
   */
  hasTemplate(templateId) {
    return this.getTemplate(templateId) !== null;
  }

  /**
   * Render template with variables
   * 
   * @param {string} template - Template string
   * @param {Object} variables - Variables to substitute
   * @returns {string} Rendered template
   */
  render(template, variables) {
    let result = template;
    
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(placeholder, this._stringify(value));
    }
    
    return result;
  }

  /**
   * Render path with variables
   * 
   * @param {string} path - Path template
   * @param {Object} variables - Variables to substitute
   * @returns {string} Rendered path
   */
  renderPath(path, variables) {
    return this.render(path, variables);
  }

  /**
   * Render content with variables
   * 
   * @param {string} content - Content template
   * @param {Object} variables - Variables to substitute
   * @returns {string} Rendered content
   */
  renderContent(content, variables) {
    return this.render(content, variables);
  }

  /**
   * Validate template structure
   * 
   * @param {Object} template - Template object
   * @returns {{valid: boolean, errors: Array<string>}} Validation result
   */
  validateTemplate(template) {
    const errors = [];
    
    if (!template) {
      return { valid: false, errors: ['Template is null or undefined'] };
    }
    
    if (!template.files || !Array.isArray(template.files)) {
      errors.push('Template must have a files array');
    }
    
    if (template.files) {
      template.files.forEach((file, index) => {
        if (!file.path) {
          errors.push(`File ${index}: Missing path`);
        }
        if (!file.content) {
          errors.push(`File ${index}: Missing content`);
        }
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get available templates for a stack
   * 
   * @param {string} stack - Stack name (express, fastapi, etc.)
   * @returns {Array<string>} List of template IDs
   */
  getAvailableTemplates(stack) {
    if (!this.templates[stack]) {
      return [];
    }
    
    return Object.keys(this.templates[stack]).map(type => `${stack}-${type}`);
  }

  // Template definitions

  _getExpressTemplates() {
    return {
      app: {
        files: [
          {
            path: 'server/app.js',
            content: `const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();

// Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Routes
{{routes}}

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || {{port}};
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});

module.exports = app;`
          },
          {
            path: 'server/package.json',
            content: `{
  "name": "{{projectName}}",
  "version": "1.0.0",
  "description": "{{description}}",
  "main": "app.js",
  "scripts": {
    "start": "node app.js",
    "dev": "nodemon app.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "helmet": "^7.0.0"{{additionalDeps}}
  },
  "devDependencies": {
    "nodemon": "^3.0.0",
    "jest": "^29.0.0"
  }
}`
          },
          {
            path: 'server/.env.example',
            content: `PORT={{port}}
NODE_ENV=development
{{envVars}}`
          },
          {
            path: 'server/README.md',
            content: `# {{projectName}}

{{description}}

## Setup

\`\`\`bash
npm install
cp .env.example .env
npm start
\`\`\`

## API Endpoints

- GET /health - Health check

{{apiDocs}}
`
          }
        ]
      },
      route: {
        files: [
          {
            path: 'server/routes/{{routeName}}.js',
            content: `const express = require('express');
const router = express.Router();

// GET /{{routePath}}
router.get('/', async (req, res) => {
  try {
    // TODO: Implement logic
    res.json({ message: 'Success' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /{{routePath}}
router.post('/', async (req, res) => {
  try {
    // TODO: Implement logic
    res.status(201).json({ message: 'Created' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;`
          }
        ]
      },
      model: {
        files: [
          {
            path: 'server/models/{{modelName}}.js',
            content: `class {{ModelName}} {
  constructor(data) {
    {{fields}}
  }

  validate() {
    // TODO: Add validation logic
    return true;
  }

  toJSON() {
    return {
      {{jsonFields}}
    };
  }
}

module.exports = {{ModelName}};`
          }
        ]
      }
    };
  }

  _getFastAPITemplates() {
    return {
      app: {
        files: [
          {
            path: 'main.py',
            content: `from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="{{projectName}}", description="{{description}}")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": "{{timestamp}}"}

{{routes}}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port={{port}})`
          },
          {
            path: 'requirements.txt',
            content: `fastapi==0.104.0
uvicorn[standard]==0.24.0
pydantic==2.4.0
{{additionalDeps}}`
          },
          {
            path: '.env.example',
            content: `PORT={{port}}
ENVIRONMENT=development
{{envVars}}`
          }
        ]
      },
      model: {
        files: [
          {
            path: 'models/{{modelName}}.py',
            content: `from pydantic import BaseModel, Field
from typing import Optional

class {{ModelName}}(BaseModel):
    {{fields}}

    class Config:
        json_schema_extra = {
            "example": {
                {{example}}
            }
        }`
          }
        ]
      }
    };
  }

  _getSvelteTemplates() {
    return {
      component: {
        files: [
          {
            path: 'src/lib/components/{{ComponentName}}.svelte',
            content: `<script>
  {{props}}

  {{logic}}
</script>

<div class="{{componentName}}">
  {{content}}
</div>

<style>
  .{{componentName}} {
    {{styles}}
  }
</style>`
          }
        ]
      },
      page: {
        files: [
          {
            path: 'src/routes/{{pageName}}/+page.svelte',
            content: `<script>
  import { onMount } from 'svelte';

  {{state}}

  onMount(() => {
    {{onMountLogic}}
  });
</script>

<svelte:head>
  <title>{{pageTitle}}</title>
</svelte:head>

<main>
  <h1>{{pageTitle}}</h1>
  {{content}}
</main>

<style>
  main {
    padding: 2rem;
  }
</style>`
          }
        ]
      }
    };
  }

  _getReactTemplates() {
    return {
      component: {
        files: [
          {
            path: 'src/components/{{ComponentName}}.jsx',
            content: `import React from 'react';
{{imports}}

function {{ComponentName}}({{props}}) {
  {{hooks}}

  return (
    <div className="{{componentName}}">
      {{content}}
    </div>
  );
}

export default {{ComponentName}};`
          }
        ]
      },
      page: {
        files: [
          {
            path: 'src/pages/{{PageName}}.jsx',
            content: `import React, { useEffect, useState } from 'react';
{{imports}}

function {{PageName}}() {
  {{state}}

  useEffect(() => {
    {{effectLogic}}
  }, []);

  return (
    <div className="page">
      <h1>{{pageTitle}}</h1>
      {{content}}
    </div>
  );
}

export default {{PageName}};`
          }
        ]
      }
    };
  }

  // Helper methods

  _stringify(value) {
    if (value === null || value === undefined) {
      return '';
    }
    
    if (typeof value === 'string') {
      return value;
    }
    
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    
    return String(value);
  }
}

module.exports = TemplateEngine;
