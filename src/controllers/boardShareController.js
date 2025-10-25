const { shareBoardWithEmail, listBoardsForUser, userCanViewBoard, getUserBoardRole, listBoardShares, removeShare, updateShareRole } = require('../services/boardShareService');

// Middleware: attach permission (owner/editor/commenter/viewer) onto req for downstream handlers
async function attachPermission(req, res, next) {
	try {
		const boardId = req.params.boardId;
		const userId = req.user.id;
		const role = await getUserBoardRole({ userId, boardId });
		req.boardPermission = role || 'none';
		next();
	} catch (err) {
		next();
	}
}

async function shareWithEmail(req, res) {
	try {
		const { email, role } = req.body || {};
		if (!email) return res.status(400).json({ error: 'email is required' });
		const boardId = req.params.boardId;
		const ownerId = req.user.id;
		const result = await shareBoardWithEmail({ boardId, ownerId, email, role });
		if (result.status === 'not_found') return res.status(404).json({ error: 'User not found' });
		if (result.status === 'invalid_self_share') return res.status(400).json({ error: 'cannot share to yourself' });
		return res.status(200).json({ share: result.share, user: result.user });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
}

async function listForCurrentUser(req, res) {
	try {
		const userId = req.user.id;
		const boards = await listBoardsForUser({ userId });
		res.json(boards);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
}

async function listShares(req, res) {
	try {
		const boardId = req.params.boardId;
		const ownerId = req.user.id;
		const shares = await listBoardShares({ boardId, ownerId });
		res.json(shares);
	} catch (err) {
		if (err.message === 'Board not found') return res.status(404).json({ error: err.message });
		if (err.message === 'Forbidden') return res.status(403).json({ error: err.message });
		res.status(500).json({ error: err.message });
	}
}

async function deleteShare(req, res) {
	try {
		const boardId = req.params.boardId;
		const userId = req.params.userId;
		const ownerId = req.user.id;
		const removed = await removeShare({ boardId, ownerId, userId });
		if (!removed) return res.status(404).json({ error: 'Share not found' });
		res.json({ success: true });
	} catch (err) {
		if (err.message === 'Board not found') return res.status(404).json({ error: err.message });
		if (err.message === 'Forbidden') return res.status(403).json({ error: err.message });
		res.status(500).json({ error: err.message });
	}
}

async function updateShare(req, res) {
	try {
		const boardId = req.params.boardId;
		const userId = req.params.userId;
		const ownerId = req.user.id;
		const { role } = req.body || {};
		if (!role) return res.status(400).json({ error: 'role is required' });
		const updated = await updateShareRole({ boardId, ownerId, userId, role });
		res.json(updated);
	} catch (err) {
		if (err.message === 'Board not found') return res.status(404).json({ error: err.message });
		if (err.message === 'Forbidden') return res.status(403).json({ error: err.message });
		if (err.message === 'Share not found') return res.status(404).json({ error: err.message });
		res.status(500).json({ error: err.message });
	}
}

async function getBoardRole(req, res) {
	try {
		const boardId = req.params.boardId;
		const userId = req.user.id;
		const role = await getUserBoardRole({ userId, boardId });
		if (!role) return res.status(403).json({ error: 'No access to this board' });
		res.json({ role });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
}

module.exports = { shareWithEmail, listForCurrentUser, attachPermission, listShares, deleteShare, updateShare, getBoardRole };


