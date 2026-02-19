/**
 *模拟Mixin Webhook请求的测试脚本
 */

const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

//配置
const CONFIG = {
 webhookUrl: 'http://localhost:3000/webhook/mixin',
 webhookSecret: 'test-secret-123', //与.env中的WEBHOOK_SECRET一致
 clientId: 'test-client-id',
};

/**
 *生成Webhook签名
 */
function generateSignature(timestamp, body) {
 const message = `${timestamp}${JSON.stringify(body)}`;
 return crypto
 .createHmac('sha256', CONFIG.webhookSecret)
 .update(message)
 .digest('hex');
}

/**
 *创建模拟文本消息
 */
function createTextMessage(text, userId = null, conversationId = null) {
 const messageId = uuidv4();
 const userIdToUse = userId || uuidv4();
 const conversationIdToUse = conversationId || uuidv4();

 return {
 action: 'CREATE_MESSAGE',
 data: {
 message_id: messageId,
 conversation_id: conversationIdToUse,
 user_id: userIdToUse,
 category: 'PLAIN_TEXT',
 data: Buffer.from(text).toString('base64'),
 status: 'SENT',
 created_at: new Date().toISOString(),
 },
 };
}

/**
 *创建模拟图片消息
 */
function createImageMessage(imageUrl, thumbnailUrl = null) {
 const messageId = uuidv4();
 const userId = uuidv4();
 const conversationId = uuidv4();

 const imageData = {
 url: imageUrl,
 thumbnail: thumbnailUrl || imageUrl,
 };

 return {
 action: 'CREATE_MESSAGE',
 data: {
 message_id: messageId,
 conversation_id: conversationId,
 user_id: userId,
 category: 'PLAIN_IMAGE',
 data: Buffer.from(JSON.stringify(imageData)).toString('base64'),
 status: 'SENT',
 created_at: new Date().toISOString(),
 },
 };
}

/**
 *发送Webhook请求
 */
async function sendWebhook(payload) {
 const timestamp = Date.now().toString();
 const signature = generateSignature(timestamp, payload);

 try {
 const response = await axios.post(CONFIG.webhookUrl, payload, {
 headers: {
 'Content-Type': 'application/json',
 'X-Mixin-Signature': signature,
 'X-Mixin-Timestamp': timestamp,
 },
 });

 console.log('✅ Webhook发送成功:');
 console.log('状态码:', response.status);
 console.log('响应:', response.data);
 console.log('消息ID:', payload.data.message_id);
 console.log('---');

 return response.data;
 } catch (error) {
 console.error('❌ Webhook发送失败:');
 if (error.response) {
 console.error('状态码:', error.response.status);
 console.error('响应:', error.response.data);
 } else {
 console.error('错误:', error.message);
 }
 console.log('---');
 throw error;
 }
}

/**
 *运行测试
 */
async function runTests() {
 console.log('🚀开始Mixin Webhook模拟测试\n');

 try {
 //测试1:简单文本消息
 console.log('测试1:简单文本消息');
 await sendWebhook(createTextMessage('你好，Openclaw！'));

 //测试2:长文本消息
 console.log('测试2:长文本消息');
 const longText = '这是一条很长的测试消息，用于测试消息处理系统是否能正确处理较长的文本内容。'.repeat(10);
 await sendWebhook(createTextMessage(longText));

 //测试3:相同用户的连续消息（测试会话管理）
 console.log('测试3:相同用户的连续消息');
 const userId = uuidv4();
 const conversationId = uuidv4();

 await sendWebhook(createTextMessage('第一条消息', userId, conversationId));
 await sendWebhook(createTextMessage('第二条消息', userId, conversationId));
 await sendWebhook(createTextMessage('第三条消息', userId, conversationId));

 //测试4:命令测试
 console.log('测试4:命令测试');
 await sendWebhook(createTextMessage('/help', userId, conversationId));
 await sendWebhook(createTextMessage('/status', userId, conversationId));
 await sendWebhook(createTextMessage('/clear', userId, conversationId));

 //测试5:图片消息
 console.log('测试5:图片消息');
 await sendWebhook(createImageMessage(
 'https://example.com/image.jpg',
 'https://example.com/thumbnail.jpg'
 ));

 //测试6:无效消息类型
 console.log('测试6:模拟无效消息类型（应被忽略）');
 const invalidMessage = createTextMessage('测试消息');
 invalidMessage.action = 'UPDATE_MESSAGE'; //无效动作
 await sendWebhook(invalidMessage);

 console.log('\n🎉所有测试完成！');

 } catch (error) {
 console.error('测试过程中出现错误:', error.message);
 }
}

/**
 *发送单个测试消息
 */
async function sendSingleMessage(text) {
 console.log(`发送消息: "${text}"`);
 const response = await sendWebhook(createTextMessage(text));
 return response;
}

//命令行接口
if (require.main === module) {
 const args = process.argv.slice(2);

 if (args.length ===0) {
 //运行完整测试套件
 runTests();
 } else if (args[0] === '--single' && args[1]) {
 //发送单个消息
 sendSingleMessage(args[1]);
 } else if (args[0] === '--image' && args[1]) {
 //发送图片消息
 sendWebhook(createImageMessage(args[1]));
 } else {
 console.log('使用方法:');
 console.log(' node mock-webhook.js #运行完整测试');
 console.log(' node mock-webhook.js --single "消息内容" #发送单个文本消息');
 console.log(' node mock-webhook.js --image "图片URL" #发送图片消息');
 }
}

module.exports = {
 createTextMessage,
 createImageMessage,
 sendWebhook,
 runTests,
 sendSingleMessage,
};