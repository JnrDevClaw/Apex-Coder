#!/usr/bin/env node

/**
 * Docker Worker Script
 * Executes code generation, testing, and build tasks inside sandboxed containers
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

class DockerWorker {
  constructor() {
    this.workerId = process.env.WORKER_ID;
    this.jobId = process.env.JOB_ID;
    this.projectId = process.env.PROJECT_ID;
    this.buildId = process.env.BUILD_ID;
    this.timeout = parseInt(process.env.WORKER_TIMEOUT) || 600000; // 10 minutes
    
    this.workspaceDir = '/workspace';
    this.artifactsDir = '/artifacts';
    this.logsDir = '/logs';
    
    this.startTime = Date.now();
    this.logs = [];
  }

  async initialize() {
    this.log('info', `Worker ${this.workerId} initializing for job ${this.jobId}`);
    
    // Set up timeout
    setTimeout(() => {
      this.log('error', 'Worker timeout reached, terminating');
      process.exit(124); // Timeout exit code
    }, this.timeout);

    // Load job data
    try {
      const jobDataPath = path.join(this.workspaceDir, 'job-data.json');
      const jobDataContent = await fs.readFile(jobDataPath, 'utf8');
      this.jobData = JSON.parse(jobDataContent);
      
      this.log('info', `Loaded job data: ${this.jobData.type} task`);
    } catch (error) {
      this.log('error', `Failed to load job data: ${error.message}`);
      process.exit(1);
    }
  }

  log(level, message, metadata = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      workerId: this.workerId,
      jobId: this.jobId,
      metadata
    };
    
    this.logs.push(logEntry);
    console.log(`[${level.toUpperCase()}] ${message}`);
    
    // Write to log file
    const logLine = JSON.stringify(logEntry) + '\n';
    fs.appendFile(path.join(this.logsDir, 'worker.log'), logLine).catch(() => {});
  }

  async executeTask() {
    const { type } = this.jobData;
    
    this.log('info', `Executing ${type} task`);
    
    try {
      let result;
      
      switch (type) {
        case 'code-generation':
          result = await this.executeCodeGeneration();
          break;
        case 'testing':
          result = await this.executeTesting();
          break;
        case 'build':
          result = await this.executeBuild();
          break;
        case 'deployment':
          result = await this.executeDeployment();
          break;
        default:
          throw new Error(`Unknown task type: ${type}`);
      }
      
      await this.saveResult(result);
      this.log('info', 'Task completed successfully');
      
      return result;
      
    } catch (error) {
      this.log('error', `Task failed: ${error.message}`, { stack: error.stack });
      await this.saveResult({
        success: false,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async executeCodeGeneration() {
    const { instructions, templates, dependencies } = this.jobData;
    
    this.log('info', 'Starting code generation');
    
    // Install dependencies first
    if (dependencies && dependencies.runtime.length > 0) {
      await this.installDependencies(dependencies);
    }
    
    // Generate code based on instructions
    const generatedFiles = await this.generateCode(instructions, templates);
    
    // Save generated files
    await this.saveGeneratedFiles(generatedFiles);
    
    return {
      success: true,
      generatedFiles,
      timestamp: new Date().toISOString()
    };
  }

  async executeTesting() {
    const { testCommands, testFramework } = this.jobData;
    
    this.log('info', `Running tests with ${testFramework}`);
    
    const results = [];
    
    for (const command of testCommands) {
      const result = await this.runCommand(command);
      results.push(result);
      
      if (result.exitCode !== 0) {
        return {
          success: false,
          testResults: results,
          error: 'Tests failed',
          exitCode: result.exitCode,
          output: result.output
        };
      }
    }
    
    return {
      success: true,
      testResults: results,
      timestamp: new Date().toISOString()
    };
  }

  async executeBuild() {
    const { buildCommands, buildTarget } = this.jobData;
    
    this.log('info', `Building for target: ${buildTarget}`);
    
    const results = [];
    
    for (const command of buildCommands) {
      const result = await this.runCommand(command);
      results.push(result);
      
      if (result.exitCode !== 0) {
        return {
          success: false,
          buildResults: results,
          error: 'Build failed',
          exitCode: result.exitCode,
          output: result.output
        };
      }
    }
    
    // Create build artifacts
    await this.createBuildArtifacts();
    
    return {
      success: true,
      buildResults: results,
      timestamp: new Date().toISOString()
    };
  }

  async executeDeployment() {
    const { deployTarget, environment } = this.jobData;
    
    this.log('info', `Deploying to ${deployTarget} (${environment})`);
    
    // Deployment logic would go here
    // For now, just simulate deployment
    
    return {
      success: true,
      deploymentId: `deploy-${Date.now()}`,
      endpoint: `https://example.com`,
      timestamp: new Date().toISOString()
    };
  }

  async installDependencies(dependencies) {
    this.log('info', `Installing ${dependencies.runtime.length} runtime dependencies`);
    
    // Detect package manager and install dependencies
    const packageManager = await this.detectPackageManager();
    
    if (packageManager === 'pnpm') {
      await this.runCommand('pnpm install');
    } else if (packageManager === 'npm') {
      await this.runCommand('npm install');
    } else if (packageManager === 'pip') {
      await this.runCommand('pip install -r requirements.txt');
    } else if (packageManager === 'go') {
      await this.runCommand('go mod tidy');
    }
  }

  async detectPackageManager() {
    try {
      await fs.access(path.join(this.workspaceDir, 'package.json'));
      return 'pnpm'; // Default to pnpm for Node.js
    } catch {
      try {
        await fs.access(path.join(this.workspaceDir, 'requirements.txt'));
        return 'pip';
      } catch {
        try {
          await fs.access(path.join(this.workspaceDir, 'go.mod'));
          return 'go';
        } catch {
          return 'unknown';
        }
      }
    }
  }

  async generateCode(instructions, templates) {
    // Placeholder for actual code generation
    // In a real implementation, this would use the ModelRouter
    // to generate code based on instructions and templates
    
    this.log('info', 'Generating code files');
    
    const generatedFiles = [
      {
        path: 'src/app.js',
        content: `// Generated application for ${instructions.projectName}\nconsole.log('Hello World');`,
        type: 'javascript'
      },
      {
        path: 'package.json',
        content: JSON.stringify({
          name: instructions.projectName.toLowerCase().replace(/\s+/g, '-'),
          version: '1.0.0',
          main: 'src/app.js'
        }, null, 2),
        type: 'json'
      }
    ];
    
    return generatedFiles;
  }

  async saveGeneratedFiles(files) {
    for (const file of files) {
      const filePath = path.join(this.workspaceDir, file.path);
      const dir = path.dirname(filePath);
      
      // Ensure directory exists
      await fs.mkdir(dir, { recursive: true });
      
      // Write file
      await fs.writeFile(filePath, file.content, 'utf8');
      
      this.log('info', `Generated file: ${file.path}`);
    }
  }

  async runCommand(command) {
    this.log('info', `Running command: ${command}`);
    
    return new Promise((resolve) => {
      const child = spawn('sh', ['-c', command], {
        cwd: this.workspaceDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let output = '';
      let errorOutput = '';
      
      child.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log(text);
      });
      
      child.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        console.error(text);
      });
      
      child.on('close', (code) => {
        resolve({
          command,
          exitCode: code,
          output: output + errorOutput,
          stdout: output,
          stderr: errorOutput,
          timestamp: new Date().toISOString()
        });
      });
    });
  }

  async createBuildArtifacts() {
    // Copy build outputs to artifacts directory
    const buildOutputs = [
      'dist',
      'build',
      'target',
      '*.zip',
      '*.tar.gz'
    ];
    
    for (const pattern of buildOutputs) {
      try {
        await this.runCommand(`cp -r ${pattern} ${this.artifactsDir}/ 2>/dev/null || true`);
      } catch (error) {
        // Ignore errors for optional artifacts
      }
    }
    
    this.log('info', 'Build artifacts created');
  }

  async saveResult(result) {
    const resultPath = path.join(this.artifactsDir, 'result.json');
    const resultData = {
      ...result,
      workerId: this.workerId,
      jobId: this.jobId,
      executionTime: Date.now() - this.startTime,
      logs: this.logs
    };
    
    await fs.writeFile(resultPath, JSON.stringify(resultData, null, 2));
    this.log('info', 'Result saved');
  }

  async cleanup() {
    this.log('info', 'Worker cleanup completed');
  }
}

// Main execution
async function main() {
  const worker = new DockerWorker();
  
  try {
    await worker.initialize();
    await worker.executeTask();
    await worker.cleanup();
    process.exit(0);
  } catch (error) {
    console.error('Worker failed:', error);
    await worker.cleanup();
    process.exit(1);
  }
}

// Handle signals
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

if (require.main === module) {
  main();
}

module.exports = DockerWorker;