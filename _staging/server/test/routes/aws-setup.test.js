import { test } from 'tap';
import { build } from '../helper.js';

test('AWS Setup Routes', async (t) => {
  const app = await build(t);

  t.test('POST /api/aws/setup - should require authentication', async (t) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/aws/setup',
      payload: {
        githubOwner: 'testuser',
        githubRepo: 'test-repo'
      }
    });

    t.equal(response.statusCode, 401, 'returns 401 unauthorized');
  });

  t.test('POST /api/aws/setup - should validate required fields', async (t) => {
    // Create a test user and get token
    const user = await app.db.query(
      `INSERT INTO users (email, password_hash, github_username) 
       VALUES ($1, $2, $3) RETURNING id`,
      ['test@example.com', 'hash', 'testuser']
    );
    const userId = user.rows[0].id;

    const token = app.jwt.sign({ id: userId, email: 'test@example.com' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/aws/setup',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {}
    });

    t.equal(response.statusCode, 400, 'returns 400 for missing fields');
  });

  t.test('POST /api/aws/setup - should fail without AWS credentials', async (t) => {
    // Create a test user without AWS credentials
    const user = await app.db.query(
      `INSERT INTO users (email, password_hash, github_username) 
       VALUES ($1, $2, $3) RETURNING id`,
      ['test2@example.com', 'hash', 'testuser2']
    );
    const userId = user.rows[0].id;

    const token = app.jwt.sign({ id: userId, email: 'test2@example.com' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/aws/setup',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        githubOwner: 'testuser',
        githubRepo: 'test-repo'
      }
    });

    t.equal(response.statusCode, 400, 'returns 400 for missing AWS credentials');
    const json = response.json();
    t.match(json.error, /AWS credentials not configured/, 'error message mentions AWS credentials');
  });

  t.test('GET /api/aws/setup/status - should require authentication', async (t) => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/aws/setup/status'
    });

    t.equal(response.statusCode, 401, 'returns 401 unauthorized');
  });

  t.test('GET /api/aws/setup/status - should return empty array for new user', async (t) => {
    // Create a test user
    const user = await app.db.query(
      `INSERT INTO users (email, password_hash, github_username) 
       VALUES ($1, $2, $3) RETURNING id`,
      ['test3@example.com', 'hash', 'testuser3']
    );
    const userId = user.rows[0].id;

    const token = app.jwt.sign({ id: userId, email: 'test3@example.com' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/aws/setup/status',
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    t.equal(response.statusCode, 200, 'returns 200');
    const json = response.json();
    t.ok(json.success, 'response is successful');
    t.same(json.stacks, [], 'returns empty stacks array');
  });

  t.test('GET /api/aws/setup/status - should return user stacks', async (t) => {
    // Create a test user
    const user = await app.db.query(
      `INSERT INTO users (email, password_hash, github_username) 
       VALUES ($1, $2, $3) RETURNING id`,
      ['test4@example.com', 'hash', 'testuser4']
    );
    const userId = user.rows[0].id;

    // Create a test stack
    await app.db.query(
      `INSERT INTO cloudformation_stacks 
       (user_id, stack_name, region, role_arn, bucket_name, github_owner, github_repo)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        'test-stack',
        'us-east-1',
        'arn:aws:iam::123456789012:role/test-role',
        'test-bucket',
        'testuser4',
        'test-repo'
      ]
    );

    const token = app.jwt.sign({ id: userId, email: 'test4@example.com' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/aws/setup/status',
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    t.equal(response.statusCode, 200, 'returns 200');
    const json = response.json();
    t.ok(json.success, 'response is successful');
    t.equal(json.stacks.length, 1, 'returns one stack');
    t.equal(json.stacks[0].stack_name, 'test-stack', 'stack name matches');
    t.equal(json.stacks[0].github_owner, 'testuser4', 'github owner matches');
  });
});
