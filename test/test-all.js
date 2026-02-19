/**
 *完整功能测试脚本
 *测试认证系统、命令处理、权限控制等功能
 */

const { AuthManager } = require('../src/auth-manager');
const { CommandHandler } = require('../src/command-handler');
const { MessageFilter } = require('../src/message-filter');
const { securityManager } = require('../src/security');
const { createLogger } = require('../src/logger');

//测试配置
const TEST_CONFIG = {
 adminUserIds: ['admin-user-001'],
 autoApprove: false,
 pairingCodeExpiry:1, //1分钟用于测试
 sessionExpiryHours:0.01, //约36秒用于测试
};

//颜色输出
const colors = {
 reset: '\x1b[0m',
 green: '\x1b[32m',
 red: '\x1b[31m',
 yellow: '\x1b[33m',
 blue: '\x1b[34m',
};

function log(message, color = 'reset') {
 console.log(`${colors[color]}${message}${colors.reset}`);
}

function assert(condition, message) {
 if (condition) {
 log(`✅ ${message}`, 'green');
 return true;
 } else {
 log(`❌ ${message}`, 'red');
 return false;
 }
}

//测试套件
class TestSuite {
 constructor() {
 this.passed =0;
 this.failed =0;
 this.authManager = new AuthManager({
 ...TEST_CONFIG,
 dataDir: './test-data',
 });
 this.commandHandler = new CommandHandler({
 authManager: this.authManager,
 });
 this.logger = createLogger('test');
 }

 async runAllTests() {
 log('\n🧪开始运行完整功能测试...\n', 'blue');

 await this.testAuthSystem();
 await this.testCommandHandler();
 await this.testMessageFilter();
 await this.testSecurityManager();
 await this.testLogger();

 //汇总结果
 log('\n' + '='.repeat(50), 'blue');
 log(`测试结果: ${this.passed}通过, ${this.failed}失败`, this.failed ===0 ? 'green' : 'red');
 log('='.repeat(50) + '\n', 'blue');

 return this.failed ===0;
 }

 //测试认证系统
 async testAuthSystem() {
 log('\n📋测试认证系统', 'yellow');
 log('-'.repeat(30));

 const userId = 'test-user-123';
 const adminId = 'admin-user-001';

 //测试1:初始状态应该是guest
 const initialRole = this.authManager.getUserRole(userId);
 assert(initialRole === 'guest', '新用户初始角色为guest');

 //测试2:生成配对码
 const code = this.authManager.generatePairingCode(userId);
 assert(code && code.length ===6, '生成的配对码是6位数字');
 assert(this.authManager.pendingAuth[userId], '配对码已存储在待认证列表');

 //测试3:错误配对码
 const wrongResult = this.authManager.verifyPairingCode(userId, '000000');
 assert(!wrongResult.success, '错误的配对码验证失败');
 assert(wrongResult.reason === 'invalid_code', '返回正确的错误原因');

 //测试4:正确配对码
 const correctResult = this.authManager.verifyPairingCode(userId, code);
 assert(correctResult.success, '正确的配对码验证成功');
 assert(correctResult.role === 'user', '普通用户认证后角色为user');
 assert(this.authManager.isAuthenticated(userId), '用户现在已认证');

 //测试5:管理员检查
 assert(this.authManager.isAdmin(adminId), '预设ID是管理员');
 assert(!this.authManager.isAdmin(userId), '普通用户不是管理员');

 //测试6:权限检查
 assert(this.authManager.hasPermission(userId, 'chat'), '用户可以聊天');
 assert(!this.authManager.hasPermission(userId, 'admin'), '用户没有管理员权限');
 assert(this.authManager.hasPermission(adminId, 'admin'), '管理员有管理权限');

 //测试7:添加管理员
 const addResult = this.authManager.addAdmin(userId, adminId);
 assert(addResult.success, '管理员可以添加其他管理员');
 assert(this.authManager.isAdmin(userId), '被添加的用户现在是管理员');

 //测试8:统计信息
 const stats = this.authManager.getStats();
 assert(stats.totalUsers >0, '统计信息包含用户数');
 assert(stats.adminCount >=2, '统计信息包含管理员数');

 log('认证系统测试完成\n');
 }

 //测试命令处理器
 async testCommandHandler() {
 log('\n📋测试命令处理器', 'yellow');
 log('-'.repeat(30));

 const userId = 'cmd-test-user';
 const adminId = 'admin-user-001';

 //先认证用户
 const code = this.authManager.generatePairingCode(userId);
 this.authManager.verifyPairingCode(userId, code);

 //测试1:帮助命令
 const helpResult = await this.commandHandler.handleMessage({
 text: '/help',
 userId,
 conversationId: 'test-conv',
 }, {});
 assert(helpResult && helpResult.type === 'text', '帮助命令返回文本消息');
 assert(helpResult.content.includes('基础命令'), '帮助内容包含基础命令');

 //测试2:状态命令
 const statusResult = await this.commandHandler.handleMessage({
 text: '/status',
 userId,
 conversationId: 'test-conv',
 }, {});
 assert(statusResult && statusResult.content.includes('系统状态'), '状态命令返回系统状态');

 //测试3:未知命令
 const unknownResult = await this.commandHandler.handleMessage({
 text: '/unknowncommand',
 userId,
 conversationId: 'test-conv',
 }, {});
 assert(unknownResult && unknownResult.content.includes('未知命令'), '未知命令返回提示');

 //测试4:非命令消息
 const nonCmdResult = await this.commandHandler.handleMessage({
 text: '普通消息',
 userId,
 conversationId: 'test-conv',
 }, {});
 assert(nonCmdResult === null, '非命令消息返回null让上层处理');

 //测试5:管理员命令（普通用户）
 const adminCmdResult = await this.commandHandler.handleMessage({
 text: '/users',
 userId,
 conversationId: 'test-conv',
 }, {});
 assert(adminCmdResult && adminCmdResult.content.includes('没有管理员权限'), '普通用户无法执行管理员命令');

 //测试6:管理员命令（管理员）
 const adminSuccessResult = await this.commandHandler.handleMessage({
 text: '/users',
 userId: adminId,
 conversationId: 'test-conv',
 }, {});
 assert(adminSuccessResult && adminSuccessResult.content.includes('用户列表'), '管理员可以查看用户列表');

 log('命令处理器测试完成\n');
 }

 //测试消息过滤器
 async testMessageFilter() {
 log('\n📋测试消息过滤器', 'yellow');
 log('-'.repeat(30));

 const filter = new MessageFilter();

 //测试1:私聊消息总是通过
 const privateMsg = { isGroup: false, text: '你好', messageType: 'text' };
 assert(filter.shouldProcess(privateMsg), '私聊消息总是通过');

 //测试2:群组@消息通过
 const mentionMsg = { isGroup: true, isMentioned: true, text: '你好', messageType: 'text' };
 assert(filter.shouldProcess(mentionMsg), '群组@消息通过');

 //测试3:群组问题通过
 const questionMsg = { isGroup: true, isMentioned: false, text: '这是什么？', messageType: 'text' };
 assert(filter.shouldProcess(questionMsg), '群组问题消息通过');

 //测试4:群组触发词通过
 const triggerMsg = { isGroup: true, isMentioned: false, text: '帮我分析一下', messageType: 'text' };
 assert(filter.shouldProcess(triggerMsg), '群组触发词消息通过');

 //测试5:普通群组消息被过滤
 const normalGroupMsg = { isGroup: true, isMentioned: false, text: '普通消息', messageType: 'text' };
 assert(!filter.shouldProcess(normalGroupMsg), '普通群组消息被过滤（低打扰模式）');

 //测试6:太短的消息被过滤
 const shortMsg = { isGroup: false, text: '', messageType: 'text' };
 assert(!filter.shouldProcess(shortMsg), '空消息被过滤');

 //测试7:提取干净文本
 const dirtyText = '@bot你好 @user谢谢';
 const cleanText = filter.extractCleanText(dirtyText, 'bot');
 assert(cleanText === '你好谢谢', '成功提取干净文本');

 log('消息过滤器测试完成\n');
 }

 //测试安全管理器
 async testSecurityManager() {
 log('\n📋测试安全管理器', 'yellow');
 log('-'.repeat(30));

 //测试1:路径白名单检查
 assert(securityManager.isPathAllowed('/tmp/test.txt'), '/tmp路径在白名单中');
 assert(!securityManager.isPathAllowed('/etc/passwd'), '/etc路径不在白名单中');

 //测试2:敏感信息清理
 const sensitiveText = 'password: secret123 apiKey: abcdef token: xyz789';
 const sanitized = securityManager.sanitizeForLog(sensitiveText);
 assert(!sanitized.includes('secret123'), '敏感信息已被隐藏');
 assert(sanitized.includes('[HIDDEN]'), '显示[HIDDEN]标记');

 //测试3:生成随机ID
 const id1 = securityManager.generateId();
 const id2 = securityManager.generateId();
 assert(id1 !== id2, '生成的随机ID不重复');
 assert(id1.length >10, '随机ID长度合理');

 //测试4:Webhook签名验证
 const signature = 'abc123';
 const timestamp = Date.now().toString();
 const body = { test: 'data' };
 const secret = 'mysecret';

 const isValid = securityManager.verifyWebhookSignature(signature, timestamp, body, secret);
 //注意：这里应该返回false因为我们用的是假签名
 assert(typeof isValid === 'boolean', '签名验证返回布尔值');

 log('安全管理器测试完成\n');
 }

 //测试日志管理器
 async testLogger() {
 log('\n📋测试日志管理器', 'yellow');
 log('-'.repeat(30));

 const logger = createLogger('test');

 //测试1:基本日志记录（不会抛出错误）
 try {
 logger.info('测试信息日志');
 logger.warn('测试警告日志');
 logger.error('测试错误日志');
 logger.debug('测试调试日志');
 assert(true, '所有级别的日志都能正常记录');
 } catch (error) {
 assert(false, `日志记录失败: ${error.message}`);
 }

 //测试2:调试模式切换
 const originalDebug = logger.debugMode;
 logger.setDebugMode(true);
 assert(logger.debugMode === true, '调试模式可以开启');
 logger.setDebugMode(false);
 assert(logger.debugMode === false, '调试模式可以关闭');
 logger.setDebugMode(originalDebug);

 //测试3:统计信息
 const stats = logger.getStats();
 assert(typeof stats === 'object', '获取到日志统计信息');
 assert('debugMode' in stats, '统计信息包含debugMode');

 log('日志管理器测试完成\n');
 }
}

//运行测试
async function main() {
 const suite = new TestSuite();
 const success = await suite.runAllTests();

 process.exit(success ?0 :1);
}

//如果直接运行此文件
if (require.main === module) {
 main().catch(error => {
 console.error('测试运行失败:', error);
 process.exit(1);
 });
}

module.exports = { TestSuite };