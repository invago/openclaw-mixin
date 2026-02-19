const { config } = require('../config');

class Logger {
 constructor(moduleName) {
 this.moduleName = moduleName;
 }

 /**
 *格式化日志消息
 */
 formatMessage(level, message, meta = {}) {
 const timestamp = new Date().toISOString();
 const baseLog = {
 timestamp,
 level,
 module: this.moduleName,
 message,
 };

 if (Object.keys(meta).length >0) {
 baseLog.meta = meta;
 }

 return JSON.stringify(baseLog);
 }

 /**
 *信息级别日志
 */
 info(message, meta = {}) {
 const logMessage = this.formatMessage('INFO', message, meta);
 console.log(logMessage);
 }

 /**
 *警告级别日志
 */
 warn(message, meta = {}) {
 const logMessage = this.formatMessage('WARN', message, meta);
 console.warn(logMessage);
 }

 /**
 *错误级别日志
 */
 error(message, error = null, meta = {}) {
 const logMessage = this.formatMessage('ERROR', message, meta);

 if (error) {
 if (error instanceof Error) {
 meta.error = {
 message: error.message,
 stack: config.server.nodeEnv === 'development' ? error.stack : undefined,
 name: error.name,
 };
 } else {
 meta.error = error;
 }
 }

 console.error(this.formatMessage('ERROR', message, meta));
 }

 /**
 *调试级别日志（仅在开发环境）
 */
 debug(message, meta = {}) {
 if (config.server.nodeEnv === 'development') {
 const logMessage = this.formatMessage('DEBUG', message, meta);
 console.debug(logMessage);
 }
 }

 /**
 *HTTP请求日志
 */
 http(req, res, responseTime) {
 const meta = {
 method: req.method,
 url: req.url,
 status: res.statusCode,
 responseTime,
 ip: req.ip || req.connection.remoteAddress,
 userAgent: req.headers['user-agent'],
 };

 this.info(`${req.method} ${req.url} ${res.statusCode} ${responseTime}ms`, meta);
 }

 /**
 *消息处理日志
 */
 message(messageId, action, details = {}) {
 const meta = {
 messageId,
 action,
 ...details,
 };

 this.info(`消息 ${action}`, meta);
 }

 /**
 *会话日志
 */
 session(sessionId, action, details = {}) {
 const meta = {
 sessionId,
 action,
 ...details,
 };

 this.info(`会话 ${action}`, meta);
 }
}

//创建默认logger
const defaultLogger = new Logger('app');

//创建模块特定的logger工厂函数
function createLogger(moduleName) {
 return new Logger(moduleName);
}

module.exports = {
 Logger,
 createLogger,
 defaultLogger,
};