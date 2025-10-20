const { pool } = require('../db');
const { v4: uuidv4 } = require('uuid');

async function findUserByEmail(email) {
	const { rows } = await pool.query('select id, email, name, avatar_url from users where email = $1', [email]);
	return rows[0] || null;
}

async function shareBoardWithEmail({ boardId, ownerId, email, role = 'viewer' }) {
	// Verify board ownership
	const { rows: boardRows } = await pool.query('select id, owner_id from boards where id = $1', [boardId]);
	if (!boardRows[0]) throw new Error('Board not found');
	if (boardRows[0].owner_id !== ownerId) throw new Error('Forbidden');

	const user = await findUserByEmail(email);
	if (!user) return { status: 'not_found' };
	if (user.id === ownerId) return { status: 'invalid_self_share' };

	// Validate role
	if (!['viewer', 'editor'].includes(role)) {
		role = 'viewer';
	}

	const { rows } = await pool.query(
		`insert into board_shares (id, board_id, user_id, role)
		 values ($1, $2, $3, $4)
		 on conflict (board_id, user_id) do update set role = excluded.role
		 returning *`,
		[uuidv4(), boardId, user.id, role]
	);
	return { status: 'ok', share: rows[0], user };
}

async function listBoardsForUser({ userId }) {
  // Owned boards
  const { rows: owned } = await pool.query(
    `
    SELECT 
      b.id,
      b.name,
      b.owner_id,
      u.name AS owner_name,
      jsonb_array_length(b.nodes) AS node_count,
      jsonb_array_length(b.edges) AS edge_count,
      b.created_at,
      b.updated_at,
      true AS is_owner,
      false AS is_shared
    FROM boards b
    JOIN users u ON u.id = b.owner_id::uuid
    WHERE b.owner_id = $1
    `,
    [userId]
  );

  // Shared boards
  const { rows: shared } = await pool.query(
    `
    SELECT 
      b.id,
      b.name,
      b.owner_id,
      u.name AS owner_name,
      jsonb_array_length(b.nodes) AS node_count,
      jsonb_array_length(b.edges) AS edge_count,
      b.created_at,
      b.updated_at,
      false AS is_owner,
      true AS is_shared
    FROM board_shares s
    JOIN boards b ON b.id = s.board_id
    JOIN users u ON u.id = b.owner_id::uuid
    WHERE s.user_id = $1::uuid
    `,
    [userId]
  );

  // Combine results
  return [...owned, ...shared]
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .map(b => ({
      id: b.id,
      name: b.name,
      ownerId: b.owner_id,
      ownerName: b.owner_name,
      nodeCount: b.node_count,
      edgeCount: b.edge_count,
      createdAt: b.created_at,
      updatedAt: b.updated_at,
      access: b.is_owner ? 'owner' : 'viewer',
      isShared: b.is_shared
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
    const { rows } = await pool.query(
		`select 1 from boards where id = $1::uuid and owner_id = $2
		 union all
		 select 1 from board_shares where board_id = $1::uuid and user_id = $2::uuid and role = 'editor'
		 limit 1`,
		[boardId, userId]
	);
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

async function updateShareRole({ boardId, ownerId, userId, role = 'viewer' }) {
	// Verify board ownership
	const { rows: boardRows } = await pool.query('select id, owner_id from boards where id = $1', [boardId]);
	if (!boardRows[0]) throw new Error('Board not found');
	if (boardRows[0].owner_id !== ownerId) throw new Error('Forbidden');

	// Validate role
	if (!['viewer', 'editor'].includes(role)) {
		role = 'viewer';
	}

	const { rows } = await pool.query(
		`update board_shares set role = $1 where board_id = $2::uuid and user_id = $3::uuid returning *`,
		[role, boardId, userId]
	);
	if (!rows[0]) throw new Error('Share not found');
	return rows[0];
}

module.exports = {
	shareBoardWithEmail,
	listBoardsForUser,
	userCanViewBoard,
	userCanEditBoard,
	listBoardShares,
	removeShare,
	updateShareRole,
};


