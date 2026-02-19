#!/usr/bin/env node

/**
 * Mixin-Openclaw适配器初始化脚本
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

const rl = readline.createInterface({
 input: process.stdin,
 output: process.stdout,
});

console.log(`
🎉欢迎使用Mixin-Openclaw适配器初始化脚本
========================================

本脚本将帮助您配置项目环境。
`);

const questions = [
 {
 name: 'mixinAppId',
 question: '1.请输入Mixin应用的App ID:',
 validate: (input) => input && input.length >0,
 },
 {
 name: 'mixinSessionId',
 question: '2.请输入Mixin应用的Session ID:',
 validate: (input) => input && input.length >0,
 },
 {
 name: 'mixinServerPublicKey',
 question: '3.请输入Mixin应用的Server Public Key（可选，按Enter跳过）:',
 validate: () => true,
 },
 {
 name: 'mixinSessionPrivateKey',
 question: '4.请输入Mixin应用的Session Private Key（Base64编码，可选）:',
 validate: () => true,
 },
 {
 name: 'port',
 question: '5.请输入服务端口号（默认3000）:',
 default: '3000',
 validate: (input) => {
 const port = parseInt(input);
 return !isNaN(port) && port >0 && port<65536;
 },
 },
 {
 name: 'redisHost',
 question: '6.请输入Redis主机地址（默认localhost）:',
 default: 'localhost',
 validate: (input) => input && input.length >0,
 },
 {
 name: 'redisPort',
 question: '7.请输入Redis端口号（默认6379）:',
 default: '6379',
 validate: (input) => {
 const port = parseInt(input);
 return !isNaN(port) && port >0 && port<65536;
 },
 },
 {
 name: 'redisPassword',
 question: '8.请输入Redis密码（可选，按Enter跳过）:',
 validate: () => true,
 },
 {
 name: 'webhookSecret',
 question: '9.请输入Webhook签名密钥（用于验证Mixin请求）:',
 default: crypto.randomBytes(32).toString('hex'),
 validate: (input) => input && input.length >=32,
 },
 {
 name: 'jwtSecret',
 question: '10.请输入JWT密钥（用于API认证）:',
 default: crypto.randomBytes(64).toString('hex'),
 validate: (input) => input && input.length >=32,
 },
];

async function askQuestion(q, index) {
 return new Promise((resolve) => {
 const ask = () => {
 rl.question(`\n${q.question} `, (answer) => {
 const value = answer.trim() || q.default || '';

 if (!q.validate(value)) {
 console.log('❌输入无效，请重新输入');
 ask();
 } else {
 resolve(value);
 }
 });
 };

 ask();
 });
}

async function runSetup() {
 try {
 const answers = {};

 console.log('\n📝开始配置...\n');

 for (let i =0; i< questions.length; i++) {
 const q = questions[i];
 const answer = await askQuestion(q, i);
 answers[q.name] = answer;
 }

 //生成.env文件内容
 const envContent = generateEnvContent(answers);

 //写入.env文件
 const envPath = path.join(__dirname, '..', '.env');
 fs.writeFileSync(envPath, envContent);

 console.log('\n✅配置完成！');
 console.log('========================================');
 console.log('📁配置文件已生成: .env');
 console.log('🔑Webhook密钥:', answers.webhookSecret.substring(0,16) + '...');
 console.log('🔐JWT密钥:', answers.jwtSecret.substring(0,16) + '...');
 console.log('\n🚀下一步:');
 console.log('1.安装依赖: npm install');
 console.log('2.启动Redis服务');
 console.log('3.运行服务: npm run dev');
 console.log('4.在Mixin开发者平台配置Webhook URL');
 console.log('========================================\n');

 //显示Webhook配置示例
 if (answers.mixinClientId) {
 console.log('📋Mixin Webhook配置示例:');
 console.log(`URL: http://your-server.com:${answers.port}/webhook/mixin`);
 console.log(`或使用ngrok: https://xxxx-xx-xx-xx-xx.ngrok.io/webhook/mixin`);
 }

 } catch (error) {
 console.error('❌初始化失败:', error.message);
 } finally {
 rl.close();
 }
}

function generateEnvContent(answers) {
 return `# Mixin应用配置
MIXIN_APP_ID=${answers.mixinAppId}
MIXIN_SESSION_ID=${answers.mixinSessionId}
${answers.mixinServerPublicKey ? `MIXIN_SERVER_PUBLIC_KEY=${answers.mixinServerPublicKey}` : '# MIXIN_SERVER_PUBLIC_KEY='}
${answers.mixinSessionPrivateKey ? `MIXIN_SESSION_PRIVATE_KEY=${answers.mixinSessionPrivateKey}` : '# MIXIN_SESSION_PRIVATE_KEY='}

#服务器配置
PORT=${answers.port}
NODE_ENV=development
WEBHOOK_SECRET=${answers.webhookSecret}

# Redis配置
REDIS_HOST=${answers.redisHost}
REDIS_PORT=${answers.redisPort}
${answers.redisPassword ? `REDIS_PASSWORD=${answers.redisPassword}` : '# REDIS_PASSWORD='}

# Openclaw配置（待定）
# OPENCLAW_API_URL=https://api.openclaw.example.com
# OPENCLAW_API_KEY=your_openclaw_api_key

#安全配置
JWT_SECRET=${answers.jwtSecret}

#管理API密钥（可选）
# ADMIN_API_KEY=your_admin_api_key_here

#日志配置
LOG_LEVEL=debug
LOG_TO_FILE=false

#性能配置
MESSAGE_PROCESSING_TIMEOUT=10000
MAX_RETRY_COUNT=3
`;
}

//运行脚本
if (require.main === module) {
 runSetup();
}

module.exports = {
 runSetup,
 generateEnvContent,
};