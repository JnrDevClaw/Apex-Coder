const jobProcessor = require('./job-processor');
const structuredLogger = require('./structured-logger');
const { getModelRouterService } = require('./model-router-service');

class TaskPlanner {
  constructor() {
    this.taskTemplates = new Map();
    this.dependencyGraph = new Map();
    this.estimationModels = new Map();
    this.modelRouter = null; // Will be initialized when needed
    
    // Initialize default task templates
    this.initializeTaskTemplates();
  }

  /**
   * Get ModelRouter service instance
   * @returns {ModelRouterService}
   */
  async getModelRouter() {
    if (!this.modelRouter) {
      this.modelRouter = getModelRouterService();
      // Ensure it's initialized
      if (!this.modelRouter.initialized) {
        await this.modelRouter.initialize();
      }
    }
    return this.modelRouter;
  }

  initializeTaskTemplates() {
    // Frontend task templates
    this.taskTemplates.set('frontend-setup', {
      name: 'Set up frontend project structure',
      agentRole: 'coder',
      estimatedTime: 300,
      dependencies: [],
      outputs: ['package.json', 'src/main.js', 'public/index.html'],
      requirements: ['project structure', 'build tools']
    });

    this.taskTemplates.set('frontend-components', {
      name: 'Create UI components',
      agentRole: 'coder',
      estimatedTime: 600,
      dependencies: ['frontend-setup'],
      outputs: ['src/components/*.svelte', 'src/lib/*.js'],
      requirements: ['component library', 'styling']
    });

    // Backend task templates
    this.taskTemplates.set('backend-setup', {
      name: 'Set up backend project structure',
      agentRole: 'coder',
      estimatedTime: 300,
      dependencies: [],
      outputs: ['app.js', 'package.json', 'routes/', 'models/'],
      requirements: ['API framework', 'middleware']
    });

    this.taskTemplates.set('database-models', {
      name: 'Create database models and schemas',
      agentRole: 'coder',
      estimatedTime: 450,
      dependencies: ['backend-setup'],
      outputs: ['models/*.js', 'migrations/*.sql'],
      requirements: ['data models', 'relationships']
    });

    this.taskTemplates.set('api-endpoints', {
      name: 'Implement API endpoints',
      agentRole: 'coder',
      estimatedTime: 900,
      dependencies: ['database-models'],
      outputs: ['routes/*.js', 'controllers/*.js'],
      requirements: ['REST API', 'validation']
    });

    // Authentication task templates
    this.taskTemplates.set('auth-system', {
      name: 'Implement authentication system',
      agentRole: 'coder',
      estimatedTime: 720,
      dependencies: ['backend-setup'],
      outputs: ['auth/*.js', 'middleware/auth.js'],
      requirements: ['JWT tokens', 'password hashing']
    });

    // Testing task templates
    this.taskTemplates.set('unit-tests', {
      name: 'Write unit tests',
      agentRole: 'tester',
      estimatedTime: 480,
      dependencies: ['api-endpoints'],
      outputs: ['test/*.test.js'],
      requirements: ['test coverage', 'mocking']
    });

    // Deployment task templates
    this.taskTemplates.set('containerization', {
      name: 'Create Docker configuration',
      agentRole: 'deployer',
      estimatedTime: 240,
      dependencies: ['backend-setup', 'frontend-setup'],
      outputs: ['Dockerfile', 'docker-compose.yml'],
      requirements: ['container images', 'orchestration']
    });

    this.taskTemplates.set('deployment-config', {
      name: 'Configure deployment pipeline',
      agentRole: 'deployer',
      estimatedTime: 360,
      dependencies: ['containerization'],
      outputs: ['deploy/*.yml', 'scripts/deploy.sh'],
      requirements: ['CI/CD', 'infrastructure']
    });
  }

  async decomposeSpec(specJson) {
    structuredLogger.info('Decomposing spec into tasks', {
      projectName: specJson.projectName,
      features: Object.keys(specJson.features || {}),
      stack: specJson.stack
    });
    
    const tasks = [];
    const taskIdCounter = { value: 1 };
    
    // Analyze spec to determine required tasks
    const requiredFeatures = this.analyzeRequiredFeatures(specJson);
    
    // Use LLM to assist with task decomposition
    const llmTaskSuggestions = await this.getLLMTaskSuggestions(specJson, requiredFeatures);
    
    // Generate core project structure tasks
    const coreTaskIds = await this.generateCoreTasks(specJson, tasks, taskIdCounter);
    
    // Generate feature-specific tasks
    const featureTaskIds = await this.generateFeatureTasks(specJson, requiredFeatures, tasks, taskIdCounter);
    
    // Generate testing tasks
    const testTaskIds = await this.generateTestingTasks(specJson, tasks, taskIdCounter, [...coreTaskIds, ...featureTaskIds]);
    
    // Generate deployment tasks
    const deployTaskIds = await this.generateDeploymentTasks(specJson, tasks, taskIdCounter, [...coreTaskIds, ...featureTaskIds]);
    
    // Enhance tasks with LLM-generated prompts
    await this.enhanceTasksWithPrompts(tasks, specJson);
    
    // Build dependency graph
    const dependencyGraph = this.buildDependencyGraph(tasks);
    
    // Calculate task ordering
    const orderedTasks = this.topologicalSort(tasks, dependencyGraph);
    
    // Generate milestones
    const milestones = this.generateMilestones(orderedTasks);
    
    // Calculate total estimation
    const totalEstimation = this.calculateTotalEstimation(orderedTasks);
    
    return {
      tasks: orderedTasks,
      dependencyGraph,
      milestones,
      totalEstimation,
      generatedAt: new Date().toISOString(),
      specVersion: specJson.version || '1.0.0',
      llmSuggestions: llmTaskSuggestions
    };
  }

  async getLLMTaskSuggestions(specJson, requiredFeatures) {
    try {
      const prompt = `You are a project planning expert. Analyze this project specification and suggest additional tasks or improvements:

Project: ${specJson.projectName}
Description: ${specJson.projectDescription || 'No description provided'}
Stack: ${JSON.stringify(specJson.stack)}
Features: ${JSON.stringify(specJson.features)}

Required Features Analysis:
${JSON.stringify(requiredFeatures, null, 2)}

Suggest any additional tasks, considerations, or improvements for this project. Focus on:
1. Missing critical tasks
2. Security considerations
3. Performance optimizations
4. Best practices for the chosen stack

Respond in JSON format with an array of suggestions.`;

      const modelRouter = await this.getModelRouter();
      const response = await modelRouter.routeTask({
        role: 'planner',
        complexity: 'medium',
        prompt,
        fallback: true,
        context: {
          projectId: specJson.projectId,
          userId: specJson.userId
        }
      });

      if (response.success && response.content) {
        try {
          // Try to parse JSON from response
          const jsonMatch = response.content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          }
        } catch (parseError) {
          structuredLogger.warn('Failed to parse LLM task suggestions', { error: parseError.message });
        }
      }

      return [];
    } catch (error) {
      structuredLogger.warn('Failed to get LLM task suggestions', { error: error.message });
      return [];
    }
  }

  async enhanceTasksWithPrompts(tasks, specJson) {
    for (const task of tasks) {
      task.prompt = await this.generateTaskPrompt(task, specJson);
      task.fileTemplates = this.generateFileTemplates(task, specJson);
    }
  }

  async generateTaskPrompt(task, specJson) {
    // Build context from spec
    const contextInfo = this.buildTaskContext(task, specJson);
    
    // Generate role-specific instructions
    const roleInstructions = this.getRoleSpecificInstructions(task.agentRole);
    
    // Build the comprehensive prompt
    const prompt = `${roleInstructions}

## Project Context
- **Project Name**: ${specJson.projectName}
- **Description**: ${specJson.projectDescription || 'Full-stack application'}
- **Stack**: 
  - Frontend: ${specJson.stack?.frontend || 'None'}
  - Backend: ${specJson.stack?.backend || 'None'}
  - Database: ${specJson.stack?.database || 'None'}

## Task Details
- **Task ID**: ${task.id}
- **Task Name**: ${task.name}
- **Agent Role**: ${task.agentRole}
- **Estimated Time**: ${task.estimatedTime} seconds

## Requirements
${task.requirements.map((req, i) => `${i + 1}. ${req}`).join('\n')}

## Expected Outputs
Generate the following files:
${task.outputs.map(f => `- ${f}`).join('\n')}

${task.context && task.context.dependencies ? `## Dependencies to Include
${task.context.dependencies.join(', ')}` : ''}

${contextInfo ? `## Additional Context
${contextInfo}` : ''}

## Output Format
Use the following format for each file:

\`\`\`filename:path/to/file.js
// File content here
// Include proper imports, error handling, and comments
\`\`\`

## Code Quality Requirements
- ✅ Use modern JavaScript/TypeScript syntax
- ✅ Include comprehensive error handling
- ✅ Add input validation where appropriate
- ✅ Follow security best practices
- ✅ Write clear, descriptive comments
- ✅ Use consistent code formatting
- ✅ Include JSDoc comments for functions
- ✅ Handle edge cases appropriately

${this.getTaskSpecificGuidance(task, specJson)}

Generate complete, production-ready code now.`;

    return prompt;
  }

  buildTaskContext(task, specJson) {
    const contextParts = [];

    // Add feature-specific context
    if (task.templateId === 'auth-system' && specJson.features?.auth) {
      contextParts.push('- Implement JWT-based authentication');
      contextParts.push('- Use bcrypt for password hashing');
      contextParts.push('- Include password strength validation');
      contextParts.push('- Add rate limiting for login attempts');
    }

    if (task.templateId === 'file-uploads' && specJson.features?.uploads) {
      contextParts.push('- Use AWS S3 for file storage');
      contextParts.push('- Validate file types and sizes');
      contextParts.push('- Generate unique filenames');
      contextParts.push('- Include virus scanning if possible');
    }

    if (task.templateId === 'payment-system' && specJson.features?.payments) {
      contextParts.push('- Integrate with Stripe payment gateway');
      contextParts.push('- Handle webhook events securely');
      contextParts.push('- Implement idempotency for payments');
      contextParts.push('- Store payment records in database');
    }

    // Add database context
    if (task.templateId === 'database-models' && specJson.stack?.database) {
      contextParts.push(`- Use ${specJson.stack.database} as the database`);
      contextParts.push('- Include proper indexes for performance');
      contextParts.push('- Add timestamps (created_at, updated_at)');
      contextParts.push('- Implement soft deletes where appropriate');
    }

    return contextParts.length > 0 ? contextParts.join('\n') : null;
  }

  getRoleSpecificInstructions(role) {
    const instructions = {
      coder: 'You are an expert software engineer specializing in full-stack development. Your code is clean, efficient, and follows industry best practices.',
      planner: 'You are a senior technical architect. You excel at breaking down complex projects into manageable tasks and identifying dependencies.',
      tester: 'You are a quality assurance expert. You write comprehensive tests that catch edge cases and ensure code reliability.',
      debugger: 'You are a debugging specialist. You analyze errors systematically and provide precise fixes.',
      deployer: 'You are a DevOps engineer. You create robust deployment configurations that ensure reliability and scalability.',
      reviewer: 'You are a senior code reviewer. You identify potential issues, suggest improvements, and ensure code quality.'
    };

    return instructions[role] || 'You are an expert developer.';
  }

  getTaskSpecificGuidance(task, specJson) {
    let guidance = '';

    // Frontend-specific guidance
    if (task.templateId?.includes('frontend')) {
      const framework = specJson.stack?.frontend || 'svelte';
      guidance += `\n## Frontend Framework: ${framework}\n`;
      
      if (framework === 'svelte') {
        guidance += '- Use Svelte 5 runes syntax ($state, $derived, $effect)\n';
        guidance += '- Implement reactive state management\n';
        guidance += '- Use SvelteKit for routing and SSR\n';
      } else if (framework === 'react') {
        guidance += '- Use React hooks (useState, useEffect, etc.)\n';
        guidance += '- Implement proper component lifecycle\n';
        guidance += '- Use React Router for navigation\n';
      }
    }

    // Backend-specific guidance
    if (task.templateId?.includes('backend') || task.templateId?.includes('api')) {
      const framework = specJson.stack?.backend || 'node';
      guidance += `\n## Backend Framework: ${framework}\n`;
      
      if (framework === 'express' || framework === 'node') {
        guidance += '- Use Express.js middleware pattern\n';
        guidance += '- Implement proper error handling middleware\n';
        guidance += '- Add request validation\n';
        guidance += '- Use async/await for asynchronous operations\n';
      } else if (framework === 'fastify') {
        guidance += '- Use Fastify plugins and decorators\n';
        guidance += '- Implement schema validation\n';
        guidance += '- Use Fastify hooks for lifecycle management\n';
      }
    }

    // Database-specific guidance
    if (task.templateId === 'database-models') {
      const database = specJson.stack?.database || 'postgres';
      guidance += `\n## Database: ${database}\n`;
      
      if (database === 'postgres' || database === 'mysql') {
        guidance += '- Use parameterized queries to prevent SQL injection\n';
        guidance += '- Implement connection pooling\n';
        guidance += '- Add proper indexes for frequently queried columns\n';
      } else if (database === 'mongodb') {
        guidance += '- Use Mongoose for schema validation\n';
        guidance += '- Implement proper indexing strategy\n';
        guidance += '- Use aggregation pipelines for complex queries\n';
      }
    }

    return guidance;
  }

  generateFileTemplates(task, specJson) {
    const templates = [];

    // Generate templates based on task type
    if (task.templateId === 'frontend-setup') {
      templates.push({
        path: 'package.json',
        template: 'frontend-package-json',
        variables: {
          projectName: specJson.projectName,
          framework: specJson.stack?.frontend || 'svelte'
        }
      });

      templates.push({
        path: 'vite.config.js',
        template: 'vite-config',
        variables: {
          framework: specJson.stack?.frontend || 'svelte'
        }
      });
    }

    if (task.templateId === 'backend-setup') {
      templates.push({
        path: 'package.json',
        template: 'backend-package-json',
        variables: {
          projectName: specJson.projectName,
          framework: specJson.stack?.backend || 'node'
        }
      });

      templates.push({
        path: 'app.js',
        template: 'express-app',
        variables: {
          port: 3000,
          features: specJson.features
        }
      });
    }

    if (task.templateId === 'auth-system') {
      templates.push({
        path: 'middleware/auth.js',
        template: 'jwt-middleware',
        variables: {
          jwtSecret: 'process.env.JWT_SECRET'
        }
      });

      templates.push({
        path: 'utils/password.js',
        template: 'password-utils',
        variables: {
          saltRounds: 10
        }
      });
    }

    return templates;
  }

  analyzeRequiredFeatures(specJson) {
    const features = {
      hasAuth: specJson.features?.auth || false,
      hasPayments: specJson.features?.payments || false,
      hasUploads: specJson.features?.uploads || false,
      hasRealtime: specJson.features?.realtime || false,
      hasWeb3: specJson.features?.web3 || false,
      requiresDatabase: this.requiresDatabase(specJson),
      requiresAPI: this.requiresAPI(specJson),
      frontendFramework: specJson.stack?.frontend || 'svelte',
      backendFramework: specJson.stack?.backend || 'node',
      databaseType: specJson.stack?.database || 'postgres'
    };
    
    structuredLogger.debug('Analyzed required features', { features });
    return features;
  }

  requiresDatabase(specJson) {
    return specJson.features?.auth || 
           specJson.features?.payments || 
           specJson.features?.uploads ||
           specJson.stack?.database !== 'none';
  }

  requiresAPI(specJson) {
    return specJson.features?.auth || 
           specJson.features?.payments || 
           specJson.features?.uploads ||
           specJson.features?.realtime ||
           specJson.stack?.backend !== 'none';
  }

  async generateCoreTasks(specJson, tasks, taskIdCounter) {
    const taskIds = [];
    
    // Frontend setup
    if (specJson.stack?.frontend !== 'none') {
      const frontendSetupTask = this.createTaskFromTemplate('frontend-setup', taskIdCounter.value++, {
        framework: specJson.stack?.frontend || 'svelte',
        projectName: specJson.projectName
      });
      tasks.push(frontendSetupTask);
      taskIds.push(frontendSetupTask.id);
      
      // Frontend components
      const componentsTask = this.createTaskFromTemplate('frontend-components', taskIdCounter.value++, {
        framework: specJson.stack?.frontend || 'svelte',
        features: specJson.features
      });
      componentsTask.dependencies = [frontendSetupTask.id];
      tasks.push(componentsTask);
      taskIds.push(componentsTask.id);
    }
    
    // Backend setup
    if (specJson.stack?.backend !== 'none') {
      const backendSetupTask = this.createTaskFromTemplate('backend-setup', taskIdCounter.value++, {
        framework: specJson.stack?.backend || 'node',
        projectName: specJson.projectName
      });
      tasks.push(backendSetupTask);
      taskIds.push(backendSetupTask.id);
      
      // Database models (if database required)
      if (this.requiresDatabase(specJson)) {
        const modelsTask = this.createTaskFromTemplate('database-models', taskIdCounter.value++, {
          databaseType: specJson.stack?.database || 'postgres',
          features: specJson.features
        });
        modelsTask.dependencies = [backendSetupTask.id];
        tasks.push(modelsTask);
        taskIds.push(modelsTask.id);
        
        // API endpoints
        const apiTask = this.createTaskFromTemplate('api-endpoints', taskIdCounter.value++, {
          features: specJson.features,
          databaseType: specJson.stack?.database
        });
        apiTask.dependencies = [modelsTask.id];
        tasks.push(apiTask);
        taskIds.push(apiTask.id);
      }
    }
    
    return taskIds;
  }

  async generateFeatureTasks(specJson, requiredFeatures, tasks, taskIdCounter) {
    const taskIds = [];
    
    // Authentication system
    if (requiredFeatures.hasAuth) {
      const authTask = this.createTaskFromTemplate('auth-system', taskIdCounter.value++, {
        authType: 'jwt',
        features: specJson.features
      });
      
      // Find backend setup task to depend on
      const backendSetupTask = tasks.find(t => t.templateId === 'backend-setup');
      if (backendSetupTask) {
        authTask.dependencies = [backendSetupTask.id];
      }
      
      tasks.push(authTask);
      taskIds.push(authTask.id);
    }
    
    // Payment system
    if (requiredFeatures.hasPayments) {
      const paymentTask = {
        id: taskIdCounter.value++,
        templateId: 'payment-system',
        name: 'Implement payment processing',
        agentRole: 'coder',
        estimatedTime: 900,
        dependencies: [],
        outputs: ['payments/*.js', 'webhooks/stripe.js'],
        requirements: ['payment gateway', 'webhook handling'],
        context: {
          provider: 'stripe',
          features: specJson.features
        }
      };
      
      // Depend on API endpoints if they exist
      const apiTask = tasks.find(t => t.templateId === 'api-endpoints');
      if (apiTask) {
        paymentTask.dependencies = [apiTask.id];
      }
      
      tasks.push(paymentTask);
      taskIds.push(paymentTask.id);
    }
    
    // File upload system
    if (requiredFeatures.hasUploads) {
      const uploadTask = {
        id: taskIdCounter.value++,
        templateId: 'file-uploads',
        name: 'Implement file upload system',
        agentRole: 'coder',
        estimatedTime: 600,
        dependencies: [],
        outputs: ['uploads/*.js', 'middleware/upload.js'],
        requirements: ['file storage', 'validation'],
        context: {
          storage: 's3',
          features: specJson.features
        }
      };
      
      // Depend on API endpoints if they exist
      const apiTask = tasks.find(t => t.templateId === 'api-endpoints');
      if (apiTask) {
        uploadTask.dependencies = [apiTask.id];
      }
      
      tasks.push(uploadTask);
      taskIds.push(uploadTask.id);
    }
    
    // Real-time features
    if (requiredFeatures.hasRealtime) {
      const realtimeTask = {
        id: taskIdCounter.value++,
        templateId: 'realtime-system',
        name: 'Implement real-time communication',
        agentRole: 'coder',
        estimatedTime: 720,
        dependencies: [],
        outputs: ['websockets/*.js', 'events/*.js'],
        requirements: ['websockets', 'event handling'],
        context: {
          protocol: 'websocket',
          features: specJson.features
        }
      };
      
      // Depend on backend setup
      const backendSetupTask = tasks.find(t => t.templateId === 'backend-setup');
      if (backendSetupTask) {
        realtimeTask.dependencies = [backendSetupTask.id];
      }
      
      tasks.push(realtimeTask);
      taskIds.push(realtimeTask.id);
    }
    
    return taskIds;
  }

  async generateTestingTasks(specJson, tasks, taskIdCounter, dependsOnTaskIds) {
    const taskIds = [];
    
    // Unit tests
    const unitTestTask = this.createTaskFromTemplate('unit-tests', taskIdCounter.value++, {
      framework: specJson.stack?.backend || 'node',
      testRunner: 'jest'
    });
    unitTestTask.dependencies = dependsOnTaskIds.slice(); // Copy array
    tasks.push(unitTestTask);
    taskIds.push(unitTestTask.id);
    
    // Integration tests
    const integrationTestTask = {
      id: taskIdCounter.value++,
      templateId: 'integration-tests',
      name: 'Write integration tests',
      agentRole: 'tester',
      estimatedTime: 600,
      dependencies: dependsOnTaskIds.slice(),
      outputs: ['test/integration/*.test.js'],
      requirements: ['API testing', 'database testing'],
      context: {
        framework: specJson.stack?.backend || 'node',
        testRunner: 'jest'
      }
    };
    tasks.push(integrationTestTask);
    taskIds.push(integrationTestTask.id);
    
    return taskIds;
  }

  async generateDeploymentTasks(specJson, tasks, taskIdCounter, dependsOnTaskIds) {
    const taskIds = [];
    
    // Containerization
    const containerTask = this.createTaskFromTemplate('containerization', taskIdCounter.value++, {
      stack: specJson.stack,
      environment: specJson.envPrefs
    });
    
    // Find setup tasks to depend on
    const setupTasks = tasks.filter(t => 
      t.templateId === 'frontend-setup' || t.templateId === 'backend-setup'
    );
    containerTask.dependencies = setupTasks.map(t => t.id);
    
    tasks.push(containerTask);
    taskIds.push(containerTask.id);
    
    // Deployment configuration
    const deployTask = this.createTaskFromTemplate('deployment-config', taskIdCounter.value++, {
      hosting: specJson.envPrefs?.hosting || 'aws',
      environment: specJson.envPrefs
    });
    deployTask.dependencies = [containerTask.id];
    tasks.push(deployTask);
    taskIds.push(deployTask.id);
    
    return taskIds;
  }

  createTaskFromTemplate(templateId, taskId, context = {}) {
    const template = this.taskTemplates.get(templateId);
    if (!template) {
      throw new Error(`Task template '${templateId}' not found`);
    }
    
    return {
      id: taskId,
      templateId,
      name: template.name,
      agentRole: template.agentRole,
      estimatedTime: template.estimatedTime,
      dependencies: [...template.dependencies],
      outputs: [...template.outputs],
      requirements: [...template.requirements],
      context
    };
  }

  buildDependencyGraph(tasks) {
    const graph = new Map();
    
    for (const task of tasks) {
      graph.set(task.id, {
        task,
        dependencies: task.dependencies || [],
        dependents: []
      });
    }
    
    // Build reverse dependencies (dependents)
    for (const [taskId, node] of graph) {
      for (const depId of node.dependencies) {
        const depNode = graph.get(depId);
        if (depNode) {
          depNode.dependents.push(taskId);
        }
      }
    }
    
    return graph;
  }

  topologicalSort(tasks, dependencyGraph) {
    const visited = new Set();
    const visiting = new Set();
    const result = [];
    
    const visit = (taskId) => {
      if (visiting.has(taskId)) {
        throw new Error(`Circular dependency detected involving task ${taskId}`);
      }
      
      if (visited.has(taskId)) {
        return;
      }
      
      visiting.add(taskId);
      
      const node = dependencyGraph.get(taskId);
      if (node) {
        for (const depId of node.dependencies) {
          visit(depId);
        }
      }
      
      visiting.delete(taskId);
      visited.add(taskId);
      
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        result.push(task);
      }
    };
    
    for (const task of tasks) {
      if (!visited.has(task.id)) {
        visit(task.id);
      }
    }
    
    return result;
  }

  generateMilestones(orderedTasks) {
    const milestones = [];
    let currentMilestone = null;
    let accumulatedTime = 0;
    
    for (const task of orderedTasks) {
      accumulatedTime += task.estimatedTime;
      
      // Create milestone every 3600 seconds (1 hour) or at major feature boundaries
      if (!currentMilestone || 
          accumulatedTime >= 3600 || 
          this.isMajorFeatureBoundary(task)) {
        
        if (currentMilestone) {
          milestones.push(currentMilestone);
        }
        
        currentMilestone = {
          id: milestones.length + 1,
          name: this.generateMilestoneName(task),
          tasks: [],
          estimatedTime: 0,
          startTime: accumulatedTime - task.estimatedTime
        };
        accumulatedTime = task.estimatedTime;
      }
      
      currentMilestone.tasks.push(task.id);
      currentMilestone.estimatedTime += task.estimatedTime;
    }
    
    if (currentMilestone && currentMilestone.tasks.length > 0) {
      milestones.push(currentMilestone);
    }
    
    return milestones;
  }

  isMajorFeatureBoundary(task) {
    const majorFeatures = [
      'frontend-components',
      'api-endpoints',
      'auth-system',
      'payment-system',
      'deployment-config'
    ];
    
    return majorFeatures.includes(task.templateId);
  }

  generateMilestoneName(task) {
    const milestoneNames = {
      'frontend-setup': 'Frontend Foundation',
      'frontend-components': 'User Interface Complete',
      'backend-setup': 'Backend Foundation',
      'database-models': 'Data Layer Complete',
      'api-endpoints': 'API Implementation Complete',
      'auth-system': 'Authentication System Complete',
      'payment-system': 'Payment Processing Complete',
      'file-uploads': 'File Upload System Complete',
      'realtime-system': 'Real-time Features Complete',
      'unit-tests': 'Testing Suite Complete',
      'containerization': 'Containerization Complete',
      'deployment-config': 'Deployment Ready'
    };
    
    return milestoneNames[task.templateId] || `${task.name} Complete`;
  }

  calculateTotalEstimation(orderedTasks) {
    const totalTime = orderedTasks.reduce((sum, task) => sum + task.estimatedTime, 0);
    
    return {
      totalTimeSeconds: totalTime,
      totalTimeMinutes: Math.round(totalTime / 60),
      totalTimeHours: Math.round(totalTime / 3600 * 10) / 10,
      estimatedCompletionDate: new Date(Date.now() + totalTime * 1000).toISOString(),
      taskCount: orderedTasks.length
    };
  }

  async generateFileStructure(specJson, tasks) {
    structuredLogger.info('Generating file structure', {
      projectName: specJson.projectName,
      stack: specJson.stack
    });

    const fileStructure = {
      projectName: specJson.projectName,
      rootFiles: [],
      directories: {},
      packageFiles: {}
    };

    // Generate root files
    fileStructure.rootFiles.push({
      name: 'README.md',
      content: this.generateReadme(specJson)
    });

    fileStructure.rootFiles.push({
      name: '.gitignore',
      content: this.generateGitignore(specJson)
    });

    fileStructure.rootFiles.push({
      name: '.env.example',
      content: this.generateEnvExample(specJson)
    });

    // Generate frontend structure
    if (specJson.stack?.frontend !== 'none') {
      fileStructure.directories.frontend = await this.generateFrontendStructure(specJson);
      fileStructure.packageFiles.frontend = await this.generateFrontendPackageJson(specJson);
    }

    // Generate backend structure
    if (specJson.stack?.backend !== 'none') {
      fileStructure.directories.backend = await this.generateBackendStructure(specJson);
      fileStructure.packageFiles.backend = await this.generateBackendPackageJson(specJson);
    }

    // Generate infrastructure files
    fileStructure.directories.infra = this.generateInfraStructure(specJson);

    return fileStructure;
  }

  generateReadme(specJson) {
    return `# ${specJson.projectName}

${specJson.projectDescription || 'A full-stack application'}

## Stack

- Frontend: ${specJson.stack?.frontend || 'None'}
- Backend: ${specJson.stack?.backend || 'None'}
- Database: ${specJson.stack?.database || 'None'}

## Features

${Object.entries(specJson.features || {})
  .filter(([_, enabled]) => enabled)
  .map(([feature]) => `- ${feature}`)
  .join('\n')}

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
${specJson.stack?.database !== 'none' ? `- ${specJson.stack?.database}` : ''}

### Installation

\`\`\`bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env

# Start development servers
pnpm dev
\`\`\`

## Project Structure

\`\`\`
${specJson.stack?.frontend !== 'none' ? 'frontend/     # Frontend application\n' : ''}${specJson.stack?.backend !== 'none' ? 'backend/      # Backend API\n' : ''}infra/        # Infrastructure and deployment
\`\`\`

## License

MIT
`;
  }

  generateGitignore(specJson) {
    return `# Dependencies
node_modules/
.pnpm-store/

# Environment variables
.env
.env.local
.env.*.local

# Build outputs
dist/
build/
.next/
.svelte-kit/

# Logs
logs/
*.log
npm-debug.log*

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Testing
coverage/
.nyc_output/

# Temporary files
tmp/
temp/
`;
  }

  generateEnvExample(specJson) {
    const envVars = ['# Application Configuration', 'NODE_ENV=development', ''];

    if (specJson.stack?.backend !== 'none') {
      envVars.push('# Backend Configuration');
      envVars.push('PORT=3000');
      envVars.push('API_URL=http://localhost:3000');
      envVars.push('');
    }

    if (specJson.features?.auth) {
      envVars.push('# Authentication');
      envVars.push('JWT_SECRET=your-secret-key-here');
      envVars.push('JWT_EXPIRES_IN=7d');
      envVars.push('');
    }

    if (specJson.stack?.database !== 'none') {
      envVars.push('# Database');
      if (specJson.stack.database === 'postgres') {
        envVars.push('DATABASE_URL=postgresql://user:password@localhost:5432/dbname');
      } else if (specJson.stack.database === 'mysql') {
        envVars.push('DATABASE_URL=mysql://user:password@localhost:3306/dbname');
      } else if (specJson.stack.database === 'mongodb') {
        envVars.push('DATABASE_URL=mongodb://localhost:27017/dbname');
      }
      envVars.push('');
    }

    if (specJson.features?.uploads) {
      envVars.push('# File Storage');
      envVars.push('AWS_ACCESS_KEY_ID=your-access-key');
      envVars.push('AWS_SECRET_ACCESS_KEY=your-secret-key');
      envVars.push('AWS_REGION=us-east-1');
      envVars.push('S3_BUCKET=your-bucket-name');
      envVars.push('');
    }

    if (specJson.features?.payments) {
      envVars.push('# Payment Processing');
      envVars.push('STRIPE_SECRET_KEY=sk_test_...');
      envVars.push('STRIPE_PUBLISHABLE_KEY=pk_test_...');
      envVars.push('STRIPE_WEBHOOK_SECRET=whsec_...');
      envVars.push('');
    }

    return envVars.join('\n');
  }

  async generateFrontendStructure(specJson) {
    const framework = specJson.stack?.frontend || 'svelte';
    const structure = {
      src: {
        lib: {
          components: [],
          stores: [],
          utils: []
        },
        routes: []
      },
      static: [],
      tests: []
    };

    if (framework === 'svelte') {
      structure.src.routes.push('+page.svelte', '+layout.svelte');
      structure.src.lib.components.push('Header.svelte', 'Footer.svelte');
      
      if (specJson.features?.auth) {
        structure.src.lib.components.push('LoginForm.svelte', 'RegisterForm.svelte');
        structure.src.routes.push('login/+page.svelte', 'register/+page.svelte');
      }
    } else if (framework === 'react') {
      structure.src.components = ['App.jsx', 'Header.jsx', 'Footer.jsx'];
      structure.src.pages = ['Home.jsx'];
      
      if (specJson.features?.auth) {
        structure.src.components.push('LoginForm.jsx', 'RegisterForm.jsx');
        structure.src.pages.push('Login.jsx', 'Register.jsx');
      }
    }

    return structure;
  }

  async generateFrontendPackageJson(specJson) {
    const framework = specJson.stack?.frontend || 'svelte';
    const packageJson = {
      name: `${specJson.projectName}-frontend`,
      version: '1.0.0',
      type: 'module',
      scripts: {},
      dependencies: {},
      devDependencies: {}
    };

    if (framework === 'svelte') {
      packageJson.scripts = {
        dev: 'vite dev',
        build: 'vite build',
        preview: 'vite preview',
        test: 'vitest run',
        'test:watch': 'vitest'
      };
      packageJson.dependencies = {
        'svelte': '^5.0.0'
      };
      packageJson.devDependencies = {
        '@sveltejs/kit': '^2.0.0',
        '@sveltejs/vite-plugin-svelte': '^4.0.0',
        'vite': '^5.0.0',
        'vitest': '^2.0.0'
      };
    } else if (framework === 'react') {
      packageJson.scripts = {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview',
        test: 'vitest run'
      };
      packageJson.dependencies = {
        'react': '^18.0.0',
        'react-dom': '^18.0.0'
      };
      packageJson.devDependencies = {
        '@vitejs/plugin-react': '^4.0.0',
        'vite': '^5.0.0',
        'vitest': '^2.0.0'
      };
    }

    // Add common dependencies
    if (specJson.features?.auth) {
      packageJson.dependencies['axios'] = '^1.6.0';
    }

    return packageJson;
  }

  async generateBackendStructure(specJson) {
    const structure = {
      routes: [],
      models: [],
      middleware: [],
      services: [],
      utils: [],
      config: [],
      tests: []
    };

    // Core files
    structure.routes.push('index.js', 'health.js');
    structure.config.push('database.js', 'server.js');
    structure.middleware.push('error-handler.js', 'logger.js');

    // Auth-related files
    if (specJson.features?.auth) {
      structure.routes.push('auth.js', 'users.js');
      structure.models.push('user.js');
      structure.middleware.push('auth.js');
      structure.services.push('auth.js');
      structure.utils.push('jwt.js', 'password.js');
    }

    // Upload-related files
    if (specJson.features?.uploads) {
      structure.routes.push('uploads.js');
      structure.models.push('upload.js');
      structure.middleware.push('upload.js');
      structure.services.push('storage.js');
    }

    // Payment-related files
    if (specJson.features?.payments) {
      structure.routes.push('payments.js', 'webhooks.js');
      structure.models.push('payment.js', 'subscription.js');
      structure.services.push('stripe.js');
    }

    return structure;
  }

  async generateBackendPackageJson(specJson) {
    const framework = specJson.stack?.backend || 'node';
    const packageJson = {
      name: `${specJson.projectName}-backend`,
      version: '1.0.0',
      type: 'module',
      scripts: {
        start: 'node app.js',
        dev: 'nodemon app.js',
        test: 'NODE_ENV=test jest',
        'test:watch': 'NODE_ENV=test jest --watch'
      },
      dependencies: {
        'dotenv': '^16.0.0',
        'cors': '^2.8.5'
      },
      devDependencies: {
        'nodemon': '^3.0.0',
        'jest': '^29.0.0'
      }
    };

    // Framework-specific dependencies
    if (framework === 'express' || framework === 'node') {
      packageJson.dependencies['express'] = '^4.18.0';
      packageJson.dependencies['helmet'] = '^7.0.0';
      packageJson.dependencies['express-rate-limit'] = '^7.0.0';
    } else if (framework === 'fastify') {
      packageJson.dependencies['fastify'] = '^4.25.0';
      packageJson.dependencies['@fastify/helmet'] = '^11.0.0';
      packageJson.dependencies['@fastify/rate-limit'] = '^9.0.0';
    }

    // Database dependencies
    if (specJson.stack?.database === 'postgres') {
      packageJson.dependencies['pg'] = '^8.11.0';
      packageJson.dependencies['pg-hstore'] = '^2.3.4';
    } else if (specJson.stack?.database === 'mysql') {
      packageJson.dependencies['mysql2'] = '^3.6.0';
    } else if (specJson.stack?.database === 'mongodb') {
      packageJson.dependencies['mongoose'] = '^8.0.0';
    }

    // Auth dependencies
    if (specJson.features?.auth) {
      packageJson.dependencies['jsonwebtoken'] = '^9.0.0';
      packageJson.dependencies['bcrypt'] = '^5.1.0';
    }

    // Upload dependencies
    if (specJson.features?.uploads) {
      packageJson.dependencies['multer'] = '^1.4.5-lts.1';
      packageJson.dependencies['@aws-sdk/client-s3'] = '^3.450.0';
    }

    // Payment dependencies
    if (specJson.features?.payments) {
      packageJson.dependencies['stripe'] = '^14.0.0';
    }

    return packageJson;
  }

  generateInfraStructure(specJson) {
    const structure = {
      docker: ['Dockerfile', 'docker-compose.yml', '.dockerignore'],
      scripts: ['deploy.sh', 'backup.sh'],
      terraform: []
    };

    if (specJson.envPrefs?.hosting === 'aws') {
      structure.terraform.push('main.tf', 'variables.tf', 'outputs.tf');
    }

    return structure;
  }

  async generateOpenAPIskeleton(specJson, tasks) {
    structuredLogger.info('Generating OpenAPI skeleton', {
      projectName: specJson.projectName,
      taskCount: tasks.length
    });
    
    const openApiSpec = {
      openapi: '3.0.0',
      info: {
        title: specJson.projectName || 'Generated API',
        version: '1.0.0',
        description: `API for ${specJson.projectName}`,
      },
      servers: [
        {
          url: 'http://localhost:3000/api',
          description: 'Development server'
        },
        {
          url: 'https://api.example.com',
          description: 'Production server'
        }
      ],
      paths: {},
      components: {
        schemas: {},
        securitySchemes: {},
        responses: {
          UnauthorizedError: {
            description: 'Authentication token is missing or invalid',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          },
          ValidationError: {
            description: 'Request validation failed',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                    details: { type: 'array', items: { type: 'object' } }
                  }
                }
              }
            }
          }
        }
      }
    };
    
    // Add authentication if required
    if (specJson.features?.auth) {
      openApiSpec.components.securitySchemes.bearerAuth = {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token obtained from /auth/login endpoint'
      };
    }
    
    // Use LLM to enhance API spec generation
    const llmEnhancedPaths = await this.generateAPIPathsWithLLM(specJson);
    
    // Generate paths based on features
    if (specJson.features?.auth) {
      openApiSpec.paths['/auth/login'] = {
        post: {
          summary: 'User login',
          tags: ['Authentication'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    email: { type: 'string', format: 'email', example: 'user@example.com' },
                    password: { type: 'string', minLength: 6, example: 'password123' }
                  },
                  required: ['email', 'password']
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Login successful',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                      user: { $ref: '#/components/schemas/User' }
                    }
                  }
                }
              }
            },
            '401': {
              $ref: '#/components/responses/UnauthorizedError'
            },
            '422': {
              $ref: '#/components/responses/ValidationError'
            }
          }
        }
      };
      
      openApiSpec.paths['/auth/register'] = {
        post: {
          summary: 'User registration',
          tags: ['Authentication'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    email: { type: 'string', format: 'email', example: 'newuser@example.com' },
                    password: { type: 'string', minLength: 6, example: 'securepass123' },
                    name: { type: 'string', example: 'John Doe' }
                  },
                  required: ['email', 'password', 'name']
                }
              }
            }
          },
          responses: {
            '201': {
              description: 'User created successfully',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/User'
                  }
                }
              }
            },
            '422': {
              $ref: '#/components/responses/ValidationError'
            }
          }
        }
      };

      openApiSpec.paths['/auth/me'] = {
        get: {
          summary: 'Get current user profile',
          tags: ['Authentication'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'User profile retrieved',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/User'
                  }
                }
              }
            },
            '401': {
              $ref: '#/components/responses/UnauthorizedError'
            }
          }
        }
      };
      
      // Add User schema
      openApiSpec.components.schemas.User = {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174000' },
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          name: { type: 'string', example: 'John Doe' },
          createdAt: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' },
          updatedAt: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00Z' }
        }
      };
    }
    
    // Add file upload endpoints if required
    if (specJson.features?.uploads) {
      openApiSpec.paths['/uploads'] = {
        post: {
          summary: 'Upload file',
          tags: ['Uploads'],
          security: specJson.features?.auth ? [{ bearerAuth: [] }] : [],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    file: {
                      type: 'string',
                      format: 'binary',
                      description: 'File to upload'
                    },
                    description: {
                      type: 'string',
                      description: 'Optional file description'
                    }
                  },
                  required: ['file']
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'File uploaded successfully',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Upload'
                  }
                }
              }
            },
            '401': {
              $ref: '#/components/responses/UnauthorizedError'
            },
            '422': {
              $ref: '#/components/responses/ValidationError'
            }
          }
        },
        get: {
          summary: 'List uploaded files',
          tags: ['Uploads'],
          security: specJson.features?.auth ? [{ bearerAuth: [] }] : [],
          parameters: [
            {
              name: 'page',
              in: 'query',
              schema: { type: 'integer', default: 1 },
              description: 'Page number'
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 20 },
              description: 'Items per page'
            }
          ],
          responses: {
            '200': {
              description: 'List of uploads',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Upload' }
                      },
                      pagination: {
                        type: 'object',
                        properties: {
                          page: { type: 'integer' },
                          limit: { type: 'integer' },
                          total: { type: 'integer' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      openApiSpec.components.schemas.Upload = {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          url: { type: 'string', format: 'uri', example: 'https://s3.amazonaws.com/bucket/file.jpg' },
          filename: { type: 'string', example: 'document.pdf' },
          originalName: { type: 'string', example: 'my-document.pdf' },
          mimeType: { type: 'string', example: 'application/pdf' },
          size: { type: 'number', example: 1024000 },
          description: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' }
        }
      };
    }

    // Add payment endpoints if required
    if (specJson.features?.payments) {
      openApiSpec.paths['/payments/checkout'] = {
        post: {
          summary: 'Create checkout session',
          tags: ['Payments'],
          security: specJson.features?.auth ? [{ bearerAuth: [] }] : [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    amount: { type: 'number', example: 1999 },
                    currency: { type: 'string', example: 'usd' },
                    description: { type: 'string', example: 'Product purchase' }
                  },
                  required: ['amount', 'currency']
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Checkout session created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      sessionId: { type: 'string' },
                      url: { type: 'string', format: 'uri' }
                    }
                  }
                }
              }
            }
          }
        }
      };

      openApiSpec.paths['/webhooks/stripe'] = {
        post: {
          summary: 'Stripe webhook handler',
          tags: ['Webhooks'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  description: 'Stripe webhook event'
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Webhook processed'
            }
          }
        }
      };
    }

    // Merge LLM-enhanced paths
    if (llmEnhancedPaths && Object.keys(llmEnhancedPaths).length > 0) {
      openApiSpec.paths = { ...openApiSpec.paths, ...llmEnhancedPaths };
    }
    
    return openApiSpec;
  }

  async generateAPIPathsWithLLM(specJson) {
    try {
      const prompt = `You are an API design expert. Generate additional OpenAPI 3.0 path definitions for this project:

Project: ${specJson.projectName}
Description: ${specJson.projectDescription || 'No description'}
Features: ${JSON.stringify(specJson.features)}

Generate OpenAPI path definitions in JSON format for any domain-specific endpoints this project might need.
Focus on CRUD operations and common use cases.
Include request/response schemas, authentication requirements, and example values.

Return ONLY valid JSON in this format:
{
  "/path": {
    "get": { ... },
    "post": { ... }
  }
}`;

      const modelRouter = await this.getModelRouter();
      const response = await modelRouter.routeTask({
        role: 'planner',
        complexity: 'medium',
        prompt,
        fallback: true,
        context: {
          projectId: specJson.projectId,
          userId: specJson.userId
        }
      });

      if (response.success && response.content) {
        try {
          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const paths = JSON.parse(jsonMatch[0]);
            return paths;
          }
        } catch (parseError) {
          structuredLogger.warn('Failed to parse LLM API paths', { error: parseError.message });
        }
      }

      return {};
    } catch (error) {
      structuredLogger.warn('Failed to generate API paths with LLM', { error: error.message });
      return {};
    }
  }

  async generateDatabaseSchema(specJson, tasks) {
    structuredLogger.info('Generating database schema', {
      projectName: specJson.projectName,
      database: specJson.stack?.database
    });
    
    const schema = {
      database: specJson.stack?.database || 'postgres',
      tables: [],
      relationships: [],
      indexes: [],
      migrations: [],
      seedData: []
    };
    
    // Generate User table if auth is required
    if (specJson.features?.auth) {
      schema.tables.push({
        name: 'users',
        columns: [
          { name: 'id', type: 'UUID', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'email', type: 'VARCHAR(255)', unique: true, notNull: true },
          { name: 'password_hash', type: 'VARCHAR(255)', notNull: true },
          { name: 'name', type: 'VARCHAR(255)', notNull: true },
          { name: 'role', type: 'VARCHAR(50)', default: "'user'", notNull: true },
          { name: 'email_verified', type: 'BOOLEAN', default: 'false' },
          { name: 'last_login', type: 'TIMESTAMP', nullable: true },
          { name: 'created_at', type: 'TIMESTAMP', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'TIMESTAMP', default: 'CURRENT_TIMESTAMP' }
        ]
      });
      
      schema.indexes.push({
        table: 'users',
        columns: ['email'],
        unique: true,
        name: 'idx_users_email'
      });

      schema.indexes.push({
        table: 'users',
        columns: ['role'],
        unique: false,
        name: 'idx_users_role'
      });

      // Add migration for users table
      schema.migrations.push({
        name: '001_create_users_table',
        up: this.generateMigrationSQL('users', schema.tables.find(t => t.name === 'users'), 'create'),
        down: 'DROP TABLE IF EXISTS users CASCADE;'
      });

      // Add seed data for users
      schema.seedData.push({
        table: 'users',
        data: [
          {
            email: 'admin@example.com',
            password_hash: '$2b$10$example_hash_here',
            name: 'Admin User',
            role: 'admin',
            email_verified: true
          },
          {
            email: 'user@example.com',
            password_hash: '$2b$10$example_hash_here',
            name: 'Test User',
            role: 'user',
            email_verified: true
          }
        ]
      });
    }
    
    // Generate file uploads table if uploads are required
    if (specJson.features?.uploads) {
      schema.tables.push({
        name: 'uploads',
        columns: [
          { name: 'id', type: 'UUID', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'filename', type: 'VARCHAR(255)', notNull: true },
          { name: 'original_name', type: 'VARCHAR(255)', notNull: true },
          { name: 'mime_type', type: 'VARCHAR(100)', notNull: true },
          { name: 'size', type: 'INTEGER', notNull: true },
          { name: 'url', type: 'TEXT', notNull: true },
          { name: 'description', type: 'TEXT', nullable: true },
          { name: 'user_id', type: 'UUID', references: 'users(id)', onDelete: 'CASCADE' },
          { name: 'created_at', type: 'TIMESTAMP', default: 'CURRENT_TIMESTAMP' }
        ]
      });
      
      if (specJson.features?.auth) {
        schema.relationships.push({
          from: 'uploads.user_id',
          to: 'users.id',
          type: 'many-to-one',
          onDelete: 'CASCADE'
        });

        schema.indexes.push({
          table: 'uploads',
          columns: ['user_id'],
          unique: false,
          name: 'idx_uploads_user_id'
        });
      }

      // Add migration for uploads table
      schema.migrations.push({
        name: '002_create_uploads_table',
        up: this.generateMigrationSQL('uploads', schema.tables.find(t => t.name === 'uploads'), 'create'),
        down: 'DROP TABLE IF EXISTS uploads CASCADE;'
      });
    }

    // Generate payments tables if payments are required
    if (specJson.features?.payments) {
      schema.tables.push({
        name: 'payments',
        columns: [
          { name: 'id', type: 'UUID', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'user_id', type: 'UUID', references: 'users(id)', onDelete: 'CASCADE' },
          { name: 'stripe_payment_id', type: 'VARCHAR(255)', unique: true },
          { name: 'amount', type: 'INTEGER', notNull: true },
          { name: 'currency', type: 'VARCHAR(3)', default: "'usd'" },
          { name: 'status', type: 'VARCHAR(50)', notNull: true },
          { name: 'description', type: 'TEXT', nullable: true },
          { name: 'metadata', type: 'JSONB', nullable: true },
          { name: 'created_at', type: 'TIMESTAMP', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'TIMESTAMP', default: 'CURRENT_TIMESTAMP' }
        ]
      });

      if (specJson.features?.auth) {
        schema.relationships.push({
          from: 'payments.user_id',
          to: 'users.id',
          type: 'many-to-one',
          onDelete: 'CASCADE'
        });

        schema.indexes.push({
          table: 'payments',
          columns: ['user_id'],
          unique: false,
          name: 'idx_payments_user_id'
        });
      }

      schema.indexes.push({
        table: 'payments',
        columns: ['stripe_payment_id'],
        unique: true,
        name: 'idx_payments_stripe_id'
      });

      schema.indexes.push({
        table: 'payments',
        columns: ['status'],
        unique: false,
        name: 'idx_payments_status'
      });

      // Add migration for payments table
      schema.migrations.push({
        name: '003_create_payments_table',
        up: this.generateMigrationSQL('payments', schema.tables.find(t => t.name === 'payments'), 'create'),
        down: 'DROP TABLE IF EXISTS payments CASCADE;'
      });
    }

    // Use LLM to suggest additional schema improvements
    const llmSchemaEnhancements = await this.enhanceSchemaWithLLM(specJson, schema);
    if (llmSchemaEnhancements) {
      schema.llmSuggestions = llmSchemaEnhancements;
    }
    
    return schema;
  }

  generateMigrationSQL(tableName, tableSchema, operation) {
    if (operation === 'create') {
      const columns = tableSchema.columns.map(col => {
        let sql = `  ${col.name} ${col.type}`;
        
        if (col.primaryKey) {
          sql += ' PRIMARY KEY';
        }
        if (col.unique && !col.primaryKey) {
          sql += ' UNIQUE';
        }
        if (col.notNull) {
          sql += ' NOT NULL';
        }
        if (col.default) {
          sql += ` DEFAULT ${col.default}`;
        }
        if (col.references) {
          const [refTable, refColumn] = col.references.split('(');
          sql += ` REFERENCES ${refTable}(${refColumn.replace(')', '')}`;
          if (col.onDelete) {
            sql += ` ON DELETE ${col.onDelete}`;
          }
          sql += ')';
        }
        
        return sql;
      }).join(',\n');

      return `CREATE TABLE IF NOT EXISTS ${tableName} (\n${columns}\n);`;
    }
    
    return '';
  }

  async enhanceSchemaWithLLM(specJson, schema) {
    try {
      const prompt = `You are a database design expert. Review this database schema and suggest improvements:

Project: ${specJson.projectName}
Database: ${schema.database}
Current Tables: ${schema.tables.map(t => t.name).join(', ')}

Schema Details:
${JSON.stringify(schema.tables, null, 2)}

Suggest:
1. Missing indexes for performance
2. Additional tables that might be needed
3. Data integrity constraints
4. Optimization opportunities

Respond in JSON format with suggestions.`;

      const modelRouter = await this.getModelRouter();
      const response = await modelRouter.routeTask({
        role: 'planner',
        complexity: 'medium',
        prompt,
        fallback: true,
        context: {
          projectId: specJson.projectId,
          userId: specJson.userId
        }
      });

      if (response.success && response.content) {
        try {
          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          }
        } catch (parseError) {
          structuredLogger.warn('Failed to parse LLM schema enhancements', { error: parseError.message });
        }
      }

      return null;
    } catch (error) {
      structuredLogger.warn('Failed to enhance schema with LLM', { error: error.message });
      return null;
    }
  }

  // Public API methods
  async planProject(specJson) {
    try {
      structuredLogger.info('Starting project planning', {
        projectName: specJson.projectName,
        correlationId: structuredLogger.getCorrelationId()
      });
      
      // Decompose spec into tasks
      const taskPlan = await this.decomposeSpec(specJson);
      
      // Generate file structure
      const fileStructure = await this.generateFileStructure(specJson, taskPlan.tasks);
      
      // Generate OpenAPI skeleton
      const openApiSkeleton = await this.generateOpenAPIskeleton(specJson, taskPlan.tasks);
      
      // Generate database schema
      const databaseSchema = await this.generateDatabaseSchema(specJson, taskPlan.tasks);
      
      const result = {
        ...taskPlan,
        fileStructure,
        openApiSkeleton,
        databaseSchema,
        projectName: specJson.projectName,
        specJson
      };
      
      structuredLogger.info('Project planning completed', {
        projectName: specJson.projectName,
        taskCount: taskPlan.tasks.length,
        milestoneCount: taskPlan.milestones.length,
        estimatedDuration: taskPlan.totalEstimation
      });
      return result;
      
    } catch (error) {
      console.error('Failed to plan project:', error);
      throw error;
    }
  }

  async addJobToQueue(projectId, specJson, userId, buildId = null) {
    try {
      const jobData = {
        projectId,
        specJson,
        userId,
        buildId: buildId || `build-${Date.now()}`,
        timestamp: new Date().toISOString()
      };
      
      const job = await jobProcessor.addJob('task-planning', 'plan-project', jobData);
      
      structuredLogger.info('Task planning job queued', {
        jobId: job.id,
        projectName: specJson.projectName
      });
      return {
        jobId: job.id,
        buildId: jobData.buildId,
        status: 'queued'
      };
      
    } catch (error) {
      console.error('Failed to add task planning job to queue:', error);
      throw error;
    }
  }
}

module.exports = new TaskPlanner();