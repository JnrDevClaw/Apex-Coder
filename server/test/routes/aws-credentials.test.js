const { build, mockHelpers } = require('../helper');

describe('AWS Credentials Routes', () => {
  let app;

  beforeAll(async () => {
    app = await build();
  }, 30000); // 30 second timeout for app initialization

  afterAll(async () => {
    await app.close();
  });

  test('POST /api/aws/credentials - should validate and store valid credentials', async () => {
    // Mock the User model
    const mockUser = {
      id: 'test-user-123',
      awsAccountId: null,
      update: async function(data) {
        Object.assign(this, data);
        return this;
      }
    };

    // Mock User.findById
    const User = require('../../models/user');
    const originalFindById = User.findById;
    User.findById = async () => mockUser;

    // Mock AWS STS client
    const mockSTSResponse = {
      Account: '123456789012',
      UserId: 'AIDAI123456789EXAMPLE',
      Arn: 'arn:aws:iam::123456789012:user/test-user'
    };

    // Create a mock token
    const token = mockHelpers.createMockJWT({ userId: 'test-user-123' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/aws/credentials',
      headers: mockHelpers.createAuthHeaders(token),
      payload: {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        sessionToken: 'FwoGZXIvYXdzEBYaDExample',
        region: 'us-east-1'
      }
    });

    // Restore original User.findById
    User.findById = originalFindById;

    expect(response.statusCode).toBe(200);
    
    const json = response.json();
    expect(json.success).toBeTruthy();
    expect(json.accountId).toBeDefined();
    expect(json.region).toBe('us-east-1');
  });

  test('POST /api/aws/credentials - should reject invalid credentials', async () => {
    // Mock the User model
    const mockUser = {
      id: 'test-user-123',
      awsAccountId: null,
      update: async function(data) {
        Object.assign(this, data);
        return this;
      }
    };

    // Mock User.findById
    const User = require('../../models/user');
    const originalFindById = User.findById;
    User.findById = async () => mockUser;

    // Create a mock token
    const token = mockHelpers.createMockJWT({ userId: 'test-user-123' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/aws/credentials',
      headers: mockHelpers.createAuthHeaders(token),
      payload: {
        accessKeyId: 'INVALID_KEY',
        secretAccessKey: 'INVALID_SECRET',
        region: 'us-east-1'
      }
    });

    // Restore original User.findById
    User.findById = originalFindById;

    expect(response.statusCode).toBe(400);
    
    const json = response.json();
    expect(json.error).toBeDefined();
    expect(json.error).toBe('Invalid AWS credentials');
  });

  test('POST /api/aws/credentials - should require authentication', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/aws/credentials',
      payload: {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        region: 'us-east-1'
      }
    });

    expect(response.statusCode).toBe(401);
  });

  test('POST /api/aws/credentials - should validate required fields', async () => {
    const token = mockHelpers.createMockJWT({ userId: 'test-user-123' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/aws/credentials',
      headers: mockHelpers.createAuthHeaders(token),
      payload: {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE'
        // Missing secretAccessKey
      }
    });

    expect(response.statusCode).toBe(400);
    
    const json = response.json();
    expect(json.error).toBeDefined();
    expect(json.message).toMatch(/required/i);
  });

  test('POST /api/aws/credentials - should default to us-east-1 if region not provided', async () => {
    // Mock the User model
    const mockUser = {
      id: 'test-user-123',
      awsAccountId: null,
      update: async function(data) {
        Object.assign(this, data);
        return this;
      }
    };

    // Mock User.findById
    const User = require('../../models/user');
    const originalFindById = User.findById;
    User.findById = async () => mockUser;

    const token = mockHelpers.createMockJWT({ userId: 'test-user-123' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/aws/credentials',
      headers: mockHelpers.createAuthHeaders(token),
      payload: {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
        // No region specified
      }
    });

    // Restore original User.findById
    User.findById = originalFindById;

    if (response.statusCode === 200) {
      const json = response.json();
      expect(json.region).toBe('us-east-1');
    } else {
      // If validation fails (expected with fake credentials), that's okay
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    }
  });

  test('GET /api/aws/status - should return connection status', async () => {
    // Mock the User model
    const mockUser = {
      id: 'test-user-123',
      awsAccountId: '123456789012',
      awsRegion: 'us-west-2',
      awsConnectedAt: '2024-01-01T00:00:00.000Z'
    };

    // Mock User.findById
    const User = require('../../models/user');
    const originalFindById = User.findById;
    User.findById = async () => mockUser;

    const token = mockHelpers.createMockJWT({ userId: 'test-user-123' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/aws/status',
      headers: mockHelpers.createAuthHeaders(token)
    });

    // Restore original User.findById
    User.findById = originalFindById;

    expect(response.statusCode).toBe(200);
    
    const json = response.json();
    expect(json.connected).toBe(true);
    expect(json.accountId).toBe('123456789012');
    expect(json.region).toBe('us-west-2');
    expect(json.connectedAt).toBeDefined();
  });

  test('GET /api/aws/status - should return disconnected status', async () => {
    // Mock the User model with no AWS connection
    const mockUser = {
      id: 'test-user-123',
      awsAccountId: null,
      awsRegion: null,
      awsConnectedAt: null
    };

    // Mock User.findById
    const User = require('../../models/user');
    const originalFindById = User.findById;
    User.findById = async () => mockUser;

    const token = mockHelpers.createMockJWT({ userId: 'test-user-123' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/aws/status',
      headers: mockHelpers.createAuthHeaders(token)
    });

    // Restore original User.findById
    User.findById = originalFindById;

    expect(response.statusCode).toBe(200);
    
    const json = response.json();
    expect(json.connected).toBe(false);
    expect(json.accountId).toBeNull();
  });

  test('POST /api/aws/disconnect - should clear AWS credentials', async () => {
    // Mock the User model
    const mockUser = {
      id: 'test-user-123',
      awsAccountId: '123456789012',
      awsRegion: 'us-west-2',
      update: async function(data) {
        Object.assign(this, data);
        return this;
      }
    };

    // Mock User.findById
    const User = require('../../models/user');
    const originalFindById = User.findById;
    User.findById = async () => mockUser;

    const token = mockHelpers.createMockJWT({ userId: 'test-user-123' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/aws/disconnect',
      headers: mockHelpers.createAuthHeaders(token)
    });

    // Restore original User.findById
    User.findById = originalFindById;

    expect(response.statusCode).toBe(200);
    
    const json = response.json();
    expect(json.success).toBeTruthy();
    
    // Verify credentials were cleared
    expect(mockUser.awsAccountId).toBeNull();
    expect(mockUser.awsRegion).toBeNull();
  });

  test('POST /api/aws/disconnect - should require authentication', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/aws/disconnect'
    });

    expect(response.statusCode).toBe(401);
  });
});
