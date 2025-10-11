const path = require('path');
const fs = require('fs');
const { getUserById, updateUserAvatar, clearUserAvatar } = require('../services/userService');

async function me(req, res) {
	const user = await getUserById(req.user.id);
	if (!user) return res.status(404).json({ error: 'User not found' });
	return res.json({ user });
}

async function uploadAvatar(req, res) {
	if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
	const filePath = `/uploads/${req.file.filename}`;
	const user = await updateUserAvatar(req.user.id, filePath);
	return res.status(200).json({ user, avatarUrl: filePath });
}

async function deleteAvatar(req, res) {
	const user = await getUserById(req.user.id);
	if (!user) return res.status(404).json({ error: 'User not found' });
	if (user.avatar_url) {
		const abs = path.join(__dirname, '..', '..', user.avatar_url);
		try { fs.unlinkSync(abs); } catch (_) {}
	}
	const updated = await clearUserAvatar(req.user.id);
	return res.status(200).json({ user: updated });
}

module.exports = { me, uploadAvatar, deleteAvatar };


