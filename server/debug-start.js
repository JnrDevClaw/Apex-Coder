const app = require('./app');
const fastify = require('fastify')({ logger: true });

console.log('Starting debug...');

// Mock decorate to match app.js expectations if needed, 
// but app.js uses fastify instance which has decorate.

(async () => {
    try {
        await app(fastify, {});
        console.log('App loaded successfully');
        await fastify.ready();
        console.log('App ready');
        process.exit(0);
    } catch (err) {
        console.error('App crashed:', err);
        process.exit(1);
    }
})();
