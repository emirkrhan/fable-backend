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

		-- Chats per board
		create table if not exists chats (
			id uuid primary key,
			board_id uuid not null,
			title text not null default 'New chat',
			created_at timestamptz not null default now()
		);
		create index if not exists idx_chats_board on chats(board_id);

		-- Messages per chat
		create table if not exists chat_messages (
			id uuid primary key,
			chat_id uuid not null,
			role text not null check (role in ('user','assistant','system')),
			content text not null,
			created_at timestamptz not null default now()
		);
		create index if not exists idx_messages_chat on chat_messages(chat_id);

		-- Add user_id to chat_messages for tracking who sent the message
		alter table if exists chat_messages add column if not exists user_id uuid;
		create index if not exists idx_messages_user_date on chat_messages(user_id, created_at);

		-- Daily AI usage tracking table
		create table if not exists daily_ai_usage (
			id uuid primary key default gen_random_uuid(),
			user_id uuid not null references users(id) on delete cascade,
			usage_date date not null default current_date,
			message_count integer not null default 0,
			created_at timestamptz not null default now(),
			updated_at timestamptz not null default now(),
			unique(user_id, usage_date)
		);
		create index if not exists idx_daily_usage_user_date on daily_ai_usage(user_id, usage_date);
	`);
}

module.exports = { pool, checkConnection, ensureSchema };


