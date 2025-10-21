const express = require('express');
const multer = require('multer');
const path = require('path');
const { jwtAuth } = require('../middleware/jwt');
const ctrl = require('../controllers/userController');

const router = express.Router();

// Multer storage: unique filenames, restrict to images
const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, path.join(__dirname, '..', '..', 'uploads'));
	},
	filename: (req, file, cb) => {
		const ext = path.extname(file.originalname).toLowerCase();
		const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
		cb(null, name);
	}
});

function fileFilter(req, file, cb) {
	const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
	if (!allowed.includes(file.mimetype)) return cb(new Error('Only image files are allowed'));
	cb(null, true);
}

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

router.use(jwtAuth);

// GET /api/users/me -> aktif kullanıcının bilgileri
router.get('/me', ctrl.me);

// POST /api/users/me/avatar -> tek dosya 'avatar'
router.post('/me/avatar', upload.single('avatar'), ctrl.uploadAvatar);

// DELETE /api/users/me/avatar -> avatarı temizle
router.delete('/me/avatar', ctrl.deleteAvatar);

// POST /api/users/me/redeem-code -> redeem premium code
router.post('/me/redeem-code', ctrl.redeemCode);

module.exports = router;


