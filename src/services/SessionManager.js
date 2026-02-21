const redis = require('redis');
const { config } = require('../config');

class SessionManager {
  constructor() {
    this.client = null;
    this.connected = false;
    this.initPromise = null;
    this.memoryStore = new Map(); // 始终初始化内存存储作为降级方案
    this.initRedis();
  }

  async initRedis() {
    // 保存 Promise 以便后续等待
    this.initPromise = this._initRedisInternal();
    return this.initPromise;
  }

  async _initRedisInternal() {
    try {
      const redisPassword = config.redis.password && config.redis.password.trim() !== ''
        ? config.redis.password
        : undefined;

      this.client = redis.createClient({
        url: `redis://${config.redis.host}:${config.redis.port}`,
        password: redisPassword,
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: (retries) => {
            if (retries > 3) {
              console.warn('[SessionManager] Redis 重连次数过多，切换到内存存储模式');
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
          console.error('[SessionManager] Redis 错误:', err.message);
        }
        this.connected = false;
      });

      this.client.on('connect', () => {
        console.log('[SessionManager] Redis 连接成功');
        this.connected = true;
      });

      this.client.on('ready', () => {
        console.log('[SessionManager] Redis 准备就绪');
        this.connected = true;
      });

      await this.client.connect();
      return true;
    } catch (error) {
      console.warn('[SessionManager] Redis 连接失败，降级为内存存储模式:', error.message);
      // 降级为内存存储
      this.client = null;
      this.connected = false;
      return false;
    }
  }

  /**
   * 确保 Redis 已就绪（或已降级到内存模式）
   */
  async ensureReady() {
    if (!this.initPromise) {
      await this.initRedis();
    }
    try {
      await this.initPromise;
    } catch (e) {
      // 已处理，使用内存存储
    }
  }

  /**
   * 创建或获取用户会话
   */
  async getOrCreateSession(userId, conversationId) {
    await this.ensureReady(); // 确保已就绪

    const sessionKey = `session:${userId}:${conversationId}`;

    try {
      if (this.connected && this.client) {
        // 检查 Redis 中是否有会话
        const existing = await this.client.get(sessionKey);
        if (existing) {
          return JSON.parse(existing);
        }
      } else if (this.memoryStore) {
        // 使用内存存储
        if (this.memoryStore.has(sessionKey)) {
          return this.memoryStore.get(sessionKey);
        }
      }

      // 创建新会话
      const newSession = {
        id: sessionKey,
        userId,
        conversationId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: 0,
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
      // 返回基础会话
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
   * 保存会话
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
   * 更新会话上下文
   */
  async updateSessionContext(userId, conversationId, message, response) {
    const sessionKey = `session:${userId}:${conversationId}`;

    try {
      const session = await this.getOrCreateSession(userId, conversationId);

      // 添加上下文
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

      // 限制上下文长度（保留最近 20 条消息）
      if (session.context.length > 20) {
        session.context = session.context.slice(-20);
      }

      session.messageCount += 1;
      session.lastMessageId = message.id || message.messageId;

      await this.saveSession(sessionKey, session);
      return session;
    } catch (error) {
      console.error('更新会话上下文失败:', error);
      return null;
    }
  }

  /**
   * 获取会话上下文
   */
  async getSessionContext(userId, conversationId) {
    await this.ensureReady();

    try {
      const session = await this.getOrCreateSession(userId, conversationId);
      return session.context;
    } catch (error) {
      console.error('获取会话上下文失败:', error);
      return [];
    }
  }

  /**
   * 清除会话
   */
  async clearSession(userId, conversationId) {
    await this.ensureReady();

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
   * 获取用户所有会话
   */
  async getUserSessions(userId) {
    await this.ensureReady();

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
   * 更新会话设置
   */
  async updateSessionSettings(userId, conversationId, settings) {
    await this.ensureReady();

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

  /**
   * 关闭 Redis 连接
   */
  async close() {
    if (this.client) {
      try {
        await this.client.quit();
        this.client = null;
        this.connected = false;
        console.log('[SessionManager] Redis 连接已关闭');
      } catch (error) {
        console.error('关闭 Redis 连接失败:', error);
      }
    }
  }
}

module.exports = new SessionManager();
