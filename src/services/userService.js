const { pool } = require('../db');

async function getUserById(userId) {
	const { rows } = await pool.query('select id, email, name, avatar_url, role from users where id = $1', [userId]);
	return rows[0] || null;
}

async function updateUserAvatar(userId, avatarUrl) {
	const { rows } = await pool.query(
		'update users set avatar_url = $2 where id = $1 returning id, email, name, avatar_url, role',
		[userId, avatarUrl]
	);
	return rows[0] || null;
}

async function clearUserAvatar(userId) {
	const { rows } = await pool.query(
		'update users set avatar_url = null where id = $1 returning id, email, name, avatar_url, role',
		[userId]
	);
	return rows[0] || null;
}

module.exports = { getUserById, updateUserAvatar, clearUserAvatar };


