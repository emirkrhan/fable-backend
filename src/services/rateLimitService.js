const { pool } = require('../db');

// Daily message limits based on user role
const MESSAGE_LIMITS = {
	user: 5,
	premium: 50,
	admin: 999999 // Unlimited for admins
};

/**
 * Get daily message limit for a user based on their role
 */
function getDailyLimit(userRole) {
	return MESSAGE_LIMITS[userRole] || MESSAGE_LIMITS.user;
}

/**
 * Get user's daily AI usage for today
 */
async function getDailyUsage(userId) {
	const result = await pool.query(
		`SELECT message_count
		 FROM daily_ai_usage
		 WHERE user_id = $1 AND usage_date = current_date`,
		[userId]
	);

	return result.rows[0]?.message_count || 0;
}

/**
 * Increment user's daily usage count
 */
async function incrementUsage(userId) {
	await pool.query(
		`INSERT INTO daily_ai_usage (user_id, usage_date, message_count)
		 VALUES ($1, current_date, 1)
		 ON CONFLICT (user_id, usage_date)
		 DO UPDATE SET
		   message_count = daily_ai_usage.message_count + 1,
		   updated_at = now()`,
		[userId]
	);
}

/**
 * Check if user has exceeded their daily limit
 * Returns { allowed: boolean, current: number, limit: number }
 */
async function checkDailyLimit(userId, userRole) {
	const limit = getDailyLimit(userRole);
	const current = await getDailyUsage(userId);

	return {
		allowed: current < limit,
		current,
		limit,
		remaining: Math.max(0, limit - current)
	};
}

/**
 * Get detailed usage stats for a user
 */
async function getUserUsageStats(userId, userRole) {
	const limit = getDailyLimit(userRole);
	const current = await getDailyUsage(userId);

	return {
		current,
		limit,
		remaining: Math.max(0, limit - current),
		role: userRole,
		resetTime: getNextResetTime()
	};
}

/**
 * Get the next reset time (midnight UTC)
 */
function getNextResetTime() {
	const now = new Date();
	const tomorrow = new Date(now);
	tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
	tomorrow.setUTCHours(0, 0, 0, 0);
	return tomorrow.toISOString();
}

module.exports = {
	getDailyLimit,
	getDailyUsage,
	incrementUsage,
	checkDailyLimit,
	getUserUsageStats,
	MESSAGE_LIMITS
};
