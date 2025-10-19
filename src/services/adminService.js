const { pool } = require('../db');

// Get all users
async function getAllUsers() {
	const { rows } = await pool.query(
		'select id, email, name, role, avatar_url, created_at from users order by created_at desc'
	);
	return rows;
}

// Update user role
async function updateUserRole(userId, role) {
	const validRoles = ['user', 'premium', 'admin'];
	if (!validRoles.includes(role)) {
		throw new Error('Invalid role');
	}
	const { rows } = await pool.query(
		'update users set role = $2 where id = $1 returning id, email, name, role, avatar_url',
		[userId, role]
	);
	if (rows.length === 0) throw new Error('User not found');
	return rows[0];
}

// Delete user
async function deleteUser(userId) {
	// First delete user's boards
	await pool.query('delete from boards where owner_id = $1', [userId]);
	// Then delete board shares
	await pool.query('delete from board_shares where user_id = $1', [userId]);
	// Finally delete user
	const { rows } = await pool.query('delete from users where id = $1 returning id', [userId]);
	if (rows.length === 0) throw new Error('User not found');
	return rows[0];
}

// Get all boards
async function getAllBoards() {
	const { rows } = await pool.query(`
		select 
			b.id, 
			b.name, 
			b.owner_id, 
			b.created_at, 
			b.updated_at,
			u.email as owner_email,
			u.name as owner_name
		from boards b
		left join users u on b.owner_id = u.id::text
		order by b.updated_at desc
	`);
	return rows;
}

// Update board name (admin)
async function updateBoardName(boardId, name) {
	const { rows } = await pool.query(
		'update boards set name = $2, updated_at = now() where id = $1 returning id, name, owner_id',
		[boardId, name]
	);
	if (rows.length === 0) throw new Error('Board not found');
	return rows[0];
}

// Delete board (admin)
async function deleteBoard(boardId) {
	// First delete board shares
	await pool.query('delete from board_shares where board_id = $1', [boardId]);
	// Then delete board
	const { rows } = await pool.query('delete from boards where id = $1 returning id', [boardId]);
	if (rows.length === 0) throw new Error('Board not found');
	return rows[0];
}

// Get statistics
async function getStatistics() {
	const userCount = await pool.query('select count(*) as count from users');
	const boardCount = await pool.query('select count(*) as count from boards');
	const adminCount = await pool.query("select count(*) as count from users where role = 'admin'");
	const premiumCount = await pool.query("select count(*) as count from users where role = 'premium'");
	
	// Get recent registrations (last 7 days)
	const recentUsers = await pool.query(`
		select count(*) as count 
		from users 
		where created_at > now() - interval '7 days'
	`);
	
	// Get boards created in last 7 days
	const recentBoards = await pool.query(`
		select count(*) as count 
		from boards 
		where created_at > now() - interval '7 days'
	`);

	return {
		totalUsers: parseInt(userCount.rows[0].count),
		totalBoards: parseInt(boardCount.rows[0].count),
		adminUsers: parseInt(adminCount.rows[0].count),
		premiumUsers: parseInt(premiumCount.rows[0].count),
		recentUsers: parseInt(recentUsers.rows[0].count),
		recentBoards: parseInt(recentBoards.rows[0].count),
	};
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
