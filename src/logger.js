/**
 *增强的日志管理器
 *参考feishu-openclaw的日志实现
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class Logger {
 constructor(options = {}) {
 this.moduleName = options.moduleName || 'app';
 this.debugMode = process.env.OPENCLAW_DEBUG === 'true' || process.env.DEBUG === 'true';
 this.logToFile = process.env.OPENCLAW_LOG_TO_FILE === 'true';

 //日志目录
 this.logDir = path.join(os.homedir(), '.openclaw', 'logs');
 this.outLogPath = path.join(this.logDir, 'mixin-bridge.out.log');
 this.errLogPath = path.join(this.logDir, 'mixin-bridge.err.log');

 //确保日志目录存在
 if (this.logToFile && !fs.existsSync(this.logDir)) {
 fs.mkdirSync(this.logDir, { recursive: true });
 }

 //日志级别
 this.levels = {
 ERROR:0,
 WARN:1,
 INFO:2,
 DEBUG:3,
 };

 this.currentLevel = this.debugMode ? this.levels.DEBUG : this.levels.INFO;
 }

 /**
*获取当前时间戳
 */
 getTimestamp() {
 return new Date().toISOString();
 }

 /**
*格式化日志消息
 */
 formatMessage(level, message, meta = {}) {
 const timestamp = this.getTimestamp();
 const logEntry = {
 timestamp,
 level,
 module: this.moduleName,
 message,
 };

 if (Object.keys(meta).length >0) {
 //在调试模式下显示更多详情
 if (this.debugMode) {
 logEntry.meta = meta;
 } else {
 //生产环境只保留关键信息
 logEntry.meta = this.sanitizeMeta(meta);
 }
 }

 return JSON.stringify(logEntry);
 }

 /**
*清理敏感信息
 */
 sanitizeMeta(meta) {
 const sensitive = ['password', 'secret', 'token', 'key', 'privateKey', 'apiKey', 'authorization', 'cookie'];
 const sanitized = {};

 for (const [k, v] of Object.entries(meta)) {
 if (sensitive.some(s => k.toLowerCase().includes(s))) {
 sanitized[k] = '[HIDDEN]';
 } else if (typeof v === 'string' && v.length > 100) {
 // 隐藏长字符串（可能是密钥或token）
 sanitized[k] = v.substring(0, 20) + '...[HIDDEN]';
 } else if (typeof v === 'object' && v !== null) {
 // 递归处理嵌套对象
 sanitized[k] = this.sanitizeMeta(v);
 } else {
 sanitized[k] = v;
 }
 }

 return sanitized;
 }

 /**
*脱敏消息内容
 */
 sanitizeMessage(message) {
 if (typeof message !== 'string') return message;

 return message
 .replace(/[a-f0-9]{64,}/gi, '[HASH_HIDDEN]') // SHA256等哈希
 .replace(/[A-Za-z0-9+/]{40,}={0,2}/g, '[BASE64_HIDDEN]') // Base64编码
 .replace(/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, '[PEM_KEY_HIDDEN]') // PEM密钥
 .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[UUID]'); // UUID
 }

 /**
*写入日志文件
 */
 writeToFile(level, message) {
 if (!this.logToFile) return;

 try {
 const logPath = level === 'ERROR' ? this.errLogPath : this.outLogPath;
 const logLine = `${this.getTimestamp()} [${level}] ${message}\n`;

 fs.appendFileSync(logPath, logLine);

 //轮转日志（如果超过10MB）
 this.rotateLogIfNeeded(logPath);

 } catch (error) {
 console.error('写入日志文件失败:', error.message);
 }
 }

 /**
*日志轮转
 */
 rotateLogIfNeeded(logPath) {
 try {
 const stats = fs.statSync(logPath);
 const maxSize =10 *1024 *1024; //10MB

 if (stats.size > maxSize) {
 const backupPath = `${logPath}.1`;
 if (fs.existsSync(backupPath)) {
 fs.unlinkSync(backupPath);
 }
 fs.renameSync(logPath, backupPath);
 }
 } catch (error) {
 //忽略轮转错误
 }
 }

 /**
*打印到控制台
 */
 printToConsole(level, formattedMessage, rawMessage) {
 const colors = {
 ERROR: '\x1b[31m', //红色
 WARN: '\x1b[33m', //黄色
 INFO: '\x1b[32m', //绿色
 DEBUG: '\x1b[36m', //青色
 RESET: '\x1b[0m',
 };

 const color = colors[level] || '';
 const reset = colors.RESET;

 //错误和警告输出到stderr
 if (level === 'ERROR' || level === 'WARN') {
 console.error(`${color}[${level}]${reset} ${rawMessage}`);
 } else {
 console.log(`${color}[${level}]${reset} ${rawMessage}`);
 }
 }

 /**
*记录日志
 */
 log(level, message, meta = {}) {
 const levelValue = this.levels[level];

 //检查日志级别
 if (levelValue > this.currentLevel) {
 return;
 }

 const formattedMessage = this.formatMessage(level, message, meta);

 //输出到控制台
 this.printToConsole(level, formattedMessage, message);

 //写入文件
 this.writeToFile(level, formattedMessage);

 //触发事件（如果有监听器）
 this.emit?.('log', { level, message, meta, timestamp: this.getTimestamp() });
 }

 /**
*错误日志
 */
 error(message, error = null, meta = {}) {
 const errorMeta = { ...meta };

 if (error) {
 if (error instanceof Error) {
 errorMeta.error = {
 message: error.message,
 name: error.name,
 stack: this.debugMode ? error.stack : undefined,
 };
 } else {
 errorMeta.error = error;
 }
 }

 this.log('ERROR', message, errorMeta);
 }

 /**
*警告日志
 */
 warn(message, meta = {}) {
 this.log('WARN', message, meta);
 }

 /**
*信息日志
 */
 info(message, meta = {}) {
 this.log('INFO', message, meta);
 }

 /**
*调试日志（仅在调试模式）
 */
 debug(message, meta = {}) {
 if (this.debugMode) {
 this.log('DEBUG', message, meta);
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
 responseTime: `${responseTime}ms`,
 ip: req.ip || req.connection?.remoteAddress,
 userAgent: req.headers?.['user-agent'],
 };


 this.info(`${req.method} ${req.url}`, meta);
 }

 /**
*消息处理日志
 */
 message(direction, messageId, details = {}) {
 //direction: 'in' | 'out'
 const arrow = direction === 'in' ? '<--' : '-->';
 const platform = 'Mixin';

 this.info(`${arrow} [${platform}] ${messageId}`, details);
 }

 /**
*设置调试模式
 */
 setDebugMode(enabled) {
 this.debugMode = enabled;
 this.currentLevel = enabled ? this.levels.DEBUG : this.levels.INFO;
 console.log(`[Logger]调试模式已${enabled ? '开启' : '关闭'}`);
 }

 /**
*获取日志统计
 */
 getStats() {
 return {
 debugMode: this.debugMode,
 logToFile: this.logToFile,
 logDir: this.logDir,
 outLog: this.outLogPath,
 errLog: this.errLogPath,
 };
 }
}

//创建默认logger实例
const defaultLogger = new Logger({ moduleName: 'app' });

//工厂函数
function createLogger(moduleName) {
 return new Logger({ moduleName });
}

module.exports = {
 Logger,
 createLogger,
 defaultLogger,
};