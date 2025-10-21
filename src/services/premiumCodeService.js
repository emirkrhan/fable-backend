const { pool } = require('../db');
const crypto = require('crypto');

/**
 * Generate a random premium code
 */
function generateCode() {
	return crypto.randomBytes(8).toString('hex').toUpperCase();
}

/**
 * Create a new premium code
 */
async function createPremiumCode(createdBy, durationDays, customCode = null, usageLimit = 1) {
	const code = customCode ? customCode.toUpperCase() : generateCode();

	// Check if code already exists
	const existing = await pool.query(
		'select id from premium_codes where code = $1',
		[code]
	);

	if (existing.rows.length > 0) {
		throw new Error('Code already exists');
	}

	const result = await pool.query(
		`insert into premium_codes (code, duration_days, usage_limit, created_by)
		 values ($1, $2, $3, $4)
		 returning *`,
		[code, durationDays, usageLimit, createdBy]
	);
	return result.rows[0];
}

/**
 * Get all premium codes (admin only)
 */
async function getAllPremiumCodes() {
	const result = await pool.query(
		`select
			pc.*,
			u1.email as created_by_email,
			u2.email as used_by_email,
			array_agg(distinct u3.email) filter (where u3.email is not null) as all_users
		 from premium_codes pc
		 left join users u1 on pc.created_by = u1.id
		 left join users u2 on pc.used_by = u2.id
		 left join premium_code_usage pcu on pc.id = pcu.code_id
		 left join users u3 on pcu.user_id = u3.id
		 group by pc.id, u1.email, u2.email
		 order by pc.created_at desc`
	);
	return result.rows;
}

/**
 * Redeem a premium code
 */
async function redeemPremiumCode(code, userId) {
	const client = await pool.connect();
	try {
		await client.query('begin');

		// Check if code exists
		const codeResult = await client.query(
			'select * from premium_codes where code = $1 for update',
			[code.toUpperCase()]
		);

		if (codeResult.rows.length === 0) {
			throw new Error('Invalid code');
		}

		const premiumCode = codeResult.rows[0];

		// Check if usage limit reached
		if (premiumCode.usage_count >= premiumCode.usage_limit) {
			throw new Error('Code usage limit reached');
		}

		// Check if this user already used this code
		const alreadyUsed = await client.query(
			'select id from premium_code_usage where code_id = $1 and user_id = $2',
			[premiumCode.id, userId]
		);

		if (alreadyUsed.rows.length > 0) {
			throw new Error('You have already used this code');
		}

		// Record the usage
		await client.query(
			'insert into premium_code_usage (code_id, user_id) values ($1, $2)',
			[premiumCode.id, userId]
		);

		// Increment usage count
		const newUsageCount = premiumCode.usage_count + 1;
		await client.query(
			`update premium_codes
			 set usage_count = $1,
			     is_used = $1 >= usage_limit,
			     used_by = case when $1 = 1 then $2 else used_by end,
			     used_at = case when $1 = 1 then now() else used_at end
			 where id = $3`,
			[newUsageCount, userId, premiumCode.id]
		);

		// Update user's premium status
		const userResult = await client.query(
			'select premium_expires_at from users where id = $1',
			[userId]
		);

		const user = userResult.rows[0];
		const now = new Date();
		const currentExpiry = user.premium_expires_at ? new Date(user.premium_expires_at) : null;

		// If user has existing premium that hasn't expired, extend it
		// Otherwise, start from now
		const startDate = currentExpiry && currentExpiry > now ? currentExpiry : now;
		const newExpiry = new Date(startDate);
		newExpiry.setDate(newExpiry.getDate() + premiumCode.duration_days);

		await client.query(
			`update users
			 set role = 'premium', premium_expires_at = $1
			 where id = $2`,
			[newExpiry, userId]
		);

		await client.query('commit');

		return {
			success: true,
			expiresAt: newExpiry,
			durationDays: premiumCode.duration_days
		};
	} catch (error) {
		await client.query('rollback');
		throw error;
	} finally {
		client.release();
	}
}

/**
 * Delete a premium code (admin only)
 */
async function deletePremiumCode(codeId) {
	await pool.query('delete from premium_codes where id = $1', [codeId]);
}

/**
 * Check and update expired premium users (run as cron job)
 */
async function checkExpiredPremiums() {
	const result = await pool.query(
		`update users
		 set role = 'user'
		 where role = 'premium'
		 and premium_expires_at is not null
		 and premium_expires_at < now()
		 returning id, email`
	);
	return result.rows;
}

module.exports = {
	createPremiumCode,
	getAllPremiumCodes,
	redeemPremiumCode,
	deletePremiumCode,
	checkExpiredPremiums
};
