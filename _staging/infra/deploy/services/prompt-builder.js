/**
 * PromptBuilder Service
 * 
 * Builds context-aware prompts for different AI agent roles.
 * Generates prompts for code generation, debugging, and other tasks.
 * 
 * Requirements: 3.1, 4.2
 */

class PromptBuilder {
  constructor() {
    this.templates = {
      coder: this._getCoderTemplate(),
      debugger: this._getDebuggerTemplate(),
      planner: this._getPlannerTemplate(),
      reviewer: this._getReviewerTemplate(),
      tester: this._getTesterTemplate()
    };
  }

  /**
   * Build code generation prompt
   * Creates detailed prompt for generating production-ready code
   * 
   * @param {Object} task - Task object with requirements and context
   * @param {Object} specJson - Project specification
   * @returns {string} Formatted prompt for code generation
   */
  buildCodePrompt(task, specJson) {
    const template = this.templates.coder;
    
    const context = {
      projectName: specJson.projectName || 'Generated Application',
      stack: this._formatStack(specJson.stack),
      features: this._formatFeatures(specJson.features),
      taskName: task.name || 'Code Generation',
      requirements: this._formatRequirements(task.requirements),
      outputs: this._formatOutputs(task.outputs),
      dependencies: this._formatDependencies(task.context?.dependencies),
      framework: task.context?.framework || 'Express',
      additionalContext: this._formatAdditionalContext(task.context)
    };
    
    return this._interpolate(template, context);
  }

  /**
   * Build debugging prompt
   * Creates prompt for analyzing errors and generating fixes
   * 
   * @param {Object} error - Error object with message and stack
   * @param {string|Object} code - Current code or file contents
   * @param {string} testOutput - Test execution output
   * @param {Object} options - Additional options (iteration, context, etc.)
   * @returns {string} Formatted prompt for debugging
   */
  buildDebugPrompt(error, code, testOutput, options = {}) {
    const template = this.templates.debugger;
    
    const context = {
      errorMessage: error.message || 'Unknown error',
      errorStack: error.stack || 'No stack trace available',
      testOutput: this._formatTestOutput(testOutput),
      code: this._formatCode(code),
      iteration: options.iteration || 1,
      previousAttempts: this._formatPreviousAttempts(options.previousAttempts),
      hints: this._formatHints(options.hints)
    };
    
    return this._interpolate(template, context);
  }

  /**
   * Build planning prompt
   * Creates prompt for task decomposition and planning
   * 
   * @param {Object} specJson - Project specification
   * @returns {string} Formatted prompt for planning
   */
  buildPlanningPrompt(specJson) {
    const template = this.templates.planner;
    
    const context = {
      projectName: specJson.projectName || 'New Project',
      description: specJson.description || 'No description provided',
      stack: this._formatStack(specJson.stack),
      features: this._formatFeatures(specJson.features),
      constraints: this._formatConstraints(specJson.constraints),
      complexity: specJson.complexity || 'medium'
    };
    
    return this._interpolate(template, context);
  }

  /**
   * Build review prompt
   * Creates prompt for code review and quality checks
   * 
   * @param {string|Object} code - Code to review
   * @param {Object} options - Review options (focus areas, standards, etc.)
   * @returns {string} Formatted prompt for code review
   */
  buildReviewPrompt(code, options = {}) {
    const template = this.templates.reviewer;
    
    const context = {
      code: this._formatCode(code),
      focusAreas: this._formatFocusAreas(options.focusAreas),
      standards: this._formatStandards(options.standards),
      language: options.language || 'javascript'
    };
    
    return this._interpolate(template, context);
  }

  /**
   * Build test generation prompt
   * Creates prompt for generating test cases
   * 
   * @param {string|Object} code - Code to test
   * @param {Object} options - Test options (framework, coverage, etc.)
   * @returns {string} Formatted prompt for test generation
   */
  buildTestPrompt(code, options = {}) {
    const template = this.templates.tester;
    
    const context = {
      code: this._formatCode(code),
      framework: options.framework || 'jest',
      testType: options.testType || 'unit',
      coverage: options.coverage || 'basic'
    };
    
    return this._interpolate(template, context);
  }

  // Template definitions

  _getCoderTemplate() {
    return `You are an expert software engineer specializing in {{framework}} development.

Project: {{projectName}}
Stack: {{stack}}
Features: {{features}}

Task: {{taskName}}
Requirements: {{requirements}}

Generate the following files:
{{outputs}}

Dependencies to include:
{{dependencies}}

{{additionalContext}}

Output format:
\`\`\`filename:path/to/file.js
// file content here
\`\`\`

Generate complete, production-ready code with:
- Proper error handling
- Input validation
- Security best practices
- Clear comments
- Modern syntax
- Consistent formatting

Ensure all files are complete and can be used immediately without modification.`;
  }

  _getDebuggerTemplate() {
    return `You are a debugging expert. Analyze and fix the following error.

Iteration: {{iteration}}

Error: {{errorMessage}}
Stack Trace:
{{errorStack}}

Test Output:
{{testOutput}}

Current Code:
{{code}}

{{previousAttempts}}
{{hints}}

Generate a git patch to fix this error. Output format:
\`\`\`patch
diff --git a/file.js b/file.js
--- a/file.js
+++ b/file.js
@@ -10,7 +10,7 @@
-  old line
+  new line
\`\`\`

Provide a clear explanation of:
1. Root cause of the error
2. Why your fix resolves it
3. Any potential side effects

Focus on minimal, targeted changes that fix the specific error.`;
  }

  _getPlannerTemplate() {
    return `You are a technical architect. Break down this project into concrete implementation tasks.

Project: {{projectName}}
Description: {{description}}
Stack: {{stack}}
Features: {{features}}
Constraints: {{constraints}}
Complexity: {{complexity}}

Generate a detailed task breakdown with:
1. Task name and description
2. Estimated time (in minutes)
3. Dependencies on other tasks
4. Required files/outputs
5. Agent role (coder, tester, deployer, etc.)

Output as JSON:
\`\`\`json
{
  "tasks": [
    {
      "id": 1,
      "name": "Task name",
      "description": "Detailed description",
      "agentRole": "coder",
      "estimatedTime": 300,
      "dependencies": [],
      "outputs": ["file1.js", "file2.js"],
      "requirements": ["requirement 1", "requirement 2"]
    }
  ],
  "milestones": [
    {
      "name": "Milestone 1",
      "tasks": [1, 2, 3]
    }
  ]
}
\`\`\`

Ensure tasks are:
- Concrete and actionable
- Properly ordered with dependencies
- Realistic in time estimates
- Complete (cover all features)`;
  }

  _getReviewerTemplate() {
    return `You are a code review expert. Review the following code for quality and best practices.

Language: {{language}}
Focus Areas: {{focusAreas}}
Standards: {{standards}}

Code:
{{code}}

Provide a detailed review covering:
1. Code quality and readability
2. Security vulnerabilities
3. Performance issues
4. Best practice violations
5. Potential bugs
6. Suggested improvements

Output as JSON:
\`\`\`json
{
  "issues": [
    {
      "severity": "high|medium|low",
      "category": "security|performance|quality|bug",
      "line": 10,
      "description": "Issue description",
      "suggestion": "How to fix"
    }
  ],
  "summary": "Overall assessment",
  "score": 85
}
\`\`\``;
  }

  _getTesterTemplate() {
    return `You are a test engineer. Generate comprehensive tests for the following code.

Framework: {{framework}}
Test Type: {{testType}}
Coverage: {{coverage}}

Code:
{{code}}

Generate tests that cover:
1. Happy path scenarios
2. Edge cases
3. Error conditions
4. Boundary values

Output format:
\`\`\`filename:path/to/test.js
// test content here
\`\`\`

Ensure tests are:
- Clear and descriptive
- Independent and isolated
- Fast and reliable
- Well-organized`;
  }

  // Formatting helpers

  _formatStack(stack) {
    if (!stack) return 'Not specified';
    if (typeof stack === 'string') return stack;
    
    const parts = [];
    if (stack.frontend) parts.push(`Frontend: ${stack.frontend}`);
    if (stack.backend) parts.push(`Backend: ${stack.backend}`);
    if (stack.database) parts.push(`Database: ${stack.database}`);
    
    return parts.join(', ') || 'Not specified';
  }

  _formatFeatures(features) {
    if (!features) return 'None specified';
    if (typeof features === 'string') return features;
    if (Array.isArray(features)) return features.join(', ');
    
    return Object.keys(features).filter(k => features[k]).join(', ') || 'None specified';
  }

  _formatRequirements(requirements) {
    if (!requirements) return 'None specified';
    if (typeof requirements === 'string') return requirements;
    if (Array.isArray(requirements)) return requirements.map((r, i) => `${i + 1}. ${r}`).join('\n');
    
    return 'None specified';
  }

  _formatOutputs(outputs) {
    if (!outputs) return 'Not specified';
    if (Array.isArray(outputs)) return outputs.map(o => `- ${o}`).join('\n');
    
    return `- ${outputs}`;
  }

  _formatDependencies(dependencies) {
    if (!dependencies) return 'None';
    if (Array.isArray(dependencies)) return dependencies.join(', ');
    
    return dependencies;
  }

  _formatAdditionalContext(context) {
    if (!context) return '';
    
    const parts = [];
    
    if (context.authentication) {
      parts.push(`Authentication: ${context.authentication}`);
    }
    
    if (context.database) {
      parts.push(`Database: ${context.database}`);
    }
    
    if (context.apiStyle) {
      parts.push(`API Style: ${context.apiStyle}`);
    }
    
    if (context.notes) {
      parts.push(`Additional Notes: ${context.notes}`);
    }
    
    return parts.length > 0 ? '\nAdditional Context:\n' + parts.join('\n') : '';
  }

  _formatTestOutput(output) {
    if (!output) return 'No test output available';
    if (typeof output === 'string') return output;
    
    return JSON.stringify(output, null, 2);
  }

  _formatCode(code) {
    if (!code) return 'No code provided';
    if (typeof code === 'string') return code;
    
    // If code is an object with file paths
    if (typeof code === 'object') {
      return Object.entries(code)
        .map(([path, content]) => `// File: ${path}\n${content}`)
        .join('\n\n---\n\n');
    }
    
    return JSON.stringify(code, null, 2);
  }

  _formatPreviousAttempts(attempts) {
    if (!attempts || !Array.isArray(attempts) || attempts.length === 0) {
      return '';
    }
    
    return '\nPrevious Fix Attempts:\n' + 
      attempts.map((a, i) => `Attempt ${i + 1}: ${a.description || 'No description'}\nResult: ${a.result || 'Failed'}`).join('\n\n');
  }

  _formatHints(hints) {
    if (!hints) return '';
    if (typeof hints === 'string') return `\nHints: ${hints}`;
    if (Array.isArray(hints)) return `\nHints:\n${hints.map(h => `- ${h}`).join('\n')}`;
    
    return '';
  }

  _formatConstraints(constraints) {
    if (!constraints) return 'None specified';
    if (typeof constraints === 'string') return constraints;
    if (Array.isArray(constraints)) return constraints.join(', ');
    
    return Object.entries(constraints)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ') || 'None specified';
  }

  _formatFocusAreas(areas) {
    if (!areas) return 'General review';
    if (Array.isArray(areas)) return areas.join(', ');
    
    return areas;
  }

  _formatStandards(standards) {
    if (!standards) return 'Industry best practices';
    if (Array.isArray(standards)) return standards.join(', ');
    
    return standards;
  }

  _interpolate(template, context) {
    let result = template;
    
    for (const [key, value] of Object.entries(context)) {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(placeholder, value || '');
    }
    
    return result;
  }
}

module.exports = PromptBuilder;
