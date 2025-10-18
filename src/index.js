const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
// Read allowed CORS origins from environment (comma-separated)
const rawCorsOrigins = process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://localhost:3002';
const ALLOWED_ORIGINS = rawCorsOrigins.split(',').map(o => o.trim()).filter(Boolean);
const { pool, checkConnection, ensureSchema } = require('./db');
const { ensureDemoUser } = require('./seed/demoUser');
const boardsRouter = require('./routes/boards');
const usersRouter = require('./routes/users');
const authRouter = require('./routes/auth');
const pkg = require('../package.json');

const app = express();
const http = require('http');
const server = http.createServer(app);
const { ExpressPeerServer } = require('peer');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { userCanViewBoard } = require('./services/boardShareService');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
// Ensure uploads directory exists and serve it statically
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
	fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(cors({
	origin: ALLOWED_ORIGINS,
	credentials: true,
	methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
const PORT = process.env.PORT || 4000;
const io = new Server(server, {
	cors: {
		origin: ALLOWED_ORIGINS,
		credentials: true
	},
	pingInterval: 25000, // Send ping every 25 seconds
	pingTimeout: 20000,  // Wait 20 seconds for pong response
	transports: ['polling', 'websocket'], // Start with polling, upgrade to websocket
	upgradeTimeout: 10000, // Allow 10 seconds for upgrade
	allowUpgrades: true
});
app.set('io', io);

app.get('/', (req, res) => {
	res.json({ message: 'Merhaba Express!' });
});

app.get('/db/health', async (req, res) => {
	try {
		const ok = await checkConnection();
		res.json({ database: ok ? 'up' : 'down' });
	} catch (err) {
		res.status(500).json({ database: 'down', error: err.message });
	}
});

app.get('/healthz', (req, res) => {
	res.json({
		status: 'ok',
		service: 'story-back',
		version: pkg.version || '0.0.0',
		uptime: Math.round(process.uptime()),
		timestamp: new Date().toISOString()
	});
});

app.use('/api/boards', boardsRouter);
app.use('/api/users', usersRouter);
app.use(authRouter);

// PeerJS Server Configuration
const peerServer = ExpressPeerServer(server, {
	debug: true,
	path: '/',
	allow_discovery: true
});
app.use('/peerjs', peerServer);

peerServer.on('connection', (client) => {
	console.log('PeerJS client connected:', client.getId());
});

peerServer.on('disconnect', (client) => {
	console.log('PeerJS client disconnected:', client.getId());
});

// Socket.io connection handlers with JWT auth
io.use((socket, next) => {
	try {
		const headerAuth = socket.handshake.headers?.authorization || '';
		const authToken = socket.handshake.auth?.token || (headerAuth.startsWith('Bearer ') ? headerAuth.slice(7) : null);
		if (!authToken) return next(new Error('Missing token'));
		const payload = jwt.verify(authToken, JWT_SECRET);
		socket.user = { id: payload.sub, email: payload.email, name: payload.name };
		return next();
	} catch (err) {
		return next(new Error('Unauthorized'));
	}
});

// Store active cursors per room: roomId -> Map(userId -> cursorData)
const activeCursors = new Map();
// Store presence per room: roomId -> Map(userId -> presenceData)
const activePresence = new Map();
// Store voice room participants: boardId -> Map(userId -> voiceData)
const voiceRoomParticipants = new Map();

io.on('connection', (socket) => {
	socket.on('join_board', async ({ boardId }) => {
		if (!boardId) return;
		// Validate view access
		const canView = await userCanViewBoard({ userId: socket.user.id, boardId });
		if (!canView) {
			socket.emit('error', { message: 'Access denied to board' });
			return;
		}
		socket.join(`board:${boardId}`);
	});

	// Cursor rooms
	socket.on('cursor:join', async ({ boardId }) => {
		if (!boardId) return;
		const canView = await userCanViewBoard({ userId: socket.user.id, boardId });
		if (!canView) {
			socket.emit('error', { message: 'Access denied to board' });
			return;
		}
		socket.join(`cursor:${boardId}`);
		socket.currentBoardId = boardId;
		// Send existing cursors to the new user
		const roomId = `cursor:${boardId}`;
		if (activeCursors.has(roomId)) {
			const cursors = Array.from(activeCursors.get(roomId).values());
			socket.emit('cursors:sync', cursors);
		}

		// Presence: add/update current user and sync
		try {
			const { rows } = await pool.query(
				`select id, name, avatar_url from users where id = $1::uuid`,
				[socket.user.id]
			);
			const dbUser = rows[0] || {};
			const presenceData = {
				userId: socket.user.id,
				userName: dbUser.name || socket.user.name || null,
				avatarUrl: dbUser.avatar_url || null,
				lastSeen: Date.now()
			};
			if (!activePresence.has(roomId)) activePresence.set(roomId, new Map());
			activePresence.get(roomId).set(socket.user.id, presenceData);
			// Send full presence list to the joiner
			socket.emit('presence:sync', Array.from(activePresence.get(roomId).values()));
			// Notify others about this user
			socket.to(roomId).emit('presence:update', presenceData);
		} catch (e) {
			// If DB lookup fails, still emit minimal presence
			const fallbackPresence = {
				userId: socket.user.id,
				userName: socket.user.name || null,
				avatarUrl: null,
				lastSeen: Date.now()
			};
			if (!activePresence.has(roomId)) activePresence.set(roomId, new Map());
			activePresence.get(roomId).set(socket.user.id, fallbackPresence);
			socket.emit('presence:sync', Array.from(activePresence.get(roomId).values()));
			socket.to(roomId).emit('presence:update', fallbackPresence);
		}
	});

	// Relay board updates to other clients in the same room (no echo)
	socket.on('board:update', ({ boardId, nodes, edges, updatedAt }) => {
		if (!boardId) return;
		socket.to(`board:${boardId}`).emit('board:update', {
			boardId,
			nodes,
			edges,
			updatedAt: updatedAt || new Date().toISOString(),
		});
	});

	// Realtime: relay incremental patches immediately to board room
	socket.on('board:patch', ({ boardId, changes }) => {
		if (!boardId || !Array.isArray(changes) || changes.length === 0) return;
		socket.to(`board:${boardId}`).emit('board:patch', {
			boardId,
			userId: socket.user.id,
			changes,
			updatedAt: new Date().toISOString(),
		});
	});

	// Cursor move with lightweight server-side throttling
	let lastCursorTs = 0;
	socket.on('cursor:move', ({ x, y, color }) => {
		const boardId = socket.currentBoardId;
		if (!boardId) return;
		const now = Date.now();
		if (now - lastCursorTs < 50) return; // ~20fps throttle
		lastCursorTs = now;
		const roomId = `cursor:${boardId}`;
		const cursorData = {
			userId: socket.user.id,
			userName: socket.user.name,
			x: Math.round(Number(x) || 0),
			y: Math.round(Number(y) || 0),
			color: color || '#3b82f6',
			lastSeen: now,
		};
		if (!activeCursors.has(roomId)) activeCursors.set(roomId, new Map());
		activeCursors.get(roomId).set(socket.user.id, cursorData);
		socket.to(roomId).emit('cursor:update', cursorData);
	});

	// Voice room management
	socket.on('voice:join', async ({ boardId, peerId }) => {
		if (!boardId || !peerId) return;

		const canView = await userCanViewBoard({ userId: socket.user.id, boardId });
		if (!canView) {
			socket.emit('error', { message: 'Access denied to board' });
			return;
		}

		if (!voiceRoomParticipants.has(boardId)) {
			voiceRoomParticipants.set(boardId, new Map());
		}

		const voiceData = {
			userId: socket.user.id,
			peerId: peerId,
			joinedAt: Date.now()
		};

		voiceRoomParticipants.get(boardId).set(socket.user.id, voiceData);
		socket.currentVoiceBoardId = boardId;

		// Send current participants to the new joiner
		const participants = Array.from(voiceRoomParticipants.get(boardId).values());
		socket.emit('voice:participants:sync', participants);

		// Notify others that this user joined
		socket.to(`board:${boardId}`).emit('voice:user_joined', voiceData);

		console.log(`User ${socket.user.id} joined voice room in board ${boardId}`);
	});

	socket.on('voice:leave', ({ boardId }) => {
		if (!boardId) return;

		if (voiceRoomParticipants.has(boardId)) {
			voiceRoomParticipants.get(boardId).delete(socket.user.id);

			socket.to(`board:${boardId}`).emit('voice:user_left', {
				userId: socket.user.id
			});

			if (voiceRoomParticipants.get(boardId).size === 0) {
				voiceRoomParticipants.delete(boardId);
			}
		}

		socket.currentVoiceBoardId = null;
		console.log(`User ${socket.user.id} left voice room in board ${boardId}`);
	});

	// Cleanup on disconnect
	socket.on('disconnect', () => {
		const boardId = socket.currentBoardId;
		if (!boardId) return;
		const roomId = `cursor:${boardId}`;
		if (activeCursors.has(roomId)) {
			activeCursors.get(roomId).delete(socket.user.id);
			socket.to(roomId).emit('cursor:remove', { userId: socket.user.id });
			if (activeCursors.get(roomId).size === 0) activeCursors.delete(roomId);
		}
		if (activePresence.has(roomId)) {
			activePresence.get(roomId).delete(socket.user.id);
			socket.to(roomId).emit('presence:remove', { userId: socket.user.id });
			if (activePresence.get(roomId).size === 0) activePresence.delete(roomId);
		}

		// Cleanup voice room on disconnect
		const voiceBoardId = socket.currentVoiceBoardId;
		if (voiceBoardId && voiceRoomParticipants.has(voiceBoardId)) {
			voiceRoomParticipants.get(voiceBoardId).delete(socket.user.id);
			socket.to(`board:${voiceBoardId}`).emit('voice:user_left', {
				userId: socket.user.id
			});
			if (voiceRoomParticipants.get(voiceBoardId).size === 0) {
				voiceRoomParticipants.delete(voiceBoardId);
			}
		}
	});
});

// Periodic cleanup of stale cursors
setInterval(() => {
	const now = Date.now();
	const staleMs = 30000; // 30s
	for (const [roomId, cursors] of activeCursors.entries()) {
		for (const [uid, cur] of cursors.entries()) {
			if (now - (cur.lastSeen || 0) > staleMs) {
				cursors.delete(uid);
				io.to(roomId).emit('cursor:remove', { userId: uid });
			}
		}
		if (cursors.size === 0) activeCursors.delete(roomId);
	}
}, 30000);

(async () => {
	try {
		await ensureSchema();
		await ensureDemoUser();
		server.listen(PORT, () => {
			console.log(`Server running at http://localhost:${PORT}`);
		});
	} catch (err) {
		console.error('Failed to start server:', err);
		process.exit(1);
	}
})();
