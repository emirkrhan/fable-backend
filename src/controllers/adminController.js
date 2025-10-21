const admin = require('../services/adminService');
const premiumCodeService = require('../services/premiumCodeService');

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

async function createPremiumCode(req, res) {
	try {
		const { durationDays, customCode, usageLimit } = req.body;
		if (!durationDays || durationDays < 1) {
			return res.status(400).json({ error: 'durationDays must be at least 1' });
		}
		if (usageLimit && usageLimit < 1) {
			return res.status(400).json({ error: 'usageLimit must be at least 1' });
		}
		const code = await premiumCodeService.createPremiumCode(
			req.user.id,
			durationDays,
			customCode,
			usageLimit || 1
		);
		res.json(code);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
}

async function getAllPremiumCodes(req, res) {
	try {
		const codes = await premiumCodeService.getAllPremiumCodes();
		res.json(codes);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
}

async function deletePremiumCode(req, res) {
	try {
		const { codeId } = req.params;
		await premiumCodeService.deletePremiumCode(codeId);
		res.json({ success: true });
	} catch (err) {
		res.status(400).json({ error: err.message });
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
	createPremiumCode,
	getAllPremiumCodes,
	deletePremiumCode,
};
