const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client();

async function authMiddleware(req, res, next) {
	try {
		const auth = req.headers['authorization'] || '';
		const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
		if (!token) return res.status(401).json({ error: 'Missing bearer token' });

		// Not: İsteğe göre audience doğrulaması eklenebilir (CLIENT_ID ile)
		const ticket = await client.verifyIdToken({ idToken: token });
		const payload = ticket.getPayload();
		if (!payload?.sub) return res.status(401).json({ error: 'Invalid token' });

		req.user = { id: payload.sub, email: payload.email, name: payload.name };
		next();
	} catch (err) {
		res.status(401).json({ error: 'Unauthorized', detail: err.message });
	}
}

module.exports = { authMiddleware };


