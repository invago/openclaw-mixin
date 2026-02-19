const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/WebhookController');
const { verifyMixinWebhook, verifyApiKey } = require('../middleware/webhookAuth');

/**
 * @swagger
 * /webhook/mixin:
 * post:
 * summary:处理Mixin Webhook消息
 * description:接收并处理来自Mixin Messenger的消息
 * tags:
 * - Webhook
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * action:
 * type: string
 * example: CREATE_MESSAGE
 * data:
 * type: object
 * responses:
 * 200:
 * description:消息接收成功
 * 401:
 * description:签名验证失败
 * 500:
 * description:服务器内部错误
 */
router.post('/mixin', verifyMixinWebhook, webhookController.handleMixinWebhook.bind(webhookController));

/**
 * @swagger
 * /webhook/verify:
 * get:
 * summary:Webhook验证端点
 * description:用于Mixin配置Webhook时的验证
 * tags:
 * - Webhook
 * parameters:
 * - name: challenge
 * in: query
 * required: true
 * schema:
 * type: string
 * responses:
 * 200:
 * description:验证成功，返回challenge
 * 400:
 * description:缺少challenge参数
 */
router.get('/verify', webhookController.webhookVerification.bind(webhookController));

/**
 * @swagger
 * /webhook/health:
 * get:
 * summary:健康检查
 * description:检查服务运行状态
 * tags:
 * - Health
 * responses:
 * 200:
 * description:服务健康
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * status:
 * type: string
 * example: healthy
 * timestamp:
 * type: string
 * format: date-time
 * version:
 * type: string
 * example:1.0.0
 */
router.get('/health', webhookController.healthCheck.bind(webhookController));

/**
 * @swagger
 * /webhook/message/{messageId}/status:
 * get:
 * summary:获取消息处理状态
 * description:查询特定消息的处理状态
 * tags:
 * - Message
 * parameters:
 * - name: messageId
 * in: path
 * required: true
 * schema:
 * type: string
 * responses:
 * 200:
 * description:状态查询成功
 * 404:
 * description:消息不存在
 * 500:
 * description:服务器内部错误
 */
router.get('/message/:messageId/status', verifyApiKey, webhookController.getMessageStatus.bind(webhookController));

module.exports = router;