const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function jwtAuth(req, res, next) {
	const auth = req.headers['authorization'] || '';
	const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
	if (!token) return res.status(401).json({ error: 'Missing bearer token' });
	try {
		const payload = jwt.verify(token, JWT_SECRET);
		req.user = { id: payload.sub, email: payload.email, name: payload.name };
		next();
	} catch (err) {
		return res.status(401).json({ error: 'Unauthorized' });
	}
}

module.exports = { jwtAuth };


