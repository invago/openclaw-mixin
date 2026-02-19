#!/usr/bin/env node

/**
 * Openclaw Mixin插件入口文件
 *参考飞书和Telegram插件实现方式
 */

const path = require('path');
const fs = require('fs');

//检查是否在Openclaw环境中运行
function isOpenclawEnvironment() {
 return process.env.OPENCLAW_HOME || process.env.CLAWD_HOME;
}

//获取Openclaw配置
function getOpenclawConfig() {
 const configPaths = [
 process.env.OPENCLAW_CONFIG,
 process.env.CLAWD_CONFIG,
 path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw', 'config.json'),
 path.join(process.env.HOME || process.env.USERPROFILE, '.clawd', 'config.json'),
 path.join(__dirname, 'claw.config.js'),
 ];

 for (const configPath of configPaths) {
 if (configPath && fs.existsSync(configPath)) {
 try {
 return require(configPath);
 } catch (error) {
 console.warn(`无法加载配置文件 ${configPath}:`, error.message);
 }
 }
 }

 return null;
}

//运行独立模式
async function runStandalone() {
 console.log(`
 🚀 Mixin Messenger插件 -独立模式
 ========================================

插件信息:
 -名称: mixin-messenger
 -版本:1.0.0
 -描述:将Openclaw AI助手接入Mixin Messenger平台

启动独立Webhook服务器...
 `);

 //加载独立配置
 const configPath = path.join(__dirname, 'claw.config.js');
 if (!fs.existsSync(configPath)) {
 console.error('❌找不到插件配置文件:', configPath);
 console.log('请先运行: npm run setup');
 process.exit(1);
 }

 //启动独立服务器
 const { startStandaloneServer } = require('./src/standalone');
 await startStandaloneServer();
}

//运行Openclaw插件模式
async function runOpenclawPlugin() {
 console.log(`
 🔌 Mixin Messenger插件 - Openclaw模式
 ========================================

正在注册到Openclaw系统...
 `);

 try {
 //加载插件类
 const MixinPlugin = require('./src/plugin');

 //获取Openclaw实例
 const claw = global.claw || require('@clawd/core');

 if (!claw) {
 console.error('❌无法找到Openclaw核心模块');
 process.exit(1);
 }

 //创建插件实例
 const plugin = new MixinPlugin(claw);

 //注册插件
 claw.registerPlugin(plugin);

 console.log(`✅ Mixin插件注册成功: ${plugin.name} v${plugin.version}`);

 //启动插件
 await plugin.start();

 //保持进程运行
 process.on('SIGINT', async () => {
 console.log('\n🛑收到停止信号，正在关闭插件...');
 await plugin.stop();
 process.exit(0);
 });

 process.on('SIGTERM', async () => {
 console.log('\n🛑收到终止信号，正在关闭插件...');
 await plugin.stop();
 process.exit(0);
 });

 } catch (error) {
 console.error('❌插件启动失败:', error);
 process.exit(1);
 }
}

//主函数
async function main() {
 //解析命令行参数
 const args = process.argv.slice(2);
 const command = args[0];

 //命令行接口
 if (command === '--help' || command === '-h') {
 showHelp();
 return;
 }

 if (command === '--version' || command === '-v') {
 showVersion();
 return;
 }

 if (command === 'setup') {
 const { runSetup } = require('./scripts/setup');
 await runSetup();
 return;
 }

 if (command === 'test') {
 const { runTests } = require('./test/mock-webhook');
 await runTests();
 return;
 }

 //根据环境选择运行模式
 if (isOpenclawEnvironment()) {
 await runOpenclawPlugin();
 } else {
 await runStandalone();
 }
}

//显示帮助信息
function showHelp() {
 console.log(`
 🤖 Mixin Messenger插件使用说明
 ========================================

使用方法:
 node index.js [command]

可用命令:
 setup -交互式配置插件
 test -运行Webhook测试
 --help, -h -显示此帮助信息
 --version, -v -显示版本信息

环境模式:
 -在Openclaw环境中:自动注册为插件
 -独立模式:启动独立的Webhook服务器

配置文件:
 -独立模式: claw.config.js
 -Openclaw模式:通过Openclaw配置系统管理

快速开始:
1. npm run setup #配置插件
2. npm start #启动独立服务器
3.在Mixin开发者平台配置Webhook URL

 GitHub仓库: https://github.com/yourusername/openclaw-mixin
 `);
}

//显示版本信息
function showVersion() {
 const packageJson = require('./package.json');
 console.log(`
 Mixin Messenger插件
版本: ${packageJson.version}
作者: ${packageJson.author}
许可证: ${packageJson.license}
主页: ${packageJson.homepage}
 `);
}

//运行主函数
if (require.main === module) {
 main().catch(error => {
 console.error('❌插件启动失败:', error);
 process.exit(1);
 });
}

//导出插件类供Openclaw使用
module.exports = {
 MixinPlugin: require('./src/plugin'),
 config: require('./src/config'),
 utils: {
 logger: require('./src/utils/logger'),
 validator: require('./src/utils/messageValidator'),
 },
};