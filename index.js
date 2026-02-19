#!/usr/bin/env node

/**
 * Openclaw Mixin通道插件
 *
 *作为Openclaw的通道适配器，将Mixin Messenger集成到Openclaw中。
 *
 *工作流程：
 *1.接收Mixin Webhook消息
 *2.通过WebSocket转发给Openclaw Gateway
 *3.Openclaw Agent处理AI逻辑
 *4.接收Agent回复
 *5.发送回复到Mixin Messenger
 */

const MixinChannel = require('./src/mixin-channel');
const { config } = require('./src/config');

//全局通道实例
let channel = null;

/**
 *启动服务
 */
async function start() {
 console.log(`
 🤖 Openclaw Mixin通道插件
 ========================================
 `);

 try {
 //验证配置
 if (!config.mixin.appId) {
 console.error('❌错误:未配置MIXIN_APP_ID');
 console.log('请运行: npm run setup');
 process.exit(1);
 }

 //创建并启动通道
 channel = new MixinChannel({
 gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789',
 webhookPort: process.env.PORT ||3000,
 });

 await channel.start();

 console.log(`
 ✅服务启动成功！

配置信息:
 -Mixin App ID: ${config.mixin.appId}
 -Webhook端口: ${channel.webhookPort}
 -Gateway地址: ${channel.gatewayUrl}

访问地址:
 -健康检查: http://localhost:${channel.webhookPort}/health
 -Webhook: http://localhost:${channel.webhookPort}/webhook/mixin

请在Mixin开发者平台配置Webhook URL:
 https://your-domain.com/webhook/mixin

按Ctrl+C停止服务
 `);

 //设置优雅关闭
 setupGracefulShutdown();

 } catch (error) {
 console.error('❌启动失败:', error);
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

 //未捕获的错误
 process.on('uncaughtException', (error) => {
 console.error('未捕获的异常:', error);
 shutdown('uncaughtException');
 });

 process.on('unhandledRejection', (reason, promise) => {
 console.error('未处理的Promise拒绝:', reason);
 });
}

/**
 *显示帮助信息
 */
function showHelp() {
 console.log(`
 🤖 Openclaw Mixin通道插件使用说明
 ========================================

使用方法:
 node index.js [command]

可用命令:
 start -启动服务（默认）
 status -查看状态
 stop -停止服务
 --help, -h -显示此帮助信息
 --version, -v -显示版本信息

环境变量:
 MIXIN_APP_ID -Mixin应用ID（必需）
 MIXIN_SESSION_ID -Mixin会话ID（必需）
 MIXIN_SESSION_PRIVATE_KEY -Mixin私钥（必需）
 OPENCLAW_GATEWAY_URL -Openclaw Gateway地址（默认: ws://127.0.0.1:18789）
 PORT -Webhook服务器端口（默认:3000）
 WEBHOOK_SECRET -Webhook签名密钥

快速开始:
1. npm run setup #配置插件
2. npm start #启动服务
3.在Mixin开发者平台配置Webhook URL

更多信息:
 GitHub: https://github.com/invago/openclaw-mixin
 `);
}

/**
 *显示版本信息
 */
function showVersion() {
 const packageJson = require('./package.json');
 console.log(`
 Openclaw Mixin通道插件
版本: ${packageJson.version}
作者: ${packageJson.author}
许可证: ${packageJson.license}
 `);
}

/**
 *主函数
 */
async function main() {
 const args = process.argv.slice(2);
 const command = args[0];

 switch (command) {
 case '--help':
 case '-h':
 showHelp();
 break;

 case '--version':
 case '-v':
 showVersion();
 break;

 case 'setup':
 const { runSetup } = require('./scripts/setup');
 await runSetup();
 break;

 case 'test':
 const { runTests } = require('./test/mock-webhook');
 await runTests();
 break;

 default:
 //默认启动服务
 await start();
 }
}

//运行主程序
if (require.main === module) {
 main().catch((error) => {
 console.error('❌程序错误:', error);
 process.exit(1);
 });
}

//导出模块供其他程序使用
module.exports = {
 MixinChannel,
 start,
};