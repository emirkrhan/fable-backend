const { pool } = require('../db');
const { v4: uuidv4 } = require('uuid');

// Helper: Add permission field to board data
async function addPermissionField(boardData, userId) {
	if (!boardData) return null;

	// Check if board has any shares
	const { rows: shareRows } = await pool.query(
		'SELECT COUNT(*) as count FROM board_shares WHERE board_id = $1',
		[boardData.id]
	);
	const isShared = parseInt(shareRows[0]?.count || 0) > 0;

	if (boardData.owner_id === userId) {
		return { ...boardData, permission: 'owner', isShared };
	}

	const { rows } = await pool.query(
		'SELECT role FROM board_shares WHERE board_id = $1 AND user_id = $2',
		[boardData.id, userId]
	);

	const permission = rows[0]?.role || 'viewer';
	return { ...boardData, permission, isShared };
}

async function createBoard({ ownerId, name }) {
	const id = uuidv4();
	const { rows } = await pool.query(
		`insert into boards (id, name, owner_id, nodes, edges)
		 values ($1, $2, $3, '[]'::jsonb, '[]'::jsonb)
		 returning *`,
		[id, name, ownerId]
	);
	return await addPermissionField(rows[0], ownerId);
}

async function getBoardById({ id, ownerId }) {
    const { rows } = await pool.query(
        `select * from boards where id = $1::uuid and owner_id = $2`,
        [id, ownerId]
    );
    return await addPermissionField(rows[0], ownerId);
}

async function getBoardByIdForUser({ id, userId }) {
    const { rows } = await pool.query(
        `select * from boards where id = $1::uuid`,
        [id]
    );
    return await addPermissionField(rows[0], userId);
}

async function listBoards({ ownerId }) {
	const { rows } = await pool.query(
		`select * from boards where owner_id = $1 order by updated_at desc`,
		[ownerId]
	);
	return await Promise.all(rows.map(board => addPermissionField(board, ownerId)));
}

async function updateBoardName({ id, ownerId, name }) {
	const { rows } = await pool.query(
        `update boards set name = $3, updated_at = now() where id = $1::uuid and owner_id = $2 returning *`,
		[id, ownerId, name]
	);
	return await addPermissionField(rows[0], ownerId);
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

// Validate change object structure
function validateChange(change) {
	const validTypes = ['addNode', 'updateNode', 'deleteNode', 'addEdge', 'updateEdge', 'deleteEdge'];

	if (!change || typeof change !== 'object') {
		return { valid: false, error: 'Change must be an object' };
	}

	if (!validTypes.includes(change.type)) {
		return { valid: false, error: `Invalid change type: ${change.type}. Must be one of: ${validTypes.join(', ')}` };
	}

	// Validate required fields based on type
	if (change.type === 'addNode') {
		if (!change.node || typeof change.node !== 'object') {
			return { valid: false, error: 'addNode requires a node object' };
		}
		if (!change.node.id) {
			return { valid: false, error: 'addNode: node.id is required' };
		}
	}

	if (change.type === 'updateNode' || change.type === 'deleteNode') {
		if (!change.id) {
			return { valid: false, error: `${change.type} requires an id` };
		}
	}

	if (change.type === 'addEdge') {
		if (!change.edge || typeof change.edge !== 'object') {
			return { valid: false, error: 'addEdge requires an edge object' };
		}
		if (!change.edge.id || !change.edge.source || !change.edge.target) {
			return { valid: false, error: 'addEdge: edge.id, edge.source, and edge.target are required' };
		}
	}

	if (change.type === 'updateEdge' || change.type === 'deleteEdge') {
		if (!change.id) {
			return { valid: false, error: `${change.type} requires an id` };
		}
	}

	return { valid: true };
}

// Consolidate duplicate changes - smart merge to prevent data loss
function consolidateChanges(changes) {
	const nodeOps = new Map(); // id -> { adds: [], updates: [], deletes: [] }
	const edgeOps = new Map(); // id -> { adds: [], updates: [], deletes: [] }

	// Group operations by entity ID
	for (const change of changes) {
		if (change.type.includes('Node')) {
			const id = change.id || change.node?.id;
			if (!id) continue;

			if (!nodeOps.has(id)) {
				nodeOps.set(id, { adds: [], updates: [], deletes: [] });
			}
			const ops = nodeOps.get(id);

			if (change.type === 'addNode') ops.adds.push(change);
			else if (change.type === 'updateNode') ops.updates.push(change);
			else if (change.type === 'deleteNode') ops.deletes.push(change);
		} else if (change.type.includes('Edge')) {
			const id = change.id || change.edge?.id;
			if (!id) continue;

			if (!edgeOps.has(id)) {
				edgeOps.set(id, { adds: [], updates: [], deletes: [] });
			}
			const ops = edgeOps.get(id);

			if (change.type === 'addEdge') ops.adds.push(change);
			else if (change.type === 'updateEdge') ops.updates.push(change);
			else if (change.type === 'deleteEdge') ops.deletes.push(change);
		}
	}

	const consolidated = [];

	// Process nodes
	for (const [id, ops] of nodeOps.entries()) {
		// If deleted, only keep the delete (ignore adds/updates)
		if (ops.deletes.length > 0) {
			consolidated.push(ops.deletes[ops.deletes.length - 1]);
			continue;
		}

		// If added, take the last add and merge all updates into it
		if (ops.adds.length > 0) {
			const lastAdd = ops.adds[ops.adds.length - 1];
			// Merge all updates into the add
			const merged = { ...lastAdd };
			for (const update of ops.updates) {
				if (update.data?.position) {
					merged.node.position = { ...merged.node.position, ...update.data.position };
				}
				if (update.data?.data) {
					merged.node.data = { ...merged.node.data, ...update.data.data };
				}
				if (update.data?.dimensions) {
					merged.node.dimensions = { ...update.data.dimensions };
				}
			}
			consolidated.push(merged);
			continue;
		}

		// If only updates, merge them all into a single update
		if (ops.updates.length > 0) {
			const mergedUpdate = {
				type: 'updateNode',
				id,
				data: {}
			};

			// Merge all update data
			for (const update of ops.updates) {
				if (update.data?.position) {
					mergedUpdate.data.position = { ...mergedUpdate.data.position, ...update.data.position };
				}
				if (update.data?.data) {
					mergedUpdate.data.data = { ...mergedUpdate.data.data, ...update.data.data };
				}
				if (update.data?.dimensions) {
					mergedUpdate.data.dimensions = { ...update.data.dimensions };
				}
			}

			consolidated.push(mergedUpdate);
		}
	}

	// Process edges (same logic)
	for (const [id, ops] of edgeOps.entries()) {
		if (ops.deletes.length > 0) {
			consolidated.push(ops.deletes[ops.deletes.length - 1]);
			continue;
		}

		if (ops.adds.length > 0) {
			const lastAdd = ops.adds[ops.adds.length - 1];
			const merged = { ...lastAdd };
			for (const update of ops.updates) {
				if (update.data?.data) {
					merged.edge.data = { ...merged.edge.data, ...update.data.data };
				}
			}
			consolidated.push(merged);
			continue;
		}

		if (ops.updates.length > 0) {
			const mergedUpdate = {
				type: 'updateEdge',
				id,
				data: {}
			};

			for (const update of ops.updates) {
				if (update.data?.data) {
					mergedUpdate.data.data = { ...mergedUpdate.data.data, ...update.data.data };
				}
			}

			consolidated.push(mergedUpdate);
		}
	}

	return consolidated;
}

async function applyPatches({ id, ownerId, changes }) {
	// Validate all changes first
	for (const change of changes || []) {
		const validation = validateChange(change);
		if (!validation.valid) {
			throw new Error(`Validation failed: ${validation.error}`);
		}
	}

	// Consolidate duplicate changes
	const consolidatedChanges = consolidateChanges(changes);

	const client = await pool.connect();
	try {
		// CRITICAL FIX: Use SERIALIZABLE isolation to prevent concurrent patch conflicts
		// This prevents lost updates when multiple users edit simultaneously
		await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        const { rows } = await client.query(
            `select * from boards where id = $1::uuid and owner_id = $2 for update`,
            [id, ownerId]
        );
		if (!rows[0]) return null;

		const board = rows[0];
		let nodes = board.nodes || [];
		let edges = board.edges || [];

		// Build Maps for O(1) lookup
		const nodeMap = new Map(nodes.map(n => [n.id, n]));
		const edgeMap = new Map(edges.map(e => [e.id, e]));

		// Track applied changes for response
		const appliedChanges = {
			addedNodes: [],
			updatedNodes: [],
			deletedNodeIds: [],
			addedEdges: [],
			updatedEdges: [],
			deletedEdgeIds: []
		};

		for (const change of consolidatedChanges) {
			if (change.type === 'addNode') {
				// Clean node data before adding
				const cleanNode = {
					id: change.node.id,
					type: change.node.type || 'storyCard',
					position: change.node.position || { x: 0, y: 0 },
					data: change.node.data || {},
					...(change.node.dragHandle && { dragHandle: change.node.dragHandle }),
					...(change.node.dimensions && { dimensions: change.node.dimensions })
				};
				nodeMap.set(change.node.id, cleanNode);
				appliedChanges.addedNodes.push(cleanNode);
			} else if (change.type === 'updateNode') {
				const existing = nodeMap.get(change.id);
				if (existing) {
					const updated = { ...existing };

					// Deep merge data fields to preserve nested properties
					if (change.data?.data) {
						updated.data = mergeDeep(existing.data || {}, change.data.data);
					}

					// Position updates are direct replacements (no merge)
					if (change.data?.position) {
						updated.position = { ...change.data.position };
					}

					// Dimensions are direct replacements
					if (change.data?.dimensions) {
						updated.dimensions = { ...change.data.dimensions };
					}

					nodeMap.set(change.id, updated);
					appliedChanges.updatedNodes.push(updated);
				}
			} else if (change.type === 'deleteNode') {
				if (nodeMap.has(change.id)) {
					nodeMap.delete(change.id);
					appliedChanges.deletedNodeIds.push(change.id);

					// Also delete connected edges
					for (const [edgeId, edge] of edgeMap.entries()) {
						if (edge.source === change.id || edge.target === change.id) {
							edgeMap.delete(edgeId);
							if (!appliedChanges.deletedEdgeIds.includes(edgeId)) {
								appliedChanges.deletedEdgeIds.push(edgeId);
							}
						}
					}
				}
			} else if (change.type === 'addEdge') {
				// Clean edge data before adding
				const cleanEdge = {
					id: change.edge.id,
					source: change.edge.source,
					target: change.edge.target,
					...(change.edge.sourceHandle && { sourceHandle: change.edge.sourceHandle }),
					...(change.edge.targetHandle && { targetHandle: change.edge.targetHandle }),
					type: change.edge.type || 'default',
					...(change.edge.data && { data: change.edge.data }),
					...(change.edge.animated !== undefined && { animated: change.edge.animated }),
					...(change.edge.style && { style: change.edge.style })
				};
				edgeMap.set(change.edge.id, cleanEdge);
				appliedChanges.addedEdges.push(cleanEdge);
			} else if (change.type === 'updateEdge') {
				const existing = edgeMap.get(change.id);
				if (existing) {
					const updated = { ...existing };

					// Deep merge edge data
					if (change.data?.data) {
						updated.data = mergeDeep(existing.data || {}, change.data.data);
					}

					// Update style if provided
					if (change.data?.style) {
						updated.style = { ...existing.style, ...change.data.style };
					}

					// Update animated if provided
					if (change.data?.animated !== undefined) {
						updated.animated = change.data.animated;
					}

					edgeMap.set(change.id, updated);
					appliedChanges.updatedEdges.push(updated);
				}
			} else if (change.type === 'deleteEdge') {
				if (edgeMap.has(change.id)) {
					edgeMap.delete(change.id);
					appliedChanges.deletedEdgeIds.push(change.id);
				}
			}
		}

		// Convert Maps back to arrays
		nodes = Array.from(nodeMap.values());
		edges = Array.from(edgeMap.values());

        await client.query(
            `update boards set nodes = $3::jsonb, edges = $4::jsonb, updated_at = now() where id = $1::uuid and owner_id = $2`,
            [id, ownerId, JSON.stringify(nodes), JSON.stringify(edges)]
        );
		await client.query('commit');

		// Return only applied changes (optimized response)
		const updatedAt = new Date();
		return {
			id: board.id,
			updatedAt,
			changes: appliedChanges,
			// Include full state only if requested (for backward compatibility)
			...(false && { nodes, edges }) // Can be enabled via parameter if needed
		};
	} catch (err) {
		await client.query('rollback');
		throw err;
	} finally {
		client.release();
	}
}

async function overwriteContent({ id, ownerId, nodes, edges, spotlights }) {
	const client = await pool.connect();
	try {
		await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

		const { rows } = await client.query(
			`update boards set nodes = $2::jsonb, edges = $3::jsonb, spotlights = $4::jsonb, updated_at = now()
			 where id = $1::uuid returning *`,
			[id, JSON.stringify(nodes || []), JSON.stringify(edges || []), JSON.stringify(spotlights || [])]
		);

		await client.query('COMMIT');
		return await addPermissionField(rows[0], ownerId);
	} catch (err) {
		await client.query('ROLLBACK');
		throw err;
	} finally {
		client.release();
	}
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
