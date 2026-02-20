/**
 * Mixin WebSocket客户端
 *通过WebSocket长连接接收Mixin消息
 *参考Mixin Bot的WebSocket实现
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class MixinWebSocketClient extends EventEmitter {
 constructor(options = {}) {
 super();

 this.appId = options.appId || process.env.MIXIN_APP_ID;
 this.sessionId = options.sessionId || process.env.MIXIN_SESSION_ID;
 this.privateKey = options.privateKey || process.env.MIXIN_SESSION_PRIVATE_KEY;

 //Mixin Blaze服务器地址
 this.blazeHost = options.blazeHost || 'blaze.mixin.one';
 this.blazePort = options.blazePort ||443;

 this.ws = null;
 this.isConnected = false;
 this.reconnectAttempts =0;
 this.maxReconnectAttempts = options.maxReconnectAttempts ||10;
 this.reconnectInterval = options.reconnectInterval ||5000;

 //消息ID追踪
 this.pendingMessages = new Map();
 }

 /**
 *连接到Mixin Blaze服务器
 */
 async connect() {
 if (this.isConnected) {
 console.log('[MixinWS]已经连接');
 return;
 }

 try {
 console.log('[MixinWS]连接到Mixin Blaze服务器...');

 //生成认证token
 const authToken = await this.generateAuthToken();

 //构建WebSocket URL
 const wsUrl = `wss://${this.blazeHost}:${this.blazePort}`;

 //创建WebSocket连接
 this.ws = new WebSocket(wsUrl, {
 headers: {
 'Authorization': `Bearer ${authToken}`,
 'X-Request-Id': uuidv4(),
 },
 });

 //设置事件处理器
 this.setupEventHandlers();

 //等待连接成功
 await this.waitForConnection();

 console.log('[MixinWS]连接成功！');
 this.isConnected = true;
 this.reconnectAttempts =0;

 //发送LIST_PENDING_MESSAGES命令获取离线消息
 this.listPendingMessages();

 } catch (error) {
 console.error('[MixinWS]连接失败:', error.message);
 this.handleReconnect();
 }
 }

 /**
 *生成认证Token
 */
 async generateAuthToken() {
 const jwt = require('jsonwebtoken');

 const payload = {
 uid: this.appId,
 sid: this.sessionId,
 iat: Math.floor(Date.now() /1000),
 exp: Math.floor(Date.now() /1000) +3600, //1小时有效期
 jti: uuidv4(),
 sig: '', //如果需要可以添加签名
 };

 //使用私钥签名
 const token = jwt.sign(payload, Buffer.from(this.privateKey, 'base64'), {
 algorithm: 'RS512',
 });

 return token;
 }

 /**
 *设置WebSocket事件处理器
 */
 setupEventHandlers() {
 this.ws.on('open', () => {
 console.log('[MixinWS]WebSocket连接已打开');
 this.emit('connected');
 });

 this.ws.on('message', (data) => {
 this.handleMessage(data);
 });

 this.ws.on('error', (error) => {
 console.error('[MixinWS]WebSocket错误:', error.message);
 this.emit('error', error);
 });

 this.ws.on('close', (code, reason) => {
 console.log(`[MixinWS]WebSocket连接关闭: ${code} - ${reason}`);
 this.isConnected = false;
 this.emit('disconnected', { code, reason });
 this.handleReconnect();
 });
 }

 /**
 *等待连接成功
 */
 waitForConnection() {
 return new Promise((resolve, reject) => {
 const timeout = setTimeout(() => {
 reject(new Error('连接超时'));
 },10000); //10秒超时

 this.ws.once('open', () => {
 clearTimeout(timeout);
 resolve();
 });

 this.ws.once('error', (error) => {
 clearTimeout(timeout);
 reject(error);
 });
 });
 }

 /**
 *处理收到的消息
 */
 handleMessage(data) {
 try {
 const message = JSON.parse(data.toString());

 console.log('[MixinWS]收到消息:', message.action || message.type);

 switch (message.action || message.type) {
 case 'CREATE_MESSAGE':
 case 'MESSAGE':
 //收到聊天消息
 this.emit('message', message.data);
 break;

 case 'ACKNOWLEDGE_MESSAGE_RECEIPT':
 //消息已送达确认
 this.emit('messageReceipt', message.data);
 break;

 case 'LIST_PENDING_MESSAGES':
 //离线消息列表
 this.handlePendingMessages(message.data);
 break;

 case 'ERROR':
 //错误消息
 console.error('[MixinWS]服务器错误:', message.data);
 this.emit('error', new Error(message.data?.message || 'Unknown error'));
 break;

 default:
 console.log('[MixinWS]未知消息类型:', message.action || message.type);
 this.emit('unknown', message);
 }

 } catch (error) {
 console.error('[MixinWS]解析消息失败:', error.message);
 this.emit('error', error);
 }
 }

 /**
 *发送消息到Mixin
 */
 sendMessage(message) {
 if (!this.isConnected || !this.ws) {
 console.error('[MixinWS]未连接，无法发送消息');
 return false;
 }

 try {
 const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
 this.ws.send(messageStr);
 return true;
 } catch (error) {
 console.error('[MixinWS]发送消息失败:', error.message);
 return false;
 }
 }

 /**
 *请求离线消息列表
 */
 listPendingMessages() {
 return this.sendMessage({
 action: 'LIST_PENDING_MESSAGES',
 });
 }

 /**
 *处理离线消息
 */
 handlePendingMessages(messages) {
 if (!Array.isArray(messages) || messages.length ===0) {
 console.log('[MixinWS]没有离线消息');
 return;
 }

 console.log(`[MixinWS]收到 ${messages.length}条离线消息`);

 messages.forEach((message, index) => {
 setTimeout(() => {
 this.emit('message', message);
 }, index *100); //100ms间隔，避免消息洪峰
 });
 }

 /**
 *确认消息已读
 */
 acknowledgeMessageReceipt(messageId) {
 return this.sendMessage({
 action: 'ACKNOWLEDGE_MESSAGE_RECEIPT',
 data: {
 message_id: messageId,
 status: 'READ',
 },
 });
 }

 /**
 *处理重连
 */
 handleReconnect() {
 if (this.reconnectAttempts >= this.maxReconnectAttempts) {
 console.error(`[MixinWS]达到最大重连次数(${this.maxReconnectAttempts})，放弃重连`);
 this.emit('reconnectFailed');
 return;
 }

 this.reconnectAttempts++;
 const delay = Math.min(this.reconnectInterval * this.reconnectAttempts,60000); //最多60秒

 console.log(`[MixinWS] ${delay}ms后尝试第${this.reconnectAttempts}次重连...`);

 setTimeout(() => {
 this.connect().catch(() => {
 //重连失败会继续触发close事件，然后再次重试
 });
 }, delay);
 }

 /**
 *断开连接
 */
 disconnect() {
 console.log('[MixinWS]主动断开连接');

 if (this.ws) {
 this.ws.close();
 this.ws = null;
 }

 this.isConnected = false;
 }

 /**
 *获取连接状态
 */
 getStatus() {
 return {
 isConnected: this.isConnected,
 reconnectAttempts: this.reconnectAttempts,
 wsState: this.ws ? this.ws.readyState : null,
 };
 }
}

module.exports = MixinWebSocketClient;