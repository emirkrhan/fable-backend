const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { jwtAuth } = require('../middleware/jwt');
const router = express.Router();

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, 'uploads/');
	},
	filename: (req, file, cb) => {
		const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
		cb(null, uniqueName);
	}
});

const upload = multer({
	storage,
	limits: { fileSize: 10 * 1024 * 1024 },
	fileFilter: (req, file, cb) => {
		const allowedTypes = /jpeg|jpg|png|gif|webp/;
		const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
		const mimetype = allowedTypes.test(file.mimetype);
		if (extname && mimetype) {
			cb(null, true);
		} else {
			cb(new Error('Only images allowed'));
		}
	}
});

router.post('/image', jwtAuth, upload.single('image'), (req, res) => {
	if (!req.file) {
		return res.status(400).json({ error: 'No file uploaded' });
	}
	const url = `/uploads/${req.file.filename}`;
	res.json({ url });
});

router.delete('/image', jwtAuth, (req, res) => {
	const { url } = req.body;
	if (!url || !url.startsWith('/uploads/')) {
		return res.status(400).json({ error: 'Invalid URL' });
	}

	// Extract filename safely (prevent path traversal)
	const filename = path.basename(url);
	if (filename.includes('..') || filename.includes('/')) {
		return res.status(400).json({ error: 'Invalid filename' });
	}

	const filePath = path.join(__dirname, '../../uploads', filename);

	// Ensure file is within uploads directory
	const uploadsDir = path.join(__dirname, '../../uploads');
	if (!filePath.startsWith(uploadsDir)) {
		return res.status(400).json({ error: 'Invalid path' });
	}

	fs.unlink(filePath, (err) => {
		if (err) {
			return res.status(500).json({ error: 'Failed to delete file' });
		}
		res.json({ success: true });
	});
});

module.exports = router;
