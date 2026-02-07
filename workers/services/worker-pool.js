const Docker = require('dockerode');
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs').promises;

class WorkerPool extends EventEmitter {
  constructor(options = {}) {
    super();
    this.docker = new Docker();
    this.workers = new Map(); // workerId -> worker instance
    this.maxWorkers = options.maxWorkers || 5;
    this.resourceLimits = {
      memory: options.memory || 2 * 1024 * 1024 * 1024, // 2GB in bytes
      cpus: options.cpus || 1,
      timeout: options.timeout || 600000 // 10 minutes in ms
    };
    this.networkName = options.networkName || 'ai-app-builder-workers';
    this.volumePrefix = options.volumePrefix || 'worker';
  }

  async initialize() {
    try {
      // Create isolated network for workers
      await this.createWorkerNetwork();
      
      // Build base images if they don't exist
      await this.buildBaseImages();
      
      console.log('Worker pool initialized successfully');
    } catch (error) {
      console.error('Failed to initialize worker pool:', error);
      throw error;
    }
  }

  async createWorkerNetwork() {
    try {
      // Check if network already exists
      const networks = await this.docker.listNetworks();
      const existingNetwork = networks.find(net => net.Name === this.networkName);
      
      if (!existingNetwork) {
        await this.docker.createNetwork({
          Name: this.networkName,
          Driver: 'bridge',
          Internal: true, // No external access for security
          IPAM: {
            Config: [{
              Subnet: '172.20.0.0/16'
            }]
          }
        });
        console.log(`Created isolated network: ${this.networkName}`);
      }
    } catch (error) {
      console.error('Failed to create worker network:', error);
      throw error;
    }
  }

  async buildBaseImages() {
    const images = [
      { name: 'worker-nodejs', dockerfile: 'Dockerfile.worker-nodejs' },
      { name: 'worker-python', dockerfile: 'Dockerfile.worker-python' },
      { name: 'worker-go', dockerfile: 'Dockerfile.worker-go' }
    ];

    for (const image of images) {
      try {
        // Check if image exists
        const existingImages = await this.docker.listImages();
        const imageExists = existingImages.some(img => 
          img.RepoTags && img.RepoTags.includes(`${image.name}:latest`)
        );

        if (!imageExists) {
          console.log(`Building base image: ${image.name}`);
          
          const buildContext = path.join(__dirname, '../../infra');
          const stream = await this.docker.buildImage({
            context: buildContext,
            src: [image.dockerfile]
          }, {
            t: `${image.name}:latest`,
            dockerfile: image.dockerfile
          });

          await this.followBuildProgress(stream);
          console.log(`Built base image: ${image.name}`);
        }
      } catch (error) {
        console.error(`Failed to build image ${image.name}:`, error);
        // Continue with other images
      }
    }
  }

  async followBuildProgress(stream) {
    return new Promise((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      }, (event) => {
        if (event.stream) {
          process.stdout.write(event.stream);
        }
      });
    });
  }

  async createWorker(jobPayload) {
    const workerId = `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Determine stack and image
      const stack = this.determineStack(jobPayload);
      const imageName = `worker-${stack}:latest`;
      
      // Create ephemeral volumes
      const workspaceVolume = await this.createEphemeralVolume(`${workerId}-workspace`);
      const artifactsVolume = await this.createEphemeralVolume(`${workerId}-artifacts`);
      const logsVolume = await this.createEphemeralVolume(`${workerId}-logs`);

      // Create container with resource limits
      const container = await this.docker.createContainer({
        Image: imageName,
        name: workerId,
        Env: [
          `WORKER_ID=${workerId}`,
          `JOB_ID=${jobPayload.jobId}`,
          `PROJECT_ID=${jobPayload.projectId}`,
          `BUILD_ID=${jobPayload.buildId}`,
          `WORKER_TIMEOUT=${this.resourceLimits.timeout}`
        ],
        HostConfig: {
          Memory: this.resourceLimits.memory,
          CpuQuota: 100000, // 1 CPU
          CpuPeriod: 100000,
          NetworkMode: this.networkName,
          Binds: [
            `${workspaceVolume.Name}:/workspace`,
            `${artifactsVolume.Name}:/artifacts`,
            `${logsVolume.Name}:/logs`
          ],
          AutoRemove: true, // Clean up after execution
          SecurityOpt: [
            'no-new-privileges:true'
          ],
          ReadonlyRootfs: false, // Allow writes to mounted volumes
          Tmpfs: {
            '/tmp': 'rw,noexec,nosuid,size=100m'
          }
        },
        NetworkingConfig: {
          EndpointsConfig: {
            [this.networkName]: {}
          }
        },
        WorkingDir: '/workspace'
      });

      const worker = {
        id: workerId,
        container,
        jobPayload,
        stack,
        volumes: {
          workspace: workspaceVolume,
          artifacts: artifactsVolume,
          logs: logsVolume
        },
        status: 'created',
        startedAt: null,
        completedAt: null,
        logs: [],
        result: null
      };

      this.workers.set(workerId, worker);
      console.log(`Created worker ${workerId} for ${stack} stack`);
      
      return worker;
    } catch (error) {
      console.error(`Failed to create worker ${workerId}:`, error);
      throw error;
    }
  }

  async createEphemeralVolume(name) {
    try {
      const volume = await this.docker.createVolume({
        Name: name,
        Driver: 'local',
        Labels: {
          'ai-app-builder.ephemeral': 'true',
          'ai-app-builder.created': new Date().toISOString()
        }
      });
      return volume;
    } catch (error) {
      console.error(`Failed to create volume ${name}:`, error);
      throw error;
    }
  }

  determineStack(jobPayload) {
    // Determine stack from spec or default to nodejs
    if (jobPayload.specJson && jobPayload.specJson.stack) {
      const backend = jobPayload.specJson.stack.backend;
      if (backend === 'python') return 'python';
      if (backend === 'go') return 'go';
    }
    return 'nodejs'; // default
  }

  async executeJob(workerId, jobData) {
    const worker = this.workers.get(workerId);
    if (!worker) {
      throw new Error(`Worker ${workerId} not found`);
    }

    try {
      worker.status = 'running';
      worker.startedAt = new Date();
      
      // Prepare job data in workspace
      await this.prepareWorkspace(worker, jobData);
      
      // Start container
      await worker.container.start();
      console.log(`Started worker ${workerId}`);

      // Set up timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Worker ${workerId} timed out after ${this.resourceLimits.timeout}ms`));
        }, this.resourceLimits.timeout);
      });

      // Wait for completion or timeout
      const executionPromise = this.waitForCompletion(worker);
      
      const result = await Promise.race([executionPromise, timeoutPromise]);
      
      worker.status = 'completed';
      worker.completedAt = new Date();
      worker.result = result;

      // Collect artifacts and logs
      await this.collectArtifacts(worker);
      await this.collectLogs(worker);

      console.log(`Worker ${workerId} completed successfully`);
      return result;

    } catch (error) {
      worker.status = 'failed';
      worker.completedAt = new Date();
      
      // Try to collect logs even on failure
      try {
        await this.collectLogs(worker);
      } catch (logError) {
        console.error(`Failed to collect logs for worker ${workerId}:`, logError);
      }

      console.error(`Worker ${workerId} failed:`, error);
      throw error;
    } finally {
      // Clean up worker
      await this.cleanupWorker(workerId);
    }
  }

  async prepareWorkspace(worker, jobData) {
    try {
      // Create a temporary container to set up workspace
      const setupContainer = await this.docker.createContainer({
        Image: 'alpine:latest',
        Cmd: ['sh', '-c', 'echo "Setting up workspace..."'],
        HostConfig: {
          Binds: [
            `${worker.volumes.workspace.Name}:/workspace`
          ],
          AutoRemove: true
        },
        WorkingDir: '/workspace'
      });

      // Write job data to workspace
      const jobDataPath = '/workspace/job-data.json';
      await setupContainer.start();
      
      // Use docker exec to write job data
      const exec = await setupContainer.exec({
        Cmd: ['sh', '-c', `echo '${JSON.stringify(jobData)}' > job-data.json`],
        AttachStdout: true,
        AttachStderr: true
      });
      
      await exec.start();
      
      console.log(`Prepared workspace for worker ${worker.id}`);
    } catch (error) {
      console.error(`Failed to prepare workspace for worker ${worker.id}:`, error);
      throw error;
    }
  }

  async waitForCompletion(worker) {
    return new Promise((resolve, reject) => {
      // Attach to container logs
      worker.container.logs({
        follow: true,
        stdout: true,
        stderr: true
      }, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        let output = '';
        stream.on('data', (chunk) => {
          const data = chunk.toString();
          output += data;
          worker.logs.push({
            timestamp: new Date(),
            data: data
          });
        });

        // Wait for container to finish
        worker.container.wait((err, data) => {
          if (err) {
            reject(err);
          } else if (data.StatusCode === 0) {
            resolve({
              success: true,
              exitCode: data.StatusCode,
              output: output
            });
          } else {
            reject(new Error(`Worker exited with code ${data.StatusCode}`));
          }
        });
      });
    });
  }

  async collectArtifacts(worker) {
    try {
      // Get artifacts from volume
      const artifactsContainer = await this.docker.createContainer({
        Image: 'alpine:latest',
        Cmd: ['sh', '-c', 'find /artifacts -type f'],
        HostConfig: {
          Binds: [
            `${worker.volumes.artifacts.Name}:/artifacts`
          ],
          AutoRemove: true
        }
      });

      await artifactsContainer.start();
      
      // In a real implementation, this would upload artifacts to S3
      // For now, just log that artifacts were collected
      console.log(`Collected artifacts for worker ${worker.id}`);
      
      worker.artifacts = []; // Placeholder for S3 URLs
      
    } catch (error) {
      console.error(`Failed to collect artifacts for worker ${worker.id}:`, error);
    }
  }

  async collectLogs(worker) {
    try {
      // Logs are already collected in waitForCompletion
      // In a real implementation, this would upload logs to S3
      console.log(`Collected ${worker.logs.length} log entries for worker ${worker.id}`);
      
      worker.logsS3Url = `s3://bucket/logs/${worker.id}.log`; // Placeholder
      
    } catch (error) {
      console.error(`Failed to collect logs for worker ${worker.id}:`, error);
    }
  }

  async cleanupWorker(workerId) {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    try {
      // Stop and remove container (AutoRemove should handle this)
      try {
        await worker.container.stop();
      } catch (error) {
        // Container might already be stopped
      }

      // Remove ephemeral volumes
      for (const volume of Object.values(worker.volumes)) {
        try {
          await volume.remove();
        } catch (error) {
          console.error(`Failed to remove volume ${volume.Name}:`, error);
        }
      }

      this.workers.delete(workerId);
      console.log(`Cleaned up worker ${workerId}`);
      
    } catch (error) {
      console.error(`Failed to cleanup worker ${workerId}:`, error);
    }
  }

  async getWorkerStatus(workerId) {
    const worker = this.workers.get(workerId);
    if (!worker) {
      return null;
    }

    return {
      id: worker.id,
      status: worker.status,
      stack: worker.stack,
      startedAt: worker.startedAt,
      completedAt: worker.completedAt,
      logs: worker.logs.slice(-10), // Last 10 log entries
      artifacts: worker.artifacts || [],
      result: worker.result
    };
  }

  async listActiveWorkers() {
    const activeWorkers = [];
    for (const [workerId, worker] of this.workers) {
      if (worker.status === 'running') {
        activeWorkers.push({
          id: workerId,
          status: worker.status,
          stack: worker.stack,
          startedAt: worker.startedAt,
          jobId: worker.jobPayload.jobId
        });
      }
    }
    return activeWorkers;
  }

  async getPoolStats() {
    const stats = {
      totalWorkers: this.workers.size,
      activeWorkers: 0,
      completedWorkers: 0,
      failedWorkers: 0,
      maxWorkers: this.maxWorkers,
      resourceLimits: this.resourceLimits
    };

    for (const worker of this.workers.values()) {
      switch (worker.status) {
        case 'running':
          stats.activeWorkers++;
          break;
        case 'completed':
          stats.completedWorkers++;
          break;
        case 'failed':
          stats.failedWorkers++;
          break;
      }
    }

    return stats;
  }

  async shutdown() {
    console.log('Shutting down worker pool...');
    
    // Stop all active workers
    const cleanupPromises = [];
    for (const workerId of this.workers.keys()) {
      cleanupPromises.push(this.cleanupWorker(workerId));
    }
    
    await Promise.all(cleanupPromises);
    
    // Remove worker network
    try {
      const networks = await this.docker.listNetworks();
      const network = networks.find(net => net.Name === this.networkName);
      if (network) {
        await this.docker.getNetwork(network.Id).remove();
        console.log(`Removed worker network: ${this.networkName}`);
      }
    } catch (error) {
      console.error('Failed to remove worker network:', error);
    }
    
    console.log('Worker pool shutdown complete');
  }
}

module.exports = WorkerPool;