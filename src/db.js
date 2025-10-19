const { Pool } = require('pg');

const pool = new Pool({
	user: process.env.PGUSER || 'emir',
	password: process.env.PGPASSWORD,
	host: process.env.PGHOST || 'localhost',
	port: Number(process.env.PGPORT || 5432),
	database: process.env.PGDATABASE || 'fable',
});

async function checkConnection() {
	const client = await pool.connect();
	try {
		const { rows } = await client.query('select 1 as ok');
		return rows[0]?.ok === 1;
	} finally {
		client.release();
	}
}

async function ensureSchema() {
	await pool.query(`
		create table if not exists users (
			id uuid primary key,
			email text not null unique,
			name text,
			password_hash text not null,
			avatar_url text,
			role text not null default 'user',
			created_at timestamptz not null default now()
		);
		create table if not exists boards (
			id uuid primary key,
			name text not null,
			owner_id text not null,
			nodes jsonb not null default '[]'::jsonb,
			edges jsonb not null default '[]'::jsonb,
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now()
		);
		-- Board shares: which users can view a board
		create table if not exists board_shares (
			id uuid primary key,
			board_id uuid not null,
			user_id uuid not null,
			role text not null default 'viewer',
			created_at timestamptz not null default now(),
			unique(board_id, user_id)
		);
		create index if not exists idx_board_shares_user on board_shares(user_id);
		create index if not exists idx_board_shares_board on board_shares(board_id);
		-- Ensure avatar_url exists on existing databases
		alter table if exists users add column if not exists avatar_url text;
		-- Ensure role exists on existing databases
		alter table if exists users add column if not exists role text not null default 'user';
		create index if not exists idx_boards_owner on boards(owner_id);
	`);
}

module.exports = { pool, checkConnection, ensureSchema };


