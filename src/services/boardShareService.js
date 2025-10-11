const { pool } = require('../db');
const { v4: uuidv4 } = require('uuid');

async function findUserByEmail(email) {
	const { rows } = await pool.query('select id, email, name, avatar_url from users where email = $1', [email]);
	return rows[0] || null;
}

async function shareBoardWithEmail({ boardId, ownerId, email }) {
	// Verify board ownership
	const { rows: boardRows } = await pool.query('select id, owner_id from boards where id = $1', [boardId]);
	if (!boardRows[0]) throw new Error('Board not found');
	if (boardRows[0].owner_id !== ownerId) throw new Error('Forbidden');

	const user = await findUserByEmail(email);
	if (!user) return { status: 'not_found' };
	if (user.id === ownerId) return { status: 'invalid_self_share' };

	const { rows } = await pool.query(
		`insert into board_shares (id, board_id, user_id, role)
		 values ($1, $2, $3, 'viewer')
		 on conflict (board_id, user_id) do update set role = excluded.role
		 returning *`,
		[uuidv4(), boardId, user.id]
	);
	return { status: 'ok', share: rows[0], user };
}

async function listBoardsForUser({ userId }) {
	// Owned boards
	const { rows: owned } = await pool.query(
		`select b.*, true as is_owner, false as is_shared
		 from boards b where b.owner_id = $1`, [userId]
	);
	// Shared boards
	const { rows: shared } = await pool.query(
		`select b.*, false as is_owner, true as is_shared
		 from board_shares s join boards b on b.id = s.board_id
		 where s.user_id = $1::uuid`, [userId]
	);
	return [...owned, ...shared]
		.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
		.map(b => ({
			...b,
			access: b.is_owner ? 'owner' : 'viewer',
			isShared: !!b.is_shared
		}));
}

async function userCanViewBoard({ userId, boardId }) {
	const { rows } = await pool.query(
        `select 1 from boards where id = $1::uuid and owner_id = $2
		 union all
        select 1 from board_shares where board_id = $1::uuid and user_id = $2::uuid
		 limit 1`,
		[boardId, userId]
	);
	return !!rows[0];
}

async function userCanEditBoard({ userId, boardId }) {
    const { rows } = await pool.query('select 1 from boards where id = $1::uuid and owner_id = $2', [boardId, userId]);
	return !!rows[0];
}

async function listBoardShares({ boardId, ownerId }) {
	// Verify board ownership
	const { rows: boardRows } = await pool.query('select id, owner_id from boards where id = $1', [boardId]);
	if (!boardRows[0]) throw new Error('Board not found');
	if (boardRows[0].owner_id !== ownerId) throw new Error('Forbidden');

	// Fetch all shares with user details
	const { rows } = await pool.query(
		`select s.id, s.board_id, s.user_id, s.role, s.created_at,
		        u.email, u.name, u.avatar_url
		 from board_shares s
		 join users u on u.id = s.user_id
		 where s.board_id = $1::uuid
		 order by s.created_at desc`,
		[boardId]
	);
	return rows;
}

async function removeShare({ boardId, ownerId, userId }) {
	// Verify board ownership
	const { rows: boardRows } = await pool.query('select id, owner_id from boards where id = $1', [boardId]);
	if (!boardRows[0]) throw new Error('Board not found');
	if (boardRows[0].owner_id !== ownerId) throw new Error('Forbidden');

	const { rowCount } = await pool.query(
		`delete from board_shares where board_id = $1::uuid and user_id = $2::uuid`,
		[boardId, userId]
	);
	return rowCount > 0;
}

module.exports = {
	shareBoardWithEmail,
	listBoardsForUser,
	userCanViewBoard,
	userCanEditBoard,
	listBoardShares,
	removeShare,
};


