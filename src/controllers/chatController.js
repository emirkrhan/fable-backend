const { pool } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { checkDailyLimit, incrementUsage, getUserUsageStats } = require('../services/rateLimitService');

async function listChats(req, res) {
  try {
    const { boardId } = req.params;
    const { rows } = await pool.query('select id, board_id, title, created_at from chats where board_id = $1 order by created_at asc', [boardId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createChat(req, res) {
  try {
    const { boardId } = req.params;
    const id = uuidv4();
    const title = (req.body && req.body.title) ? String(req.body.title) : 'New chat';
    await pool.query('insert into chats (id, board_id, title) values ($1, $2, $3)', [id, boardId, title]);
    res.status(201).json({ id, board_id: boardId, title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function listMessages(req, res) {
  try {
    const { chatId } = req.params;
    const { rows } = await pool.query('select id, chat_id, role, content, created_at from chat_messages where chat_id = $1 order by created_at asc', [chatId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createMessage(req, res) {
  try {
    const { chatId } = req.params;
    const id = uuidv4();
    const role = (req.body && req.body.role) ? String(req.body.role) : 'user';
    const content = (req.body && req.body.content) ? String(req.body.content) : '';
    if (!content) return res.status(400).json({ error: 'content required' });

    // Only check rate limit for user messages (not AI responses)
    if (role === 'user' && req.user) {
      const userId = req.user.id;
      const userRole = req.user.role || 'user';

      // Check if user has exceeded daily limit
      const limitCheck = await checkDailyLimit(userId, userRole);
      if (!limitCheck.allowed) {
        return res.status(429).json({
          error: 'Daily message limit exceeded',
          current: limitCheck.current,
          limit: limitCheck.limit,
          remaining: 0,
          resetTime: new Date(new Date().setUTCHours(24, 0, 0, 0)).toISOString()
        });
      }

      // Insert message with user_id
      await pool.query(
        'insert into chat_messages (id, chat_id, role, content, user_id) values ($1, $2, $3, $4, $5)',
        [id, chatId, role, content, userId]
      );

      // Increment usage count
      await incrementUsage(userId);

      // Get updated stats
      const stats = await getUserUsageStats(userId, userRole);

      res.status(201).json({
        id,
        chat_id: chatId,
        role,
        content,
        usage: stats
      });
    } else {
      // AI response or system message - no rate limiting
      await pool.query(
        'insert into chat_messages (id, chat_id, role, content, user_id) values ($1, $2, $3, $4, $5)',
        [id, chatId, role, content, req.user?.id || null]
      );
      res.status(201).json({ id, chat_id: chatId, role, content });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function deleteChat(req, res) {
  try {
    const { boardId, chatId } = req.params;
    // Ensure chat belongs to board
    const { rows } = await pool.query('select id from chats where id = $1 and board_id = $2', [chatId, boardId]);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    await pool.query('delete from chat_messages where chat_id = $1', [chatId]);
    await pool.query('delete from chats where id = $1 and board_id = $2', [chatId, boardId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getUsageStats(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user.id;
    const userRole = req.user.role || 'user';
    const stats = await getUserUsageStats(userId, userRole);

    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { listChats, createChat, listMessages, createMessage, deleteChat, getUsageStats };


