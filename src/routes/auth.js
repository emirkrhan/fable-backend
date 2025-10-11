const express = require('express');
const ctrl = require('../controllers/authController');

const router = express.Router();

router.post('/api/auth/register', ctrl.register);
router.post('/api/auth/login', ctrl.login);

module.exports = router;


