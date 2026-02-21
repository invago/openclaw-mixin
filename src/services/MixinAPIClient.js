const axios = require('axios');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { config } = require('../config');

class MixinAPIClient {
  constructor() {
    this.baseUrl = config.mixin.apiBaseUrl;
    this.appId = config.mixin.appId;
    this.sessionId = config.mixin.sessionId;
    this.serverPublicKey = config.mixin.serverPublicKey;
    this.sessionPrivateKey = config.mixin.sessionPrivateKey ? Buffer.from(config.mixin.sessionPrivateKey, 'base64') : null;

    // JWT 令牌缓存
    this.currentToken = null;
    this.tokenExpiry = 0;
    this.tokenLock = false; // 防止并发刷新

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: config.message.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mixin-Openclaw-Adapter/1.0',
      },
    });
  }

  /**
   * 生成 JWT 令牌用于 API 认证（带缓存和自动刷新）
   */
  async generateToken(method, uri, body = '') {
    if (!this.sessionPrivateKey) {
      throw new Error('MIXIN_SESSION_PRIVATE_KEY 未配置');
    }

    const now = Math.floor(Date.now() / 1000);

    // 如果令牌还有效（剩余 5 分钟以上），直接返回
    if (this.currentToken && now < this.tokenExpiry - 300) {
      return this.currentToken;
    }

    // 防止并发刷新
    if (this.tokenLock) {
      // 等待当前刷新完成
      while (this.tokenLock) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return this.currentToken;
    }

    this.tokenLock = true;

    try {
      // 计算请求内容的 SHA256 摘要
      const content = method === 'GET' || method === 'DELETE' ? '' : JSON.stringify(body);
      const sig = crypto.createHash('sha256').update(content).digest('hex');

      // 生成 JWT payload
      const payload = {
        uid: this.appId,
        sid: this.sessionId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 小时有效
        jti: uuidv4(),
        sig,
      };

      // 使用会话私钥签名
      this.currentToken = jwt.sign(payload, this.sessionPrivateKey, {
        algorithm: 'RS512',
      });

      this.tokenExpiry = now + 3600; // 1 小时有效期
      console.log('[MixinAPI] JWT 令牌已刷新');

      return this.currentToken;
    } finally {
      this.tokenLock = false;
    }
  }

  /**
   * 发送认证请求
   */
  async request(method, endpoint, data = null) {
    try {
      const uri = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      const token = await this.generateToken(method, uri, data);

      const axiosConfig = {
        method,
        url: uri,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      };

      if (data && (method === 'POST' || method === 'PUT')) {
        axiosConfig.data = data;
      }

      const response = await this.axiosInstance(axiosConfig);
      return response.data;
    } catch (error) {
      console.error(`Mixin API 请求失败：${method} ${endpoint}`, error.message);

      if (error.response) {
        console.error('响应状态:', error.response.status);
        console.error('响应数据:', error.response.data);
        throw new Error(`Mixin API 错误：${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }

      throw error;
    }
  }

  /**
   * 发送消息
   */
  async sendMessage(conversationId, messageData) {
    const message = {
      conversation_id: conversationId,
      category: messageData.category,
      data: messageData.data,
      message_id: uuidv4(),
      status: 'SENT',
    };

    try {
      const response = await this.request('POST', '/messages', message);
      return response.data;
    } catch (error) {
      console.error('发送消息失败:', error.message);
      throw error;
    }
  }

  /**
   * 发送文本消息
   */
  async sendTextMessage(conversationId, text) {
    const messageData = {
      category: 'PLAIN_TEXT',
      data: Buffer.from(text).toString('base64'),
    };

    return this.sendMessage(conversationId, messageData);
  }

  /**
   * 发送图片消息
   */
  async sendImageMessage(conversationId, imageUrl, thumbnailUrl = null) {
    const messageData = {
      category: 'PLAIN_IMAGE',
      data: Buffer.from(JSON.stringify({
        url: imageUrl,
        thumbnail: thumbnailUrl,
      })).toString('base64'),
    };

    return this.sendMessage(conversationId, messageData);
  }

  /**
   * 获取用户信息
   */
  async getUserInfo(userId) {
    try {
      const response = await this.request('GET', `/users/${userId}`);
      return response.data;
    } catch (error) {
      console.error('获取用户信息失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取会话信息
   */
  async getConversation(conversationId) {
    try {
      const response = await this.request('GET', `/conversations/${conversationId}`);
      return response.data;
    } catch (error) {
      console.error('获取会话信息失败:', error.message);
      throw error;
    }
  }

  /**
   * 创建会话
   */
  async createConversation(participants) {
    try {
      const response = await this.request('POST', '/conversations', {
        participants,
      });
      return response.data;
    } catch (error) {
      console.error('创建会话失败:', error.message);
      throw error;
    }
  }

  /**
   * 确认消息已读
   */
  async acknowledgeMessageReceipt(messageId, status = 'READ') {
    try {
      await this.sendMessage(null, {
        category: 'MessageReceipt',
        data: Buffer.from(JSON.stringify({
          message_id: messageId,
          status,
        })).toString('base64'),
      });
    } catch (error) {
      console.error('确认消息已读失败:', error.message);
    }
  }

  /**
   * 验证 Webhook 签名
   */
  verifyWebhookSignature(signature, timestamp, body) {
    const message = `${timestamp}${JSON.stringify(body)}`;
    const expectedSignature = crypto
      .createHmac('sha256', config.server.webhookSecret)
      .update(message)
      .digest('hex');

    return signature === expectedSignature;
  }
}

module.exports = new MixinAPIClient();
