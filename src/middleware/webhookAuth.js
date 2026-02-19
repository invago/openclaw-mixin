const { config } = require('../config');
const mixinClient = require('../services/MixinAPIClient');

/**
 *验证Mixin Webhook签名中间件
 */
function verifyMixinWebhook(req, res, next) {
 //在开发环境中跳过验证
 if (config.server.nodeEnv === 'development' && !config.server.webhookSecret) {
 console.log('开发环境:跳过Webhook签名验证');
 return next();
 }

 const signature = req.headers['x-mixin-signature'];
 const timestamp = req.headers['x-mixin-timestamp'];

 if (!signature || !timestamp) {
 console.error('缺少Webhook签名或时间戳');
 return res.status(401).json({
 error: 'Unauthorized',
 message: '缺少签名或时间戳',
 });
 }

 //验证签名
 const isValid = mixinClient.verifyWebhookSignature(signature, timestamp, req.body);

 if (!isValid) {
 console.error('Webhook签名验证失败');
 return res.status(401).json({
 error: 'Unauthorized',
 message: '签名验证失败',
 });
 }

 next();
}

/**
 *验证API密钥中间件（用于管理接口）
 */
function verifyApiKey(req, res, next) {
 const apiKey = req.headers['x-api-key'];

 if (!apiKey) {
 return res.status(401).json({
 error: 'Unauthorized',
 message: '缺少API密钥',
 });
 }

 //TODO:实现API密钥验证逻辑
 //暂时使用简单的验证
 if (apiKey !== process.env.ADMIN_API_KEY) {
 return res.status(403).json({
 error: 'Forbidden',
 message: '无效的API密钥',
 });
 }

 next();
}

/**
 *验证JWT令牌中间件
 */
function verifyJWT(req, res, next) {
 const authHeader = req.headers.authorization;

 if (!authHeader || !authHeader.startsWith('Bearer ')) {
 return res.status(401).json({
 error: 'Unauthorized',
 message: '缺少或无效的授权头',
 });
 }

 const token = authHeader.split(' ')[1];

 try {
 const decoded = jwt.verify(token, config.security.jwtSecret);
 req.user = decoded;
 next();
 } catch (error) {
 console.error('JWT验证失败:', error.message);
 return res.status(401).json({
 error: 'Unauthorized',
 message: '无效的令牌',
 });
 }
}

module.exports = {
 verifyMixinWebhook,
 verifyApiKey,
 verifyJWT,
};