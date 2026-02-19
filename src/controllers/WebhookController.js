const Message = require('../models/Message');
const MessageProcessor = require('../services/MessageProcessor');
const SessionManager = require('../services/SessionManager');

class WebhookController {
 constructor() {
 this.messageProcessor = new MessageProcessor();
 }

 /**
 *处理Mixin Webhook消息
 */
 async handleMixinWebhook(req, res) {
 try {
 console.log('收到Mixin Webhook:', JSON.stringify(req.body, null,2));

 const { action, data } = req.body;

 //只处理CREATE_MESSAGE动作
 if (action !== 'CREATE_MESSAGE') {
 console.log(`忽略动作: ${action}`);
 return res.status(200).json({ status: 'ignored' });
 }

 //解析消息
 const message = Message.fromMixinWebhook(req.body);
 console.log('解析后的消息:', {
 id: message.id,
 userId: message.user_id,
 conversationId: message.conversation_id,
 category: message.category,
 textContent: message.getTextContent(),
 });

 //忽略机器人自己的消息
 if (message.user_id === process.env.MIXIN_APP_ID) {
 console.log('忽略机器人自己的消息');
 return res.status(200).json({ status: 'self_message_ignored' });
 }

 //异步处理消息（不阻塞Webhook响应）
 this.processMessageAsync(message);

 //立即返回成功响应
 res.status(200).json({
 status: 'received',
 messageId: message.id,
 });

 } catch (error) {
 console.error('处理Webhook失败:', error);
 res.status(500).json({
 error: 'Internal Server Error',
 message: error.message,
 });
 }
 }

 /**
 *异步处理消息
 */
 async processMessageAsync(message) {
 try {
 console.log('开始异步处理消息:', message.id);

 //获取或创建会话
 const session = await SessionManager.getOrCreateSession(
 message.user_id,
 message.conversation_id
 );

 //处理消息
 const response = await this.messageProcessor.processMessage(message, session);

 if (response) {
 console.log('消息处理完成，生成回复:', {
 messageId: message.id,
 responseType: response.type,
 });
 }

 } catch (error) {
 console.error('异步处理消息失败:', error);
 }
 }

 /**
 *健康检查端点
 */
 healthCheck(req, res) {
 const health = {
 status: 'healthy',
 timestamp: new Date().toISOString(),
 version: '1.0.0',
 services: {
 redis: SessionManager.connected ? 'connected' : 'disconnected',
 mixin: process.env.MIXIN_CLIENT_ID ? 'configured' : 'not_configured',
 },
 };

 res.status(200).json(health);
 }

 /**
 *Webhook验证端点（用于Mixin配置）
 */
 webhookVerification(req, res) {
 const challenge = req.query.challenge;

 if (!challenge) {
 return res.status(400).json({
 error: 'Bad Request',
 message: '缺少challenge参数',
 });
 }

 res.status(200).send(challenge);
 }

 /**
 *获取消息处理状态
 */
 async getMessageStatus(req, res) {
 try {
 const { messageId } = req.params;

 //TODO:实现消息状态查询逻辑
 //暂时返回基础状态
 res.status(200).json({
 messageId,
 status: 'processed',
 timestamp: new Date().toISOString(),
 });
 } catch (error) {
 console.error('获取消息状态失败:', error);
 res.status(500).json({
 error: 'Internal Server Error',
 message: error.message,
 });
 }
 }
}

module.exports = new WebhookController();