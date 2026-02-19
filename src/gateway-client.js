/**
 * Openclaw Gateway WebSocket客户端
 *负责与Openclaw核心进行双向通信
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class OpenclawGatewayClient extends EventEmitter {
 constructor(options = {}) {
 super();

 this.gatewayUrl = options.gatewayUrl || 'ws://127.0.0.1:18789';
 this.channelId = options.channelId || 'mixin';
 this.apiKey = options.apiKey || '';

 this.ws = null;
 this.isConnected = false;
 this.reconnectInterval =5000;
 this.reconnectAttempts =0;
 this.maxReconnectAttempts =10;

 //会话映射表：用于跟踪消息和回复的对应关系
 this.pendingMessages = new Map();
 }

 /**
 *连接到Openclaw Gateway
 */
 async connect() {
 return new Promise((resolve, reject) => {
 try {
 console.log(`[Gateway]连接到 ${this.gatewayUrl}...`);

 this.ws = new WebSocket(this.gatewayUrl, {
 headers: {
 'X-Channel-ID': this.channelId,
 'X-API-Key': this.apiKey,
 },
 });

 this.ws.on('open', () => {
 console.log('[Gateway] WebSocket连接成功');
 this.isConnected = true;
 this.reconnectAttempts =0;

 //发送注册消息
 this.registerChannel();

 this.emit('connected');
 resolve();
 });

 this.ws.on('message', (data) => {
 this.handleMessage(data);
 });

 this.ws.on('error', (error) => {
 console.error('[Gateway] WebSocket错误:', error);
 this.emit('error', error);
 reject(error);
 });

 this.ws.on('close', () => {
 console.log('[Gateway] WebSocket连接关闭');
 this.isConnected = false;
 this.emit('disconnected');

 //自动重连
 this.attemptReconnect();
 });

 } catch (error) {
 console.error('[Gateway]连接失败:', error);
 reject(error);
 }
 });
 }

 /**
 *注册通道
 */
 registerChannel() {
 const registration = {
 type: 'channel.register',
 payload: {
 channelId: this.channelId,
 channelType: 'mixin',
 capabilities: ['text', 'image', 'file'],
 timestamp: new Date().toISOString(),
 },
 };

 this.send(registration);
 console.log('[Gateway]通道注册消息已发送');
 }

 /**
 *发送消息到Gateway
 */
 send(message) {
 if (!this.isConnected || !this.ws) {
 console.error('[Gateway]未连接到Gateway');
 return false;
 }

 try {
 const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
 this.ws.send(messageStr);
 return true;
 } catch (error) {
 console.error('[Gateway]发送消息失败:', error);
 return false;
 }
 }

 /**
 *处理收到的消息
 */
 handleMessage(data) {
 try {
 const message = JSON.parse(data.toString());
 console.log('[Gateway]收到消息:', message.type);

 switch (message.type) {
 case 'agent.response':
 // Openclaw Agent的回复
 this.handleAgentResponse(message.payload);
 break;

 case 'channel.ack':
 //通道确认
 console.log('[Gateway]通道注册确认:', message.payload);
 break;

 case 'ping':
 //心跳检测
 this.send({ type: 'pong', timestamp: Date.now() });
 break;

 case 'error':
 console.error('[Gateway]错误:', message.payload);
 this.emit('gatewayError', message.payload);
 break;

 default:
 console.log('[Gateway]未知消息类型:', message.type);
 this.emit('unknownMessage', message);
 }

 } catch (error) {
 console.error('[Gateway]解析消息失败:', error);
 }
 }

 /**
 *处理Agent回复
 */
 handleAgentResponse(payload) {
 const { messageId, content, conversationId, userId } = payload;

 console.log('[Gateway]收到Agent回复:', { messageId, conversationId });

 //触发回复事件
 this.emit('agentResponse', {
 messageId,
 conversationId,
 userId,
 content,
 originalPayload: payload,
 });

 //检查是否有等待的Promise
 if (this.pendingMessages.has(messageId)) {
 const { resolve } = this.pendingMessages.get(messageId);
 resolve(payload);
 this.pendingMessages.delete(messageId);
 }
 }

 /**
 *发送用户消息到Openclaw
 */
 async sendUserMessage(userMessage) {
 return new Promise((resolve, reject) => {
 const messageId = uuidv4();
 const timeout =60000; //60秒超时

 const message = {
 type: 'channel.message',
 payload: {
 messageId,
 channelId: this.channelId,
 userId: userMessage.userId,
 conversationId: userMessage.conversationId,
 content: {
 type: userMessage.type || 'text',
 text: userMessage.text,
 attachments: userMessage.attachments || [],
 metadata: userMessage.metadata || {},
 },
 timestamp: new Date().toISOString(),
 },
 };

 //存储Promise以便异步回复
 this.pendingMessages.set(messageId, { resolve, reject });

 //发送消息
 if (!this.send(message)) {
 this.pendingMessages.delete(messageId);
 reject(new Error('Failed to send message to Gateway'));
 return;
 }

 console.log('[Gateway]用户消息已发送:', messageId);

 //设置超时
 setTimeout(() => {
 if (this.pendingMessages.has(messageId)) {
 this.pendingMessages.delete(messageId);
 reject(new Error('Response timeout'));
 }
 }, timeout);
 });
 }

 /**
 *尝试重连
 */
 attemptReconnect() {
 if (this.reconnectAttempts >= this.maxReconnectAttempts) {
 console.error('[Gateway]达到最大重连次数，放弃重连');
 this.emit('reconnectFailed');
 return;
 }

 this.reconnectAttempts++;
 console.log(`[Gateway] ${this.reconnectInterval /1000}秒后尝试第${this.reconnectAttempts}次重连...`);

 setTimeout(() => {
 this.connect().catch(() => {
 //重连失败会继续触发close事件，然后再次重试
 });
 }, this.reconnectInterval);
 }

 /**
 *断开连接
 */
 disconnect() {
 if (this.ws) {
 this.ws.close();
 this.ws = null;
 }
 this.isConnected = false;

 //清理所有等待的消息
 for (const [messageId, { reject }] of this.pendingMessages) {
 reject(new Error('Connection closed'));
 }
 this.pendingMessages.clear();

 console.log('[Gateway]已断开连接');
 }

 /**
 *检查连接状态
 */
 getStatus() {
 return {
 isConnected: this.isConnected,
 channelId: this.channelId,
 gatewayUrl: this.gatewayUrl,
 pendingMessages: this.pendingMessages.size,
 reconnectAttempts: this.reconnectAttempts,
 };
 }
}

module.exports = OpenclawGatewayClient;