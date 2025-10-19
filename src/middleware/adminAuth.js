const { jwtAuth } = require('./jwt');

function adminAuth(req, res, next) {
	jwtAuth(req, res, (err) => {
		if (err) return;
		if (req.user?.role !== 'admin') {
			return res.status(403).json({ error: 'Admin access required' });
		}
		next();
	});
}

module.exports = { adminAuth };
