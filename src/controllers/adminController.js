const admin = require('../services/adminService');

async function getAllUsers(req, res) {
	try {
		const users = await admin.getAllUsers();
		res.json(users);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
}

async function updateUserRole(req, res) {
	try {
		const { userId } = req.params;
		const { role } = req.body;
		if (!role) return res.status(400).json({ error: 'role is required' });
		const user = await admin.updateUserRole(userId, role);
		res.json(user);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
}

async function deleteUser(req, res) {
	try {
		const { userId } = req.params;
		await admin.deleteUser(userId);
		res.json({ success: true });
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
}

async function getAllBoards(req, res) {
	try {
		const boards = await admin.getAllBoards();
		res.json(boards);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
}

async function updateBoardName(req, res) {
	try {
		const { boardId } = req.params;
		const { name } = req.body;
		if (!name) return res.status(400).json({ error: 'name is required' });
		const board = await admin.updateBoardName(boardId, name);
		res.json(board);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
}

async function deleteBoard(req, res) {
	try {
		const { boardId } = req.params;
		await admin.deleteBoard(boardId);
		res.json({ success: true });
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
}

async function getStatistics(req, res) {
	try {
		const stats = await admin.getStatistics();
		res.json(stats);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
}

module.exports = {
	getAllUsers,
	updateUserRole,
	deleteUser,
	getAllBoards,
	updateBoardName,
	deleteBoard,
	getStatistics,
};
