const { userCanViewBoard, userCanEditBoard, getUserBoardRole } = require('../services/boardShareService');

async function canViewBoard(req, res, next) {
	try {
		const boardId = req.params.boardId || req.params.id;
		const userId = req.user.id;
		const ok = await userCanViewBoard({ userId, boardId });
		if (!ok) return res.status(403).json({ error: 'forbidden' });
		next();
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
}

async function canEditBoard(req, res, next) {
	try {
		const boardId = req.params.boardId || req.params.id;
		const userId = req.user.id;
		const ok = await userCanEditBoard({ userId, boardId });
		if (!ok) return res.status(403).json({ error: 'forbidden' });
		next();
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
}

// Middleware to attach user's role for the board
async function attachBoardRole(req, res, next) {
	try {
		const boardId = req.params.boardId || req.params.id;
		const userId = req.user.id;
		const role = await getUserBoardRole({ userId, boardId });
		req.userBoardRole = role;
		next();
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
}

// Middleware to check if user can edit OR is commenter (can only add/edit comment cards)
async function canInteractWithBoard(req, res, next) {
	try {
		const boardId = req.params.boardId || req.params.id;
		const userId = req.user.id;
		const role = await getUserBoardRole({ userId, boardId });
		if (!role || role === 'viewer') {
			return res.status(403).json({ error: 'forbidden' });
		}
		req.userBoardRole = role;
		next();
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
}

module.exports = { canViewBoard, canEditBoard, attachBoardRole, canInteractWithBoard };


