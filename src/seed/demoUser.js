const { findUserByEmail, createUser } = require('../services/authService');

async function ensureDemoUser() {
	const email = process.env.DEMO_EMAIL || 'demo@example.com';
	const password = process.env.DEMO_PASSWORD || 'demo1234';
	const name = process.env.DEMO_NAME || 'Demo User';
	const existing = await findUserByEmail(email);
	if (existing) {
		// Update existing demo user to admin if not already
		const { pool } = require('../db');
		await pool.query('update users set role = $1 where email = $2', ['admin', email]);
		const { rows } = await pool.query('select * from users where email = $1', [email]);
		return rows[0];
	}
	return await createUser({ email, name, password, role: 'admin' });
}

module.exports = { ensureDemoUser };


