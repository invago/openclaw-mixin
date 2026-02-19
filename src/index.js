const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const { config, validateConfig } = require('./config');
const webhookRoutes = require('./routes/webhook');
const SessionManager = require('./services/SessionManager');

class App {
 constructor() {
 this.app = express();
 this.port = config.server.port;
 this.initMiddleware();
 this.initRoutes();
 this.initErrorHandling();
 }

 initMiddleware() {
 //跨域支持
 this.app.use(cors());

 //请求日志
 this.app.use(morgan(config.server.nodeEnv === 'development' ? 'dev' : 'combined'));

 //解析请求体
 this.app.use(bodyParser.json({ limit: '10mb' }));
 this.app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

 //请求日志中间件
 this.app.use((req, res, next) => {
 console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
 next();
 });
 }

 initRoutes() {
 //API路由
 this.app.use('/webhook', webhookRoutes);

 //根路由
 this.app.get('/', (req, res) => {
 res.json({
 service: 'Mixin-Openclaw适配器',
 version: '1.0.0',
 status: 'running',
 endpoints: {
 webhook: '/webhook/mixin',
 health: '/webhook/health',
 verify: '/webhook/verify',
 },
 });
 });

 //404处理
 this.app.use('*', (req, res) => {
 res.status(404).json({
 error: 'Not Found',
 message: `路由 ${req.originalUrl}不存在`,
 });
 });
 }

 initErrorHandling() {
 //错误处理中间件
 this.app.use((err, req, res, next) => {
 console.error('未处理的错误:', err);

 const statusCode = err.statusCode ||500;
 const message = config.server.nodeEnv === 'production'
 ? '服务器内部错误'
 : err.message;

 res.status(statusCode).json({
 error: 'Internal Server Error',
 message,
 ...(config.server.nodeEnv === 'development' && { stack: err.stack }),
 });
 });
 }

 async start() {
 try {
 //验证配置
 const isValid = validateConfig();
 if (!isValid) {
 console.warn('配置验证失败，部分功能可能无法正常工作');
 }

 //初始化会话管理器
 await SessionManager.initRedis();

 //启动服务器
 this.server = this.app.listen(this.port, () => {
 console.log(`
 🚀 Mixin-Openclaw适配器启动成功!

环境: ${config.server.nodeEnv}
端口: ${this.port}
时间: ${new Date().toISOString()}

端点:
 - Webhook: http://localhost:${this.port}/webhook/mixin
 -健康检查: http://localhost:${this.port}/webhook/health
 -验证端点: http://localhost:${this.port}/webhook/verify
 `);
 });

 //优雅关闭
 this.setupGracefulShutdown();

 } catch (error) {
 console.error('启动失败:', error);
 process.exit(1);
 }
 }

 setupGracefulShutdown() {
 const shutdown = async (signal) => {
 console.log(`收到 ${signal}信号，开始优雅关闭...`);

 if (this.server) {
 this.server.close(async () => {
 console.log('HTTP服务器已关闭');

 //关闭Redis连接
 if (SessionManager.client) {
 await SessionManager.client.quit();
 console.log('Redis连接已关闭');
 }

 console.log('服务关闭完成');
 process.exit(0);
 });
 }

 //强制退出超时
 setTimeout(() => {
 console.error('优雅关闭超时，强制退出');
 process.exit(1);
 },10000);
 };

 process.on('SIGTERM', () => shutdown('SIGTERM'));
 process.on('SIGINT', () => shutdown('SIGINT'));
 }
}

//启动应用
if (require.main === module) {
 const app = new App();
 app.start();
}

module.exports = App;