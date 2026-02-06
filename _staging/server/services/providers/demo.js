/**
 * Demo Mode Provider - Returns realistic mock responses when no API keys are configured
 * Allows the system to work end-to-end without requiring real LLM API keys
 */

const { LLMProvider, LLMResponse } = require('../model-router');

class DemoProvider extends LLMProvider {
  constructor(config = {}) {
    super({
      name: 'demo',
      capabilities: [
        'interviewer',
        'planner',
        'schema-designer',
        'coder',
        'tester',
        'debugger',
        'reviewer',
        'deployer'
      ],
      costPerToken: 0, // Free for demo
      maxTokens: 8192,
      latency: 300, // Simulate realistic latency
      reliability: 1.0,
      ...config
    });
    
    this.simulateLatency = config.simulateLatency !== false;
  }

  /**
   * Make a demo call with realistic mock responses
   */
  async call(prompt, context = {}) {
    const startTime = Date.now();
    
    // Simulate network latency
    if (this.simulateLatency) {
      await this.sleep(200 + Math.random() * 200);
    }
    
    const role = context.role?.toLowerCase() || 'coder';
    const content = this.generateMockResponse(role, prompt, context);
    
    const latency = Date.now() - startTime;
    
    return new LLMResponse({
      success: true,
      content,
      tokens: Math.floor(content.length / 4), // Rough estimate
      cost: 0,
      latency,
      provider: 'demo',
      model: 'demo-model',
      metadata: {
        demoMode: true,
        role,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Generate mock response based on agent role
   */
  generateMockResponse(role, prompt, context) {
    switch (role) {
      case 'interviewer':
        return this.mockInterviewerResponse(prompt, context);
      
      case 'planner':
        return this.mockPlannerResponse(prompt, context);
      
      case 'schema-designer':
        return this.mockSchemaDesignerResponse(prompt, context);
      
      case 'coder':
        return this.mockCoderResponse(prompt, context);
      
      case 'tester':
        return this.mockTesterResponse(prompt, context);
      
      case 'debugger':
        return this.mockDebuggerResponse(prompt, context);
      
      case 'reviewer':
        return this.mockReviewerResponse(prompt, context);
      
      case 'deployer':
        return this.mockDeployerResponse(prompt, context);
      
      default:
        return this.mockGenericResponse(prompt, context);
    }
  }

  mockInterviewerResponse(prompt, context) {
    return JSON.stringify({
      clarifications: [
        {
          question: "What type of authentication would you like? (JWT, OAuth, Session-based)",
          reason: "This will determine the security architecture",
          priority: "high"
        },
        {
          question: "Do you need real-time features like WebSockets or Server-Sent Events?",
          reason: "This affects infrastructure and scaling decisions",
          priority: "medium"
        }
      ],
      suggestions: [
        "Consider using PostgreSQL for relational data with complex queries",
        "Recommend implementing rate limiting for API endpoints"
      ],
      confidence: 0.85
    }, null, 2);
  }

  mockPlannerResponse(prompt, context) {
    const spec = context.spec || {};
    const projectName = spec.projectName || 'demo-app';
    
    return JSON.stringify({
      tasks: [
        {
          id: 1,
          name: "Setup project structure",
          description: "Initialize project with package.json, folder structure, and configuration files",
          dependencies: [],
          estimatedTime: "30 minutes",
          complexity: "low",
          files: ["package.json", "README.md", ".gitignore", ".env.example"]
        },
        {
          id: 2,
          name: "Implement database models",
          description: "Create database schema and models based on requirements",
          dependencies: [1],
          estimatedTime: "2 hours",
          complexity: "medium",
          files: ["models/user.js", "models/project.js", "migrations/001_initial.sql"]
        },
        {
          id: 3,
          name: "Build API endpoints",
          description: "Implement REST API endpoints with authentication",
          dependencies: [2],
          estimatedTime: "4 hours",
          complexity: "high",
          files: ["routes/auth.js", "routes/projects.js", "middleware/auth.js"]
        },
        {
          id: 4,
          name: "Create frontend components",
          description: "Build UI components and pages",
          dependencies: [3],
          estimatedTime: "6 hours",
          complexity: "high",
          files: ["components/Login.jsx", "components/Dashboard.jsx", "pages/index.jsx"]
        },
        {
          id: 5,
          name: "Write tests",
          description: "Add unit and integration tests",
          dependencies: [3, 4],
          estimatedTime: "3 hours",
          complexity: "medium",
          files: ["tests/auth.test.js", "tests/projects.test.js"]
        },
        {
          id: 6,
          name: "Setup deployment",
          description: "Configure Docker and deployment scripts",
          dependencies: [5],
          estimatedTime: "2 hours",
          complexity: "medium",
          files: ["Dockerfile", "docker-compose.yml", ".github/workflows/deploy.yml"]
        }
      ],
      fileStructure: {
        [projectName]: {
          "package.json": "file",
          "README.md": "file",
          ".env.example": "file",
          "src": {
            "models": {},
            "routes": {},
            "middleware": {},
            "services": {},
            "utils": {}
          },
          "tests": {},
          "public": {},
          "Dockerfile": "file"
        }
      },
      estimatedTotalTime: "17.5 hours",
      recommendedStack: {
        backend: spec.backend || "Node.js + Express",
        frontend: spec.frontend || "React",
        database: spec.database || "PostgreSQL",
        deployment: "Docker + AWS"
      }
    }, null, 2);
  }

  mockSchemaDesignerResponse(prompt, context) {
    return JSON.stringify({
      database: {
        tables: [
          {
            name: "users",
            columns: [
              { name: "id", type: "UUID", primaryKey: true },
              { name: "email", type: "VARCHAR(255)", unique: true, notNull: true },
              { name: "password_hash", type: "VARCHAR(255)", notNull: true },
              { name: "created_at", type: "TIMESTAMP", default: "NOW()" },
              { name: "updated_at", type: "TIMESTAMP", default: "NOW()" }
            ],
            indexes: [
              { name: "idx_users_email", columns: ["email"] }
            ]
          },
          {
            name: "projects",
            columns: [
              { name: "id", type: "UUID", primaryKey: true },
              { name: "user_id", type: "UUID", foreignKey: "users(id)", notNull: true },
              { name: "name", type: "VARCHAR(255)", notNull: true },
              { name: "description", type: "TEXT" },
              { name: "status", type: "VARCHAR(50)", default: "'active'" },
              { name: "created_at", type: "TIMESTAMP", default: "NOW()" }
            ],
            indexes: [
              { name: "idx_projects_user_id", columns: ["user_id"] },
              { name: "idx_projects_status", columns: ["status"] }
            ]
          }
        ]
      },
      api: {
        endpoints: [
          {
            path: "/api/auth/register",
            method: "POST",
            description: "Register a new user",
            requestBody: {
              email: "string",
              password: "string"
            },
            responses: {
              201: { message: "User created", userId: "uuid" },
              400: { error: "Invalid input" },
              409: { error: "Email already exists" }
            }
          },
          {
            path: "/api/auth/login",
            method: "POST",
            description: "Login user",
            requestBody: {
              email: "string",
              password: "string"
            },
            responses: {
              200: { token: "jwt", user: "object" },
              401: { error: "Invalid credentials" }
            }
          },
          {
            path: "/api/projects",
            method: "GET",
            description: "Get user's projects",
            auth: "required",
            responses: {
              200: { projects: "array" }
            }
          },
          {
            path: "/api/projects",
            method: "POST",
            description: "Create new project",
            auth: "required",
            requestBody: {
              name: "string",
              description: "string"
            },
            responses: {
              201: { project: "object" },
              400: { error: "Invalid input" }
            }
          }
        ]
      }
    }, null, 2);
  }

  mockCoderResponse(prompt, context) {
    const task = context.task || {};
    const fileName = task.fileName || 'index.js';
    
    // Generate appropriate code based on file type
    if (fileName.endsWith('.js') || fileName.endsWith('.ts')) {
      return this.generateJavaScriptCode(fileName, context);
    } else if (fileName.endsWith('.jsx') || fileName.endsWith('.tsx')) {
      return this.generateReactCode(fileName, context);
    } else if (fileName.endsWith('.py')) {
      return this.generatePythonCode(fileName, context);
    } else if (fileName.endsWith('.go')) {
      return this.generateGoCode(fileName, context);
    }
    
    return this.generateGenericCode(fileName, context);
  }

  generateJavaScriptCode(fileName, context) {
    if (fileName.includes('route') || fileName.includes('api')) {
      return `// ${fileName}
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

// GET endpoint
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    // TODO: Implement business logic
    res.json({ success: true, data: [] });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST endpoint
router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const data = req.body;
    
    // TODO: Validate input
    // TODO: Implement business logic
    
    res.status(201).json({ success: true, data: {} });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
`;
    }
    
    if (fileName.includes('model')) {
      return `// ${fileName}
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Model = sequelize.define('Model', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'active'
  }
}, {
  timestamps: true,
  underscored: true
});

module.exports = Model;
`;
    }
    
    return `// ${fileName}
// TODO: Implement functionality
module.exports = {
  // Add exports here
};
`;
  }

  generateReactCode(fileName, context) {
    const componentName = fileName.split('/').pop().replace(/\.(jsx|tsx)$/, '');
    
    return `import React, { useState, useEffect } from 'react';

function ${componentName}() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/data');
      const result = await response.json();
      setData(result.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="${componentName.toLowerCase()}">
      <h1>${componentName}</h1>
      {/* TODO: Implement component UI */}
    </div>
  );
}

export default ${componentName};
`;
  }

  generatePythonCode(fileName, context) {
    return `# ${fileName}
from typing import List, Optional
from datetime import datetime

class Service:
    """Service class for business logic"""
    
    def __init__(self):
        pass
    
    async def process(self, data: dict) -> dict:
        """Process data and return result"""
        # TODO: Implement business logic
        return {"success": True, "data": data}
    
    async def validate(self, data: dict) -> bool:
        """Validate input data"""
        # TODO: Implement validation
        return True
`;
  }

  generateGoCode(fileName, context) {
    return `// ${fileName}
package main

import (
    "encoding/json"
    "net/http"
)

type Handler struct {
    // Add dependencies here
}

func NewHandler() *Handler {
    return &Handler{}
}

func (h *Handler) HandleRequest(w http.ResponseWriter, r *http.Request) {
    // TODO: Implement handler logic
    
    response := map[string]interface{}{
        "success": true,
        "data": nil,
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
}
`;
  }

  generateGenericCode(fileName, context) {
    return `// ${fileName}
// Generated by AI App Builder (Demo Mode)
// TODO: Implement functionality

module.exports = {
  // Add your code here
};
`;
  }

  mockTesterResponse(prompt, context) {
    return `// Generated test file
const request = require('supertest');
const app = require('../app');

describe('API Tests', () => {
  test('GET /api/health returns 200', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
  });

  test('POST /api/auth/register creates user', async () => {
    const userData = {
      email: 'test@example.com',
      password: 'password123'
    };
    
    const response = await request(app)
      .post('/api/auth/register')
      .send(userData);
    
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('userId');
  });

  test('POST /api/auth/login returns token', async () => {
    const credentials = {
      email: 'test@example.com',
      password: 'password123'
    };
    
    const response = await request(app)
      .post('/api/auth/login')
      .send(credentials);
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
  });
});
`;
  }

  mockDebuggerResponse(prompt, context) {
    return JSON.stringify({
      analysis: {
        errorType: "TypeError",
        rootCause: "Undefined variable reference",
        affectedFiles: ["src/routes/api.js"],
        severity: "high"
      },
      suggestedFix: {
        type: "patch",
        description: "Add null check before accessing property",
        patch: `--- a/src/routes/api.js
+++ b/src/routes/api.js
@@ -10,7 +10,7 @@
 router.get('/data', async (req, res) => {
   try {
     const result = await fetchData();
-    res.json({ data: result.items });
+    res.json({ data: result?.items || [] });
   } catch (error) {
     res.status(500).json({ error: error.message });
   }
`,
        confidence: 0.9
      },
      alternativeFixes: [
        {
          description: "Add validation before processing",
          confidence: 0.7
        }
      ]
    }, null, 2);
  }

  mockReviewerResponse(prompt, context) {
    return JSON.stringify({
      review: {
        overallScore: 8.5,
        issues: [
          {
            severity: "medium",
            type: "security",
            file: "routes/auth.js",
            line: 45,
            message: "Password should be hashed before storage",
            suggestion: "Use bcrypt.hash() before saving to database"
          },
          {
            severity: "low",
            type: "performance",
            file: "services/data.js",
            line: 23,
            message: "Consider adding database index for frequently queried field",
            suggestion: "Add index on 'email' column"
          },
          {
            severity: "low",
            type: "style",
            file: "utils/helpers.js",
            line: 12,
            message: "Function could be simplified",
            suggestion: "Use array destructuring"
          }
        ],
        strengths: [
          "Good error handling throughout",
          "Consistent code style",
          "Comprehensive input validation"
        ],
        recommendations: [
          "Add more unit tests for edge cases",
          "Consider implementing rate limiting",
          "Add API documentation"
        ]
      }
    }, null, 2);
  }

  mockDeployerResponse(prompt, context) {
    return JSON.stringify({
      deployment: {
        platform: "AWS",
        services: [
          {
            name: "Backend API",
            type: "ECS Fargate",
            config: {
              cpu: "256",
              memory: "512",
              desiredCount: 2,
              healthCheck: "/health"
            }
          },
          {
            name: "Frontend",
            type: "S3 + CloudFront",
            config: {
              bucket: "app-frontend",
              distribution: "enabled",
              caching: "enabled"
            }
          },
          {
            name: "Database",
            type: "RDS PostgreSQL",
            config: {
              instanceClass: "db.t3.micro",
              storage: "20GB",
              backups: "enabled"
            }
          }
        ],
        infrastructure: {
          vpc: "10.0.0.0/16",
          subnets: ["10.0.1.0/24", "10.0.2.0/24"],
          securityGroups: ["api-sg", "db-sg"]
        },
        cicd: {
          provider: "GitHub Actions",
          stages: ["build", "test", "deploy"],
          triggers: ["push to main"]
        }
      },
      estimatedCost: "$50-100/month"
    }, null, 2);
  }

  mockGenericResponse(prompt, context) {
    return `Based on your request, here's a suggested approach:

1. Analyze the requirements carefully
2. Break down the problem into smaller tasks
3. Implement each task incrementally
4. Test thoroughly
5. Deploy with monitoring

This is a demo response. In production, this would be generated by a real LLM based on your specific needs.
`;
  }

  /**
   * Health check always succeeds for demo provider
   */
  async healthCheck() {
    return true;
  }

  /**
   * Sleep utility for simulating latency
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = DemoProvider;
