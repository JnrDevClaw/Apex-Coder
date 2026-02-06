/**
 * Mock Pipeline Store for Demo Purposes
 * Simulates the AI app building process with realistic timing and updates
 */

import { writable, derived } from 'svelte/store';

// Pipeline stages based on the steering document
export const pipelineStages = [
  {
    id: 'initializing',
    label: 'Initializing AI Pipeline',
    description: 'Setting up AI models and processing queue',
    duration: 3000
  },
  {
    id: 'analyzing_requirements',
    label: 'Analyzing Requirements',
    description: 'AI is analyzing your project specifications',
    duration: 8000
  },
  {
    id: 'generating_architecture',
    label: 'Generating Architecture',
    description: 'Designing system architecture and data flow',
    duration: 12000
  },
  {
    id: 'creating_database_schema',
    label: 'Creating Database Schema',
    description: 'Designing database structure and relationships',
    duration: 10000
  },
  {
    id: 'planning_file_structure',
    label: 'Planning File Structure',
    description: 'Organizing project files and dependencies',
    duration: 6000
  },
  {
    id: 'generating_code',
    label: 'Generating Code',
    description: 'AI is writing your application code',
    duration: 'ongoing', // This will run indefinitely
    supportsMultiple: true,
    files: [
      'Frontend components',
      'API endpoints',
      'Database models',
      'Authentication system',
      'Business logic',
      'UI styling',
      'Configuration files',
      'Tests and validation'
    ]
  },
  {
    id: 'running_tests',
    label: 'Running Tests',
    description: 'Executing automated tests and validations',
    duration: 8000
  },
  {
    id: 'creating_repository',
    label: 'Creating Repository',
    description: 'Initializing Git repository and pushing code',
    duration: 6000
  },
  {
    id: 'deploying',
    label: 'Deploying to AWS',
    description: 'Provisioning infrastructure and deploying application',
    duration: 15000,
    supportsMultiple: true,
    resources: [
      'Creating S3 bucket',
      'Setting up CloudFront distribution',
      'Configuring Lambda functions',
      'Setting up API Gateway',
      'Creating ECS cluster',
      'Deploying containers',
      'Configuring load balancer',
      'Setting up database'
    ]
  },
  {
    id: 'deployment_complete',
    label: 'Deployment Complete',
    description: 'Application successfully deployed and accessible',
    duration: 2000
  }
];

// Current pipeline state
export const pipelineState = writable({
  isRunning: false,
  currentStageIndex: -1,
  stageStatuses: {},
  stageDetails: {},
  startTime: null,
  endTime: null,
  error: null,
  projectName: '',
  repoUrl: '',
  appUrl: ''
});

// Derived stores
export const currentStage = derived(
  pipelineState,
  ($state) => {
    if ($state.currentStageIndex >= 0 && $state.currentStageIndex < pipelineStages.length) {
      return pipelineStages[$state.currentStageIndex];
    }
    return null;
  }
);

export const isComplete = derived(
  pipelineState,
  ($state) => $state.currentStageIndex >= pipelineStages.length
);

export const hasError = derived(
  pipelineState,
  ($state) => !!$state.error
);

export const progress = derived(
  pipelineState,
  ($state) => {
    if ($state.currentStageIndex < 0) return 0;
    return Math.round(($state.currentStageIndex / pipelineStages.length) * 100);
  }
);

// Mock GitHub and AWS connection states
export const githubConnection = writable({
  isConnected: false,
  username: '',
  avatar: '',
  isConnecting: false
});

export const awsConnection = writable({
  isConnected: false,
  accountId: '',
  region: 'us-east-1',
  isConnecting: false
});

// Pipeline control functions
export function startPipeline(projectSpec) {
  pipelineState.update(state => ({
    ...state,
    isRunning: true,
    currentStageIndex: 0,
    stageStatuses: {},
    stageDetails: {},
    startTime: new Date(),
    endTime: null,
    error: null,
    projectName: projectSpec.project_overview?.app_name || 'My App',
    repoUrl: '',
    appUrl: ''
  }));

  // Start executing stages
  executeNextStage();
}

export function stopPipeline() {
  pipelineState.update(state => ({
    ...state,
    isRunning: false,
    error: 'Pipeline stopped by user'
  }));
}

function executeNextStage() {
  pipelineState.subscribe(state => {
    if (!state.isRunning || state.currentStageIndex >= pipelineStages.length) {
      return;
    }

    const stage = pipelineStages[state.currentStageIndex];
    
    // Update stage status to running
    pipelineState.update(s => ({
      ...s,
      stageStatuses: {
        ...s.stageStatuses,
        [stage.id]: 'running'
      }
    }));

    // Simulate stage execution
    if (stage.supportsMultiple) {
      executeMultipleItemStage(stage);
    } else {
      executeSingleItemStage(stage);
    }
  })();
}

function executeSingleItemStage(stage) {
  // Handle ongoing stages differently
  if (stage.duration === 'ongoing') {
    // Mark as running and don't complete
    pipelineState.update(state => ({
      ...state,
      stageStatuses: {
        ...state.stageStatuses,
        [stage.id]: 'running'
      }
    }));
    return; // Don't proceed to next stage
  }

  setTimeout(() => {
    pipelineState.update(state => {
      const newState = {
        ...state,
        stageStatuses: {
          ...state.stageStatuses,
          [stage.id]: getStageResult(stage)
        },
        currentStageIndex: state.currentStageIndex + 1
      };

      return newState;
    });

    // Continue to next stage if not complete
    pipelineState.subscribe(state => {
      if (state.isRunning && state.currentStageIndex < pipelineStages.length) {
        setTimeout(executeNextStage, 500);
      }
    })();
  }, stage.duration);
}

function executeMultipleItemStage(stage) {
  const items = stage.files || stage.tests || stage.resources || [];
  let currentItemIndex = 0;

  // Handle ongoing stages
  if (stage.duration === 'ongoing') {
    function processOngoingItem() {
      if (!pipelineState.subscribe(state => state.isRunning)()) {
        return; // Stop if pipeline is stopped
      }

      const item = items[currentItemIndex % items.length];
      
      // Update stage details with current item
      pipelineState.update(state => ({
        ...state,
        stageDetails: {
          ...state.stageDetails,
          [stage.id]: {
            currentItem: item,
            progress: Math.min(95, Math.round((currentItemIndex / items.length) * 100)),
            isOngoing: true,
            itemsProcessed: currentItemIndex + 1
          }
        }
      }));

      currentItemIndex++;
      
      // Continue processing items with random intervals
      const nextInterval = 2000 + Math.random() * 4000; // 2-6 seconds
      setTimeout(processOngoingItem, nextInterval);
    }

    processOngoingItem();
    return;
  }

  // Handle regular stages
  function processNextItem() {
    if (currentItemIndex >= items.length) {
      // Stage complete
      pipelineState.update(state => ({
        ...state,
        stageStatuses: {
          ...state.stageStatuses,
          [stage.id]: 'done'
        },
        currentStageIndex: state.currentStageIndex + 1
      }));

      // Continue to next stage
      setTimeout(executeNextStage, 500);
      return;
    }

    const item = items[currentItemIndex];
    const itemDuration = stage.duration / items.length;

    // Update stage details with current item
    pipelineState.update(state => ({
      ...state,
      stageDetails: {
        ...state.stageDetails,
        [stage.id]: {
          currentItem: item,
          progress: Math.round(((currentItemIndex + 1) / items.length) * 100)
        }
      }
    }));

    setTimeout(() => {
      currentItemIndex++;
      processNextItem();
    }, itemDuration);
  }

  processNextItem();
}

function getStageResult(stage) {
  // Simulate occasional failures for realism
  if (Math.random() < 0.05) { // 5% chance of failure
    return 'error';
  }

  switch (stage.id) {
    case 'running_tests':
      return Math.random() < 0.9 ? 'passed' : 'failed';
    case 'creating_repo':
    case 'deployment_complete':
      return 'done';
    case 'pushing_files':
      return 'pushed';
    case 'deploying':
      return 'deployed';
    default:
      return 'created';
  }
}

// Real connection functions
export async function connectToGitHub() {
  githubConnection.update(state => ({ ...state, isConnecting: true }));
  
  try {
    // Try real GitHub OAuth first
    const popup = window.open(
      '/api/auth/github',
      'github-oauth',
      'width=600,height=700,scrollbars=yes,resizable=yes'
    );

    // Listen for OAuth success message
    const result = await new Promise((resolve, reject) => {
      const messageHandler = (event) => {
        if (event.data.type === 'github-oauth-success') {
          window.removeEventListener('message', messageHandler);
          popup.close();
          resolve(event.data);
        }
      };

      window.addEventListener('message', messageHandler);

      // Check if popup was closed without success
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', messageHandler);
          reject(new Error('OAuth popup was closed'));
        }
      }, 1000);

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(checkClosed);
        window.removeEventListener('message', messageHandler);
        popup.close();
        reject(new Error('OAuth timeout'));
      }, 300000);
    });

    githubConnection.update(state => ({
      ...state,
      isConnected: true,
      isConnecting: false,
      username: result.user.username,
      avatar: result.user.avatar,
      token: result.token
    }));

  } catch (error) {
    console.log('Real GitHub OAuth failed, falling back to mock:', error.message);
    
    // Fallback to mock
    try {
      const { mockGitHubOAuth } = await import('../api/mock-backend.js');
      const result = await mockGitHubOAuth();
      
      if (result.success) {
        githubConnection.update(state => ({
          ...state,
          isConnected: true,
          isConnecting: false,
          username: result.user.username,
          avatar: result.user.avatar,
          isMock: true
        }));
      } else {
        throw new Error('Mock GitHub connection failed');
      }
    } catch (mockError) {
      githubConnection.update(state => ({
        ...state,
        isConnecting: false,
        error: mockError.message
      }));
    }
  }
}

export async function connectToAWS() {
  awsConnection.update(state => ({ ...state, isConnecting: true }));
  
  try {
    // For demo purposes, show a credential input dialog
    const credentials = await showAWSCredentialsDialog();
    
    if (!credentials) {
      throw new Error('AWS credentials not provided');
    }

    // Try to validate credentials with real AWS
    const response = await fetch('/api/aws/credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    if (response.ok) {
      const result = await response.json();
      awsConnection.update(state => ({
        ...state,
        isConnected: true,
        isConnecting: false,
        accountId: result.account.accountId,
        region: credentials.region || 'us-east-1'
      }));
    } else {
      throw new Error('Invalid AWS credentials');
    }

  } catch (error) {
    console.log('Real AWS connection failed, falling back to mock:', error.message);
    
    // Fallback to mock
    try {
      const { mockAWSConnection } = await import('../api/mock-backend.js');
      const result = await mockAWSConnection({ region: 'us-east-1' });
      
      if (result.success) {
        awsConnection.update(state => ({
          ...state,
          isConnected: true,
          isConnecting: false,
          accountId: result.account.accountId,
          region: result.account.region,
          isMock: true
        }));
      } else {
        throw new Error('Mock AWS connection failed');
      }
    } catch (mockError) {
      awsConnection.update(state => ({
        ...state,
        isConnecting: false,
        error: mockError.message
      }));
    }
  }
}

// Helper function to show AWS credentials dialog
function showAWSCredentialsDialog() {
  // Check if we're in the browser
  if (typeof document === 'undefined') {
    return Promise.resolve(null);
  }
  
  return new Promise((resolve) => {
    const dialog = document.createElement('div');
    dialog.innerHTML = `
      <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;">
        <div style="background: white; padding: 30px; border-radius: 8px; max-width: 400px; width: 90%;">
          <h3 style="margin: 0 0 20px 0; color: #333;">Connect to AWS</h3>
          <p style="color: #666; margin-bottom: 20px; font-size: 14px;">Enter your AWS credentials to enable real deployment features:</p>
          
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Access Key ID:</label>
            <input type="text" id="aws-access-key" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" placeholder="AKIA...">
          </div>
          
          <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Secret Access Key:</label>
            <input type="password" id="aws-secret-key" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" placeholder="Enter secret key">
          </div>
          
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Region:</label>
            <select id="aws-region" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
              <option value="us-east-1">US East (N. Virginia)</option>
              <option value="us-west-2">US West (Oregon)</option>
              <option value="eu-west-1">Europe (Ireland)</option>
              <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
            </select>
          </div>
          
          <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button id="aws-cancel" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">Use Mock</button>
            <button id="aws-connect" style="padding: 8px 16px; border: none; background: #007bff; color: white; border-radius: 4px; cursor: pointer;">Connect</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    dialog.querySelector('#aws-connect').onclick = () => {
      const accessKeyId = dialog.querySelector('#aws-access-key').value.trim();
      const secretAccessKey = dialog.querySelector('#aws-secret-key').value.trim();
      const region = dialog.querySelector('#aws-region').value;
      
      document.body.removeChild(dialog);
      
      if (accessKeyId && secretAccessKey) {
        resolve({ accessKeyId, secretAccessKey, region });
      } else {
        resolve(null);
      }
    };
    
    dialog.querySelector('#aws-cancel').onclick = () => {
      document.body.removeChild(dialog);
      resolve(null);
    };
  });
}

export function disconnectGitHub() {
  githubConnection.set({
    isConnected: false,
    username: '',
    avatar: '',
    isConnecting: false
  });
}

export function disconnectAWS() {
  awsConnection.set({
    isConnected: false,
    accountId: '',
    region: 'us-east-1',
    isConnecting: false
  });
}

// Pipeline management stores for dashboard
export const pipelines = writable(new Map());
export const pipelineFilters = writable({
  status: 'all',
  sortBy: 'createdAt',
  sortOrder: 'desc'
});

// Derived stores for dashboard
export const filteredPipelines = derived(
  [pipelines, pipelineFilters],
  ([$pipelines, $filters]) => {
    let pipelineArray = Array.from($pipelines.values());
    
    // Apply status filter
    if ($filters.status !== 'all') {
      pipelineArray = pipelineArray.filter(pipeline => pipeline.status === $filters.status);
    }
    
    // Apply sorting
    pipelineArray.sort((a, b) => {
      let aValue = a[$filters.sortBy];
      let bValue = b[$filters.sortBy];
      
      // Handle date strings
      if ($filters.sortBy.includes('At')) {
        aValue = new Date(aValue || 0).getTime();
        bValue = new Date(bValue || 0).getTime();
      }
      
      // Handle progress numbers
      if ($filters.sortBy === 'progress') {
        aValue = aValue || 0;
        bValue = bValue || 0;
      }
      
      if ($filters.sortOrder === 'desc') {
        return bValue > aValue ? 1 : -1;
      } else {
        return aValue > bValue ? 1 : -1;
      }
    });
    
    return pipelineArray;
  }
);

export const pipelineStats = derived(
  pipelines,
  ($pipelines) => {
    const stats = {
      total: $pipelines.size,
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0
    };
    
    for (const pipeline of $pipelines.values()) {
      stats[pipeline.status] = (stats[pipeline.status] || 0) + 1;
    }
    
    return stats;
  }
);

// Pipeline management functions
export function setPipelineFilters(filters) {
  pipelineFilters.update(current => ({
    ...current,
    ...filters
  }));
}

export function cancelPipeline(pipelineId) {
  pipelines.update(pipelineMap => {
    const newMap = new Map(pipelineMap);
    const pipeline = newMap.get(pipelineId);
    
    if (pipeline && (pipeline.status === 'pending' || pipeline.status === 'running')) {
      const updatedPipeline = { ...pipeline };
      updatedPipeline.status = 'cancelled';
      updatedPipeline.completedAt = new Date().toISOString();
      
      newMap.set(pipelineId, updatedPipeline);
    }
    
    return newMap;
  });
}

export function retryPipeline(pipelineId) {
  pipelines.update(pipelineMap => {
    const newMap = new Map(pipelineMap);
    const pipeline = newMap.get(pipelineId);
    
    if (pipeline && pipeline.status === 'failed') {
      const updatedPipeline = { ...pipeline };
      updatedPipeline.status = 'pending';
      updatedPipeline.progress = 0;
      updatedPipeline.startedAt = null;
      updatedPipeline.completedAt = null;
      updatedPipeline.error = null;
      
      newMap.set(pipelineId, updatedPipeline);
    }
    
    return newMap;
  });
}

// Reset pipeline state
export function resetPipeline() {
  pipelineState.set({
    isRunning: false,
    currentStageIndex: -1,
    stageStatuses: {},
    stageDetails: {},
    startTime: null,
    endTime: null,
    error: null,
    projectName: '',
    repoUrl: '',
    appUrl: ''
  });
}