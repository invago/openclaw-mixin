const { defaultLogger } = require('./logger');

class MessageValidator {
 /**
 *验证Mixin Webhook消息格式
 */
 static validateMixinWebhook(data) {
 const requiredFields = ['action', 'data'];

 for (const field of requiredFields) {
 if (!data[field]) {
 throw new Error(`缺少必要字段: ${field}`);
 }
 }

 if (data.action !== 'CREATE_MESSAGE') {
 throw new Error(`不支持的动作类型: ${data.action}`);
 }

 //验证消息数据
 this.validateMessageData(data.data);

 return true;
 }

 /**
 *验证消息数据
 */
 static validateMessageData(messageData) {
 const requiredFields = [
 'message_id',
 'conversation_id',
 'user_id',
 'category',
 'data',
 ];

 for (const field of requiredFields) {
 if (!messageData[field]) {
 throw new Error(`消息数据缺少字段: ${field}`);
 }
 }

 //验证消息类型
 const supportedCategories = [
 'PLAIN_TEXT',
 'PLAIN_IMAGE',
 'PLAIN_DATA',
 'PLAIN_STICKER',
 'PLAIN_CONTACT',
 'PLAIN_LOCATION',
 ];

 if (!supportedCategories.includes(messageData.category)) {
 defaultLogger.warn(`不支持的的消息类型: ${messageData.category}`, {
 messageId: messageData.message_id,
 });
 }

 //验证数据格式
 if (messageData.category === 'PLAIN_TEXT') {
 this.validateTextData(messageData.data);
 } else if (messageData.category === 'PLAIN_IMAGE') {
 this.validateImageData(messageData.data);
 }

 return true;
 }

 /**
 *验证文本数据
 */
 static validateTextData(data) {
 try {
 //尝试Base64解码
 const decoded = Buffer.from(data, 'base64').toString('utf-8');
 if (!decoded.trim()) {
 throw new Error('文本内容为空');
 }
 return true;
 } catch (error) {
 throw new Error(`无效的文本数据格式: ${error.message}`);
 }
 }

 /**
 *验证图片数据
 */
 static validateImageData(data) {
 try {
 const decoded = Buffer.from(data, 'base64').toString('utf-8');
 const imageInfo = JSON.parse(decoded);

 if (!imageInfo.url) {
 throw new Error('图片URL缺失');
 }

 //验证URL格式
 try {
 new URL(imageInfo.url);
 } catch (error) {
 throw new Error(`无效的图片URL: ${imageInfo.url}`);
 }

 return true;
 } catch (error) {
 if (error instanceof SyntaxError) {
 throw new Error('无效的JSON格式图片数据');
 }
 throw error;
 }
 }

 /**
 *验证用户ID格式
 */
 static validateUserId(userId) {
 //Mixin用户ID通常是UUID格式
 const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

 if (!uuidRegex.test(userId)) {
 throw new Error(`无效的用户ID格式: ${userId}`);
 }

 return true;
 }

 /**
 *验证会话ID格式
 */
 static validateConversationId(conversationId) {
 //会话ID也是UUID格式
 const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

 if (!uuidRegex.test(conversationId)) {
 throw new Error(`无效的会话ID格式: ${conversationId}`);
 }

 return true;
 }

 /**
 *验证消息ID格式
 */
 static validateMessageId(messageId) {
 const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

 if (!uuidRegex.test(messageId)) {
 throw new Error(`无效的消息ID格式: ${messageId}`);
 }

 return true;
 }

 /**
 *验证Openclaw响应格式
 */
 static validateOpenclawResponse(response) {
 if (!response || typeof response !== 'object') {
 throw new Error('响应必须是对象');
 }

 const { type, content } = response;

 if (!type || typeof type !== 'string') {
 throw new Error('响应类型缺失或无效');
 }

 if (!content && content !== '') {
 throw new Error('响应内容缺失');
 }

 //验证特定类型的额外字段
 if (type === 'image') {
 if (!response.content || typeof response.content !== 'string') {
 throw new Error('图片响应必须包含content字段');
 }
 }

 return true;
 }

 /**
 *清理和规范化消息数据
 */
 static sanitizeMessageData(messageData) {
 const sanitized = { ...messageData };

 //移除可能的敏感信息
 delete sanitized.private_key;
 delete sanitized.secret;
 delete sanitized.password;

 //规范化字符串字段
 if (sanitized.data && typeof sanitized.data === 'string') {
 sanitized.data = sanitized.data.trim();
 }

 //限制文本长度
 if (sanitized.category === 'PLAIN_TEXT') {
 try {
 const decoded = Buffer.from(sanitized.data, 'base64').toString('utf-8');
 if (decoded.length >1000) {
 const truncated = decoded.substring(0,1000) + '...';
 sanitized.data = Buffer.from(truncated).toString('base64');
 }
 } catch (error) {
 //如果解码失败，保持原样
 }
 }

 return sanitized;
 }
}

module.exports = MessageValidator;