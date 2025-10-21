const express = require('express');
const ctrl = require('../controllers/adminController');
const { adminAuth } = require('../middleware/adminAuth');

const router = express.Router();

// All routes require admin auth
router.use(adminAuth);

// Users management
router.get('/users', ctrl.getAllUsers);
router.patch('/users/:userId/role', ctrl.updateUserRole);
router.delete('/users/:userId', ctrl.deleteUser);

// Boards management
router.get('/boards', ctrl.getAllBoards);
router.patch('/boards/:boardId', ctrl.updateBoardName);
router.delete('/boards/:boardId', ctrl.deleteBoard);

// Statistics
router.get('/stats', ctrl.getStatistics);

// Premium codes management
router.post('/premium-codes', ctrl.createPremiumCode);
router.get('/premium-codes', ctrl.getAllPremiumCodes);
router.delete('/premium-codes/:codeId', ctrl.deletePremiumCode);

module.exports = router;
