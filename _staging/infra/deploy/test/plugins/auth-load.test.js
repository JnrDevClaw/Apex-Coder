const Fastify = require('fastify');

describe('Auth Plugin Loading Test', () => {
  test('should load auth plugin without errors', async () => {
    const fastify = Fastify();
    
    try {
      const authPlugin = require('../../plugins/auth');
      await fastify.register(authPlugin);
      expect(true).toBe(true);
    } catch (error) {
      console.error('Plugin loading error:', error);
      throw error;
    } finally {
      await fastify.close();
    }
  });
});