const { findUserByEmail, createUser } = require('../services/authService');

async function ensureDemoUser() {
	const email = process.env.DEMO_EMAIL || 'demo@example.com';
	const password = process.env.DEMO_PASSWORD || 'demo1234';
	const name = process.env.DEMO_NAME || 'Demo User';
	const existing = await findUserByEmail(email);
	if (existing) return existing;
	return await createUser({ email, name, password });
}

module.exports = { ensureDemoUser };


