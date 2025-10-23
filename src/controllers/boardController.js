const service = require('../services/boardService');

async function create(req, res) {
	try {
		const ownerId = req.user.id;
		const { name } = req.body || {};
		if (!name) return res.status(400).json({ error: 'name is required' });
		const board = await service.createBoard({ ownerId, name });
		res.status(201).json(board);
	} catch (err) {
		console.error('Board create error:', err);
		res.status(500).json({ error: 'Failed to create board' });
	}
}

async function listMine(req, res) {
	try {
		const ownerId = req.user.id;
		const boards = await service.listBoards({ ownerId });
		res.json(boards);
	} catch (err) {
		console.error('Board list error:', err);
		res.status(500).json({ error: 'Failed to load boards' });
	}
}

async function getById(req, res) {
	try {
        const userId = req.user.id;
        const boardId = req.params.boardId;
        const board = await service.getBoardByIdForUser({ id: boardId, userId });
		if (!board) return res.status(404).json({ error: 'Board not found' });
		res.json(board);
	} catch (err) {
		console.error('Board get error:', err);
		res.status(500).json({ error: 'Failed to load board' });
	}
}

async function rename(req, res) {
	try {
		const ownerId = req.user.id;
		const boardId = req.params.boardId;
		const { name } = req.body || {};
		if (!name) return res.status(400).json({ error: 'name is required' });
		const board = await service.updateBoardName({ id: boardId, ownerId, name });
		if (!board) return res.status(404).json({ error: 'Board not found' });
		res.json(board);
	} catch (err) {
		console.error('Board rename error:', err);
		res.status(500).json({ error: 'Failed to rename board' });
	}
}

async function remove(req, res) {
	try {
		const ownerId = req.user.id;
		const boardId = req.params.boardId;
		await service.deleteBoard({ id: boardId, ownerId });
		res.status(204).end();
	} catch (err) {
		console.error('Board delete error:', err);
		res.status(500).json({ error: 'Failed to delete board' });
	}
}

async function postPatches(req, res) {
	try {
		const ownerId = req.user.id;
		const boardId = req.params.boardId;
		const { changes } = req.body || {};

		if (!Array.isArray(changes)) {
			return res.status(400).json({ error: 'changes[] required' });
		}

		if (changes.length === 0) {
			return res.status(400).json({ error: 'changes array cannot be empty' });
		}

        const result = await service.applyPatches({ id: boardId, ownerId, changes });
        if (!result) return res.status(404).json({ error: 'not found' });

		// Broadcast changes to other users via WebSocket
        try {
            const io = req.app.get('io');
            if (io) {
                io.to(`board:${boardId}`).emit('board:patch', {
                    boardId,
                    userId: ownerId, // Echo prevention: Frontend can ignore own changes
                    changes: result.changes,
                    updatedAt: result.updatedAt,
                });
            }
        } catch (_) {}

		res.json(result);
	} catch (err) {
		// Check if it's a validation error
		if (err.message && err.message.includes('Validation failed')) {
			return res.status(400).json({ error: err.message });
		}
		res.status(500).json({ error: err.message });
	}
}

async function putContent(req, res) {
	try {
		const ownerId = req.user.id;
		const boardId = req.params.boardId;
		const { nodes, edges, spotlights } = req.body || {};
        const result = await service.overwriteContent({
			id: boardId,
			ownerId,
			nodes: nodes || [],
			edges: edges || [],
			spotlights: spotlights || []
		});
        if (!result) return res.status(404).json({ error: 'not found' });

        // NOTE: No broadcast for full content updates
        // Full overwrites are typically used for initial saves or bulk operations
        // Real-time collaboration uses incremental patches instead

        res.json(result);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
}

// PATCH handler - Optimized with proper validation and consistent responses
async function patchBoard(req, res) {
	try {
		const ownerId = req.user.id;
		const boardId = req.params.boardId;
		const body = req.body || {};

		// Count how many update types are present
		const hasName = body.name !== undefined;
		const hasPatches = body.patches && Array.isArray(body.patches);
		const hasContent = body.nodes !== undefined || body.edges !== undefined;
		
		const updateCount = [hasName, hasPatches, hasContent].filter(Boolean).length;

		// Validation: exactly one update type allowed
		if (updateCount === 0) {
			return res.status(400).json({ 
				error: 'Missing update data. Expected one of: name, patches, or nodes/edges' 
			});
		}

		if (updateCount > 1) {
			return res.status(400).json({ 
				error: 'Invalid request. Send only one of: name, patches, or nodes/edges' 
			});
		}

		let result;

		// Handle name update
		if (hasName) {
			if (!body.name.trim()) {
				return res.status(400).json({ error: 'name cannot be empty' });
			}
			result = await service.updateBoardName({ id: boardId, ownerId, name: body.name });
		}
		
		// Handle incremental patches
		else if (hasPatches) {
			if (body.patches.length === 0) {
				return res.status(400).json({ error: 'patches array cannot be empty' });
			}
			result = await service.applyPatches({ id: boardId, ownerId, changes: body.patches });

			// Broadcast via WebSocket
			try {
				const io = req.app.get('io');
				if (io) {
					io.to(`board:${boardId}`).emit('board:patch', {
						boardId,
						userId: ownerId, // Echo prevention: Frontend can ignore own changes
						changes: result.changes,
						updatedAt: result.updatedAt,
					});
				}
			} catch (_) {}
		}
		
		// Handle full content update
		else if (hasContent) {
			result = await service.overwriteContent({
				id: boardId,
				ownerId,
				nodes: body.nodes || [],
				edges: body.edges || [],
				spotlights: body.spotlights || []
			});
		}

		if (!result) {
			return res.status(404).json({ error: 'Board not found' });
		}

		// All paths return consistent response with permission field
		return res.json(result);

	} catch (err) {
		console.error('PATCH /boards/:boardId error:', err);
		res.status(500).json({ error: err.message });
	}
}

// Simple save endpoint for auto-save (full state overwrite)
async function saveBoard(req, res) {
	try {
		const ownerId = req.user.id;
		const boardId = req.params.boardId;
		const { nodes, edges, spotlights } = req.body || {};

		const result = await service.overwriteContent({
			id: boardId,
			ownerId,
			nodes: nodes || [],
			edges: edges || [],
			spotlights: spotlights || []
		});

		if (!result) {
			return res.status(404).json({ error: 'Board not found' });
		}

		res.json({ success: true, message: 'Board saved successfully' });
	} catch (err) {
		console.error('Save board error:', err);
		res.status(500).json({ error: err.message });
	}
}

module.exports = {
	create,
	listMine,
	getById,
	rename,
	remove,
	postPatches,
	putContent,
	patchBoard,
	saveBoard,
};
