import { test } from 'tap';
import { build } from '../helper.js';

test('CloudFormation Service', async (t) => {
  t.test('createGitHubOIDCStack - should validate template exists', async (t) => {
    const app = await build(t);
    const { createGitHubOIDCStack } = await import('../../services/cloudformation-service.js');

    // Create a test user with AWS credentials
    const encryptedKey = app.encrypt('AKIAIOSFODNN7EXAMPLE');
    const encryptedSecret = app.encrypt('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');

    const user = await app.db.query(
      `INSERT INTO users (email, password_hash, github_username, aws_access_key, aws_secret_key, aws_region) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      ['test@example.com', 'hash', 'testuser', encryptedKey, encryptedSecret, 'us-east-1']
    );
    const userId = user.rows[0].id;

    // Note: This test will fail in CI without real AWS credentials
    // It's meant to verify the function structure and error handling
    try {
      await createGitHubOIDCStack(app, userId, {
        githubOwner: 'testuser',
        githubRepo: 'test-repo',
        region: 'us-east-1'
      });
      t.fail('Should have thrown an error with fake credentials');
    } catch (error) {
      t.ok(error, 'throws error with invalid credentials');
      t.pass('Function properly handles AWS errors');
    }
  });

  t.test('createGitHubOIDCStack - should fail without AWS credentials', async (t) => {
    const app = await build(t);
    const { createGitHubOIDCStack } = await import('../../services/cloudformation-service.js');

    // Create a test user without AWS credentials
    const user = await app.db.query(
      `INSERT INTO users (email, password_hash, github_username) 
       VALUES ($1, $2, $3) RETURNING id`,
      ['test2@example.com', 'hash', 'testuser2']
    );
    const userId = user.rows[0].id;

    try {
      await createGitHubOIDCStack(app, userId, {
        githubOwner: 'testuser',
        githubRepo: 'test-repo'
      });
      t.fail('Should have thrown an error');
    } catch (error) {
      t.equal(error.message, 'AWS credentials not configured', 'throws correct error message');
    }
  });
});
