/**
 *消息过滤器
 *实现类似feishu-openclaw的"低打扰"模式
 */

class MessageFilter {
 constructor(options = {}) {
 //配置选项
 this.config = {
 //群组中是否需要@才回复
 requireMentionInGroup: options.requireMentionInGroup !== false,

 //触发词列表
 triggerWords: options.triggerWords || [
 '帮', '请', '分析', '总结', '写', '生成', '创建',
 'help', 'please', 'analyze', 'summarize', 'write', 'generate', 'create',
 ],

 //问题标记
 questionMarks: ['?', '？'],

 //机器人名称（用于检测是否被@）
 botNames: options.botNames || ['bot', '助手', 'assistant', 'claw', 'openclaw'],

 //忽略的消息类型
 ignoredTypes: options.ignoredTypes || ['system', 'recall'],

 //最大消息长度（防止超长消息攻击）
 maxMessageLength: options.maxMessageLength ||10000,

 //最小消息长度
 minMessageLength: options.minMessageLength ||1,

 ...options,
 };

 //统计信息
 this.stats = {
 totalMessages:0,
 filteredMessages:0,
 allowedMessages:0,
 };
 }

 /**
*检查是否应该处理这条消息
 */
 shouldProcess(message, context = {}) {
 const { isGroup, isMentioned, text, messageType, sender } = message;

 this.stats.totalMessages++;

 //1.检查消息类型
 if (this.config.ignoredTypes.includes(messageType)) {
 this.debug('忽略:消息类型在忽略列表中', { messageType });
 return false;
 }

 //2.检查消息长度
 if (!text || text.length < this.config.minMessageLength) {
 this.debug('忽略:消息太短', { length: text?.length });
 return false;
 }

 if (text.length > this.config.maxMessageLength) {
 this.debug('忽略:消息超过最大长度', { length: text.length });
 return false;
 }

 //3.私聊消息 -总是处理
 if (!isGroup) {
 this.stats.allowedMessages++;
 return true;
 }

 //4.群组消息 -应用"低打扰"规则

 //4.1如果被明确@，则处理
 if (isMentioned) {
 this.debug('允许:被@提及');
 this.stats.allowedMessages++;
 return true;
 }

 //4.2如果包含问号，可能是问题
 if (this.hasQuestionMark(text)) {
 this.debug('允许:检测到问题标记');
 this.stats.allowedMessages++;
 return true;
 }

 //4.3如果包含触发词
 if (this.hasTriggerWord(text)) {
 this.debug('允许:检测到触发词');
 this.stats.allowedMessages++;
 return true;
 }

 //4.4如果提到机器人名字
 if (this.isCallingBot(text)) {
 this.debug('允许:提到机器人名字');
 this.stats.allowedMessages++;
 return true;
 }

 //4.5如果配置了需要@但没被@，则忽略
 if (this.config.requireMentionInGroup) {
 this.debug('忽略:群组中未被@且未触发其他条件');
 this.stats.filteredMessages++;
 return false;
 }

 //默认允许
 this.stats.allowedMessages++;
 return true;
 }

 /**
*检查是否包含问号
 */
 hasQuestionMark(text) {
 return this.config.questionMarks.some(mark => text.includes(mark));
 }

 /**
*检查是否包含触发词
 */
 hasTriggerWord(text) {
 const lowerText = text.toLowerCase();
 return this.config.triggerWords.some(word =>
 lowerText.includes(word.toLowerCase())
 );
 }

 /**
*检查是否在呼叫机器人
 */
 isCallingBot(text) {
 const lowerText = text.toLowerCase();
 return this.config.botNames.some(name =>
 lowerText.includes(name.toLowerCase())
 );
 }

 /**
*提取干净的文本（移除@提及等）
 */
 extractCleanText(text, botId) {
 let cleanText = text;

 //移除@机器人的部分
 if (botId) {
 const mentionPattern = new RegExp(`@${botId}\\s*`, 'gi');
 cleanText = cleanText.replace(mentionPattern, '');
 }

 //移除通用的@提及
 cleanText = cleanText.replace(/@\w+\s*/g, '');

 //清理多余空格
 cleanText = cleanText.trim().replace(/\s+/g, ' ');

 return cleanText;
 }

 /**
*获取统计信息
 */
 getStats() {
 return {
 ...this.stats,
 filterRate: this.stats.totalMessages >0
 ? ((this.stats.filteredMessages / this.stats.totalMessages) *100).toFixed(2) + '%'
 : '0%',
 };
 }

 /**
*重置统计
 */
 resetStats() {
 this.stats = {
 totalMessages:0,
 filteredMessages:0,
 allowedMessages:0,
 };
 }

 /**
*调试日志
 */
 debug(message, meta = {}) {
 if (process.env.OPENCLAW_DEBUG === 'true') {
 console.log(`[MessageFilter] ${message}`, meta);
 }
 }
}

//便捷函数：快速检查
function quickCheck(text, isGroup = false, isMentioned = false) {
 const filter = new MessageFilter();
 return filter.shouldProcess({
 text,
 isGroup,
 isMentioned,
 messageType: 'text',
 });
}

module.exports = {
 MessageFilter,
 quickCheck,
};