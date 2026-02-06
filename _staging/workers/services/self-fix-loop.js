const { EventEmitter } = require('events');

class SelfFixLoop extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxIterations = options.maxIterations || 5;
    this.modelRouter = options.modelRouter; // Injected from main service
    this.activeFixSessions = new Map(); // jobId -> fix session
    this.fixHistory = new Map(); // jobId -> array of fix attempts
  }

  async initialize() {
    console.log('Self-fix loop service initialized');
  }

  async startFixLoop(jobId, testFailure, codeContext) {
    if (this.activeFixSessions.has(jobId)) {
      throw new Error(`Fix loop already active for job ${jobId}`);
    }

    const fixSession = {
      jobId,
      startedAt: new Date(),
      iteration: 0,
      maxIterations: this.maxIterations,
      status: 'running',
      testFailure,
      codeContext,
      attempts: [],
      finalResult: null
    };

    this.activeFixSessions.set(jobId, fixSession);
    this.emit('fixLoopStarted', { jobId, fixSession });

    console.log(`Starting self-fix loop for job ${jobId}`);

    try {
      const result = await this.executeFixLoop(fixSession);
      
      fixSession.status = 'completed';
      fixSession.completedAt = new Date();
      fixSession.finalResult = result;

      // Store in history
      this.fixHistory.set(jobId, fixSession);
      
      this.emit('fixLoopCompleted', { jobId, result });
      console.log(`Self-fix loop completed for job ${jobId} after ${fixSession.iteration} iterations`);

      return result;

    } catch (error) {
      fixSession.status = 'failed';
      fixSession.completedAt = new Date();
      fixSession.error = error.message;

      // Store in history
      this.fixHistory.set(jobId, fixSession);

      this.emit('fixLoopFailed', { jobId, error });
      console.error(`Self-fix loop failed for job ${jobId}:`, error);

      throw error;

    } finally {
      this.activeFixSessions.delete(jobId);
    }
  }

  async executeFixLoop(fixSession) {
    const { jobId, testFailure, codeContext } = fixSession;

    for (let iteration = 1; iteration <= fixSession.maxIterations; iteration++) {
      fixSession.iteration = iteration;
      
      console.log(`Self-fix iteration ${iteration}/${fixSession.maxIterations} for job ${jobId}`);
      
      this.emit('fixIteration', { jobId, iteration, maxIterations: fixSession.maxIterations });

      try {
        // Analyze the failure and generate a patch
        const patch = await this.generatePatch(testFailure, codeContext, fixSession.attempts);
        
        const attempt = {
          iteration,
          startedAt: new Date(),
          patch,
          status: 'applying'
        };

        fixSession.attempts.push(attempt);

        // Apply the patch
        const patchResult = await this.applyPatch(jobId, patch);
        attempt.patchResult = patchResult;
        attempt.status = 'testing';

        // Run tests to see if the fix worked
        const testResult = await this.runTests(jobId, codeContext);
        attempt.testResult = testResult;
        attempt.completedAt = new Date();

        if (testResult.success) {
          attempt.status = 'success';
          console.log(`Self-fix successful on iteration ${iteration} for job ${jobId}`);
          
          return {
            success: true,
            iteration,
            totalIterations: iteration,
            patch,
            testResult,
            fixedAt: new Date().toISOString()
          };
        } else {
          attempt.status = 'failed';
          // Update test failure for next iteration
          Object.assign(testFailure, testResult);
          
          console.log(`Self-fix iteration ${iteration} failed for job ${jobId}, trying next iteration`);
        }

      } catch (error) {
        const attempt = fixSession.attempts[fixSession.attempts.length - 1];
        if (attempt) {
          attempt.status = 'error';
          attempt.error = error.message;
          attempt.completedAt = new Date();
        }

        console.error(`Error in self-fix iteration ${iteration} for job ${jobId}:`, error);
        
        // Continue to next iteration unless it's the last one
        if (iteration === fixSession.maxIterations) {
          throw error;
        }
      }
    }

    // All iterations exhausted, escalate to human
    await this.escalateToHuman(jobId, fixSession);
    
    return {
      success: false,
      totalIterations: fixSession.maxIterations,
      escalated: true,
      escalatedAt: new Date().toISOString(),
      message: 'Self-fix loop exhausted, escalated to human review'
    };
  }

  async generatePatch(testFailure, codeContext, previousAttempts) {
    try {
      // Prepare context for the debugger agent
      const debugContext = {
        testFailure: {
          error: testFailure.error || testFailure.message,
          failingTests: testFailure.failingTests || [],
          logs: testFailure.logs || testFailure.output,
          exitCode: testFailure.exitCode
        },
        codeContext: {
          files: codeContext.files || [],
          dependencies: codeContext.dependencies || [],
          framework: codeContext.framework || 'unknown'
        },
        previousAttempts: previousAttempts.map(attempt => ({
          iteration: attempt.iteration,
          patch: attempt.patch,
          result: attempt.testResult,
          status: attempt.status
        }))
      };

      // Use ModelRouter to get patch from debugger agent
      if (!this.modelRouter) {
        throw new Error('ModelRouter not available for patch generation');
      }

      const prompt = this.buildDebuggerPrompt(debugContext);
      
      const patchResponse = await this.modelRouter.routeTask({
        role: 'debugger',
        complexity: 'high',
        prompt,
        fallback: true
      }, {
        task: 'generate_patch',
        iteration: previousAttempts.length + 1
      });

      if (!patchResponse.success) {
        throw new Error(`Debugger agent failed: ${patchResponse.error || 'Unknown error'}`);
      }

      const patch = this.parsePatchResponse(patchResponse);
      
      console.log(`Generated patch with ${patch.changes.length} changes using ${patchResponse.provider}/${patchResponse.model}`);
      
      // Add LLM metadata to patch
      patch.llmMetadata = {
        provider: patchResponse.provider,
        model: patchResponse.model,
        cost: patchResponse.cost,
        tokens: patchResponse.tokens,
        latency: patchResponse.latency
      };
      
      return patch;

    } catch (error) {
      console.error('Failed to generate patch:', error);
      throw new Error(`Patch generation failed: ${error.message}`);
    }
  }

  buildDebuggerPrompt(debugContext) {
    const { testFailure, codeContext, previousAttempts } = debugContext;

    let prompt = `You are a debugging agent. Analyze the test failure and generate a patch to fix the issue.

## Test Failure Analysis
Error: ${testFailure.error}
Exit Code: ${testFailure.exitCode}

## Failing Tests
${testFailure.failingTests.map(test => `- ${test}`).join('\n')}

## Logs
\`\`\`
${testFailure.logs}
\`\`\`

## Code Context
Framework: ${codeContext.framework}
Files: ${codeContext.files.length} files
Dependencies: ${Array.isArray(codeContext.dependencies) ? codeContext.dependencies.join(', ') : 'none'}

`;

    if (previousAttempts.length > 0) {
      prompt += `## Previous Fix Attempts
${previousAttempts.map(attempt => 
        `Iteration ${attempt.iteration}: ${attempt.status} - ${attempt.patch?.description || 'No description'}`
      ).join('\n')}

`;
    }

    prompt += `## Instructions
1. Analyze the error and identify the root cause
2. Generate a targeted patch that fixes the specific issue
3. Avoid making changes that could break other functionality
4. Focus on the minimal change needed to resolve the test failure
5. Provide clear explanation of the fix

## Response Format
Respond with a JSON object containing:
{
  "analysis": "Brief analysis of the issue",
  "changes": [
    {
      "file": "path/to/file.js",
      "action": "modify|create|delete",
      "content": "new file content or patch",
      "explanation": "why this change is needed"
    }
  ],
  "description": "Summary of what this patch does",
  "confidence": 0.8
}`;

    return prompt;
  }

  parsePatchResponse(response) {
    try {
      const content = response.content || response;
      
      // Try to parse as JSON first
      try {
        // Extract JSON from response if it's wrapped in text or markdown
        let jsonStr = content;
        
        // Try to find JSON in code blocks
        const jsonBlockMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (jsonBlockMatch) {
          jsonStr = jsonBlockMatch[1];
        } else {
          // Try to find JSON without code blocks
          const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonStr = jsonMatch[0];
          }
        }

        const patchData = JSON.parse(jsonStr);
        
        // Validate patch structure
        if (!patchData.changes || !Array.isArray(patchData.changes)) {
          throw new Error('Invalid patch format: missing changes array');
        }

        return {
          analysis: patchData.analysis || 'No analysis provided',
          changes: patchData.changes,
          description: patchData.description || 'No description provided',
          confidence: patchData.confidence || 0.5,
          generatedAt: new Date().toISOString()
        };
      } catch (jsonError) {
        // If JSON parsing fails, try to parse as git diff format
        console.log('JSON parsing failed, attempting to parse as git diff format');
        return this.parseGitDiffFormat(content);
      }

    } catch (error) {
      console.error('Failed to parse patch response:', error);
      throw new Error(`Invalid patch response format: ${error.message}`);
    }
  }

  /**
   * Parse git diff format patches
   * @param {string} content - Patch content in git diff format
   * @returns {Object} Parsed patch object
   */
  parseGitDiffFormat(content) {
    const changes = [];
    
    // Extract diff blocks
    const diffPattern = /diff --git a\/(.*?) b\/\1\n(?:.*?\n)*?@@.*?@@\n([\s\S]*?)(?=diff --git|$)/g;
    let match;
    
    while ((match = diffPattern.exec(content)) !== null) {
      const filePath = match[1];
      const diffContent = match[2];
      
      // Extract the actual changes
      const lines = diffContent.split('\n');
      const newContent = lines
        .filter(line => !line.startsWith('-') && !line.startsWith('@@'))
        .map(line => line.startsWith('+') ? line.substring(1) : line)
        .join('\n');
      
      changes.push({
        file: filePath,
        action: 'modify',
        content: newContent,
        explanation: `Applied git diff patch to ${filePath}`
      });
    }
    
    if (changes.length === 0) {
      throw new Error('No valid changes found in patch response');
    }
    
    return {
      analysis: 'Parsed from git diff format',
      changes,
      description: `Applied ${changes.length} file changes`,
      confidence: 0.7,
      generatedAt: new Date().toISOString()
    };
  }

  async applyPatch(jobId, patch) {
    try {
      console.log(`Applying patch for job ${jobId}: ${patch.description}`);

      const results = [];
      let totalChanges = 0;
      let successfulChanges = 0;

      for (const change of patch.changes) {
        totalChanges++;
        try {
          const result = await this.applyFileChange(jobId, change);
          successfulChanges++;
          results.push({
            file: change.file,
            action: change.action,
            success: true,
            result
          });
        } catch (error) {
          results.push({
            file: change.file,
            action: change.action,
            success: false,
            error: error.message
          });
        }
      }

      const allSuccessful = successfulChanges === totalChanges;
      
      console.log(`Applied patch for job ${jobId}: ${successfulChanges}/${totalChanges} changes successful`);

      // Track patch application metrics
      this.emit('patchApplied', {
        jobId,
        success: allSuccessful,
        totalChanges,
        successfulChanges,
        patch: {
          description: patch.description,
          confidence: patch.confidence,
          llmMetadata: patch.llmMetadata
        }
      });

      return {
        success: allSuccessful,
        totalChanges,
        successfulChanges,
        results,
        appliedAt: new Date().toISOString(),
        patchMetadata: {
          analysis: patch.analysis,
          confidence: patch.confidence,
          llmProvider: patch.llmMetadata?.provider,
          llmModel: patch.llmMetadata?.model
        }
      };

    } catch (error) {
      console.error(`Failed to apply patch for job ${jobId}:`, error);
      throw error;
    }
  }

  async applyFileChange(jobId, change) {
    // Apply file changes within the worker context
    console.log(`Applying ${change.action} to ${change.file} for job ${jobId}`);

    try {
      switch (change.action) {
        case 'create':
          return await this.createFile(jobId, change.file, change.content);
        case 'modify':
          return await this.modifyFile(jobId, change.file, change.content);
        case 'delete':
          return await this.deleteFile(jobId, change.file);
        default:
          throw new Error(`Unknown change action: ${change.action}`);
      }
    } catch (error) {
      console.error(`Failed to apply ${change.action} to ${change.file}:`, error);
      throw error;
    }
  }

  async createFile(jobId, filePath, content) {
    // In a real implementation with Docker workers, this would:
    // 1. Get the worker container for this job
    // 2. Execute: docker exec <container> sh -c "mkdir -p $(dirname <filePath>) && cat > <filePath> << 'EOF'\n<content>\nEOF"
    // 3. Verify the file was created
    
    // For now, emit event for worker pool to handle
    this.emit('fileChange', {
      jobId,
      action: 'create',
      file: filePath,
      content
    });
    
    return {
      action: 'create',
      file: filePath,
      size: content ? content.length : 0,
      created: true,
      timestamp: new Date().toISOString()
    };
  }

  async modifyFile(jobId, filePath, content) {
    // In a real implementation with Docker workers, this would:
    // 1. Get the worker container for this job
    // 2. Execute: docker exec <container> sh -c "cat > <filePath> << 'EOF'\n<content>\nEOF"
    // 3. Verify the file was modified
    
    // For now, emit event for worker pool to handle
    this.emit('fileChange', {
      jobId,
      action: 'modify',
      file: filePath,
      content
    });
    
    return {
      action: 'modify',
      file: filePath,
      size: content ? content.length : 0,
      modified: true,
      timestamp: new Date().toISOString()
    };
  }

  async deleteFile(jobId, filePath) {
    // In a real implementation with Docker workers, this would:
    // 1. Get the worker container for this job
    // 2. Execute: docker exec <container> rm -f <filePath>
    // 3. Verify the file was deleted
    
    // For now, emit event for worker pool to handle
    this.emit('fileChange', {
      jobId,
      action: 'delete',
      file: filePath
    });
    
    return {
      action: 'delete',
      file: filePath,
      deleted: true,
      timestamp: new Date().toISOString()
    };
  }

  async runTests(jobId, codeContext) {
    try {
      console.log(`Running tests for job ${jobId}`);

      const testCommands = this.getTestCommands(codeContext);
      const startTime = Date.now();
      
      const testResult = await this.executeTestCommands(jobId, testCommands, codeContext);
      
      const executionTime = Date.now() - startTime;
      testResult.executionTime = executionTime;

      // Emit test execution event
      this.emit('testsExecuted', {
        jobId,
        success: testResult.success,
        executionTime,
        testsRun: testResult.testsRun,
        testsPassed: testResult.testsPassed,
        testsFailed: testResult.testsFailed
      });

      return testResult;

    } catch (error) {
      console.error(`Failed to run tests for job ${jobId}:`, error);
      return {
        success: false,
        error: error.message,
        exitCode: 1,
        output: error.toString(),
        testsRun: 0,
        testsPassed: 0,
        testsFailed: 0
      };
    }
  }

  getTestCommands(codeContext) {
    const { framework, testCommands } = codeContext;

    // Use provided test commands if available
    if (testCommands && Array.isArray(testCommands) && testCommands.length > 0) {
      return testCommands;
    }

    // Otherwise, infer from framework
    switch (framework) {
      case 'jest':
        return ['pnpm install --frozen-lockfile', 'pnpm test'];
      case 'pytest':
        return ['pip install -r requirements.txt', 'pytest -v'];
      case 'go':
      case 'testing':
        return ['go mod download', 'go test -v ./...'];
      case 'vitest':
        return ['pnpm install --frozen-lockfile', 'pnpm test:run'];
      default:
        return ['pnpm test']; // default
    }
  }

  async executeTestCommands(jobId, commands, codeContext) {
    // In a real implementation with Docker workers, this would:
    // 1. Get the worker container for this job
    // 2. Execute each command in sequence: docker exec <container> <command>
    // 3. Capture stdout/stderr
    // 4. Parse test output to extract results
    // 5. Return structured test results
    
    console.log(`Executing test commands for job ${jobId}:`, commands);

    // Emit event for worker pool to handle actual execution
    this.emit('executeTests', {
      jobId,
      commands,
      framework: codeContext.framework
    });

    // For now, simulate test execution
    // In production, this would wait for actual test results from worker
    const success = Math.random() > 0.3; // 70% success rate for simulation

    if (success) {
      return {
        success: true,
        exitCode: 0,
        output: this.generateMockTestOutput(codeContext.framework, true),
        testsRun: 5,
        testsPassed: 5,
        testsFailed: 0,
        duration: Math.floor(Math.random() * 3000) + 1000
      };
    } else {
      return {
        success: false,
        exitCode: 1,
        output: this.generateMockTestOutput(codeContext.framework, false),
        testsRun: 5,
        testsPassed: 4,
        testsFailed: 1,
        failingTests: ['should validate user input'],
        error: 'Test assertion failed',
        duration: Math.floor(Math.random() * 3000) + 1000
      };
    }
  }

  /**
   * Generate mock test output for simulation
   * @param {string} framework - Test framework
   * @param {boolean} success - Whether tests passed
   * @returns {string} Mock test output
   */
  generateMockTestOutput(framework, success) {
    if (success) {
      switch (framework) {
        case 'jest':
          return `PASS  src/app.test.js
  ✓ should create app instance (15ms)
  ✓ should handle requests (23ms)
  ✓ should validate input (12ms)
  ✓ should return correct response (18ms)
  ✓ should handle errors (10ms)

Tests: 5 passed, 5 total
Time:  2.345s`;
        
        case 'pytest':
          return `============================= test session starts ==============================
collected 5 items

test_app.py::test_create_app PASSED                                      [ 20%]
test_app.py::test_handle_requests PASSED                                 [ 40%]
test_app.py::test_validate_input PASSED                                  [ 60%]
test_app.py::test_correct_response PASSED                                [ 80%]
test_app.py::test_handle_errors PASSED                                   [100%]

============================== 5 passed in 2.34s ===============================`;
        
        default:
          return 'All tests passed successfully';
      }
    } else {
      switch (framework) {
        case 'jest':
          return `FAIL  src/app.test.js
  ✓ should create app instance (15ms)
  ✓ should handle requests (23ms)
  ✗ should validate user input (12ms)
  ✓ should return correct response (18ms)
  ✓ should handle errors (10ms)

  ● should validate user input

    expect(received).toBeTruthy()

    Expected value to be truthy, instead received
      null

      at Object.<anonymous> (src/app.test.js:45:23)

Tests: 1 failed, 4 passed, 5 total
Time:  2.345s`;
        
        case 'pytest':
          return `============================= test session starts ==============================
collected 5 items

test_app.py::test_create_app PASSED                                      [ 20%]
test_app.py::test_handle_requests PASSED                                 [ 40%]
test_app.py::test_validate_input FAILED                                  [ 60%]
test_app.py::test_correct_response PASSED                                [ 80%]
test_app.py::test_handle_errors PASSED                                   [100%]

=================================== FAILURES ===================================
___________________________ test_validate_input ________________________________

    def test_validate_input():
>       assert validate_input(None) is not None
E       AssertionError: assert None is not None

test_app.py:45: AssertionError
=========================== 1 failed, 4 passed in 2.34s ========================`;
        
        default:
          return 'Test failed: Expected value to be truthy';
      }
    }
  }

  async escalateToHuman(jobId, fixSession) {
    try {
      // Prepare comprehensive escalation report
      const escalation = {
        jobId,
        escalatedAt: new Date().toISOString(),
        reason: 'self_fix_exhausted',
        iterations: fixSession.iteration,
        maxIterations: fixSession.maxIterations,
        status: 'pending_human_review',
        
        // Original failure details
        originalFailure: {
          error: fixSession.testFailure.error,
          exitCode: fixSession.testFailure.exitCode,
          output: fixSession.testFailure.output,
          failingTests: fixSession.testFailure.failingTests
        },
        
        // All fix attempts with details
        attempts: fixSession.attempts.map(attempt => ({
          iteration: attempt.iteration,
          startedAt: attempt.startedAt,
          completedAt: attempt.completedAt,
          status: attempt.status,
          patch: {
            description: attempt.patch?.description,
            confidence: attempt.patch?.confidence,
            changesCount: attempt.patch?.changes?.length,
            llmProvider: attempt.patch?.llmMetadata?.provider,
            llmModel: attempt.patch?.llmMetadata?.model,
            llmCost: attempt.patch?.llmMetadata?.cost
          },
          patchResult: {
            success: attempt.patchResult?.success,
            totalChanges: attempt.patchResult?.totalChanges,
            successfulChanges: attempt.patchResult?.successfulChanges
          },
          testResult: {
            success: attempt.testResult?.success,
            exitCode: attempt.testResult?.exitCode,
            testsRun: attempt.testResult?.testsRun,
            testsPassed: attempt.testResult?.testsPassed,
            testsFailed: attempt.testResult?.testsFailed
          },
          error: attempt.error
        })),
        
        // Summary statistics
        summary: {
          totalAttempts: fixSession.attempts.length,
          totalCost: fixSession.attempts.reduce((sum, a) => 
            sum + (a.patch?.llmMetadata?.cost || 0), 0),
          totalDuration: fixSession.attempts.length > 0 ? 
            new Date(fixSession.attempts[fixSession.attempts.length - 1].completedAt) - 
            new Date(fixSession.attempts[0].startedAt) : 0,
          patchesApplied: fixSession.attempts.filter(a => 
            a.patchResult?.success).length,
          uniqueErrors: [...new Set(fixSession.attempts.map(a => 
            a.testResult?.error || a.error).filter(Boolean))]
        },
        
        // Code context for reference
        codeContext: {
          framework: fixSession.codeContext?.framework,
          filesCount: fixSession.codeContext?.files?.length || 0,
          dependencies: fixSession.codeContext?.dependencies
        }
      };

      console.log(`🚨 Escalating job ${jobId} to human review after ${escalation.iterations} failed iterations`);
      console.log(`   Total cost: $${escalation.summary.totalCost.toFixed(4)}`);
      console.log(`   Duration: ${Math.round(escalation.summary.totalDuration / 1000)}s`);
      
      // Emit escalation event for monitoring and notifications
      this.emit('escalatedToHuman', { jobId, escalation });

      // Store escalation in memory for retrieval
      if (!this.escalations) {
        this.escalations = new Map();
      }
      this.escalations.set(jobId, escalation);

      // In a real implementation, this would also:
      // 1. Store escalation in database for persistence
      // 2. Send email notification to administrators
      // 3. Create Slack/Discord notification
      // 4. Create GitHub issue if repository is configured
      // 5. Update job status in database to 'escalated'
      // 6. Trigger webhook for external systems

      return escalation;

    } catch (error) {
      console.error(`Failed to escalate job ${jobId} to human:`, error);
      
      // Even if escalation fails, emit event so it's not lost
      this.emit('escalationFailed', { 
        jobId, 
        error: error.message,
        fixSession: {
          iterations: fixSession.iteration,
          status: fixSession.status
        }
      });
      
      throw error;
    }
  }

  /**
   * Get escalation details for a job
   * @param {string} jobId - Job ID
   * @returns {Object|null} Escalation details or null if not found
   */
  getEscalation(jobId) {
    return this.escalations?.get(jobId) || null;
  }

  /**
   * Get all escalations
   * @returns {Array<Object>} Array of all escalations
   */
  getAllEscalations() {
    if (!this.escalations) {
      return [];
    }
    
    return Array.from(this.escalations.entries()).map(([jobId, escalation]) => ({
      jobId,
      ...escalation
    }));
  }

  /**
   * Resolve an escalation (called when human fixes the issue)
   * @param {string} jobId - Job ID
   * @param {Object} resolution - Resolution details
   * @returns {Object} Updated escalation
   */
  async resolveEscalation(jobId, resolution) {
    const escalation = this.getEscalation(jobId);
    
    if (!escalation) {
      throw new Error(`No escalation found for job ${jobId}`);
    }
    
    escalation.status = 'resolved';
    escalation.resolvedAt = new Date().toISOString();
    escalation.resolution = {
      resolvedBy: resolution.resolvedBy || 'unknown',
      solution: resolution.solution,
      notes: resolution.notes,
      timeToResolve: new Date(escalation.resolvedAt) - new Date(escalation.escalatedAt)
    };
    
    this.emit('escalationResolved', { jobId, escalation });
    
    console.log(`✅ Escalation resolved for job ${jobId} by ${resolution.resolvedBy}`);
    
    return escalation;
  }

  getFixSession(jobId) {
    return this.activeFixSessions.get(jobId) || this.fixHistory.get(jobId);
  }

  getActiveFixSessions() {
    const sessions = [];
    for (const [jobId, session] of this.activeFixSessions) {
      sessions.push({
        jobId,
        status: session.status,
        iteration: session.iteration,
        maxIterations: session.maxIterations,
        startedAt: session.startedAt
      });
    }
    return sessions;
  }

  getFixHistory(jobId) {
    return this.fixHistory.get(jobId);
  }

  getFixStats() {
    const stats = {
      activeSessions: this.activeFixSessions.size,
      totalSessions: this.fixHistory.size,
      successfulFixes: 0,
      failedFixes: 0,
      escalatedFixes: 0,
      averageIterations: 0
    };

    let totalIterations = 0;
    let sessionCount = 0;

    for (const session of this.fixHistory.values()) {
      sessionCount++;
      totalIterations += session.iteration;

      if (session.finalResult?.success) {
        stats.successfulFixes++;
      } else if (session.finalResult?.escalated) {
        stats.escalatedFixes++;
      } else {
        stats.failedFixes++;
      }
    }

    if (sessionCount > 0) {
      stats.averageIterations = Math.round((totalIterations / sessionCount) * 100) / 100;
    }

    return stats;
  }

  async shutdown() {
    console.log('Shutting down self-fix loop service...');

    // Wait for active sessions to complete or timeout
    const activeSessionIds = Array.from(this.activeFixSessions.keys());
    if (activeSessionIds.length > 0) {
      console.log(`Waiting for ${activeSessionIds.length} active fix sessions to complete...`);
      
      // Give sessions 30 seconds to complete gracefully
      await new Promise(resolve => setTimeout(resolve, 30000));
    }

    this.activeFixSessions.clear();
    this.fixHistory.clear();

    console.log('Self-fix loop service shutdown complete');
  }
}

module.exports = SelfFixLoop;