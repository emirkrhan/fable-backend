const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
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

router.post('/image', upload.single('image'), (req, res) => {
	console.log('Upload request received:', req.file);
	if (!req.file) {
		console.log('No file in request');
		return res.status(400).json({ error: 'No file uploaded' });
	}
	const url = `/uploads/${req.file.filename}`;
	console.log('Upload successful:', url);
	res.json({ url });
});

router.delete('/image', (req, res) => {
	const { url } = req.body;
	if (!url) {
		return res.status(400).json({ error: 'No URL provided' });
	}

	// Extract filename from URL (e.g., /uploads/abc-123.jpg -> abc-123.jpg)
	const filename = url.split('/').pop();
	const filePath = path.join(__dirname, '../../uploads', filename);

	fs.unlink(filePath, (err) => {
		if (err) {
			console.error('Failed to delete file:', err);
			return res.status(500).json({ error: 'Failed to delete file' });
		}
		console.log('File deleted:', filePath);
		res.json({ success: true });
	});
});

module.exports = router;
