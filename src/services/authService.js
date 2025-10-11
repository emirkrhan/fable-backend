const { pool } = require('../db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

async function findUserByEmail(email) {
	const { rows } = await pool.query(`select * from users where email = $1`, [email]);
	return rows[0] || null;
}

async function createUser({ email, name, password }) {
	const id = uuidv4();
	const passwordHash = await bcrypt.hash(password, 10);
	const { rows } = await pool.query(
		`insert into users (id, email, name, password_hash) values ($1, $2, $3, $4) returning *`,
		[id, email, name || null, passwordHash]
	);
	return rows[0];
}

function signToken(user) {
	return jwt.sign({ sub: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

async function register({ email, name, password }) {
	const existing = await findUserByEmail(email);
	if (existing) throw new Error('Email already in use');
	const user = await createUser({ email, name, password });
	const token = signToken(user);
	return { user: { id: user.id, email: user.email, name: user.name }, token };
}

async function login({ email, password }) {
	const user = await findUserByEmail(email);
	if (!user) throw new Error('Invalid credentials');
	const ok = await bcrypt.compare(password, user.password_hash);
	if (!ok) throw new Error('Invalid credentials');
	const token = signToken(user);
	return { user: { id: user.id, email: user.email, name: user.name }, token };
}

module.exports = { register, login, findUserByEmail, createUser };


