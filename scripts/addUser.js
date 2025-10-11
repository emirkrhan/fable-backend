require('dotenv').config();
const { ensureSchema } = require('../src/db');
const { findUserByEmail, createUser } = require('../src/services/authService');

async function main() {
	const [email, password, name] = process.argv.slice(2);
	if (!email || !password) {
		console.error('Usage: node scripts/addUser.js <email> <password> [name]');
		process.exit(1);
	}

	await ensureSchema();
	const existing = await findUserByEmail(email);
	if (existing) {
		console.log(`User already exists: ${existing.email}`);
		return;
	}

	const user = await createUser({ email, password, name });
	console.log('User created:', { id: user.id, email: user.email, name: user.name || null });
}

main().catch((err) => {
	console.error('Failed to create user:', err.message);
	process.exit(1);
});



