require('dotenv').config();

const config = {
 // Mixin配置
 mixin: {
 appId: process.env.MIXIN_APP_ID,
 sessionId: process.env.MIXIN_SESSION_ID,
 serverPublicKey: process.env.MIXIN_SERVER_PUBLIC_KEY,
 sessionPrivateKey: process.env.MIXIN_SESSION_PRIVATE_KEY,
 apiBaseUrl: 'https://api.mixin.one',
 oauthBaseUrl: 'https://mixin.one',
 },

 //服务器配置
 server: {
 port: process.env.PORT ||3000,
 nodeEnv: process.env.NODE_ENV || 'development',
 webhookUrl: process.env.WEBHOOK_URL,
 webhookSecret: process.env.WEBHOOK_SECRET,
 },

 // Redis配置
 redis: {
 host: process.env.REDIS_HOST || 'localhost',
 port: parseInt(process.env.REDIS_PORT) ||6379,
 password: process.env.REDIS_PASSWORD || '',
 sessionTtl:24 *60 *60, //24小时
 },

 // Openclaw配置
 openclaw: {
 apiUrl: process.env.OPENCLAW_API_URL,
 apiKey: process.env.OPENCLAW_API_KEY,
 },

 //安全配置
 security: {
 jwtSecret: process.env.JWT_SECRET,
 jwtExpiresIn: '7d',
 },

 //消息配置
 message: {
 maxRetryCount:3,
 retryDelay:1000,
 timeout:10000,
 },
};

//验证必要的配置
function validateConfig() {
 const required = [
 'MIXIN_APP_ID',
 'MIXIN_SESSION_ID',
 'MIXIN_SESSION_PRIVATE_KEY',
 ];

 const missing = required.filter(key => !process.env[key]);

 if (missing.length >0) {
 console.warn(`警告:以下环境变量未设置: ${missing.join(', ')}`);
 console.warn('请复制 .env.example为 .env并填写必要的配置');
 }

 return missing.length ===0;
}

module.exports = {
 config,
 validateConfig,
};