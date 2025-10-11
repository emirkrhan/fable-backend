const auth = require('../services/authService');

async function register(req, res) {
	try {
		const { email, name, password } = req.body || {};
		if (!email || !password) return res.status(400).json({ error: 'email and password required' });
		const result = await auth.register({ email, name, password });
		res.status(201).json(result);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
}

async function login(req, res) {
	try {
		const { email, password } = req.body || {};
		if (!email || !password) return res.status(400).json({ error: 'email and password required' });
		const result = await auth.login({ email, password });
		res.json(result);
	} catch (err) {
		res.status(401).json({ error: err.message });
	}
}

module.exports = { register, login };


