const redis = require('redis');
const { config } = require('../config');

class SessionManager {
 constructor() {
 this.client = null;
 this.connected = false;
 this.initRedis();
 }

 async initRedis() {
 try {
 this.client = redis.createClient({
 url: `redis://${config.redis.host}:${config.redis.port}`,
 password: config.redis.password || undefined,
 socket: {
 connectTimeout: 5000,
 reconnectStrategy: (retries) => {
 if (retries > 3) {
 console.warn('[SessionManager] Redis重连次数过多，切换到内存存储模式');
 this.connected = false;
 return false; // 停止重连
 }
 return Math.min(retries * 1000, 3000);
 },
 },
 });

 this.client.on('error', (err) => {
 // 只在非连接错误时打印
 if (!err.message.includes('ECONNREFUSED')) {
 console.error('[SessionManager] Redis错误:', err.message);
 }
 this.connected = false;
 });

 this.client.on('connect', () => {
 console.log('[SessionManager] Redis连接成功');
 this.connected = true;
 });

 this.client.on('ready', () => {
 console.log('[SessionManager] Redis准备就绪');
 this.connected = true;
 });

 await this.client.connect();
 } catch (error) {
 console.warn('[SessionManager] Redis连接失败，降级为内存存储模式:', error.message);
 // 降级为内存存储
 this.client = null;
 this.memoryStore = new Map();
 this.connected = false;
 }
 }

 /**
 *创建或获取用户会话
 */
 async getOrCreateSession(userId, conversationId) {
 const sessionKey = `session:${userId}:${conversationId}`;

 try {
 if (this.connected && this.client) {
 //检查Redis中是否有会话
 const existing = await this.client.get(sessionKey);
 if (existing) {
 return JSON.parse(existing);
 }
 } else if (this.memoryStore) {
 //使用内存存储
 if (this.memoryStore.has(sessionKey)) {
 return this.memoryStore.get(sessionKey);
 }
 }

 //创建新会话
 const newSession = {
 id: sessionKey,
 userId,
 conversationId,
 createdAt: new Date().toISOString(),
 updatedAt: new Date().toISOString(),
 messageCount:0,
 lastMessageId: null,
 context: [],
 settings: {
 language: 'zh-CN',
 notificationEnabled: true,
 autoReply: true,
 },
 };

 await this.saveSession(sessionKey, newSession);
 return newSession;
 } catch (error) {
 console.error('获取会话失败:', error);
 //返回基础会话
 return {
 id: `fallback:${userId}:${conversationId}`,
 userId,
 conversationId,
 createdAt: new Date().toISOString(),
 context: [],
 };
 }
 }

 /**
 *保存会话
 */
 async saveSession(sessionKey, session) {
 session.updatedAt = new Date().toISOString();

 try {
 if (this.connected && this.client) {
 await this.client.setEx(
 sessionKey,
 config.redis.sessionTtl,
 JSON.stringify(session)
 );
 } else if (this.memoryStore) {
 this.memoryStore.set(sessionKey, session);
 }
 } catch (error) {
 console.error('保存会话失败:', error);
 }
 }

 /**
 *更新会话上下文
 */
 async updateSessionContext(userId, conversationId, message, response) {
 const sessionKey = `session:${userId}:${conversationId}`;

 try {
 const session = await this.getOrCreateSession(userId, conversationId);

 //添加上下文
 session.context.push({
 role: 'user',
 content: message,
 timestamp: new Date().toISOString(),
 });

 if (response) {
 session.context.push({
 role: 'assistant',
 content: response,
 timestamp: new Date().toISOString(),
 });
 }

 //限制上下文长度（保留最近20条消息）
 if (session.context.length >20) {
 session.context = session.context.slice(-20);
 }

 session.messageCount +=1;
 session.lastMessageId = message.id || message.messageId;

 await this.saveSession(sessionKey, session);
 return session;
 } catch (error) {
 console.error('更新会话上下文失败:', error);
 return null;
 }
 }

 /**
 *获取会话上下文
 */
 async getSessionContext(userId, conversationId, limit =10) {
 try {
 const session = await this.getOrCreateSession(userId, conversationId);
 if (limit && session.context.length > limit) {
 return session.context.slice(-limit);
 }
 return session.context;
 } catch (error) {
 console.error('获取会话上下文失败:', error);
 return [];
 }
 }

 /**
 *清除会话
 */
 async clearSession(userId, conversationId) {
 const sessionKey = `session:${userId}:${conversationId}`;

 try {
 if (this.connected && this.client) {
 await this.client.del(sessionKey);
 } else if (this.memoryStore) {
 this.memoryStore.delete(sessionKey);
 }
 return true;
 } catch (error) {
 console.error('清除会话失败:', error);
 return false;
 }
 }

 /**
 *获取用户所有会话
 */
 async getUserSessions(userId) {
 try {
 if (this.connected && this.client) {
 const keys = await this.client.keys(`session:${userId}:*`);
 const sessions = [];

 for (const key of keys) {
 const sessionData = await this.client.get(key);
 if (sessionData) {
 sessions.push(JSON.parse(sessionData));
 }
 }

 return sessions;
 }
 return [];
 } catch (error) {
 console.error('获取用户会话失败:', error);
 return [];
 }
 }

 /**
 *更新会话设置
 */
 async updateSessionSettings(userId, conversationId, settings) {
 const sessionKey = `session:${userId}:${conversationId}`;

 try {
 const session = await this.getOrCreateSession(userId, conversationId);
 session.settings = { ...session.settings, ...settings };
 await this.saveSession(sessionKey, session);
 return session;
 } catch (error) {
 console.error('更新会话设置失败:', error);
 return null;
 }
 }
}

module.exports = new SessionManager();