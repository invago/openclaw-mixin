/**
 * Mixin通道适配器（简化版）
 *使用WebSocket长连接接收Mixin消息
 */

const OpenclawGatewayClient = require('./gateway-client');
const MixinWebSocketClient = require('./mixin-websocket-client');
const MixinAPIClient = require('./services/MixinAPIClient');
const { getAuthManager } = require('./auth-manager');
const { CommandHandler } = require('./command-handler');
const { createLogger } = require('./logger');
const { MessageFilter } = require('./message-filter');

class MixinChannel {
 constructor(options = {}) {
 this.name = 'mixin';
 this.displayName = 'Mixin Messenger';

 //配置
 this.gatewayUrl = options.gatewayUrl || process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789';

 //组件
 this.gatewayClient = null;
 this.mixinClient = null;
 this.authManager = getAuthManager();
 this.commandHandler = new CommandHandler({ authManager: this.authManager });
 this.logger = createLogger('mixin-channel');
 this.messageFilter = new MessageFilter();

 //状态
 this.isRunning = false;
 }

 /**
 *启动通道
 */
 async start() {
 console.log(`[${this.name}]启动Mixin通道...`);

 try {
 //1.连接到Openclaw Gateway
 await this.connectToOpenclaw();

 //2.连接到Mixin Blaze服务器
 await this.connectToMixin();

 this.isRunning = true;
 console.log(`[${this.name}]通道启动完成！`);
 console.log(`[${this.name}]现在可以通过Mixin与AI对话了`);

 return true;

 } catch (error) {
 console.error(`[${this.name}]启动失败:`, error);
 throw error;
 }
 }

 /**
 *连接到Openclaw Gateway
 */
 async connectToOpenclaw() {
 console.log(`[${this.name}]连接到Openclaw Gateway...`);

 this.gatewayClient = new OpenclawGatewayClient({
 gatewayUrl: this.gatewayUrl,
 channelId: this.name,
 apiKey: process.env.OPENCLAW_API_KEY || '',
 });

 //监听Agent回复
 this.gatewayClient.on('agentResponse', this.handleAgentResponse.bind(this));

 //监听连接状态
 this.gatewayClient.on('connected', () => {
 console.log(`[${this.name}]已连接到Openclaw Gateway`);
 });

 this.gatewayClient.on('disconnected', () => {
 console.log(`[${this.name}]与Openclaw Gateway断开连接`);
 });

 await this.gatewayClient.connect();
 }

 /**
 *连接到Mixin Blaze服务器
 */
 async connectToMixin() {
 console.log(`[${this.name}]连接到Mixin Blaze服务器...`);

 this.mixinClient = new MixinWebSocketClient({
 appId: process.env.MIXIN_APP_ID,
 sessionId: process.env.MIXIN_SESSION_ID,
 privateKey: process.env.MIXIN_SESSION_PRIVATE_KEY,
 });

 //监听Mixin消息
 this.mixinClient.on('message', this.handleMixinMessage.bind(this));

 //监听连接状态
 this.mixinClient.on('connected', () => {
 console.log(`[${this.name}]已连接到Mixin服务器`);
 });

 this.mixinClient.on('disconnected', () => {
 console.log(`[${this.name}]与Mixin服务器断开连接`);
 });

 this.mixinClient.on('error', (error) => {
 console.error(`[${this.name}] Mixin连接错误:`, error.message);
 });

 await this.mixinClient.connect();
 }

 /**
 *处理Mixin消息
 */
 async handleMixinMessage(message) {
 try {
 const userId = message.user_id;
 const conversationId = message.conversation_id;
 const messageId = message.message_id;

 this.logger.info(`收到Mixin消息`, {
 userId,
 conversationId,
 category: message.category,
 });

 //忽略机器人自己的消息
 if (userId === process.env.MIXIN_APP_ID) {
 return;
 }

 //确认消息已读（可选）
 // this.mixinClient.acknowledgeMessageReceipt(messageId);

 //解析消息内容
 let textContent = '';
 let messageType = 'text';

 switch (message.category) {
 case 'PLAIN_TEXT':
 textContent = Buffer.from(message.data, 'base64').toString('utf-8');
 messageType = 'text';
 break;

 case 'PLAIN_IMAGE':
 textContent = '[图片]';
 messageType = 'image';
 break;

 default:
 textContent = `[${message.category}]`;
 messageType = 'unknown';
 }

 //检查是否应该处理（低打扰模式）
 const shouldProcess = this.messageFilter.shouldProcess({
 isGroup: message.conversation_id.startsWith('GROUP_'),
 isMentioned: message.mentions?.includes(process.env.MIXIN_APP_ID),
 text: textContent,
 messageType,
 });

 if (!shouldProcess) {
 this.logger.debug('消息被过滤器拦截', { userId, text: textContent });
 return;
 }

 //清理文本（移除@提及等）
 const cleanText = this.messageFilter.extractCleanText(textContent, process.env.MIXIN_APP_ID);

 //检查是否是命令
 const commandResult = await this.commandHandler.handleMessage({
 text: cleanText,
 userId,
 conversationId,
 }, {});

 if (commandResult) {
 //是命令，直接回复
 await this.sendReplyToMixin(conversationId, commandResult);
 return;
 }

 //不是命令，转发给Openclaw处理
 await this.forwardToOpenclaw({
 messageId,
 userId,
 conversationId,
 type: messageType,
 text: cleanText,
 rawMessage: message,
 });

 } catch (error) {
 this.logger.error('处理Mixin消息失败', error);
 }
 }

 /**
 *转发消息到Openclaw
 */
 async forwardToOpenclaw(mixinMessage) {
 try {
 //检查用户是否已认证
 if (!this.authManager.isAuthenticated(mixinMessage.userId)) {
 //未认证，提示用户认证
 await this.sendReplyToMixin(mixinMessage.conversationId, {
 type: 'text',
 content: `欢迎使用Openclaw AI助手！\\n\\n请先发送 /start进行认证。`,
 });
 return;
 }

 //转换消息格式
 const openclawMessage = {
 messageId: mixinMessage.messageId,
 userId: mixinMessage.userId,
 conversationId: mixinMessage.conversationId,
 type: mixinMessage.type,
 text: mixinMessage.text,
 attachments: [],
 metadata: {
 source: 'mixin',
 category: mixinMessage.rawMessage.category,
 },
 timestamp: new Date().toISOString(),
 };

 this.logger.info('转发消息到Openclaw', { messageId: openclawMessage.messageId });

 //发送到Openclaw Gateway
 const response = await this.gatewayClient.sendUserMessage(openclawMessage);

 this.logger.info('收到Openclaw回复', { messageId: response.messageId });

 //发送回复到Mixin
 await this.sendReplyToMixin(mixinMessage.conversationId, response);

 } catch (error) {
 this.logger.error('转发消息失败', error);

 //发送错误提示
 await this.sendReplyToMixin(mixinMessage.conversationId, {
 type: 'text',
 content: '抱歉，服务暂时不可用，请稍后重试。',
 });
 }
 }

 /**
 *处理Openclaw Agent的回复
 */
 async handleAgentResponse(response) {
 try {
 const { conversationId, content } = response;

 this.logger.info('处理Agent回复', { conversationId });

 //发送回复到Mixin
 await this.sendReplyToMixin(conversationId, content);

 } catch (error) {
 this.logger.error('处理Agent回复失败', error);
 }
 }

 /**
 *发送回复到Mixin
 */
 async sendReplyToMixin(conversationId, content) {
 try {
 let messageData;

 switch (content.type) {
 case 'text':
 messageData = {
 conversation_id: conversationId,
 category: 'PLAIN_TEXT',
 data: Buffer.from(content.content).toString('base64'),
 };
 break;

 case 'image':
 messageData = {
 conversation_id: conversationId,
 category: 'PLAIN_IMAGE',
 data: Buffer.from(JSON.stringify({
 url: content.url,
 thumbnail: content.thumbnail || content.url,
 })).toString('base64'),
 };
 break;

 default:
 messageData = {
 conversation_id: conversationId,
 category: 'PLAIN_TEXT',
 data: Buffer.from(String(content.content || content)).toString('base64'),
 };
 }

 //这里需要调用Mixin API发送消息
 //由于Mixin WebSocket客户端主要用于接收，发送可能需要HTTP API
 //简化起见，先记录日志
 this.logger.info('发送回复到Mixin', { conversationId, type: content.type });

 //TODO:实现Mixin HTTP API发送消息
 // await MixinAPIClient.sendMessage(conversationId, messageData);

 } catch (error) {
 this.logger.error('发送回复失败', error);
 }
 }

 /**
 *停止通道
 */
 async stop() {
 console.log(`[${this.name}]停止Mixin通道...`);

 this.isRunning = false;

 if (this.mixinClient) {
 this.mixinClient.disconnect();
 }

 if (this.gatewayClient) {
 this.gatewayClient.disconnect();
 }

 console.log(`[${this.name}]通道已停止`);
 }

 /**
 *获取状态
 */
 getStatus() {
 return {
 isRunning: this.isRunning,
 mixinConnected: this.mixinClient?.isConnected || false,
 openclawConnected: this.gatewayClient?.isConnected || false,
 };
 }
}

module.exports = MixinChannelSimple;