const { Octokit } = require('octokit');
const { withRetry, GITHUB_RETRY_CONFIG } = require('../utils/retry.js');

/**
 * Create repository and push all files atomically
 */
async function pushGeneratedAppToGitHub({
  githubToken,
  owner,
  repoName,
  generatedFiles,      // { "src/App.svelte": "...", "package.json": "..." }
  githubWorkflowYML,   // GitHub Actions workflow content
  privateRepo = true,
  webhookUrl = null    // Optional webhook URL to register
}) {
  const octokit = new Octokit({ auth: githubToken });

  // 1. Create repo if not exists with retry logic
  let repo;
  let repoCreated = false;
  try {
    repo = await withRetry(
      () => octokit.rest.repos.get({ owner, repo: repoName }),
      GITHUB_RETRY_CONFIG
    );
  } catch (error) {
    if (error.status === 404) {
      repo = await withRetry(
        () => octokit.rest.repos.createForAuthenticatedUser({
          name: repoName,
          private: privateRepo,
          auto_init: false,
          description: 'AI-generated application'
        }),
        GITHUB_RETRY_CONFIG
      );
      repoCreated = true;
    } else {
      throw error;
    }
  }

  // 2. Prepare all files including workflow
  const filesToCommit = {
    ...generatedFiles,
    '.github/workflows/deploy.yml': githubWorkflowYML
  };

  // 3. Create git tree with retry logic
  const treeSha = await withRetry(
    () => createGitTree(octokit, owner, repoName, filesToCommit),
    GITHUB_RETRY_CONFIG
  );

  // 4. Create commit and update main branch with retry logic
  const commit = await withRetry(
    () => createCommit(
      octokit,
      owner,
      repoName,
      treeSha,
      'AI-generated application + deployment workflow'
    ),
    GITHUB_RETRY_CONFIG
  );

  // 5. Register webhook if URL provided and repo was just created
  if (webhookUrl && repoCreated) {
    try {
      await registerWebhook(octokit, owner, repoName, webhookUrl);
      console.log(`Webhook registered for ${owner}/${repoName}`);
    } catch (error) {
      console.error(`Failed to register webhook for ${owner}/${repoName}:`, error.message);
      // Don't fail the entire operation if webhook registration fails
    }
  }

  return {
    repoUrl: repo.data.html_url,
    commitSha: commit.sha,
    repoFullName: `${owner}/${repoName}`
  };
}

/**
 * Helper: Create blob for file
 */
async function createBlobForFile(octokit, owner, repo, fileContent) {
  const encoded = Buffer.from(fileContent).toString('base64');

  const blob = await withRetry(
    () => octokit.rest.git.createBlob({
      owner,
      repo,
      content: encoded,
      encoding: 'base64'
    }),
    GITHUB_RETRY_CONFIG
  );

  return blob.data.sha;
}

/**
 * Helper: Create git tree from files
 */
async function createGitTree(octokit, owner, repo, files, baseTreeSha = null) {
  const tree = [];

  for (const filePath of Object.keys(files)) {
    const content = files[filePath];
    const blobSha = await createBlobForFile(octokit, owner, repo, content);

    tree.push({
      path: filePath,
      mode: '100644',
      type: 'blob',
      sha: blobSha
    });
  }

  const treeResp = await withRetry(
    () => octokit.rest.git.createTree({
      owner,
      repo,
      tree,
      base_tree: baseTreeSha || undefined
    }),
    GITHUB_RETRY_CONFIG
  );

  return treeResp.data.sha;
}

/**
 * Helper: Create commit and update branch
 */
async function createCommit(octokit, owner, repo, treeSha, message) {
  let parentSha = null;

  // Try to get existing main branch with retry logic
  try {
    const ref = await withRetry(
      () => octokit.rest.git.getRef({
        owner,
        repo,
        ref: 'heads/main'
      }),
      GITHUB_RETRY_CONFIG
    );
    parentSha = ref.data.object.sha;
  } catch (error) {
    // No main branch yet, will create it
    parentSha = null;
  }

  // Create commit with retry logic
  const commit = await withRetry(
    () => octokit.rest.git.createCommit({
      owner,
      repo,
      message,
      tree: treeSha,
      parents: parentSha ? [parentSha] : []
    }),
    GITHUB_RETRY_CONFIG
  );

  // Update or create main branch with retry logic
  if (parentSha) {
    await withRetry(
      () => octokit.rest.git.updateRef({
        owner,
        repo,
        ref: 'heads/main',
        sha: commit.data.sha,
        force: true
      }),
      GITHUB_RETRY_CONFIG
    );
  } else {
    await withRetry(
      () => octokit.rest.git.createRef({
        owner,
        repo,
        ref: 'refs/heads/main',
        sha: commit.data.sha
      }),
      GITHUB_RETRY_CONFIG
    );
  }

  return commit.data;
}

/**
 * Register webhook for repository
 */
async function registerWebhook(octokit, owner, repo, webhookUrl) {
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

  // Check if webhook already exists with retry logic
  try {
    const { data: hooks } = await withRetry(
      () => octokit.rest.repos.listWebhooks({
        owner,
        repo
      }),
      GITHUB_RETRY_CONFIG
    );

    const existingHook = hooks.find(hook => hook.config.url === webhookUrl);
    if (existingHook) {
      console.log(`Webhook already exists for ${owner}/${repo}`);
      return existingHook;
    }
  } catch (error) {
    console.warn(`Could not check existing webhooks: ${error.message}`);
  }

  // Create new webhook with retry logic
  const webhook = await withRetry(
    () => octokit.rest.repos.createWebhook({
      owner,
      repo,
      config: {
        url: webhookUrl,
        content_type: 'json',
        secret: webhookSecret || undefined,
        insecure_ssl: '0'
      },
      events: [
        'workflow_run',
        'workflow_job',
        'push'
      ],
      active: true
    }),
    GITHUB_RETRY_CONFIG
  );

  return webhook.data;
}

module.exports = {
  pushGeneratedAppToGitHub,
  createBlobForFile,
  createGitTree,
  createCommit,
  registerWebhook
};
