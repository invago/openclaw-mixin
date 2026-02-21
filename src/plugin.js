/**
 * Mixin Messenger插件主文件
 *参考Openclaw飞书和Telegram插件实现
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const config = require('./config').config;

//导入服务模块
const MixinAPIClient = require('./services/MixinAPIClient');
const MessageProcessor = require('./services/MessageProcessor');
const SessionManager = require('./services/SessionManager');

class MixinPlugin {
 constructor(claw) {
 this.claw = claw;
 this.name = 'mixin-messenger';
 this.displayName = 'Mixin Messenger';
 this.version = '1.0.0';

 //初始化服务
 this.client = MixinAPIClient;
 this.processor = new MessageProcessor();
 this.sessionManager = SessionManager;

 //插件状态
 this.isInitialized = false;
 this.isRunning = false;
 this.app = null;
 this.server = null;
 }

 /**
 *插件初始化
 */
 async initialize() {
 try {
 console.log(`[${this.name}]插件初始化...`);

 //初始化会话管理器
 await this.sessionManager.initRedis();

 //注册事件处理器
 this.registerEventHandlers();

 //创建Express应用
 this.app = express();
 this.setupMiddleware();
 this.setupRoutes();

 this.isInitialized = true;
 console.log(`[${this.name}]插件初始化完成`);

 return true;
 } catch (error) {
 console.error(`[${this.name}]初始化失败:`, error);
 throw error;
 }
 }

 /**
 *启动插件
 */
 async start() {
 if (!this.isInitialized) {
 await this.initialize();
 }

 try {
 console.log(`[${this.name}]启动插件...`);

 //启动HTTP服务器
 const port = config.server.port;
 this.server = this.app.listen(port, () => {
 console.log(`[${this.name}] Webhook服务器启动，端口: ${port}`);
 console.log(`[${this.name}] Webhook地址: http://localhost:${port}/webhook/mixin`);
 });

 this.isRunning = true;
 console.log(`[${this.name}]插件启动完成`);

 return true;
 } catch (error) {
 console.error(`[${this.name}]启动失败:`, error);
 throw error;
 }
 }

 /**
 *停止插件
 */
 async stop() {
 try {
 console.log(`[${this.name}]停止插件...`);

 //关闭HTTP服务器
 if (this.server) {
 this.server.close(() => {
 console.log(`[${this.name}] Webhook服务器已关闭`);
 });
 }

 //清理会话管理器
 if (this.sessionManager.client) {
 await this.sessionManager.client.quit();
 }

 this.isRunning = false;
 console.log(`[${this.name}]插件已停止`);

 return true;
 } catch (error) {
 console.error(`[${this.name}]停止失败:`, error);
 throw error;
 }
 }

 /**
 *设置中间件
 */
 setupMiddleware() {
 //JSON解析
 this.app.use(express.json({ limit: '10mb' }));
 this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

 //请求日志
 this.app.use((req, res, next) => {
 console.log(`[${this.name}] ${req.method} ${req.url}`);
 next();
 });
 }

 /**
 *设置路由
 */
 setupRoutes() {
 //Webhook速率限制：每IP每分钟最多60个请求
 const webhookRateLimiter = rateLimit({
 windowMs: 60 * 1000, // 1分钟
 max: 60, // 每个IP最多60个请求
 message: { error: 'Too many requests, please try again later.' },
 standardHeaders: true,
 legacyHeaders: false,
 });

 //Webhook端点（带速率限制）
 this.app.post('/webhook/mixin', webhookRateLimiter, this.handleWebhook.bind(this));

 //健康检查
 this.app.get('/health', (req, res) => {
 res.json({
 status: 'healthy',
 plugin: this.name,
 version: this.version,
 timestamp: new Date().toISOString(),
 });
 });

 //插件信息
 this.app.get('/info', (req, res) => {
 res.json({
 name: this.name,
 displayName: this.displayName,
 version: this.version,
 description: '将Openclaw AI助手接入Mixin Messenger平台',
 isRunning: this.isRunning,
 isInitialized: this.isInitialized,
 });
 });
 }

 /**
 *处理Webhook请求
 */
 async handleWebhook(req, res) {
 try {
 //验证签名
 const signature = req.headers['x-mixin-signature'];
 const timestamp = req.headers['x-mixin-timestamp'];

 if (!signature || !timestamp) {
 return res.status(401).json({ error: 'Missing signature or timestamp' });
 }

 const isValid = this.client.verifyWebhookSignature(signature, timestamp, req.body);
 if (!isValid) {
 return res.status(401).json({ error: 'Invalid signature' });
 }

 //处理消息
 const { action, data } = req.body;

 if (action !== 'CREATE_MESSAGE') {
 return res.status(200).json({ status: 'ignored' });
 }

 //解析消息
 const message = {
 id: data.message_id,
 conversation_id: data.conversation_id,
 user_id: data.user_id,
 category: data.category,
 data: data.data,
 created_at: data.created_at,
 };

 //忽略机器人自己的消息
 if (message.user_id === config.mixin.appId) {
 return res.status(200).json({ status: 'self_message_ignored' });
 }

 //异步处理消息
 this.processMessageAsync(message);

 //立即返回响应
 res.status(200).json({
 status: 'received',
 messageId: message.id,
 });

 } catch (error) {
 console.error(`[${this.name}] Webhook处理失败:`, error);
 res.status(500).json({ error: 'Internal server error' });
 }
 }

 /**
 *异步处理消息
 */
 async processMessageAsync(message) {
 try {
 //获取或创建会话
 const session = await this.sessionManager.getOrCreateSession(
 message.user_id,
 message.conversation_id
 );

 //处理消息
 const response = await this.processor.processMessage(message, session);

 if (response) {
 //发送回复
 await this.client.sendMessage(message.conversation_id, response);

 //更新会话上下文
 await this.sessionManager.updateSessionContext(
 message.user_id,
 message.conversation_id,
 message,
 response
 );

 //触发消息事件
 this.claw.emit('message:processed', {
 plugin: this.name,
 message,
 response,
 session,
 });
 }

 } catch (error) {
 console.error(`[${this.name}]消息处理失败:`, error);

 //发送错误回复
 try {
 await this.client.sendTextMessage(
 message.conversation_id,
 '抱歉，处理消息时出现错误，请稍后重试。'
 );
 } catch (sendError) {
 console.error(`[${this.name}]发送错误消息失败:`, sendError);
 }
 }
 }

 /**
 *注册事件处理器
 */
 registerEventHandlers() {
 //注册到Openclaw事件系统
 this.claw.on('plugin:start', async (pluginName) => {
 if (pluginName === this.name) {
 await this.start();
 }
 });

 this.claw.on('plugin:stop', async (pluginName) => {
 if (pluginName === this.name) {
 await this.stop();
 }
 });

 this.claw.on('plugin:restart', async (pluginName) => {
 if (pluginName === this.name) {
 await this.stop();
 await this.start();
 }
 });
 }

 /**
 *获取插件配置
 */
 getConfig() {
 return {
 name: this.name,
 displayName: this.displayName,
 version: this.version,
 description: '将Openclaw AI助手接入Mixin Messenger平台',
 options: [
 {
 key: 'MIXIN_APP_ID',
 value: config.mixin.appId,
 },
 {
 key: 'MIXIN_SESSION_ID',
 value: config.mixin.sessionId,
 },
 {
 key: 'MIXIN_SERVER_PUBLIC_KEY',
 value: config.mixin.serverPublicKey,
 },
 {
 key: 'MIXIN_SESSION_PRIVATE_KEY',
 value: config.mixin.sessionPrivateKey ? '***隐藏***' : '',
 },
 ],
 };
 }

 /**
 *更新插件配置
 */
 updateConfig(newConfig) {
 //这里可以实现配置更新逻辑
 console.log(`[${this.name}]配置更新:`, newConfig);
 return true;
 }
}

module.exports = MixinPlugin;