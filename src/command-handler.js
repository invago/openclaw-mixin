/**
 *命令处理器
 *处理用户命令，包括普通命令和管理员命令
 */

const { getAuthManager } = require('./auth-manager');

class CommandHandler {
 constructor(options = {}) {
 this.authManager = options.authManager || getAuthManager();
 this.logger = options.logger || console;

 //命令前缀
 this.prefix = '/';

 //注册命令
 this.commands = new Map([
 //普通命令
 ['help', this.handleHelp.bind(this)],
 ['start', this.handleStart.bind(this)],
 ['auth', this.handleAuth.bind(this)],
 ['status', this.handleStatus.bind(this)],

 //管理员命令
 ['admin', this.handleAdmin.bind(this)],
 ['users', this.handleUsers.bind(this)],
 ['broadcast', this.handleBroadcast.bind(this)],
 ['stats', this.handleStats.bind(this)],
 ]);
 }

 /**
*解析命令
 */
 parseCommand(text) {
 if (!text || !text.startsWith(this.prefix)) {
 return null;
 }

 const parts = text.slice(1).trim().split(/\s+/);
 const command = parts[0].toLowerCase();
 const args = parts.slice(1);

 return { command, args, raw: text };
 }

 /**
*处理消息（检查是否为命令）
 */
 async handleMessage(message, context = {}) {
 const { text, userId, conversationId } = message;

 const parsed = this.parseCommand(text);
 if (!parsed) {
 return null; //不是命令，返回null让上层处理
 }

 const { command, args } = parsed;

 this.logger.info(`[Command]用户 ${userId}执行命令: ${command}`);

 //获取命令处理器
 const handler = this.commands.get(command);
 if (!handler) {
 return {
 type: 'text',
 content: `未知命令: ${command}\n发送 /help查看可用命令`,
 };
 }

 //执行命令
 try {
 const result = await handler(userId, args, context);
 return result;
 } catch (error) {
 this.logger.error(`[Command]命令执行失败: ${command}`, error);
 return {
 type: 'text',
 content: '命令执行失败，请稍后重试。',
 };
 }
 }

 /**
*帮助命令
 */
 async handleHelp(userId, args, context) {
 const role = this.authManager.getUserRole(userId);

 let helpText = `🤖 **Mixin Openclaw助手**\\n\\n`;
 helpText += `**基础命令:**\\n`;
 helpText += `/start -开始使用\\n`;
 helpText += `/help -显示帮助\\n`;
 helpText += `/status -查看状态\\n`;

 if (role === 'guest') {
 helpText += `\\n⚠️您尚未认证，请发送 /auth进行认证`;
 } else {
 helpText += `\\n**已认证用户命令:**\\n`;
 helpText += `直接发送消息即可与AI对话\\n`;
 }

 if (role === 'admin') {
 helpText += `\\n**管理员命令:**\\n`;
 helpText += `/admin <add|remove> <userId> -管理管理员\\n`;
 helpText += `/users -查看用户列表\\n`;
 helpText += `/stats -查看统计信息\\n`;
 helpText += `/broadcast <message> -广播消息\\n`;
 }

 return { type: 'text', content: helpText };
 }

 /**
*开始命令
 */
 async handleStart(userId, args, context) {
 const isAuthenticated = this.authManager.isAuthenticated(userId);

 if (isAuthenticated) {
 return {
 type: 'text',
 content: `欢迎回来！您已认证，可以直接发送消息与AI对话。\\n\\n发送 /help查看所有命令。`,
 };
 }

 //生成配对码
 const code = this.authManager.generatePairingCode(userId);

 return {
 type: 'text',
 content: `欢迎使用 Mixin Openclaw助手！\\n\\n` +
 `您的配对码是: **${code}**\\n\\n` +
 `请在 ${this.authManager.config.pairingCodeExpiry}分钟内发送 /auth <配对码>完成认证。\\n\\n` +
 `例如: /auth ${code}`,
 };
 }

 /**
*认证命令
 */
 async handleAuth(userId, args, context) {
 if (args.length ===0) {
 //检查是否有待处理的认证
 const pending = this.authManager.pendingAuth[userId];
 if (pending) {
 return {
 type: 'text',
 content: `您有待处理的认证请求。\\n请输入: /auth <配对码>\\n\\n` +
 `或者发送 /start重新生成配对码。`,
 };
 }

 //没有待处理认证，引导用户开始
 return this.handleStart(userId, args, context);
 }

 const code = args[0];
 const result = this.authManager.verifyPairingCode(userId, code);

 if (result.success) {
 const roleText = result.role === 'admin' ? '管理员' : '普通用户';
 return {
 type: 'text',
 content: `✅认证成功！\\n\\n` +
 `您的角色: ${roleText}\\n` +
 `现在可以直接发送消息与AI对话了。`,
 };
 }

 //认证失败
 switch (result.reason) {
 case 'no_pending_auth':
 return {
 type: 'text',
 content: `❌没有找到待处理的认证请求。\\n请先发送 /start生成配对码。`,
 };
 case 'expired':
 return {
 type: 'text',
 content: `❌配对码已过期。\\n请发送 /start重新生成配对码。`,
 };
 case 'too_many_attempts':
 return {
 type: 'text',
 content: `❌尝试次数过多，配对码已失效。\\n请发送 /start重新生成配对码。`,
 };
 case 'invalid_code':
 return {
 type: 'text',
 content: `❌配对码错误。\\n还剩 ${result.remainingAttempts}次尝试机会。`,
 };
 default:
 return {
 type: 'text',
 content: `❌认证失败: ${result.reason}`,
 };
 }
 }

 /**
*状态命令
 */
 async handleStatus(userId, args, context) {
 const role = this.authManager.getUserRole(userId);
 const stats = this.authManager.getStats();

 let statusText = `📊 **系统状态**\\n\\n`;
 statusText += `您的角色: ${role}\\n`;
 statusText += `认证状态: ${role !== 'guest' ? '✅已认证' : '❌未认证'}\\n\\n`;
 statusText += `系统统计:\\n`;
 statusText += `-总用户数: ${stats.totalUsers}\\n`;
 statusText += `-活跃用户: ${stats.activeUsers}\\n`;
 statusText += `-在线会话: ${stats.activeSessions}\\n`;

 if (role === 'admin') {
 statusText += `\\n管理员信息:\\n`;
 statusText += `-管理员数量: ${stats.adminCount}\\n`;
 statusText += `-待认证请求: ${stats.pendingAuth}\\n`;
 }

 return { type: 'text', content: statusText };
 }

 /**
*管理员命令
 */
 async handleAdmin(userId, args, context) {
 //检查权限
 if (!this.authManager.isAdmin(userId)) {
 return { type: 'text', content: '❌您没有管理员权限。' };
 }

 if (args.length <2) {
 return {
 type: 'text',
 content: `用法: /admin <add|remove> <userId>\\n\\n` +
 `示例: /admin add123456789`,
 };
 }

 const action = args[0].toLowerCase();
 const targetUserId = args[1];

 if (action === 'add') {
 const result = this.authManager.addAdmin(targetUserId, userId);
 if (result.success) {
 return { type: 'text', content: `✅已将用户 ${targetUserId}添加为管理员。` };
 } else {
 return { type: 'text', content: `❌操作失败: ${result.reason}` };
 }
 } else if (action === 'remove') {
 const result = this.authManager.removeAdmin(targetUserId, userId);
 if (result.success) {
 return { type: 'text', content: `✅已移除用户 ${targetUserId}的管理员权限。` };
 } else {
 return { type: 'text', content: `❌操作失败: ${result.reason}` };
 }
 }

 return { type: 'text', content: '❌未知操作，请使用 add或 remove。' };
 }

 /**
*用户列表命令
 */
 async handleUsers(userId, args, context) {
 if (!this.authManager.isAdmin(userId)) {
 return { type: 'text', content: '❌您没有管理员权限。' };
 }

 const users = Object.values(this.authManager.users);

 if (users.length ===0) {
 return { type: 'text', content: '暂无用户数据。' };
 }

 let listText = `👥 **用户列表** (${users.length}人)\\n\\n`;

 users.forEach((user, index) => {
 const role = user.role === 'admin' ? '👑' : '👤';
 const status = user.status === 'active' ? '✅' : '❌';
 listText += `${index +1}. ${role} ${user.userId.substring(0,8)}... ${status}\\n`;
 });

 return { type: 'text', content: listText };
 }

 /**
*统计命令
 */
 async handleStats(userId, args, context) {
 if (!this.authManager.isAdmin(userId)) {
 return { type: 'text', content: '❌您没有管理员权限。' };
 }

 const stats = this.authManager.getStats();

 let statsText = `📈 **详细统计**\\n\\n`;
 statsText += `用户统计:\\n`;
 statsText += `-总用户数: ${stats.totalUsers}\\n`;
 statsText += `-活跃用户: ${stats.activeUsers}\\n`;
 statsText += `-管理员数: ${stats.adminCount}\\n\\n`;
 statsText += `认证统计:\\n`;
 statsText += `-待认证请求: ${stats.pendingAuth}\\n`;
 statsText += `-活跃会话: ${stats.activeSessions}\\n`;

 return { type: 'text', content: statsText };
 }

 /**
*广播命令
 */
 async handleBroadcast(userId, args, context) {
 if (!this.authManager.isAdmin(userId)) {
 return { type: 'text', content: '❌您没有管理员权限。' };
 }

 if (args.length ===0) {
 return { type: 'text', content: '用法: /broadcast <消息内容>' };
 }

 const message = args.join(' ');

 //这里应该调用广播功能
 //暂时返回提示
 return {
 type: 'text',
 content: `📢广播消息已准备:\\n\\n${message}\\n\\n` +
 `(注意:广播功能需要配合消息发送模块实现)`,
 };
 }
}

module.exports = {
 CommandHandler,
};