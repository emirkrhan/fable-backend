const { userCanViewBoard, userCanEditBoard } = require('../services/boardShareService');

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

module.exports = { canViewBoard, canEditBoard };


