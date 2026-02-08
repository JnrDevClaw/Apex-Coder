const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const taskRoutes = require('./routes/tasks');
const { initDb } = require('./lib/db');

async function start() {
  await fastify.register(cors, { origin: true });
  await fastify.register(taskRoutes, { prefix: '/api' });
  await initDb();
  
  const port = process.env.PORT || 3000;
  await fastify.listen({ port, host: '0.0.0.0' });
  console.log(`Server running on port ${port}`);
}

start().catch(console.error);
module.exports = { start };