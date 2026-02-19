/**
 * Mixin通道适配器
 *作为Openclaw插件，将Mixin消息转发给Openclaw处理
 */

const express = require('express');
const OpenclawGatewayClient = require('./gateway-client');
const MixinAPIClient = require('./services/MixinAPIClient');
const Message = require('./models/Message');
const { config } = require('./config');
const { securityManager } = require('./security');
const { createLogger } = require('./logger');
const { MessageFilter } = require('./message-filter');

class MixinChannel {
 constructor(options = {}) {
 this.name = 'mixin';
 this.displayName = 'Mixin Messenger';

 //配置
 this.gatewayUrl = options.gatewayUrl || process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789';
 this.webhookPort = options.webhookPort || process.env.PORT ||3000;
 this.webhookPath = options.webhookPath || '/webhook/mixin';

 //组件
 this.gatewayClient = null;
 this.webhookServer = null;
 this.app = null;

 //状态
 this.isRunning = false;
 this.messageHandlers = new Map();
 }

 /**
 *启动通道
 */
 async start() {
 console.log(`[${this.name}]启动Mixin通道...`);

 try {
 //1.连接到Openclaw Gateway
 await this.connectToGateway();

 //2.启动Webhook服务器（接收Mixin消息）
 await this.startWebhookServer();

 this.isRunning = true;
 console.log(`[${this.name}]通道启动完成`);

 return true;
 } catch (error) {
 console.error(`[${this.name}]启动失败:`, error);
 throw error;
 }
 }

 /**
 *连接到Openclaw Gateway
 */
 async connectToGateway() {
 console.log(`[${this.name}]连接到Openclaw Gateway...`);

 this.gatewayClient = new OpenclawGatewayClient({
 gatewayUrl: this.gatewayUrl,
 channelId: this.name,
 apiKey: process.env.OPENCLAW_API_KEY || '',
 });

 //监听Agent回复
 this.gatewayClient.on('agentResponse', this.handleAgentResponse.bind(this));

 //监听连接状态
 this.gatewayClient.on('connected', () => {
 console.log(`[${this.name}]已连接到Openclaw Gateway`);
 });

 this.gatewayClient.on('disconnected', () => {
 console.log(`[${this.name}]与Openclaw Gateway断开连接`);
 });

 this.gatewayClient.on('error', (error) => {
 console.error(`[${this.name}] Gateway错误:`, error);
 });

 await this.gatewayClient.connect();
 }

 /**
 *启动Webhook服务器
 */
 async startWebhookServer() {
 console.log(`[${this.name}]启动Webhook服务器...`);

 this.app = express();

 //中间件
 this.app.use(express.json({ limit: '10mb' }));

 //健康检查
 this.app.get('/health', (req, res) => {
 res.json({
 status: 'healthy',
 channel: this.name,
 gatewayConnected: this.gatewayClient?.isConnected || false,
 timestamp: new Date().toISOString(),
 });
 });

 // Webhook端点
 this.app.post(this.webhookPath, this.handleMixinWebhook.bind(this));

 //启动服务器
 return new Promise((resolve, reject) => {
 this.webhookServer = this.app.listen(this.webhookPort, (err) => {
 if (err) {
 reject(err);
 } else {
 console.log(`[${this.name}] Webhook服务器启动，端口: ${this.webhookPort}`);
 console.log(`[${this.name}] Webhook地址: http://localhost:${this.webhookPort}${this.webhookPath}`);
 resolve();
 }
 });
 });
 }

 /**
 *处理Mixin Webhook
 */
 async handleMixinWebhook(req, res) {
 try {
 console.log(`[${this.name}]收到Mixin Webhook`);

 //验证签名
 const signature = req.headers['x-mixin-signature'];
 const timestamp = req.headers['x-mixin-timestamp'];

 if (!signature || !timestamp) {
 return res.status(401).json({ error: 'Missing signature or timestamp' });
 }

 const isValid = MixinAPIClient.verifyWebhookSignature(signature, timestamp, req.body);
 if (!isValid) {
 return res.status(401).json({ error: 'Invalid signature' });
 }

 const { action, data } = req.body;

 //只处理CREATE_MESSAGE动作
 if (action !== 'CREATE_MESSAGE') {
 return res.status(200).json({ status: 'ignored' });
 }

 //解析消息
 const message = Message.fromMixinWebhook(req.body);

 //忽略机器人自己的消息
 if (message.user_id === config.mixin.appId) {
 return res.status(200).json({ status: 'self_message_ignored' });
 }

 console.log(`[${this.name}]收到用户消息:`, {
 userId: message.user_id,
 conversationId: message.conversation_id,
 type: message.category,
 });

 //立即返回响应（不阻塞Webhook）
 res.status(200).json({
 status: 'received',
 messageId: message.id,
 });

 //转发给Openclaw处理
 await this.forwardToOpenclaw(message);

 } catch (error) {
 console.error(`[${this.name}]处理Webhook失败:`, error);
 res.status(500).json({ error: 'Internal server error' });
 }
 }

 /**
 *转发消息到Openclaw
 */
 async forwardToOpenclaw(mixinMessage) {
 try {
 //转换消息格式
 const openclawMessage = this.convertToOpenclawFormat(mixinMessage);

 console.log(`[${this.name}]转发消息到Openclaw:`, openclawMessage.messageId);

 //发送到Gateway
 const response = await this.gatewayClient.sendUserMessage(openclawMessage);

 console.log(`[${this.name}]收到Openclaw回复:`, response.messageId);

 //发送回复到Mixin
 await this.sendReplyToMixin(mixinMessage.conversation_id, response);

 } catch (error) {
 console.error(`[${this.name}]转发消息失败:`, error);

 //发送错误提示
 await MixinAPIClient.sendTextMessage(
 mixinMessage.conversation_id,
 '抱歉，服务暂时不可用，请稍后重试。'
 );
 }
 }

 /**
 *转换Mixin消息为Openclaw格式
 */
 convertToOpenclawFormat(mixinMessage) {
 const baseMessage = {
 messageId: mixinMessage.message_id,
 userId: mixinMessage.user_id,
 conversationId: mixinMessage.conversation_id,
 timestamp: mixinMessage.created_at,
 };

 switch (mixinMessage.category) {
 case 'PLAIN_TEXT':
 return {
 ...baseMessage,
 type: 'text',
 text: mixinMessage.getTextContent(),
 attachments: [],
 metadata: {
 source: 'mixin',
 category: mixinMessage.category,
 },
 };

 case 'PLAIN_IMAGE':
 const imageInfo = mixinMessage.getImageInfo();
 return {
 ...baseMessage,
 type: 'image',
 text: '[图片]',
 attachments: [
 {
 type: 'image',
 url: imageInfo?.url,
 thumbnail: imageInfo?.thumbnail,
 },
 ],
 metadata: {
 source: 'mixin',
 category: mixinMessage.category,
 },
 };

 case 'PLAIN_DATA':
 return {
 ...baseMessage,
 type: 'file',
 text: '[文件]',
 attachments: [
 {
 type: 'file',
 data: mixinMessage.data,
 },
 ],
 metadata: {
 source: 'mixin',
 category: mixinMessage.category,
 },
 };

 default:
 return {
 ...baseMessage,
 type: 'unknown',
 text: `[${mixinMessage.category}]`,
 attachments: [],
 metadata: {
 source: 'mixin',
 category: mixinMessage.category,
 },
 };
 }
 }

 /**
 *处理Openclaw Agent回复
 */
 async handleAgentResponse(response) {
 console.log(`[${this.name}]处理Agent回复:`, response.messageId);

 try {
 const { conversationId, content } = response;

 //发送回复到Mixin
 await this.sendReplyToMixin(conversationId, content);

 } catch (error) {
 console.error(`[${this.name}]发送回复失败:`, error);
 }
 }

 /**
 *发送回复到Mixin
 */
 async sendReplyToMixin(conversationId, content) {
 try {
 let messageData;

 if (typeof content === 'string') {
 //纯文本回复
 messageData = {
 category: 'PLAIN_TEXT',
 data: Buffer.from(content).toString('base64'),
 };
 } else if (content.type === 'text') {
 messageData = {
 category: 'PLAIN_TEXT',
 data: Buffer.from(content.text).toString('base64'),
 };
 } else if (content.type === 'image') {
 messageData = {
 category: 'PLAIN_IMAGE',
 data: Buffer.from(JSON.stringify({
 url: content.url,
 thumbnail: content.thumbnail || content.url,
 })).toString('base64'),
 };
 } else {
 //默认文本
 messageData = {
 category: 'PLAIN_TEXT',
 data: Buffer.from(String(content)).toString('base64'),
 };
 }

 await MixinAPIClient.sendMessage(conversationId, messageData);
 console.log(`[${this.name}]回复已发送到Mixin`);

 } catch (error) {
 console.error(`[${this.name}]发送Mixin消息失败:`, error);
 throw error;
 }
 }

 /**
 *停止通道
 */
 async stop() {
 console.log(`[${this.name}]停止通道...`);

 //关闭Gateway连接
 if (this.gatewayClient) {
 this.gatewayClient.disconnect();
 }

 //关闭Webhook服务器
 if (this.webhookServer) {
 this.webhookServer.close();
 }

 this.isRunning = false;
 console.log(`[${this.name}]通道已停止`);
 }

 /**
 *获取状态
 */
 getStatus() {
 return {
 name: this.name,
 isRunning: this.isRunning,
 gatewayConnected: this.gatewayClient?.isConnected || false,
 webhookPort: this.webhookPort,
 gatewayUrl: this.gatewayUrl,
 };
 }
}

module.exports = MixinChannel;