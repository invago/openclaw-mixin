/**
 * Openclaw插件配置文件
 *参考飞书和Telegram插件配置
 */

module.exports = {
 //插件基本信息
 plugin: {
 name: 'mixin-messenger',
 displayName: 'Mixin Messenger',
 description: '将Openclaw AI助手接入Mixin Messenger平台',
 version: '1.0.0',
 author: 'Your Name',
 license: 'MIT',
 homepage: 'https://github.com/yourusername/openclaw-mixin',
 icon: 'https://mixin.one/assets/logo.png',
 category: 'messaging',
 tags: ['mixin', 'messenger', 'chatbot', 'ai'],
 },

 //依赖配置
 dependencies: {
 'node:express': '^4.18.0',
 'node:axios': '^1.6.0',
 'node:jsonwebtoken': '^9.0.0',
 'node:redis': '^4.6.0',
 'node:crypto': 'latest',
 'node:uuid': '^9.0.0',
 },

 //通道配置
 channel: {
 name: 'mixin',
 displayName: 'Mixin Messenger',
 description: 'Mixin加密聊天平台',
 type: 'webhook',
 supportedMessageTypes: ['text', 'image', 'file', 'sticker', 'contact', 'location'],
 webhookPath: '/webhook/mixin',
 authentication: {
 type: 'jwt',
 privateKey: 'env:MIXIN_SESSION_PRIVATE_KEY',
 },
 },

 //配置选项
 options: [
 {
 key: 'MIXIN_APP_ID',
 type: 'string',
 label: 'App ID',
 description: 'Mixin应用的App ID',
 required: true,
 placeholder: '请输入您的Mixin App ID',
 },
 {
 key: 'MIXIN_SESSION_ID',
 type: 'string',
 label: 'Session ID',
 description: 'Mixin应用的Session ID',
 required: true,
 placeholder: '请输入您的Mixin Session ID',
 },
 {
 key: 'MIXIN_SERVER_PUBLIC_KEY',
 type: 'string',
 label: 'Server Public Key',
 description: 'Mixin服务器的公钥（可选）',
 required: false,
 placeholder: '请输入Mixin服务器公钥',
 },
 {
 key: 'MIXIN_SESSION_PRIVATE_KEY',
 type: 'string',
 label: 'Session Private Key',
 description: '会话私钥（Base64编码）',
 required: true,
 placeholder: '请输入Base64编码的会话私钥',
 secure: true,
 },
 {
 key: 'WEBHOOK_SECRET',
 type: 'string',
 label: 'Webhook Secret',
 description: '用于验证Webhook请求的密钥',
 required: true,
 default: () => require('crypto').randomBytes(32).toString('hex'),
 secure: true,
 },
 {
 key: 'REDIS_HOST',
 type: 'string',
 label: 'Redis Host',
 description: 'Redis服务器地址',
 required: false,
 default: 'localhost',
 },
 {
 key: 'REDIS_PORT',
 type: 'number',
 label: 'Redis Port',
 description: 'Redis服务器端口',
 required: false,
 default:6379,
 },
 ],

 //事件处理
 events: {
 onMessage: 'handleMessage',
 onWebhook: 'handleWebhook',
 onStart: 'initialize',
 onStop: 'cleanup',
 },

 //技能配置
 skills: [
 {
 id: 'mixin-weather',
 name: 'Mixin天气查询',
 description: '通过Mixin查询天气信息',
 triggers: ['天气', 'weather'],
 },
 {
 id: 'mixin-calculator',
 name: 'Mixin计算器',
 description: '通过Mixin进行数学计算',
 triggers: ['计算', 'calculate'],
 },
 ],

 //初始化函数
 initialize() {
 console.log('Mixin插件初始化...');
 //这里可以添加初始化逻辑
 },

 //清理函数
 cleanup() {
 console.log('Mixin插件清理...');
 //这里可以添加清理逻辑
 },
};