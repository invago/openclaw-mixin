/**
 * Mixin WebSocket 客户端
 * 通过 WebSocket 长连接接收 Mixin 消息
 * 参考 Mixin Bot 的 WebSocket 实现
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

    // Mixin Blaze 服务器地址
    this.blazeHost = options.blazeHost || 'blaze.mixin.one';
    this.blazePort = options.blazePort || 443;

    this.ws = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    this.reconnectInterval = options.reconnectInterval || 5000;
    this.shouldReconnect = true; // 控制是否应该重连

    // 消息 ID 追踪
    this.pendingMessages = new Map();

    // 消息去重
    this.processedMessages = new Set();
    this.maxMessageCache = 1000;

    // 心跳检测
    this.heartbeatInterval = null;
    this.heartbeatTimeout = 30000; // 30 秒
    this.lastPongReceived = null;
  }

  /**
   * 连接到 Mixin Blaze 服务器
   */
  async connect() {
    if (this.isConnected || this.isConnecting) {
      console.log('[MixinWS] 已经连接或正在连接中');
      return;
    }

    this.shouldReconnect = true;

    try {
      console.log('[MixinWS] 连接到 Mixin Blaze 服务器...');

      // 生成认证 token
      const authToken = await this.generateAuthToken();

      // 构建 WebSocket URL
      const wsUrl = `wss://${this.blazeHost}:${this.blazePort}`;

      // 创建 WebSocket 连接
      this.ws = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'X-Request-Id': uuidv4(),
        },
        handshakeTimeout: 10000,
      });

      this.isConnecting = true;

      // 设置事件处理器
      this.setupEventHandlers();

      // 等待连接成功
      await this.waitForConnection();

      console.log('[MixinWS] 连接成功！');
      this.isConnected = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;

      // 启动心跳检测
      this.startHeartbeat();

      // 发送 LIST_PENDING_MESSAGES 命令获取离线消息
      this.listPendingMessages();

    } catch (error) {
      console.error('[MixinWS] 连接失败:', error.message);
      this.isConnecting = false;
      if (this.shouldReconnect) {
        this.handleReconnect();
      }
    }
  }

  /**
   * 生成认证 Token
   */
  async generateAuthToken() {
    const jwt = require('jsonwebtoken');

    const payload = {
      uid: this.appId,
      sid: this.sessionId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 小时有效期
      jti: uuidv4(),
      sig: '', // 如果需要可以添加签名
    };

    // 使用私钥签名
    const token = jwt.sign(payload, Buffer.from(this.privateKey, 'base64'), {
      algorithm: 'RS512',
    });

    return token;
  }

  /**
   * 设置 WebSocket 事件处理器
   */
  setupEventHandlers() {
    this.ws.on('open', () => {
      console.log('[MixinWS] WebSocket 连接已打开');
      this.emit('connected');
    });

    this.ws.on('message', (data) => {
      this.handleMessage(data);
    });

    this.ws.on('error', (error) => {
      console.error('[MixinWS] WebSocket 错误:', error.message);
      this.emit('error', error);
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[MixinWS] WebSocket 连接关闭：${code} - ${reason}`);
      this.isConnected = false;
      this.isConnecting = false;

      // 停止心跳
      this.stopHeartbeat();

      this.emit('disconnected', { code, reason });

      // 只有在非主动断开时才重连
      if (this.shouldReconnect) {
        this.handleReconnect();
      }
    });

    this.ws.on('pong', () => {
      this.lastPongReceived = Date.now();
    });
  }

  /**
   * 等待连接成功
   */
  waitForConnection() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.isConnecting = false;
        reject(new Error('连接超时'));
      }, 10000); // 10 秒超时

      this.ws.once('open', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.ws.once('error', (error) => {
        clearTimeout(timeout);
        this.isConnecting = false;
        reject(error);
      });
    });
  }

  /**
   * 处理收到的消息
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());

      console.log('[MixinWS] 收到消息:', message.action || message.type);

      switch (message.action || message.type) {
        case 'CREATE_MESSAGE':
        case 'MESSAGE':
          // 检查消息是否已处理（去重）
          const msgId = message.data?.message_id || message.message_id;
          if (msgId && !this.shouldProcessMessage(msgId)) {
            console.log('[MixinWS] 跳过已处理的消息:', msgId);
            return;
          }
          // 收到聊天消息
          this.emit('message', message.data);
          break;

        case 'ACKNOWLEDGE_MESSAGE_RECEIPT':
          // 消息已送达确认
          this.emit('messageReceipt', message.data);
          break;

        case 'LIST_PENDING_MESSAGES':
          // 离线消息列表
          this.handlePendingMessages(message.data);
          break;

        case 'ERROR':
          // 错误消息
          console.error('[MixinWS] 服务器错误:', message.data);
          this.emit('error', new Error(message.data?.message || 'Unknown error'));
          break;

        default:
          console.log('[MixinWS] 未知消息类型:', message.action || message.type);
          this.emit('unknown', message);
      }

    } catch (error) {
      console.error('[MixinWS] 解析消息失败:', error.message);
      this.emit('error', error);
    }
  }

  /**
   * 消息去重检查
   */
  shouldProcessMessage(messageId) {
    if (this.processedMessages.has(messageId)) {
      return false;
    }
    this.processedMessages.add(messageId);
    if (this.processedMessages.size > this.maxMessageCache) {
      const first = this.processedMessages.values().next().value;
      this.processedMessages.delete(first);
    }
    return true;
  }

  /**
   * 发送消息到 Mixin
   */
  sendMessage(message) {
    if (!this.isConnected || !this.ws) {
      console.error('[MixinWS] 未连接，无法发送消息');
      return false;
    }

    try {
      const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
      this.ws.send(messageStr);
      return true;
    } catch (error) {
      console.error('[MixinWS] 发送消息失败:', error.message);
      return false;
    }
  }

  /**
   * 请求离线消息列表
   */
  listPendingMessages() {
    return this.sendMessage({
      action: 'LIST_PENDING_MESSAGES',
    });
  }

  /**
   * 处理离线消息
   */
  handlePendingMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
      console.log('[MixinWS] 没有离线消息');
      return;
    }

    console.log(`[MixinWS] 收到 ${messages.length} 条离线消息`);

    messages.forEach((message, index) => {
      setTimeout(() => {
        // 去重检查
        const msgId = message.message_id;
        if (msgId && !this.shouldProcessMessage(msgId)) {
          return;
        }
        this.emit('message', message);
      }, index * 100); // 100ms 间隔，避免消息洪峰
    });
  }

  /**
   * 确认消息已读
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
   * 启动心跳检测
   */
  startHeartbeat() {
    this.stopHeartbeat(); // 先停止已有的心跳

    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected && this.ws) {
        // 发送 ping
        this.ws.ping();

        // 检查上次 pong 响应时间
        if (this.lastPongReceived && Date.now() - this.lastPongReceived > this.heartbeatTimeout * 2) {
          console.warn('[MixinWS] 心跳超时，可能连接已断开');
          this.ws.terminate();
        }
      }
    }, this.heartbeatTimeout);
  }

  /**
   * 停止心跳检测
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * 处理重连（修复版：指数退避）
   */
  handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[MixinWS] 达到最大重连次数 (${this.maxReconnectAttempts})，放弃重连`);
      this.emit('reconnectFailed');
      return;
    }

    this.reconnectAttempts++;
    // 指数退避：5s, 10s, 20s, 40s, 60s (上限)
    const delay = Math.min(this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1), 60000);

    console.log(`[MixinWS] ${delay}ms 后尝试第 ${this.reconnectAttempts} 次重连...`);

    setTimeout(async () => {
      if (!this.shouldReconnect) {
        return;
      }
      try {
        await this.connect();
      } catch (error) {
        // 错误已在 connect 中处理
      }
    }, delay);
  }

  /**
   * 断开连接
   */
  disconnect() {
    console.log('[MixinWS] 主动断开连接');

    this.shouldReconnect = false; // 停止自动重连
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.isConnecting = false;
  }

  /**
   * 获取连接状态
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts,
      wsState: this.ws ? this.ws.readyState : null,
      lastPongReceived: this.lastPongReceived,
    };
  }
}

module.exports = MixinWebSocketClient;
