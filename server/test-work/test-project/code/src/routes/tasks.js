const { getDb } = require('../lib/db');

async function taskRoutes(fastify) {
  fastify.get('/tasks', async (req, reply) => {
    const db = getDb();
    const tasks = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();
    return { tasks, total: tasks.length };
  });

  fastify.post('/tasks', async (req, reply) => {
    const { title } = req.body;
    if (!title) return reply.status(400).send({ error: 'Title required' });
    
    const db = getDb();
    const result = db.prepare('INSERT INTO tasks (title) VALUES (?)').run(title);
    return { id: result.lastInsertRowid, title, completed: false };
  });

  fastify.put('/tasks/:id', async (req, reply) => {
    const { id } = req.params;
    const { completed } = req.body;
    const db = getDb();
    db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(completed ? 1 : 0, id);
    return { id, completed };
  });

  fastify.delete('/tasks/:id', async (req, reply) => {
    const { id } = req.params;
    const db = getDb();
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    return { deleted: true };
  });
}

module.exports = taskRoutes;