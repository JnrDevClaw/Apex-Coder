/**
 * Pipeline Stage Handlers for Workers
 * 
 * Implements worker-side handlers for the 8-stage pipeline.
 * These handlers are called by the pipeline orchestrator to execute
 * stages that require worker processing (file creation, code generation, etc.)
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

class PipelineStageHandlers extends EventEmitter {
  constructor(options = {}) {
    super();
    this.artifactStorage = options.artifactStorage;
    this.codeGenerator = options.codeGenerator;
    this.githubClient = options.githubClient;
    this.workDir = options.workDir || process.env.WORK_DIR || path.resolve(process.cwd(), 'work');
  }

  /**
   * Stage 6: Create empty files from validated structure
   * @param {Object} params - Stage parameters
   * @param {string} params.buildId - Build ID
   * @param {string} params.projectId - Project ID
   * @param {Object} params.validatedStructure - Validated file structure
   * @param {string} params.projectDir - Project directory
   * @returns {Promise<Object>} Stage result
   */
  async handleEmptyFileCreation(params) {
    const { buildId, projectId, validatedStructure, projectDir } = params;

    console.log(`[Worker] Stage 6: Creating empty files for build ${buildId}`);

    const codeDir = path.join(projectDir, 'code');
    const createdFiles = [];

    // Flatten the structure to get all file paths
    const filesToCreate = this.flattenFileStructure(validatedStructure);

    console.log(`[Worker] Creating ${filesToCreate.length} empty files...`);

    // Emit progress event
    this.emit('progress', {
      buildId,
      stage: 6,
      message: `Creating ${filesToCreate.length} empty files`,
      total: filesToCreate.length,
      completed: 0
    });

    // Create each file with placeholder comment
    for (let i = 0; i < filesToCreate.length; i++) {
      const fileInfo = filesToCreate[i];
      const filePath = path.join(codeDir, fileInfo.path);
      
      try {
        // Create directory if it doesn't exist
        await fs.mkdir(path.dirname(filePath), { recursive: true });

        // Create placeholder content based on file type
        const placeholder = this.generatePlaceholder(fileInfo.path, fileInfo.purpose);

        // Write empty file with placeholder
        await fs.writeFile(filePath, placeholder, 'utf8');

        createdFiles.push({
          path: fileInfo.path,
          fullPath: filePath,
          purpose: fileInfo.purpose
        });

        // Emit progress update every 10 files
        if ((i + 1) % 10 === 0 || i === filesToCreate.length - 1) {
          this.emit('progress', {
            buildId,
            stage: 6,
            message: `Created ${i + 1}/${filesToCreate.length} files`,
            total: filesToCreate.length,
            completed: i + 1
          });
        }

        console.log(`[Worker] Created: ${fileInfo.path}`);
      } catch (error) {
        console.error(`[Worker] Failed to create ${fileInfo.path}:`, error.message);
        throw new Error(`Failed to create file ${fileInfo.path}: ${error.message}`);
      }
    }

    // Verify all files were created
    const verificationResults = await this.verifyFilesCreated(codeDir, filesToCreate);

    if (!verificationResults.allCreated) {
      throw new Error(
        `Failed to create ${verificationResults.missing.length} files: ${verificationResults.missing.join(', ')}`
      );
    }

    console.log(`[Worker] ✅ Successfully created ${createdFiles.length} empty files`);

    return {
      success: true,
      count: createdFiles.length,
      files: createdFiles,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Stage 7: Generate code for all files
   * @param {Object} params - Stage parameters
   * @param {string} params.buildId - Build ID
   * @param {string} params.projectId - Project ID
   * @param {Object} params.validatedStructure - Validated file structure
   * @param {string} params.docsMd - Documentation markdown
   * @param {Object} params.schemaJson - Schema JSON
   * @param {string} params.projectDir - Project directory
   * @param {number} params.concurrency - Concurrency level (default: 2)
   * @returns {Promise<Object>} Stage result
   */
  async handleCodeGeneration(params) {
    const {
      buildId,
      projectId,
      validatedStructure,
      docsMd,
      schemaJson,
      projectDir,
      concurrency = 2
    } = params;

    console.log(`[Worker] Stage 7: Generating code for build ${buildId}`);

    if (!this.codeGenerator) {
      throw new Error('Code generator not initialized');
    }

    const codeDir = path.join(projectDir, 'code');
    const generatedFiles = [];
    const failedFiles = [];

    // Get all files to generate
    const filesToGenerate = this.flattenFileStructure(validatedStructure);
    
    console.log(`[Worker] Generating code for ${filesToGenerate.length} files...`);

    // Emit progress event
    this.emit('progress', {
      buildId,
      stage: 7,
      message: `Generating code for ${filesToGenerate.length} files`,
      total: filesToGenerate.length,
      completed: 0
    });

    // Process files in batches with controlled concurrency
    for (let i = 0; i < filesToGenerate.length; i += concurrency) {
      const batch = filesToGenerate.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async (fileInfo) => {
        try {
          console.log(`[Worker] Generating code for: ${fileInfo.path}`);

          // Emit file-level progress
          this.emit('file-progress', {
            buildId,
            stage: 7,
            file: fileInfo.path,
            status: 'generating'
          });

          // Extract relevant docs and schema excerpts for this file
          const docsExcerpt = this.extractRelevantDocs(docsMd, fileInfo.path, fileInfo.purpose);
          const schemaExcerpt = this.extractRelevantSchema(schemaJson, fileInfo.path, fileInfo.purpose);

          // Generate code using code generator
          const codeResult = await this.codeGenerator.generateFileCode({
            filePath: fileInfo.path,
            filePurpose: fileInfo.purpose,
            docsExcerpt,
            schemaExcerpt,
            codingRules: 'Follow best practices, use modern syntax, include error handling',
            buildId,
            projectId
          });

          // Write generated code to file
          const filePath = path.join(codeDir, fileInfo.path);
          await fs.writeFile(filePath, codeResult.code, 'utf8');

          generatedFiles.push({
            path: fileInfo.path,
            fullPath: filePath,
            purpose: fileInfo.purpose,
            tokens: codeResult.tokens || 0,
            cost: codeResult.cost || 0,
            model: codeResult.model,
            provider: codeResult.provider
          });

          // Emit file completion
          this.emit('file-progress', {
            buildId,
            stage: 7,
            file: fileInfo.path,
            status: 'completed'
          });

          console.log(`[Worker] ✅ Generated: ${fileInfo.path}`);
        } catch (error) {
          console.error(`[Worker] ❌ Failed to generate ${fileInfo.path}:`, error.message);
          
          failedFiles.push({
            path: fileInfo.path,
            error: error.message
          });

          // Emit file failure
          this.emit('file-progress', {
            buildId,
            stage: 7,
            file: fileInfo.path,
            status: 'failed',
            error: error.message
          });
        }
      });

      // Wait for batch to complete
      await Promise.all(batchPromises);

      // Emit batch progress
      const completed = generatedFiles.length + failedFiles.length;
      this.emit('progress', {
        buildId,
        stage: 7,
        message: `Generated ${completed}/${filesToGenerate.length} files`,
        total: filesToGenerate.length,
        completed,
        succeeded: generatedFiles.length,
        failed: failedFiles.length
      });
    }

    console.log(`[Worker] Code generation complete: ${generatedFiles.length} succeeded, ${failedFiles.length} failed`);

    // Calculate totals
    const totalTokens = generatedFiles.reduce((sum, f) => sum + (f.tokens || 0), 0);
    const totalCost = generatedFiles.reduce((sum, f) => sum + (f.cost || 0), 0);

    // If too many files failed, throw error
    if (failedFiles.length > filesToGenerate.length * 0.3) {
      throw new Error(
        `Code generation failed for ${failedFiles.length} files (>30% failure rate)`
      );
    }

    return {
      success: true,
      count: generatedFiles.length,
      files: generatedFiles,
      failed: failedFiles,
      totalTokens,
      totalCost,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Stage 8: Create GitHub repository and push code
   * @param {Object} params - Stage parameters
   * @param {string} params.buildId - Build ID
   * @param {string} params.projectId - Project ID
   * @param {string} params.projectDir - Project directory
   * @param {string} params.repoName - Repository name
   * @param {string} params.repoDescription - Repository description
   * @param {boolean} params.isPrivate - Whether repo should be private
   * @param {string} params.githubToken - GitHub access token
   * @returns {Promise<Object>} Stage result
   */
  async handleRepoCreation(params) {
    const {
      buildId,
      projectId,
      projectDir,
      repoName,
      repoDescription,
      isPrivate = false,
      githubToken
    } = params;

    console.log(`[Worker] Stage 8: Creating GitHub repository for build ${buildId}`);

    if (!this.githubClient) {
      throw new Error('GitHub client not initialized');
    }

    // Emit progress event
    this.emit('progress', {
      buildId,
      stage: 8,
      message: 'Creating GitHub repository',
      step: 'create-repo'
    });

    try {
      // Create GitHub repository
      console.log(`[Worker] Creating GitHub repository: ${repoName}`);
      
      const repo = await this.githubClient.createRepository({
        name: repoName,
        description: repoDescription,
        private: isPrivate,
        auto_init: false,
        token: githubToken
      });

      console.log(`[Worker] ✅ Repository created: ${repo.html_url}`);

      // Emit progress event
      this.emit('progress', {
        buildId,
        stage: 8,
        message: 'Repository created, preparing files',
        step: 'prepare-files',
        repoUrl: repo.html_url
      });

      // Get all generated files from code directory
      const codeDir = path.join(projectDir, 'code');
      const files = await this.getAllFilesRecursive(codeDir);

      console.log(`[Worker] Pushing ${files.length} files to repository...`);

      // Emit progress event
      this.emit('progress', {
        buildId,
        stage: 8,
        message: `Pushing ${files.length} files to repository`,
        step: 'push-files',
        totalFiles: files.length
      });

      // Read file contents
      const fileContents = await Promise.all(
        files.map(async (filePath) => {
          const relativePath = path.relative(codeDir, filePath);
          const content = await fs.readFile(filePath, 'utf8');
          
          return {
            path: relativePath,
            content
          };
        })
      );

      // Create initial commit with all files
      const commitResult = await this.githubClient.createOrUpdateFiles({
        owner: repo.owner.login,
        repo: repo.name,
        files: fileContents,
        message: 'Initial commit - Generated by AI App Builder',
        branch: 'main',
        token: githubToken
      });

      console.log(`[Worker] ✅ Pushed ${files.length} files to repository`);

      // Emit completion event
      this.emit('progress', {
        buildId,
        stage: 8,
        message: 'Repository creation complete',
        step: 'complete',
        repoUrl: repo.html_url,
        filesCount: files.length
      });

      return {
        success: true,
        repoUrl: repo.html_url,
        repoName: repo.full_name,
        repoOwner: repo.owner.login,
        commitSha: commitResult.sha,
        filesCount: files.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`[Worker] Failed to create GitHub repository:`, error);
      throw new Error(`GitHub repository creation failed: ${error.message}`);
    }
  }

  /**
   * Flatten file structure to get list of all files
   * @param {Object} structure - Validated structure
   * @returns {Array} Array of file info objects
   */
  flattenFileStructure(structure) {
    const files = [];

    const traverse = (obj, basePath = '') => {
      if (typeof obj === 'object' && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
          if (typeof value === 'string') {
            // This is a file with its purpose as the value
            files.push({
              path: key,
              purpose: value
            });
          } else if (typeof value === 'object') {
            // This might be a nested structure
            traverse(value, key);
          }
        }
      }
    };

    traverse(structure);
    return files;
  }

  /**
   * Generate placeholder content for a file
   * @param {string} filePath - File path
   * @param {string} purpose - File purpose
   * @returns {string} Placeholder content
   */
  generatePlaceholder(filePath, purpose) {
    const ext = path.extname(filePath);
    const fileName = path.basename(filePath);

    let placeholder = '';

    // Add appropriate comment syntax based on file type
    if (ext === '.js' || ext === '.ts' || ext === '.jsx' || ext === '.tsx') {
      placeholder = `/**
 * ${fileName}
 * 
 * Purpose: ${purpose}
 * 
 * This file was generated by the AI App Builder pipeline.
 * Stage 6: Empty file creation
 * 
 * Code will be generated in Stage 7.
 */

// TODO: Implement ${fileName}
`;
    } else if (ext === '.svelte' || ext === '.vue') {
      placeholder = `<!--
  ${fileName}
  
  Purpose: ${purpose}
  
  This file was generated by the AI App Builder pipeline.
  Stage 6: Empty file creation
  
  Code will be generated in Stage 7.
-->

<script>
  // TODO: Implement component logic
</script>

<!-- TODO: Implement component template -->

<style>
  /* TODO: Implement component styles */
</style>
`;
    } else if (ext === '.css' || ext === '.scss') {
      placeholder = `/**
 * ${fileName}
 * 
 * Purpose: ${purpose}
 * 
 * This file was generated by the AI App Builder pipeline.
 * Stage 6: Empty file creation
 * 
 * Code will be generated in Stage 7.
 */

/* TODO: Implement styles */
`;
    } else if (ext === '.html') {
      placeholder = `<!--
  ${fileName}
  
  Purpose: ${purpose}
  
  This file was generated by the AI App Builder pipeline.
  Stage 6: Empty file creation
  
  Code will be generated in Stage 7.
-->

<!DOCTYPE html>
<html>
<head>
  <title>${fileName}</title>
</head>
<body>
  <!-- TODO: Implement HTML content -->
</body>
</html>
`;
    } else if (ext === '.md') {
      placeholder = `# ${fileName}

Purpose: ${purpose}

This file was generated by the AI App Builder pipeline.
Stage 6: Empty file creation

Code will be generated in Stage 7.

## TODO

- Implement documentation
`;
    } else if (ext === '.json') {
      placeholder = `{
  "_comment": "This file was generated by the AI App Builder pipeline",
  "_purpose": "${purpose}",
  "_stage": "Stage 6: Empty file creation",
  "_todo": "Implement JSON structure in Stage 7"
}
`;
    } else {
      // Generic placeholder
      placeholder = `# ${fileName}
# Purpose: ${purpose}
# This file was generated by the AI App Builder pipeline
# Stage 6: Empty file creation
# Code will be generated in Stage 7

# TODO: Implement ${fileName}
`;
    }

    return placeholder;
  }

  /**
   * Verify that all files were created
   * @param {string} codeDir - Code directory
   * @param {Array} expectedFiles - Expected files
   * @returns {Promise<Object>} Verification results
   */
  async verifyFilesCreated(codeDir, expectedFiles) {
    const missing = [];

    for (const fileInfo of expectedFiles) {
      const filePath = path.join(codeDir, fileInfo.path);
      
      try {
        await fs.access(filePath);
      } catch (error) {
        missing.push(fileInfo.path);
      }
    }

    return {
      allCreated: missing.length === 0,
      totalExpected: expectedFiles.length,
      created: expectedFiles.length - missing.length,
      missing
    };
  }

  /**
   * Extract relevant documentation for a specific file
   * @param {string} docs - Full documentation
   * @param {string} filePath - File path
   * @param {string} purpose - File purpose
   * @returns {string} Relevant docs excerpt
   */
  extractRelevantDocs(docs, filePath, purpose) {
    // Simple heuristic: if file is in frontend, extract frontend sections
    if (filePath.includes('frontend') || filePath.includes('src/lib') || filePath.includes('components')) {
      const frontendMatch = docs.match(/## Frontend.*?(?=##|$)/s);
      if (frontendMatch) {
        return frontendMatch[0];
      }
    }

    // If file is in backend/server, extract backend sections
    if (filePath.includes('backend') || filePath.includes('server') || filePath.includes('api')) {
      const backendMatch = docs.match(/## (Backend|API|Endpoints).*?(?=##|$)/s);
      if (backendMatch) {
        return backendMatch[0];
      }
    }

    // Return first 2000 characters as excerpt
    return docs.substring(0, 2000) + (docs.length > 2000 ? '\n\n... (truncated)' : '');
  }

  /**
   * Extract relevant schema for a specific file
   * @param {Object} schema - Full schema
   * @param {string} filePath - File path
   * @param {string} purpose - File purpose
   * @returns {string} Relevant schema excerpt
   */
  extractRelevantSchema(schema, filePath, purpose) {
    // For now, return full schema as JSON string
    // In production, this would extract only relevant entities
    return JSON.stringify(schema, null, 2);
  }

  /**
   * Get all files recursively from a directory
   * @param {string} dir - Directory path
   * @returns {Promise<string[]>} Array of file paths
   */
  async getAllFilesRecursive(dir) {
    const files = [];

    const traverse = async (currentDir) => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          await traverse(fullPath);
        } else {
          files.push(fullPath);
        }
      }
    };

    await traverse(dir);
    return files;
  }
}

module.exports = PipelineStageHandlers;
