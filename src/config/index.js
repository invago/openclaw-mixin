require('dotenv').config();

const config = {
  // Mixin 配置
  mixin: {
    appId: process.env.MIXIN_APP_ID,
    sessionId: process.env.MIXIN_SESSION_ID,
    serverPublicKey: process.env.MIXIN_SERVER_PUBLIC_KEY,
    sessionPrivateKey: process.env.MIXIN_SESSION_PRIVATE_KEY,
    apiBaseUrl: 'https://api.mixin.one',
    oauthBaseUrl: 'https://mixin.one',
  },

  // 服务器配置
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    webhookUrl: process.env.WEBHOOK_URL,
    webhookSecret: process.env.WEBHOOK_SECRET,
  },

  // Redis 配置
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || '',
    sessionTtl: 24 * 60 * 60, // 24 小时
  },

  // Openclaw 配置
  openclaw: {
    apiUrl: process.env.OPENCLAW_API_URL,
    apiKey: process.env.OPENCLAW_API_KEY,
    // 新增：可配置项
    language: process.env.OPENCLAW_LANGUAGE || 'zh-CN',
    maxTokens: parseInt(process.env.OPENCLAW_MAX_TOKENS, 10) || 1000,
    temperature: parseFloat(process.env.OPENCLAW_TEMPERATURE) || 0.7,
  },

  // 安全配置
  security: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: '7d',
  },

  // 消息配置
  message: {
    maxRetryCount: 3,
    retryDelay: 1000,
    timeout: 10000,
  },

  // 调试配置
  debug: {
    enabled: process.env.OPENCLAW_DEBUG === 'true',
    logToFile: process.env.OPENCLAW_LOG_TO_FILE === 'true',
    autoApprove: process.env.OPENCLAW_AUTO_APPROVE === 'true',
  },
};

/**
 * 验证必要的配置
 */
function validateConfig() {
  const required = [
    'MIXIN_APP_ID',
    'MIXIN_SESSION_ID',
    'MIXIN_SESSION_PRIVATE_KEY',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `必要配置缺失：${missing.join(', ')}\n` +
      '请复制 .env.example 为 .env 并填写必要的配置'
    );
  }

  // 验证 UUID 格式
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (process.env.MIXIN_APP_ID && !uuidRegex.test(process.env.MIXIN_APP_ID)) {
    console.warn('警告：MIXIN_APP_ID 格式可能不正确（应为 UUID 格式）');
  }

  if (process.env.MIXIN_SESSION_ID && !uuidRegex.test(process.env.MIXIN_SESSION_ID)) {
    console.warn('警告：MIXIN_SESSION_ID 格式可能不正确（应为 UUID 格式）');
  }

  // 验证私钥格式
  if (process.env.MIXIN_SESSION_PRIVATE_KEY) {
    try {
      Buffer.from(process.env.MIXIN_SESSION_PRIVATE_KEY, 'base64');
    } catch (e) {
      throw new Error('MIXIN_SESSION_PRIVATE_KEY 必须是有效的 Base64 编码');
    }
  }

  return true;
}

module.exports = {
  config,
  validateConfig,
};
