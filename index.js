#!/usr/bin/env node

/**
 * Openclaw Mixin通道插件（简化版）
 *
 *使用WebSocket长连接接收Mixin消息，无需HTTP Webhook。
 *
 *工作流程：
 *1.通过WebSocket连接到Mixin Blaze服务器
 *2.实时接收Mixin用户消息
 *3.通过WebSocket转发给Openclaw Gateway
 *4.Openclaw Agent处理AI逻辑
 *5.接收Agent回复并发送回Mixin
 */

const MixinChannel = require('./src/mixin-channel');

//全局通道实例
let channel = null;

/**
 * Openclaw 插件注册函数
 * 当通过 openclaw plugins install 安装时调用
 */
async function register(config) {
  console.log('[mixin] 注册 Mixin 通道插件...');

  const options = {
    gatewayUrl: config?.gatewayUrl || process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789',
    appId: config?.appId || process.env.MIXIN_APP_ID,
    sessionId: config?.sessionId || process.env.MIXIN_SESSION_ID,
    privateKey: config?.privateKey || process.env.MIXIN_SESSION_PRIVATE_KEY,
  };

  channel = new MixinChannel(options);
  return channel;
}

/**
 *启动服务
 */
async function start() {
 console.log(`
 🤖 Openclaw Mixin通道插件（简化版）
 ========================================
版本:1.0.0
模式: WebSocket长连接
 ========================================
 `);

 //验证必要的环境变量
 const requiredEnvVars = [
 'MIXIN_APP_ID',
 'MIXIN_SESSION_ID',
 'MIXIN_SESSION_PRIVATE_KEY',
 ];

 const missing = requiredEnvVars.filter(varName => !process.env[varName]);

 if (missing.length >0) {
 console.error('❌错误:缺少必要的环境变量:');
 missing.forEach(varName => console.error(` - ${varName}`));
 console.log('\n请复制 .env.example为 .env并填写配置');
 process.exit(1);
 }

 try {
 //创建并启动通道
 channel = new MixinChannel({
 gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789',
 });

 await channel.start();

 console.log(`
 ✅服务启动成功！

配置信息:
 -Mixin App ID: ${process.env.MIXIN_APP_ID?.substring(0,8)}...
 -Openclaw Gateway: ${channel.gatewayUrl}

现在可以通过Mixin与AI对话了！

命令列表:
 /start -开始认证
 /auth <code> -提交配对码
 /status -查看状态
 /help -显示帮助

按Ctrl+C停止服务
 `);

 //设置优雅关闭
 setupGracefulShutdown();

 } catch (error) {
 console.error('❌启动失败:', error.message);
 process.exit(1);
 }
}

/**
 *设置优雅关闭
 */
function setupGracefulShutdown() {
 const shutdown = async (signal) => {
 console.log(`\n🛑收到${signal}信号，正在关闭...`);

 if (channel) {
 await channel.stop();
 }

 console.log('✅服务已关闭');
 process.exit(0);
 };

 process.on('SIGTERM', () => shutdown('SIGTERM'));
 process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 *主函数
 */
async function main() {
 const args = process.argv.slice(2);

 if (args.includes('--help') || args.includes('-h')) {
 console.log(`
使用方法: node index-simple.js

环境变量:
 MIXIN_APP_ID -Mixin应用ID（必需）
 MIXIN_SESSION_ID -Mixin会话ID（必需）
 MIXIN_SESSION_PRIVATE_KEY -Mixin私钥（必需）
 OPENCLAW_GATEWAY_URL -Openclaw Gateway地址（默认: ws://127.0.0.1:18789）
 `);
 return;
 }

 await start();
}

//运行主程序
if (require.main === module) {
 main().catch(error => {
 console.error('程序错误:', error);
 process.exit(1);
 });
}

module.exports = { MixinChannel, register };