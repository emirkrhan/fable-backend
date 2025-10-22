const express = require('express');
const ctrl = require('../controllers/boardController');
const shareCtrl = require('../controllers/boardShareController');
const { jwtAuth } = require('../middleware/jwt');
const { canViewBoard, canEditBoard } = require('../middleware/boardAccess');

const router = express.Router();

router.use(jwtAuth);

// CRUD (relative paths; mounted at /api/boards)
router.post('/', ctrl.create);
// List owned + shared boards (single handler)
router.get('/', shareCtrl.listForCurrentUser);
router.get('/:boardId', canViewBoard, shareCtrl.attachPermission, ctrl.getById);
router.patch('/:boardId', canEditBoard, ctrl.patchBoard); // PATCH for flexible updates
router.put('/:boardId', canEditBoard, ctrl.rename);
router.delete('/:boardId', canEditBoard, ctrl.remove);

// Incremental patch (alternative endpoint)
router.post('/:boardId/patches', canEditBoard, ctrl.postPatches);

// Simple save endpoint for auto-save
router.post('/:boardId/save', canEditBoard, ctrl.saveBoard);

// Full-state overwrite
router.put('/:boardId/content', ctrl.putContent);

// Sharing endpoints
router.post('/:boardId/share', canEditBoard, shareCtrl.shareWithEmail);
router.get('/:boardId/shares', canEditBoard, shareCtrl.listShares);
router.patch('/:boardId/shares/:userId', canEditBoard, shareCtrl.updateShare);
router.delete('/:boardId/shares/:userId', canEditBoard, shareCtrl.deleteShare);

// Chats endpoints
const chatCtrl = require('../controllers/chatController');
router.get('/:boardId/chats', canViewBoard, chatCtrl.listChats);
router.post('/:boardId/chats', canEditBoard, chatCtrl.createChat);
router.get('/:boardId/chats/:chatId/messages', canViewBoard, chatCtrl.listMessages);
router.post('/:boardId/chats/:chatId/messages', canEditBoard, chatCtrl.createMessage);
router.delete('/:boardId/chats/:chatId', canEditBoard, chatCtrl.deleteChat);

// AI usage stats endpoint
router.get('/ai/usage-stats', chatCtrl.getUsageStats);

// Favorites endpoints
const favoriteCtrl = require('../controllers/favoriteController');
router.get('/favorites', favoriteCtrl.listFavorites); // Must be before /:boardId routes
router.post('/:boardId/favorite', canViewBoard, favoriteCtrl.addFavorite);
router.delete('/:boardId/favorite', favoriteCtrl.removeFavorite);

module.exports = router;
