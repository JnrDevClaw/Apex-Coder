const { Octokit } = require('octokit');
const User = require('../models/user');
const { decrypt } = require('./encryption');
const { logGitHubError, logDatabaseError, logEncryptionError } = require('./deployment-error-logger');

/**
 * Get an authenticated Octokit client for a user
 * @param {string} userId - User ID
 * @returns {Promise<Octokit>} Authenticated Octokit instance
 * @throws {Error} If GitHub is not connected or token is invalid
 */
async function getGitHubClient(userId) {
  try {
    // Fetch user from database
    const user = await User.findById(userId);
    
    if (!user) {
      const error = new Error('User not found');
      logDatabaseError('getGitHubClient', error, { userId, table: 'users' });
      throw error;
    }

    if (!user.githubToken) {
      const error = new Error('GitHub not connected. Please connect your GitHub account first.');
      logGitHubError('getGitHubClient', error, { userId, operation: 'token_missing' });
      throw error;
    }

    try {
      // Decrypt the stored token
      const token = decrypt(user.githubToken);
      
      // Create and return authenticated Octokit client
      return new Octokit({ auth: token });
    } catch (error) {
      logEncryptionError('getGitHubClient', error, { userId, dataType: 'github_token' });
      throw new Error(`Failed to decrypt GitHub token: ${error.message}`);
    }
  } catch (error) {
    // Re-throw if already logged
    if (error.message.includes('User not found') || 
        error.message.includes('GitHub not connected') || 
        error.message.includes('Failed to decrypt')) {
      throw error;
    }
    // Log unexpected errors
    logGitHubError('getGitHubClient', error, { userId, operation: 'unexpected_error' });
    throw error;
  }
}

/**
 * Test GitHub connection for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Connection test result
 */
async function testGitHubConnection(userId) {
  try {
    const octokit = await getGitHubClient(userId);
    
    // Try to get authenticated user info
    const { data } = await octokit.rest.users.getAuthenticated();
    
    return {
      success: true,
      username: data.login,
      name: data.name,
      email: data.email,
      avatarUrl: data.avatar_url
    };
  } catch (error) {
    logGitHubError('testGitHubConnection', error, { userId, operation: 'test_connection' });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get GitHub username for a user
 * @param {string} userId - User ID
 * @returns {Promise<string|null>} GitHub username or null if not connected
 */
async function getGitHubUsername(userId) {
  try {
    const user = await User.findById(userId);
    return user?.githubUsername || null;
  } catch (error) {
    logDatabaseError('getGitHubUsername', error, { userId, table: 'users', operation: 'fetch_username' });
    return null;
  }
}

/**
 * Check if user has GitHub connected
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if GitHub is connected
 */
async function isGitHubConnected(userId) {
  try {
    const user = await User.findById(userId);
    return !!(user?.githubToken && user?.githubUsername);
  } catch (error) {
    logDatabaseError('isGitHubConnected', error, { userId, table: 'users', operation: 'check_connection' });
    return false;
  }
}

module.exports = {
  getGitHubClient,
  testGitHubConnection,
  getGitHubUsername,
  isGitHubConnected
};
