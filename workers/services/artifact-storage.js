const AWS = require('aws-sdk');
const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const { createReadStream, createWriteStream } = require('fs');

/**
 * Canonical directory structure for pipeline artifacts:
 * /project/{projectId}/
 *   ├── specs/
 *   │   ├── specs.json
 *   │   ├── specs_refined.json
 *   │   ├── clarification_history.json
 *   │   ├── specs_clean.json
 *   │   ├── schema.json
 *   │   ├── structural_issues.json
 *   │   ├── file_structure.json
 *   │   └── validated_structure.json
 *   ├── docs/
 *   │   └── docs.md
 *   └── code/
 *       └── [generated file structure]
 */

class ArtifactStorage {
  constructor(options = {}) {
    this.s3 = new AWS.S3({
      region: options.region || process.env.AWS_REGION || 'us-east-1',
      accessKeyId: options.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: options.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY
    });
    
    this.bucketName = options.bucketName || process.env.ARTIFACTS_BUCKET || 'ai-app-builder-artifacts';
    this.logsBucketName = options.logsBucketName || process.env.LOGS_BUCKET || 'ai-app-builder-logs';
    this.versioningEnabled = options.versioningEnabled !== false;
    
    // Canonical subdirectories
    this.subdirectories = {
      SPECS: 'specs',
      DOCS: 'docs',
      CODE: 'code'
    };
  }

  async initialize() {
    try {
      // Ensure buckets exist
      await this.ensureBucketExists(this.bucketName);
      await this.ensureBucketExists(this.logsBucketName);
      
      console.log('Artifact storage initialized successfully');
    } catch (error) {
      console.error('Failed to initialize artifact storage:', error);
      throw error;
    }
  }

  async ensureBucketExists(bucketName) {
    try {
      await this.s3.headBucket({ Bucket: bucketName }).promise();
    } catch (error) {
      if (error.statusCode === 404) {
        // Bucket doesn't exist, create it
        await this.s3.createBucket({ 
          Bucket: bucketName,
          CreateBucketConfiguration: {
            LocationConstraint: this.s3.config.region !== 'us-east-1' ? this.s3.config.region : undefined
          }
        }).promise();
        
        // Enable versioning if required
        if (this.versioningEnabled) {
          await this.s3.putBucketVersioning({
            Bucket: bucketName,
            VersioningConfiguration: {
              Status: 'Enabled'
            }
          }).promise();
        }
        
        console.log(`Created S3 bucket: ${bucketName}`);
      } else {
        throw error;
      }
    }
  }

  async uploadArtifacts(jobId, projectId, buildId, artifactsPath) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const artifactKey = `projects/${projectId}/builds/${buildId}/artifacts/${jobId}-${timestamp}.zip`;
      
      // Create zip archive of artifacts
      const zipPath = `/tmp/${jobId}-artifacts.zip`;
      await this.createZipArchive(artifactsPath, zipPath);
      
      // Upload to S3
      const uploadParams = {
        Bucket: this.bucketName,
        Key: artifactKey,
        Body: createReadStream(zipPath),
        ContentType: 'application/zip',
        Metadata: {
          jobId,
          projectId,
          buildId,
          uploadedAt: new Date().toISOString()
        },
        ServerSideEncryption: 'AES256'
      };

      const result = await this.s3.upload(uploadParams).promise();
      
      // Clean up temporary zip file
      await fs.unlink(zipPath);
      
      console.log(`Uploaded artifacts for job ${jobId} to ${result.Location}`);
      
      return {
        s3Url: result.Location,
        key: artifactKey,
        bucket: this.bucketName,
        versionId: result.VersionId,
        size: (await fs.stat(zipPath)).size
      };
      
    } catch (error) {
      console.error(`Failed to upload artifacts for job ${jobId}:`, error);
      throw error;
    }
  }

  async createZipArchive(sourcePath, outputPath) {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(outputPath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });

      output.on('close', () => {
        console.log(`Archive created: ${archive.pointer()} total bytes`);
        resolve();
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.pipe(output);
      
      // Add all files from source directory
      archive.directory(sourcePath, false);
      
      archive.finalize();
    });
  }

  async uploadLogs(jobId, projectId, buildId, logs) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logKey = `projects/${projectId}/builds/${buildId}/logs/${jobId}-${timestamp}.log`;
      
      // Format logs as text
      const logContent = Array.isArray(logs) 
        ? logs.map(entry => `[${entry.timestamp}] ${entry.data}`).join('\n')
        : logs.toString();
      
      const uploadParams = {
        Bucket: this.logsBucketName,
        Key: logKey,
        Body: logContent,
        ContentType: 'text/plain',
        Metadata: {
          jobId,
          projectId,
          buildId,
          uploadedAt: new Date().toISOString()
        },
        ServerSideEncryption: 'AES256'
      };

      const result = await this.s3.upload(uploadParams).promise();
      
      console.log(`Uploaded logs for job ${jobId} to ${result.Location}`);
      
      return {
        s3Url: result.Location,
        key: logKey,
        bucket: this.logsBucketName,
        versionId: result.VersionId,
        size: Buffer.byteLength(logContent, 'utf8')
      };
      
    } catch (error) {
      console.error(`Failed to upload logs for job ${jobId}:`, error);
      throw error;
    }
  }

  async downloadArtifacts(s3Url, downloadPath) {
    try {
      const { bucket, key } = this.parseS3Url(s3Url);
      
      const downloadParams = {
        Bucket: bucket,
        Key: key
      };

      const result = await this.s3.getObject(downloadParams).promise();
      await fs.writeFile(downloadPath, result.Body);
      
      console.log(`Downloaded artifacts from ${s3Url} to ${downloadPath}`);
      return downloadPath;
      
    } catch (error) {
      console.error(`Failed to download artifacts from ${s3Url}:`, error);
      throw error;
    }
  }

  async downloadLogs(s3Url) {
    try {
      const { bucket, key } = this.parseS3Url(s3Url);
      
      const downloadParams = {
        Bucket: bucket,
        Key: key
      };

      const result = await this.s3.getObject(downloadParams).promise();
      return result.Body.toString('utf8');
      
    } catch (error) {
      console.error(`Failed to download logs from ${s3Url}:`, error);
      throw error;
    }
  }

  parseS3Url(s3Url) {
    // Parse S3 URL: https://bucket.s3.region.amazonaws.com/key or s3://bucket/key
    if (s3Url.startsWith('s3://')) {
      const parts = s3Url.substring(5).split('/');
      return {
        bucket: parts[0],
        key: parts.slice(1).join('/')
      };
    } else if (s3Url.includes('.s3.')) {
      const url = new URL(s3Url);
      const bucket = url.hostname.split('.')[0];
      const key = url.pathname.substring(1);
      return { bucket, key };
    } else {
      throw new Error(`Invalid S3 URL format: ${s3Url}`);
    }
  }

  async listArtifacts(projectId, buildId, limit = 100) {
    try {
      const prefix = `projects/${projectId}/builds/${buildId}/artifacts/`;
      
      const listParams = {
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: limit
      };

      const result = await this.s3.listObjectsV2(listParams).promise();
      
      return result.Contents.map(obj => ({
        key: obj.Key,
        s3Url: `https://${this.bucketName}.s3.${this.s3.config.region}.amazonaws.com/${obj.Key}`,
        size: obj.Size,
        lastModified: obj.LastModified,
        etag: obj.ETag
      }));
      
    } catch (error) {
      console.error(`Failed to list artifacts for project ${projectId}, build ${buildId}:`, error);
      throw error;
    }
  }

  async deleteArtifacts(s3Url) {
    try {
      const { bucket, key } = this.parseS3Url(s3Url);
      
      const deleteParams = {
        Bucket: bucket,
        Key: key
      };

      await this.s3.deleteObject(deleteParams).promise();
      console.log(`Deleted artifacts: ${s3Url}`);
      
    } catch (error) {
      console.error(`Failed to delete artifacts ${s3Url}:`, error);
      throw error;
    }
  }

  async getArtifactMetadata(s3Url) {
    try {
      const { bucket, key } = this.parseS3Url(s3Url);
      
      const headParams = {
        Bucket: bucket,
        Key: key
      };

      const result = await this.s3.headObject(headParams).promise();
      
      return {
        size: result.ContentLength,
        lastModified: result.LastModified,
        etag: result.ETag,
        contentType: result.ContentType,
        metadata: result.Metadata,
        versionId: result.VersionId
      };
      
    } catch (error) {
      console.error(`Failed to get metadata for ${s3Url}:`, error);
      throw error;
    }
  }

  async generatePresignedUrl(s3Url, expiresIn = 3600) {
    try {
      const { bucket, key } = this.parseS3Url(s3Url);
      
      const params = {
        Bucket: bucket,
        Key: key,
        Expires: expiresIn
      };

      const presignedUrl = await this.s3.getSignedUrlPromise('getObject', params);
      return presignedUrl;
      
    } catch (error) {
      console.error(`Failed to generate presigned URL for ${s3Url}:`, error);
      throw error;
    }
  }

  async cleanupOldArtifacts(projectId, retentionDays = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      const prefix = `projects/${projectId}/`;
      
      const listParams = {
        Bucket: this.bucketName,
        Prefix: prefix
      };

      let deletedCount = 0;
      let continuationToken;
      
      do {
        if (continuationToken) {
          listParams.ContinuationToken = continuationToken;
        }
        
        const result = await this.s3.listObjectsV2(listParams).promise();
        
        const objectsToDelete = result.Contents
          .filter(obj => obj.LastModified < cutoffDate)
          .map(obj => ({ Key: obj.Key }));
        
        if (objectsToDelete.length > 0) {
          const deleteParams = {
            Bucket: this.bucketName,
            Delete: {
              Objects: objectsToDelete,
              Quiet: true
            }
          };
          
          await this.s3.deleteObjects(deleteParams).promise();
          deletedCount += objectsToDelete.length;
        }
        
        continuationToken = result.NextContinuationToken;
        
      } while (continuationToken);
      
      console.log(`Cleaned up ${deletedCount} old artifacts for project ${projectId}`);
      return deletedCount;
      
    } catch (error) {
      console.error(`Failed to cleanup old artifacts for project ${projectId}:`, error);
      throw error;
    }
  }

  async getStorageStats(projectId) {
    try {
      const prefix = `projects/${projectId}/`;
      
      const listParams = {
        Bucket: this.bucketName,
        Prefix: prefix
      };

      let totalSize = 0;
      let totalObjects = 0;
      let continuationToken;
      
      do {
        if (continuationToken) {
          listParams.ContinuationToken = continuationToken;
        }
        
        const result = await this.s3.listObjectsV2(listParams).promise();
        
        totalObjects += result.Contents.length;
        totalSize += result.Contents.reduce((sum, obj) => sum + obj.Size, 0);
        
        continuationToken = result.NextContinuationToken;
        
      } while (continuationToken);
      
      return {
        projectId,
        totalObjects,
        totalSize,
        totalSizeMB: totalSize > 0 ? Math.round(totalSize / (1024 * 1024) * 100) / 100 : 0
      };
      
    } catch (error) {
      console.error(`Failed to get storage stats for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Create canonical directory structure for a project
   * Requirements: 5.1, 8.1-8.10
   */
  async createProjectDirectoryStructure(projectId) {
    try {
      const basePrefix = `projects/${projectId}/`;
      
      // Create placeholder objects for each subdirectory
      const subdirs = [
        `${basePrefix}${this.subdirectories.SPECS}/`,
        `${basePrefix}${this.subdirectories.DOCS}/`,
        `${basePrefix}${this.subdirectories.CODE}/`
      ];
      
      for (const dir of subdirs) {
        const params = {
          Bucket: this.bucketName,
          Key: `${dir}.placeholder`,
          Body: '',
          ContentType: 'text/plain',
          Metadata: {
            projectId,
            createdAt: new Date().toISOString(),
            type: 'directory-placeholder'
          }
        };
        
        await this.s3.putObject(params).promise();
      }
      
      console.log(`Created directory structure for project ${projectId}`);
      
      return {
        projectId,
        basePrefix,
        subdirectories: subdirs
      };
      
    } catch (error) {
      console.error(`Failed to create directory structure for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Store stage artifact in the correct subdirectory
   * Requirements: 5.2, 8.1-8.10
   */
  async storeStageArtifact(projectId, subdirectory, filename, content, metadata = {}) {
    try {
      // Validate subdirectory
      const validSubdirs = Object.values(this.subdirectories);
      if (!validSubdirs.includes(subdirectory)) {
        throw new Error(`Invalid subdirectory: ${subdirectory}. Must be one of: ${validSubdirs.join(', ')}`);
      }
      
      const key = `projects/${projectId}/${subdirectory}/${filename}`;
      
      // Determine content type
      let contentType = 'application/octet-stream';
      let body = content;
      
      if (filename.endsWith('.json')) {
        contentType = 'application/json';
        body = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
      } else if (filename.endsWith('.md')) {
        contentType = 'text/markdown';
        body = content.toString();
      } else if (filename.endsWith('.txt') || filename.endsWith('.log')) {
        contentType = 'text/plain';
        body = content.toString();
      }
      
      const params = {
        Bucket: this.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: {
          projectId,
          subdirectory,
          filename,
          uploadedAt: new Date().toISOString(),
          ...metadata
        },
        ServerSideEncryption: 'AES256'
      };
      
      const result = await this.s3.upload(params).promise();
      
      console.log(`Stored artifact ${filename} in ${subdirectory} for project ${projectId}`);
      
      return {
        s3Url: result.Location,
        key,
        bucket: this.bucketName,
        versionId: result.VersionId,
        subdirectory,
        filename
      };
      
    } catch (error) {
      console.error(`Failed to store artifact ${filename} in ${subdirectory}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve stage artifact from the correct subdirectory
   * Requirements: 5.3
   */
  async retrieveStageArtifact(projectId, subdirectory, filename) {
    try {
      const key = `projects/${projectId}/${subdirectory}/${filename}`;
      
      const params = {
        Bucket: this.bucketName,
        Key: key
      };
      
      const result = await this.s3.getObject(params).promise();
      
      // Parse JSON if applicable
      let content = result.Body.toString('utf8');
      if (filename.endsWith('.json')) {
        try {
          content = JSON.parse(content);
        } catch (e) {
          console.warn(`Failed to parse JSON for ${filename}, returning as string`);
        }
      }
      
      console.log(`Retrieved artifact ${filename} from ${subdirectory} for project ${projectId}`);
      
      return {
        content,
        metadata: result.Metadata,
        contentType: result.ContentType,
        lastModified: result.LastModified,
        versionId: result.VersionId
      };
      
    } catch (error) {
      if (error.code === 'NoSuchKey') {
        console.warn(`Artifact ${filename} not found in ${subdirectory} for project ${projectId}`);
        return null;
      }
      console.error(`Failed to retrieve artifact ${filename} from ${subdirectory}:`, error);
      throw error;
    }
  }

  /**
   * Store multiple artifacts for a stage
   * Requirements: 5.2, 8.1-8.10
   */
  async storeStageArtifacts(projectId, stageNumber, artifacts) {
    try {
      const results = [];
      
      for (const [filename, content] of Object.entries(artifacts)) {
        // Determine subdirectory based on file type
        let subdirectory;
        if (filename.endsWith('.json') && filename !== 'docs.md') {
          subdirectory = this.subdirectories.SPECS;
        } else if (filename.endsWith('.md')) {
          subdirectory = this.subdirectories.DOCS;
        } else {
          subdirectory = this.subdirectories.CODE;
        }
        
        const result = await this.storeStageArtifact(
          projectId,
          subdirectory,
          filename,
          content,
          { stageNumber: stageNumber.toString() }
        );
        
        results.push(result);
      }
      
      console.log(`Stored ${results.length} artifacts for stage ${stageNumber}, project ${projectId}`);
      
      return results;
      
    } catch (error) {
      console.error(`Failed to store artifacts for stage ${stageNumber}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve all artifacts for a stage
   * Requirements: 5.3
   */
  async retrieveStageArtifacts(projectId, artifactNames) {
    try {
      const artifacts = {};
      
      for (const filename of artifactNames) {
        // Determine subdirectory based on file type
        let subdirectory;
        if (filename.endsWith('.json')) {
          subdirectory = this.subdirectories.SPECS;
        } else if (filename.endsWith('.md')) {
          subdirectory = this.subdirectories.DOCS;
        } else {
          subdirectory = this.subdirectories.CODE;
        }
        
        const result = await this.retrieveStageArtifact(projectId, subdirectory, filename);
        if (result) {
          artifacts[filename] = result.content;
        }
      }
      
      console.log(`Retrieved ${Object.keys(artifacts).length} artifacts for project ${projectId}`);
      
      return artifacts;
      
    } catch (error) {
      console.error(`Failed to retrieve stage artifacts:`, error);
      throw error;
    }
  }

  /**
   * Persist artifacts on failure
   * Requirements: 7.4
   */
  async persistArtifactsOnFailure(projectId, stageNumber, artifacts, errorInfo) {
    try {
      // Store all artifacts with failure metadata
      const results = [];
      
      for (const [filename, content] of Object.entries(artifacts)) {
        let subdirectory;
        if (filename.endsWith('.json')) {
          subdirectory = this.subdirectories.SPECS;
        } else if (filename.endsWith('.md')) {
          subdirectory = this.subdirectories.DOCS;
        } else {
          subdirectory = this.subdirectories.CODE;
        }
        
        const result = await this.storeStageArtifact(
          projectId,
          subdirectory,
          filename,
          content,
          {
            stageNumber: stageNumber.toString(),
            failedAt: new Date().toISOString(),
            errorMessage: errorInfo.message || 'Unknown error',
            errorCode: errorInfo.code || 'UNKNOWN'
          }
        );
        
        results.push(result);
      }
      
      // Store error log
      const errorLogKey = `projects/${projectId}/specs/stage_${stageNumber}_error.json`;
      const errorLogContent = {
        stageNumber,
        failedAt: new Date().toISOString(),
        error: errorInfo,
        artifactsPersisted: results.map(r => r.filename)
      };
      
      await this.s3.putObject({
        Bucket: this.bucketName,
        Key: errorLogKey,
        Body: JSON.stringify(errorLogContent, null, 2),
        ContentType: 'application/json',
        ServerSideEncryption: 'AES256'
      }).promise();
      
      console.log(`Persisted ${results.length} artifacts on failure for stage ${stageNumber}, project ${projectId}`);
      
      return {
        artifactsPersisted: results,
        errorLog: errorLogKey
      };
      
    } catch (error) {
      console.error(`Failed to persist artifacts on failure for stage ${stageNumber}:`, error);
      throw error;
    }
  }

  /**
   * List all artifacts in a subdirectory
   * Requirements: 5.3
   */
  async listSubdirectoryArtifacts(projectId, subdirectory) {
    try {
      const prefix = `projects/${projectId}/${subdirectory}/`;
      
      const listParams = {
        Bucket: this.bucketName,
        Prefix: prefix
      };
      
      const result = await this.s3.listObjectsV2(listParams).promise();
      
      const artifacts = result.Contents
        .filter(obj => !obj.Key.endsWith('.placeholder'))
        .map(obj => ({
          filename: path.basename(obj.Key),
          key: obj.Key,
          s3Url: `https://${this.bucketName}.s3.${this.s3.config.region}.amazonaws.com/${obj.Key}`,
          size: obj.Size,
          lastModified: obj.LastModified
        }));
      
      return artifacts;
      
    } catch (error) {
      console.error(`Failed to list artifacts in ${subdirectory} for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Store code file in the code subdirectory with proper path structure
   * Requirements: 8.9
   */
  async storeCodeFile(projectId, filePath, content, metadata = {}) {
    try {
      const key = `projects/${projectId}/${this.subdirectories.CODE}/${filePath}`;
      
      // Determine content type based on file extension
      const ext = path.extname(filePath).toLowerCase();
      const contentTypeMap = {
        '.js': 'application/javascript',
        '.ts': 'application/typescript',
        '.jsx': 'application/javascript',
        '.tsx': 'application/typescript',
        '.json': 'application/json',
        '.html': 'text/html',
        '.css': 'text/css',
        '.md': 'text/markdown',
        '.txt': 'text/plain',
        '.yml': 'text/yaml',
        '.yaml': 'text/yaml'
      };
      
      const contentType = contentTypeMap[ext] || 'application/octet-stream';
      
      const params = {
        Bucket: this.bucketName,
        Key: key,
        Body: content,
        ContentType: contentType,
        Metadata: {
          projectId,
          filePath,
          uploadedAt: new Date().toISOString(),
          ...metadata
        },
        ServerSideEncryption: 'AES256'
      };
      
      const result = await this.s3.upload(params).promise();
      
      console.log(`Stored code file ${filePath} for project ${projectId}`);
      
      return {
        s3Url: result.Location,
        key,
        bucket: this.bucketName,
        versionId: result.VersionId,
        filePath
      };
      
    } catch (error) {
      console.error(`Failed to store code file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve code file from the code subdirectory
   * Requirements: 5.3
   */
  async retrieveCodeFile(projectId, filePath) {
    try {
      const key = `projects/${projectId}/${this.subdirectories.CODE}/${filePath}`;
      
      const params = {
        Bucket: this.bucketName,
        Key: key
      };
      
      const result = await this.s3.getObject(params).promise();
      
      return {
        content: result.Body.toString('utf8'),
        metadata: result.Metadata,
        contentType: result.ContentType,
        lastModified: result.LastModified
      };
      
    } catch (error) {
      if (error.code === 'NoSuchKey') {
        console.warn(`Code file ${filePath} not found for project ${projectId}`);
        return null;
      }
      console.error(`Failed to retrieve code file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * List all code files for a project
   * Requirements: 5.3
   */
  async listCodeFiles(projectId) {
    try {
      return await this.listSubdirectoryArtifacts(projectId, this.subdirectories.CODE);
    } catch (error) {
      console.error(`Failed to list code files for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Check if artifact exists
   * Requirements: 5.3
   */
  async artifactExists(projectId, subdirectory, filename) {
    try {
      const key = `projects/${projectId}/${subdirectory}/${filename}`;
      
      await this.s3.headObject({
        Bucket: this.bucketName,
        Key: key
      }).promise();
      
      return true;
      
    } catch (error) {
      if (error.code === 'NotFound' || error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }
}

module.exports = ArtifactStorage;