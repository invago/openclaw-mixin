/**
 *独立运行模式服务器
 */

const express = require('express');
const http = require('http');
const { config } = require('./config');
const SessionManager = require('./services/SessionManager');
const MixinAPIClient = require('./services/MixinAPIClient');
const MessageProcessor = require('./services/MessageProcessor');
const Message = require('./models/Message');
const { defaultLogger } = require('./utils/logger');

class StandaloneServer {
 constructor() {
 this.app = express();
 this.server = null;
 this.port = config.server.port;
 this.logger = defaultLogger;
 this.processor = new MessageProcessor();
 this.isRunning = false;

 this.setupMiddleware();
 this.setupRoutes();
 }

 /**
 *设置中间件
 */
 setupMiddleware() {
 // JSON解析
 this.app.use(express.json({ limit: '10mb' }));
 this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

 //请求日志
 this.app.use((req, res, next) => {
 const startTime = Date.now();
 const originalSend = res.send;

 res.send = function(data) {
 const duration = Date.now() - startTime;
 this.logger.http(req, res, duration);
 return originalSend.call(this, data);
 }.bind(this);

 next();
 });

 //跨域支持
 this.app.use((req, res, next) => {
 res.header('Access-Control-Allow-Origin', '*');
 res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
 res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Mixin-Signature, X-Mixin-Timestamp');

 if (req.method === 'OPTIONS') {
 return res.status(200).end();
 }

 next();
 });
 }

 /**
 *设置路由
 */
 setupRoutes() {
 //根路由
 this.app.get('/', (req, res) => {
 res.json({
 service: 'Mixin Messenger插件',
 version: '1.0.0',
 mode: 'standalone',
 status: 'running',
 endpoints: {
 webhook: '/webhook/mixin',
 health: '/health',
 info: '/info',
 },
 documentation: 'https://github.com/invago/openclaw-mixin',
 });
 });

 // Webhook端点
 this.app.post('/webhook/mixin', this.handleWebhook.bind(this));

 //健康检查
 this.app.get('/health', this.healthCheck.bind(this));

 //插件信息
 this.app.get('/info', this.pluginInfo.bind(this));

 //404处理
 this.app.use('*', (req, res) => {
 res.status(404).json({
 error: 'Not Found',
 message: `路由 ${req.originalUrl}不存在`,
 });
 });

 //错误处理
 this.app.use((err, req, res, next) => {
 this.logger.error('服务器错误:', err);

 const statusCode = err.statusCode ||500;
 const message = config.server.nodeEnv === 'production'
 ? '服务器内部错误'
 : err.message;

 res.status(statusCode).json({
 error: 'Internal Server Error',
 message,
 ...(config.server.nodeEnv === 'development' && { stack: err.stack }),
 });
 }

 /**
 *处理Webhook请求
 */
 async handleWebhook(req, res) {
 try {
 this.logger.info('收到Mixin Webhook请求');

 //验证签名
 const signature = req.headers['x-mixin-signature'];
 const timestamp = req.headers['x-mixin-timestamp'];

 if (!signature || !timestamp) {
 return res.status(401).json({ error: '缺少签名或时间戳' });
 }

 const isValid = MixinAPIClient.verifyWebhookSignature(signature, timestamp, req.body);
 if (!isValid) {
 return res.status(401).json({ error: '无效签名' });
 }

 const { action, data } = req.body;

 //只处理CREATE_MESSAGE动作
 if (action !== 'CREATE_MESSAGE') {
 this.logger.info(`忽略动作: ${action}`);
 return res.status(200).json({ status: 'ignored' });
 }

 //解析消息
 const message = Message.fromMixinWebhook(req.body);
 this.logger.info('解析消息:', {
 id: message.id,
 userId: message.user_id,
 conversationId: message.conversation_id,
 category: message.category,
 });

 //忽略机器人自己的消息
 if (message.user_id === config.mixin.appId) {
 this.logger.info('忽略机器人自己的消息');
 return res.status(200).json({ status: 'self_message_ignored' });
 }

 //异步处理消息
 this.processMessageAsync(message);

 //立即返回响应
 res.status(200).json({
 status: 'received',
 messageId: message.id,
 timestamp: new Date().toISOString(),
 });

 } catch (error) {
 this.logger.error('处理Webhook失败:', error);
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
 //获取或创建会话
 const session = await SessionManager.getOrCreateSession(
 message.user_id,
 message.conversation_id
 );

 //处理消息
 const response = await this.processor.processMessage(message, session);

 if (response) {
 //发送回复
 await MixinAPIClient.sendMessage(message.conversation_id, response);

 //更新会话上下文
 await SessionManager.updateSessionContext(
 message.user_id,
 message.conversation_id,
 message,
 response
 );

 this.logger.info('消息处理完成', {
 messageId: message.id,
 responseType: response.type,
 sessionId: session.id,
 });
 }

 } catch (error) {
 this.logger.error('异步处理消息失败:', error);

 //发送错误回复
 try {
 await MixinAPIClient.sendTextMessage(
 message.conversation_id,
 '抱歉，处理消息时出现错误，请稍后重试。'
 );
 } catch (sendError) {
 this.logger.error('发送错误消息失败:', sendError);
 }
 }
 }

 /**
 *健康检查
 */
 healthCheck(req, res) {
 const health = {
 status: 'healthy',
 timestamp: new Date().toISOString(),
 version: '1.0.0',
 mode: 'standalone',
 services: {
 redis: SessionManager.connected ? 'connected' : 'disconnected',
 mixin: config.mixin.appId ? 'configured' : 'not_configured',
 },
 uptime: process.uptime(),
 memory: process.memoryUsage(),
 };

 res.status(200).json(health);
 }

 /**
 *插件信息
 */
 pluginInfo(req, res) {
 const info = {
 name: 'mixin-messenger',
 displayName: 'Mixin Messenger',
 version: '1.0.0',
 description: '将Openclaw AI助手接入Mixin Messenger平台',
 author: 'Your Name',
 license: 'MIT',
 homepage: 'https://github.com/invago/openclaw-mixin',
 config: {
 appId: config.mixin.appId,
 sessionId: config.mixin.sessionId,
 serverPublicKey: config.mixin.serverPublicKey ? '配置中' : '未配置',
 sessionPrivateKey: config.mixin.sessionPrivateKey ? '配置中' : '未配置',
 },
 endpoints: {
 webhook: `http://localhost:${this.port}/webhook/mixin`,
 health: `http://localhost:${this.port}/health`,
 info: `http://localhost:${this.port}/info`,
 },
 };

 res.status(200).json(info);
 }

 /**
 *启动服务器
 */
 async start() {
 try {
 //初始化会话管理器
 await SessionManager.initRedis();

 //启动HTTP服务器
 this.server = http.createServer(this.app);

 this.server.listen(this.port, () => {
 this.isRunning = true;

 console.log(`
 ✅ Mixin Messenger独立服务器启动成功!

环境信息:
 -模式:独立运行
 -端口: ${this.port}
 -时间: ${new Date().toISOString()}
 -环境: ${config.server.nodeEnv}

访问地址:
 -主页: http://localhost:${this.port}/
 -Webhook: http://localhost:${this.port}/webhook/mixin
 -健康检查: http://localhost:${this.port}/health
 -插件信息: http://localhost:${this.port}/info

配置状态:
 -App ID: ${config.mixin.appId ? '已配置' : '未配置'}
 -Session ID: ${config.mixin.sessionId ? '已配置' : '未配置'}
 -Server Public Key: ${config.mixin.serverPublicKey ? '已配置' : '未配置'}
 -Session Private Key: ${config.mixin.sessionPrivateKey ? '已配置' : '未配置'}
 `);
 });

 //优雅关闭
 this.setupGracefulShutdown();

 return this.server;

 } catch (error) {
 this.logger.error('启动服务器失败:', error);
 throw error;
 }
 }

 /**
 *设置优雅关闭
 */
 setupGracefulShutdown() {
 const shutdown = async (signal) => {
 this.logger.info(`收到 ${signal}信号，开始优雅关闭...`);

 if (this.server) {
 this.server.close(async () => {
 this.logger.info('HTTP服务器已关闭');

 //关闭Redis连接
 if (SessionManager.client) {
 await SessionManager.client.quit();
 this.logger.info('Redis连接已关闭');
 }

 this.logger.info('服务关闭完成');
 process.exit(0);
 });
 }

 //强制退出超时
 setTimeout(() => {
 this.logger.error('优雅关闭超时，强制退出');
 process.exit(1);
 },10000);
 };

 process.on('SIGTERM', () => shutdown('SIGTERM'));
 process.on('SIGINT', () => shutdown('SIGINT'));
 }

 /**
 *停止服务器
 */
 async stop() {
 if (this.server) {
 this.server.close();
 this.isRunning = false;
 }

 //关闭Redis连接
 if (SessionManager.client) {
 await SessionManager.client.quit();
 }

 this.logger.info('独立服务器已停止');
 }
}

/**
 *启动独立服务器
 */
async function startStandaloneServer() {
 const server = new StandaloneServer();
 await server.start();
 return server;
}

module.exports = {
 StandaloneServer,
 startStandaloneServer,
};