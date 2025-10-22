const { pool } = require('../db');

/**
 * Add a board to user's favorites
 * POST /api/boards/:boardId/favorite
 */
async function addFavorite(req, res) {
	try {
		const userId = req.user.id;
		const { boardId } = req.params;

		// Check if user has access to this board
		const boardAccess = await pool.query(
			`SELECT 1 FROM boards WHERE id = $1::uuid AND owner_id = $2::text
			 UNION
			 SELECT 1 FROM board_shares WHERE board_id = $1::uuid AND user_id = $2::uuid
			 LIMIT 1`,
			[boardId, userId]
		);

		if (boardAccess.rows.length === 0) {
			return res.status(403).json({ error: 'Access denied to this board' });
		}

		// Add to favorites (ignore if already exists)
		await pool.query(
			`INSERT INTO favorite_boards (user_id, board_id)
			 VALUES ($1, $2)
			 ON CONFLICT (user_id, board_id) DO NOTHING`,
			[userId, boardId]
		);

		res.json({ success: true, message: 'Board added to favorites' });
	} catch (error) {
		console.error('Error adding favorite:', error);
		res.status(500).json({ error: 'Failed to add favorite' });
	}
}

/**
 * Remove a board from user's favorites
 * DELETE /api/boards/:boardId/favorite
 */
async function removeFavorite(req, res) {
	try {
		const userId = req.user.id;
		const { boardId } = req.params;

		await pool.query(
			`DELETE FROM favorite_boards
			 WHERE user_id = $1 AND board_id = $2`,
			[userId, boardId]
		);

		res.json({ success: true, message: 'Board removed from favorites' });
	} catch (error) {
		console.error('Error removing favorite:', error);
		res.status(500).json({ error: 'Failed to remove favorite' });
	}
}

/**
 * Get list of favorite board IDs for current user
 * GET /api/boards/favorites
 */
async function listFavorites(req, res) {
	try {
		const userId = req.user.id;

		const result = await pool.query(
			`SELECT board_id FROM favorite_boards
			 WHERE user_id = $1
			 ORDER BY created_at DESC`,
			[userId]
		);

		const favoriteIds = result.rows.map(row => row.board_id);
		res.json(favoriteIds);
	} catch (error) {
		console.error('Error listing favorites:', error);
		res.status(500).json({ error: 'Failed to list favorites' });
	}
}

module.exports = {
	addFavorite,
	removeFavorite,
	listFavorites,
};
