const mixinClient = require('./MixinAPIClient');
const OpenclawClient = require('./OpenclawClient');
const SessionManager = require('./SessionManager');
const Message = require('../models/Message');
const { defaultLogger } = require('../utils/logger');

class MessageProcessor {
 constructor() {
 this.logger = defaultLogger;

 //消息类型处理器映射
 this.messageHandlers = {
 'PLAIN_TEXT': this.handleTextMessage.bind(this),
 'PLAIN_IMAGE': this.handleImageMessage.bind(this),
 'PLAIN_DATA': this.handleFileMessage.bind(this),
 'PLAIN_STICKER': this.handleStickerMessage.bind(this),
 'PLAIN_CONTACT': this.handleContactMessage.bind(this),
 'PLAIN_LOCATION': this.handleLocationMessage.bind(this),
 };
 }

 /**
 *处理消息
 */
 async processMessage(message, session) {
 try {
 const handler = this.messageHandlers[message.category] || this.handleUnknownMessage.bind(this);
 const response = await handler(message, session);

 if (response) {
 //发送回复
 await this.sendResponse(message.conversation_id, response);

 //更新会话上下文
 await SessionManager.updateSessionContext(
 message.user_id,
 message.conversation_id,
 message,
 response
 );

 return response;
 }

 return null;
 } catch (error) {
 console.error('处理消息失败:', error);
 //发送错误回复
 await this.sendErrorMessage(message.conversation_id, error.message);
 throw error;
 }
 }

 /**
 *处理文本消息
 */
 async handleTextMessage(message, session) {
 const text = message.getTextContent();
 console.log('处理文本消息:', text);

 if (!text || text.trim() === '') {
 return null;
 }

 //检查是否为命令
 if (text.startsWith('/')) {
 return this.handleCommand(text, message, session);
 }

 //调用Openclaw API处理消息
 const openclawResponse = await this.callOpenclawAPI(text, session, message);

 return {
 type: 'text',
 content: openclawResponse,
 };
 }

 /**
 *处理图片消息
 */
 async handleImageMessage(message, session) {
 const imageInfo = message.getImageInfo();
 console.log('处理图片消息:', imageInfo);

 //TODO:实现图片分析逻辑
 //暂时返回文本回复
 return {
 type: 'text',
 content: '已收到图片，Openclaw暂不支持图片分析功能。',
 };
 }

 /**
 *处理文件消息
 */
 async handleFileMessage(message, session) {
 console.log('处理文件消息');

 //TODO:实现文件处理逻辑
 return {
 type: 'text',
 content: '已收到文件，Openclaw暂不支持文件处理功能。',
 };
 }

 /**
 *处理贴纸消息
 */
 async handleStickerMessage(message, session) {
 console.log('处理贴纸消息');

 return {
 type: 'text',
 content: '😊收到贴纸！',
 };
 }

 /**
 *处理联系人消息
 */
 async handleContactMessage(message, session) {
 console.log('处理联系人消息');

 return {
 type: 'text',
 content: '已收到联系人信息。',
 };
 }

 /**
 *处理位置消息
 */
 async handleLocationMessage(message, session) {
 console.log('处理位置消息');

 return {
 type: 'text',
 content: '已收到位置信息。',
 };
 }

 /**
 *处理未知消息类型
 */
 async handleUnknownMessage(message, session) {
 console.log('处理未知消息类型:', message.category);

 return {
 type: 'text',
 content: `暂不支持的消息类型: ${message.category}`,
 };
 }

 /**
 *处理命令
 */
 async handleCommand(command, message, session) {
 const [cmd, ...args] = command.slice(1).split(' ');
 const argStr = args.join(' ');

 console.log('处理命令:', { cmd, args: argStr });

 switch (cmd.toLowerCase()) {
 case 'help':
 case '帮助':
 return {
 type: 'text',
 content: this.getHelpMessage(),
 };

 case 'clear':
 case '清空':
 await SessionManager.clearSession(message.user_id, message.conversation_id);
 return {
 type: 'text',
 content: '会话已清空，可以开始新的对话。',
 };

 case 'status':
 case '状态':
 const userSessions = await SessionManager.getUserSessions(message.user_id);
 return {
 type: 'text',
 content: `当前状态:\n-会话数: ${userSessions.length}\n-消息数: ${session.messageCount ||0}`,
 };

 case 'settings':
 case '设置':
 if (argStr) {
 //TODO:解析设置参数
 return {
 type: 'text',
 content: '设置功能开发中...',
 };
 }
 return {
 type: 'text',
 content: '可用设置:\n- /settings language zh-CN/en\n- /settings notification on/off',
 };

 default:
 return {
 type: 'text',
 content: `未知命令: ${cmd}\n输入 /help查看可用命令`,
 };
 }
 }

 /**
 *调用Openclaw API
 */
 async callOpenclawAPI(text, session, message) {
 try {
 this.logger.debug('调用Openclaw API', {
 textLength: text.length,
 sessionId: session.id,
 messageId: message.id,
 });

 //构建Openclaw消息数据
 const openclawMessage = {
 type: 'text',
 content: text,
 userId: message.user_id,
 conversationId: message.conversation_id,
 id: message.id,
 };

 //获取会话上下文
 const context = await SessionManager.getSessionContext(
 message.user_id,
 message.conversation_id,
10 //最近10条消息作为上下文
 );

 //调用Openclaw客户端
 const response = await OpenclawClient.sendMessage(openclawMessage, context);

 this.logger.debug('Openclaw API响应', {
 responseType: response.type,
 contentLength: response.content?.length ||0,
 });

 return response.content || '收到消息';
 } catch (error) {
 this.logger.error('调用Openclaw API失败', error);
 return '抱歉，处理消息时出现错误，请稍后重试。';
 }
 }

 /**
 *发送回复
 */
 async sendResponse(conversationId, response) {
 try {
 const mixinMessage = Message.toMixinFormat(response, conversationId);
 await mixinClient.sendMessage(conversationId, mixinMessage);
 console.log('回复发送成功:', { conversationId, type: response.type });
 } catch (error) {
 console.error('发送回复失败:', error);
 throw error;
 }
 }

 /**
 *发送错误消息
 */
 async sendErrorMessage(conversationId, errorMessage) {
 try {
 await mixinClient.sendTextMessage(
 conversationId,
 `抱歉，处理消息时出现错误: ${errorMessage}\n请稍后重试。`
 );
 } catch (error) {
 console.error('发送错误消息失败:', error);
 }
 }

 /**
 *获取帮助消息
 */
 getHelpMessage() {
 return `🤖 Mixin-Openclaw助手帮助

**基本功能:**
-发送文本消息与AI对话
-支持图片、文件等多媒体消息

**可用命令:**
- /help -显示此帮助信息
- /clear -清空当前会话
- /status -查看当前状态
- /settings -管理设置

**注意事项:**
-部分功能正在开发中
-如有问题请反馈

版本:1.0.0`;
 }
}

module.exports = MessageProcessor;