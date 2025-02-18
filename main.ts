import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

interface Env {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Env }>();

// Add CORS middleware
app.use('*', cors());

// Schema validation
const createTodoSchema = z.object({
  title: z.string().min(1).max(100),
});

const updateTodoSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  completed: z.boolean().optional(),
});

// Routes
app.get('/todos', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM todos ORDER BY created_at DESC'
    ).all();
    return c.json(results);
  } catch (error) {
    console.error('Failed to fetch todos:', error);
    return c.json({ error: 'Failed to fetch todos' }, 500);
  }
});

app.get('/todos/:id', async (c) => {
  const id = c.req.param('id');
  
  try {
    const todo = await c.env.DB.prepare(
      'SELECT * FROM todos WHERE id = ?'
    ).bind(id).first();
    
    if (!todo) {
      return c.json({ error: 'Todo not found' }, 404);
    }
    
    return c.json(todo);
  } catch (error) {
    console.error('Failed to fetch todo:', error);
    return c.json({ error: 'Failed to fetch todo' }, 500);
  }
});

app.post('/todos', zValidator('json', createTodoSchema), async (c) => {
  const { title } = c.req.valid('json');
  
  try {
    const result = await c.env.DB.prepare(
      'INSERT INTO todos (title) VALUES (?) RETURNING *'
    ).bind(title).first();
    
    return c.json(result, 201);
  } catch (error) {
    console.error('Failed to create todo:', error);
    return c.json({ error: 'Failed to create todo' }, 500);
  }
});

app.patch('/todos/:id', zValidator('json', updateTodoSchema), async (c) => {
  const id = c.req.param('id');
  const updates = c.req.valid('json');
  
  try {
    // First check if todo exists
    const existingTodo = await c.env.DB.prepare(
      'SELECT * FROM todos WHERE id = ?'
    ).bind(id).first();
    
    if (!existingTodo) {
      return c.json({ error: 'Todo not found' }, 404);
    }
    
    // Build update query dynamically based on provided fields
    const updateFields = [];
    const values = [];
    if (updates.title !== undefined) {
      updateFields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.completed !== undefined) {
      updateFields.push('completed = ?');
      values.push(updates.completed);
    }
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    
    const updateQuery = `
      UPDATE todos 
      SET ${updateFields.join(', ')}
      WHERE id = ?
      RETURNING *
    `;
    
    const updatedTodo = await c.env.DB.prepare(updateQuery)
      .bind(...values, id)
      .first();
    
    return c.json(updatedTodo);
  } catch (error) {
    console.error('Failed to update todo:', error);
    return c.json({ error: 'Failed to update todo' }, 500);
  }
});

app.delete('/todos/:id', async (c) => {
  const id = c.req.param('id');
  
  try {
    await c.env.DB.prepare(
      'DELETE FROM todos WHERE id = ?'
    ).bind(id).run();
    
    return c.json({ message: 'Todo deleted successfully' });
  } catch (error) {
    console.error('Failed to delete todo:', error);
    return c.json({ error: 'Failed to delete todo' }, 500);
  }
});

export default app;