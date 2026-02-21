/**
 * Mixin 通道适配器（简化版）
 * 使用 WebSocket 长连接接收 Mixin 消息
 */

const OpenclawGatewayClient = require('./gateway-client');
const MixinWebSocketClient = require('./mixin-websocket-client');
const MixinAPIClient = require('./services/MixinAPIClient');
const { getAuthManager } = require('./auth-manager');
const { CommandHandler } = require('./command-handler');
const { createLogger } = require('./logger');
const { MessageFilter } = require('./message-filter');

class MixinChannelSimple {
  constructor(options = {}) {
    this.name = 'mixin';
    this.displayName = 'Mixin Messenger';

    // 配置
    this.gatewayUrl = options.gatewayUrl || process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789';

    // 组件
    this.gatewayClient = null;
    this.mixinClient = null;
    this.authManager = getAuthManager();
    this.commandHandler = new CommandHandler({ authManager: this.authManager });
    this.logger = createLogger('mixin-channel');
    this.messageFilter = new MessageFilter();

    // 状态
    this.isRunning = false;
  }

  /**
   * 启动通道
   */
  async start() {
    console.log(`[${this.name}] 启动 Mixin 通道...`);

    try {
      // 1. 连接到 Openclaw Gateway
      await this.connectToOpenclaw();

      // 2. 连接到 Mixin Blaze 服务器
      await this.connectToMixin();

      this.isRunning = true;
      console.log(`[${this.name}] 通道启动完成！`);
      console.log(`[${this.name}] 现在可以通过 Mixin 与 AI 对话了`);

      return true;

    } catch (error) {
      console.error(`[${this.name}] 启动失败:`, error);
      throw error;
    }
  }

  /**
   * 连接到 Openclaw Gateway
   */
  async connectToOpenclaw() {
    console.log(`[${this.name}] 连接到 Openclaw Gateway...`);

    this.gatewayClient = new OpenclawGatewayClient({
      gatewayUrl: this.gatewayUrl,
      channelId: this.name,
      apiKey: process.env.OPENCLAW_API_KEY || '',
    });

    // 监听 Agent 回复
    this.gatewayClient.on('agentResponse', this.handleAgentResponse.bind(this));

    // 监听连接状态
    this.gatewayClient.on('connected', () => {
      console.log(`[${this.name}] 已连接到 Openclaw Gateway`);
    });

    this.gatewayClient.on('disconnected', () => {
      console.log(`[${this.name}] 与 Openclaw Gateway 断开连接`);
    });

    await this.gatewayClient.connect();
  }

  /**
   * 连接到 Mixin Blaze 服务器
   */
  async connectToMixin() {
    console.log(`[${this.name}] 连接到 Mixin Blaze 服务器...`);

    this.mixinClient = new MixinWebSocketClient({
      appId: process.env.MIXIN_APP_ID,
      sessionId: process.env.MIXIN_SESSION_ID,
      privateKey: process.env.MIXIN_SESSION_PRIVATE_KEY,
    });

    // 监听 Mixin 消息
    this.mixinClient.on('message', this.handleMixinMessage.bind(this));

    // 监听连接状态
    this.mixinClient.on('connected', () => {
      console.log(`[${this.name}] 已连接到 Mixin 服务器`);
    });

    this.mixinClient.on('disconnected', () => {
      console.log(`[${this.name}] 与 Mixin 服务器断开连接`);
    });

    this.mixinClient.on('error', (error) => {
      console.error(`[${this.name}] Mixin 连接错误:`, error.message);
    });

    await this.mixinClient.connect();
  }

  /**
   * 处理 Mixin 消息
   */
  async handleMixinMessage(message) {
    try {
      const userId = message.user_id;
      const conversationId = message.conversation_id;
      const messageId = message.message_id;

      this.logger.info(`收到 Mixin 消息`, {
        userId,
        conversationId,
        category: message.category,
      });

      // 忽略机器人自己的消息
      if (userId === process.env.MIXIN_APP_ID) {
        return;
      }

      // 确认消息已读（修复问题 6：启用 ACK）
      this.mixinClient.acknowledgeMessageReceipt(messageId);

      // 解析消息内容
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

      // 检查是否应该处理（低打扰模式）
      const shouldProcess = this.messageFilter.shouldProcess({
        isGroup: message.conversation_id?.startsWith('GROUP_') || false,
        isMentioned: message.mentions?.includes(process.env.MIXIN_APP_ID) || false,
        text: textContent,
        messageType,
      });

      if (!shouldProcess) {
        this.logger.debug('消息被过滤器拦截', { userId, text: textContent });
        return;
      }

      // 清理文本（移除@提及等）
      const cleanText = this.messageFilter.extractCleanText(textContent, process.env.MIXIN_APP_ID);

      // 检查是否是命令
      const commandResult = await this.commandHandler.handleMessage({
        text: cleanText,
        userId,
        conversationId,
      }, {});

      if (commandResult) {
        // 是命令，直接回复
        await this.sendReplyToMixin(conversationId, commandResult);
        return;
      }

      // 不是命令，转发给 Openclaw 处理
      await this.forwardToOpenclaw({
        messageId,
        userId,
        conversationId,
        type: messageType,
        text: cleanText,
        rawMessage: message,
      });

    } catch (error) {
      this.logger.error('处理 Mixin 消息失败', error);
    }
  }

  /**
   * 转发消息到 Openclaw（修复问题 5：认证检查逻辑）
   */
  async forwardToOpenclaw(mixinMessage) {
    try {
      // 检查用户是否已认证
      if (!this.authManager.isAuthenticated(mixinMessage.userId)) {
        // 检查是否已有待认证
        const hasPending = this.authManager.hasPendingAuth(mixinMessage.userId);

        if (!hasPending) {
          // 生成配对码
          const pairingCode = await this.authManager.generatePairingCode(mixinMessage.userId);
          await this.sendReplyToMixin(mixinMessage.conversationId, {
            type: 'text',
            content: `欢迎使用 Openclaw AI 助手！\n\n请在 Openclaw 中发送配对码进行认证：${pairingCode}\n\n配对码 10 分钟内有效。`,
          });
        } else {
          await this.sendReplyToMixin(mixinMessage.conversationId, {
            type: 'text',
            content: '您已有待认证的配对码，请查看之前的消息或发送 /start 获取新的配对码。',
          });
        }
        return;
      }

      // 转换消息格式
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

      this.logger.info('转发消息到 Openclaw', { messageId: openclawMessage.messageId });

      // 发送到 Openclaw Gateway
      const response = await this.gatewayClient.sendUserMessage(openclawMessage);

      this.logger.info('收到 Openclaw 回复', { messageId: response.messageId });

      // 发送回复到 Mixin
      await this.sendReplyToMixin(mixinMessage.conversationId, response);

    } catch (error) {
      this.logger.error('转发消息失败', error);

      // 发送错误提示
      await this.sendReplyToMixin(mixinMessage.conversationId, {
        type: 'text',
        content: '抱歉，服务暂时不可用，请稍后重试。',
      });
    }
  }

  /**
   * 处理 Openclaw Agent 的回复
   */
  async handleAgentResponse(response) {
    try {
      const { conversationId, content } = response;

      this.logger.info('处理 Agent 回复', { conversationId });

      // 发送回复到 Mixin
      await this.sendReplyToMixin(conversationId, content);

    } catch (error) {
      this.logger.error('处理 Agent 回复失败', error);
    }
  }

  /**
   * 发送回复到 Mixin
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

      // 调用 Mixin API 发送消息
      this.logger.info('发送回复到 Mixin', { conversationId, type: content.type });

      await MixinAPIClient.sendMessage(conversationId, messageData);

    } catch (error) {
      this.logger.error('发送回复失败', error);
    }
  }

  /**
   * 停止通道
   */
  async stop() {
    console.log(`[${this.name}] 停止 Mixin 通道...`);

    this.isRunning = false;

    if (this.mixinClient) {
      this.mixinClient.disconnect();
    }

    if (this.gatewayClient) {
      this.gatewayClient.disconnect();
    }

    console.log(`[${this.name}] 通道已停止`);
  }

  /**
   * 获取状态
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
