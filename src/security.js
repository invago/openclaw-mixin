/**
 *安全工具模块
 *参考feishu-openclaw的安全实现
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class SecurityManager {
 constructor() {
 //默认文件访问白名单
 this.fileWhitelist = [
 path.join(os.homedir(), '.openclaw', 'media'),
 path.join(os.homedir(), '.clawd', 'media'),
 os.tmpdir(),
 path.join(os.tmpdir(), 'openclaw'),
 ];

 //密钥存储路径
 this.secretsDir = path.join(os.homedir(), '.openclaw', 'secrets');
 }

 /**
 *从文件读取密钥
 *参考feishu-openclaw的密钥管理方式
 */
 readSecretFromFile(fileName) {
 const filePath = path.join(this.secretsDir, fileName);

 try {
 if (!fs.existsSync(filePath)) {
 return null;
 }

 //检查文件权限（非Windows）
 if (process.platform !== 'win32') {
 const stats = fs.statSync(filePath);
 const mode = stats.mode & parseInt('777',8);

 //警告：如果文件权限过于开放
 if (mode & parseInt('044',8)) {
 console.warn(`[Security]警告:密钥文件 ${fileName}权限过于开放，建议设置为600`);
 }
 }

 const content = fs.readFileSync(filePath, 'utf-8').trim();
 return content;

 } catch (error) {
 console.error(`[Security]读取密钥文件失败:`, error.message);
 return null;
 }
 }

 /**
 *保存密钥到文件
 */
 saveSecretToFile(fileName, content) {
 try {
 //确保目录存在
 if (!fs.existsSync(this.secretsDir)) {
 fs.mkdirSync(this.secretsDir, { recursive: true, mode:0o700 });
 }

 const filePath = path.join(this.secretsDir, fileName);

 //写入文件并设置权限
 fs.writeFileSync(filePath, content, { mode:0o600 });

 console.log(`[Security]密钥已保存到: ${filePath}`);
 return true;

 } catch (error) {
 console.error(`[Security]保存密钥失败:`, error.message);
 return false;
 }
 }

 /**
 *获取Mixin私钥
 *优先从文件读取，其次环境变量
 */
 getMixinPrivateKey() {
 //首先尝试从文件读取
 const fromFile = this.readSecretFromFile('mixin_session_private_key');
 if (fromFile) {
 return fromFile;
 }

 //其次从环境变量读取
 const fromEnv = process.env.MIXIN_SESSION_PRIVATE_KEY;
 if (fromEnv) {
 //可选：保存到文件以便下次使用
 if (process.env.OPENCLAW_SAVE_SECRETS === 'true') {
 this.saveSecretToFile('mixin_session_private_key', fromEnv);
 }
 return fromEnv;
 }

 return null;
 }

 /**
 *验证文件路径是否在白名单中
 *防止目录遍历攻击
 */
 isPathAllowed(filePath) {
 const resolvedPath = path.resolve(filePath);

 //检查是否在白名单中
 for (const allowedPath of this.fileWhitelist) {
 const resolvedAllowed = path.resolve(allowedPath);
 if (resolvedPath.startsWith(resolvedAllowed)) {
 return true;
 }
 }

 console.warn(`[Security]拒绝访问不在白名单中的路径: ${filePath}`);
 return false;
 }

 /**
 *添加文件白名单路径
 */
 addToWhitelist(dirPath) {
 const resolved = path.resolve(dirPath);
 if (!this.fileWhitelist.includes(resolved)) {
 this.fileWhitelist.push(resolved);
 console.log(`[Security]已添加到文件白名单: ${resolved}`);
 }
 }

 /**
 *安全的文件读取
 */
 safeReadFile(filePath) {
 if (!this.isPathAllowed(filePath)) {
 throw new Error('Access denied: Path not in whitelist');
 }

 if (!fs.existsSync(filePath)) {
 throw new Error('File not found');
 }

 return fs.readFileSync(filePath);
 }

 /**
 *安全的文件写入
 */
 safeWriteFile(filePath, data) {
 if (!this.isPathAllowed(filePath)) {
 throw new Error('Access denied: Path not in whitelist');
 }

 //确保目录存在
 const dir = path.dirname(filePath);
 if (!fs.existsSync(dir)) {
 fs.mkdirSync(dir, { recursive: true });
 }

 fs.writeFileSync(filePath, data);
 }

 /**
 *清理敏感信息（用于日志）
 */
 sanitizeForLog(text) {
 if (!text || typeof text !== 'string') {
 return text;
 }

 //隐藏常见的敏感信息模式
 return text
 .replace(/([a-zA-Z0-9_-]{20,})/g, '[HIDDEN]') //长字符串（可能是密钥）
 .replace(/(private[_-]?key[:=]\s*).+/i, '$1[HIDDEN]')
 .replace(/(secret[:=]\s*).+/i, '$1[HIDDEN]')
 .replace(/(token[:=]\s*).+/i, '$1[HIDDEN]')
 .replace(/(password[:=]\s*).+/i, '$1[HIDDEN]');
 }

 /**
 *生成随机ID
 */
 generateId() {
 return `${Date.now()}-${Math.random().toString(36).substr(2,9)}`;
 }

 /**
 *验证Webhook签名（Mixin格式）
 */
 verifyWebhookSignature(signature, timestamp, body, secret) {
 const crypto = require('crypto');
 const message = `${timestamp}${JSON.stringify(body)}`;
 const expectedSignature = crypto
 .createHmac('sha256', secret)
 .update(message)
 .digest('hex');

 return signature === expectedSignature;
 }
}

//单例实例
const securityManager = new SecurityManager();

module.exports = {
 SecurityManager,
 securityManager,
};