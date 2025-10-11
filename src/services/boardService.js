const { pool } = require('../db');
const { v4: uuidv4 } = require('uuid');

// Helper: Add permission field to board data
function addPermissionField(boardData, userId) {
	if (!boardData) return null;
	// If board has owner_id and it matches userId, they're the owner
	return {
		...boardData,
		permission: boardData.owner_id === userId ? 'owner' : 'view'
	};
}

async function createBoard({ ownerId, name }) {
	const id = uuidv4();
	const { rows } = await pool.query(
		`insert into boards (id, name, owner_id, nodes, edges)
		 values ($1, $2, $3, '[]'::jsonb, '[]'::jsonb)
		 returning *`,
		[id, name, ownerId]
	);
	return addPermissionField(rows[0], ownerId);
}

async function getBoardById({ id, ownerId }) {
    const { rows } = await pool.query(
        `select * from boards where id = $1::uuid and owner_id = $2`,
        [id, ownerId]
    );
    return addPermissionField(rows[0], ownerId);
}

async function getBoardByIdForUser({ id, userId }) {
    const { rows } = await pool.query(
        `select * from boards where id = $1::uuid`,
        [id]
    );
    return addPermissionField(rows[0], userId);
}

async function listBoards({ ownerId }) {
	const { rows } = await pool.query(
		`select * from boards where owner_id = $1 order by updated_at desc`,
		[ownerId]
	);
	return rows.map(board => addPermissionField(board, ownerId));
}

async function updateBoardName({ id, ownerId, name }) {
	const { rows } = await pool.query(
        `update boards set name = $3, updated_at = now() where id = $1::uuid and owner_id = $2 returning *`,
		[id, ownerId, name]
	);
	return addPermissionField(rows[0], ownerId);
}

async function deleteBoard({ id, ownerId }) {
    await pool.query(`delete from boards where id = $1::uuid and owner_id = $2`, [id, ownerId]);
	return true;
}

function mergeDeep(target, source) {
	if (typeof target !== 'object' || target === null) return source;
	if (typeof source !== 'object' || source === null) return target;
	const result = Array.isArray(target) ? [...target] : { ...target };
	for (const key of Object.keys(source)) {
		const value = source[key];
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			result[key] = mergeDeep(result[key] ?? {}, value);
		} else {
			result[key] = value;
		}
	}
	return result;
}

async function applyPatches({ id, ownerId, changes }) {
	const client = await pool.connect();
	try {
		await client.query('begin');
        const { rows } = await client.query(
            `select * from boards where id = $1::uuid and owner_id = $2 for update`,
            [id, ownerId]
        );
		if (!rows[0]) return null;
		
		const board = rows[0];
		let nodes = board.nodes || [];
		let edges = board.edges || [];

		for (const change of changes || []) {
			if (change.type === 'addNode') {
				nodes = [...nodes, change.node];
			} else if (change.type === 'updateNode') {
				nodes = nodes.map(n => {
					if (n.id !== change.id) return n;
					const updated = { ...n };
					if (change.data?.data) {
						updated.data = mergeDeep(n.data || {}, change.data.data);
					}
					if (change.data?.position) {
						updated.position = { ...n.position, ...change.data.position };
					}
					if (change.data?.dimensions) {
						updated.dimensions = { ...change.data.dimensions };
					}
					return updated;
				});
			} else if (change.type === 'deleteNode') {
				nodes = nodes.filter(n => n.id !== change.id);
			} else if (change.type === 'addEdge') {
				edges = [...edges, change.edge];
			} else if (change.type === 'updateEdge') {
				edges = edges.map(e => {
					if (e.id !== change.id) return e;
					const updated = { ...e };
					if (change.data?.data) {
						updated.data = mergeDeep(e.data || {}, change.data.data);
					}
					return updated;
				});
			} else if (change.type === 'deleteEdge') {
				edges = edges.filter(e => e.id !== change.id);
			}
		}

        await client.query(
            `update boards set nodes = $3::jsonb, edges = $4::jsonb, updated_at = now() where id = $1::uuid and owner_id = $2`,
            [id, ownerId, JSON.stringify(nodes), JSON.stringify(edges)]
        );
		await client.query('commit');
		
		// Return full board with permission
		return addPermissionField({
			...board,
			nodes,
			edges,
			updated_at: new Date()
		}, ownerId);
	} catch (err) {
		await client.query('rollback');
		throw err;
	} finally {
		client.release();
	}
}

async function overwriteContent({ id, ownerId, nodes, edges }) {
	const { rows } = await pool.query(
        `update boards set nodes = $3::jsonb, edges = $4::jsonb, updated_at = now() 
         where id = $1::uuid and owner_id = $2 returning *`,
		[id, ownerId, JSON.stringify(nodes || []), JSON.stringify(edges || [])]
	);
	return addPermissionField(rows[0], ownerId);
}

module.exports = {
	createBoard,
	getBoardById,
    getBoardByIdForUser,
	listBoards,
	updateBoardName,
	deleteBoard,
	applyPatches,
	overwriteContent,
};
