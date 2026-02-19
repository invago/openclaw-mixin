const axios = require('axios');
const { config } = require('../config');
const { defaultLogger } = require('../utils/logger');

class OpenclawClient {
 constructor() {
 this.baseUrl = config.openclaw.apiUrl;
 this.apiKey = config.openclaw.apiKey;
 this.logger = defaultLogger;

 this.axiosInstance = axios.create({
 baseURL: this.baseUrl,
 timeout: config.message.timeout,
 headers: {
 'Content-Type': 'application/json',
 'User-Agent': 'Mixin-Openclaw-Adapter/1.0',
 },
 });

 //如果有API密钥，添加到请求头
 if (this.apiKey) {
 this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${this.apiKey}`;
 }
 }

 /**
 *发送消息到Openclaw
 */
 async sendMessage(messageData, sessionContext = []) {
 try {
 //如果没有配置Openclaw API URL，使用模拟回复
 if (!this.baseUrl) {
 return this.getMockResponse(messageData, sessionContext);
 }

 const payload = this.buildPayload(messageData, sessionContext);
 this.logger.debug('发送到Openclaw的请求:', { payload });

 const response = await this.axiosInstance.post('/api/v1/messages', payload);
 this.logger.debug('Openclaw响应:', { response: response.data });

 return this.parseResponse(response.data);
 } catch (error) {
 this.logger.error('Openclaw API调用失败', error);

 //如果API调用失败，返回模拟回复
 return this.getMockResponse(messageData, sessionContext);
 }
 }

 /**
 *构建请求负载
 */
 buildPayload(messageData, sessionContext) {
 const { type, content, userId, conversationId } = messageData;

 return {
 message: {
 id: messageData.id || Date.now().toString(),
 type,
 content,
 userId,
 conversationId,
 timestamp: new Date().toISOString(),
 },
 context: sessionContext,
 options: {
 language: 'zh-CN',
 includeContext: true,
 maxTokens:1000,
 temperature:0.7,
 },
 };
 }

 /**
 *解析Openclaw响应
 */
 parseResponse(responseData) {
 //假设响应格式为 { success: true, data: { type: 'text', content: '...' } }
 if (responseData.success && responseData.data) {
 return responseData.data;
 }

 //如果响应格式不同，尝试其他解析方式
 if (responseData.type && responseData.content) {
 return responseData;
 }

 if (responseData.response) {
 return {
 type: 'text',
 content: responseData.response,
 };
 }

 //默认返回文本响应
 return {
 type: 'text',
 content: responseData.message || '收到消息',
 };
 }

 /**
 *获取模拟回复（用于开发测试）
 */
 getMockResponse(messageData, sessionContext) {
 const { type, content } = messageData;
 const contextLength = sessionContext.length;

 this.logger.debug('使用模拟Openclaw回复', {
 messageType: type,
 contentLength: content?.length ||0,
 contextLength,
 });

 //根据消息类型和上下文生成不同的回复
 const responses = {
 text: [
 `收到你的消息: "${content.substring(0,50)}${content.length >50 ? '...' : ''}"`,
 `已处理您的查询。上下文中有${contextLength}条历史消息。`,
 `👋我是Openclaw AI助手，正在为您服务。`,
 `分析完成:检测到关键词"${this.extractKeywords(content)}"`,
 `根据您的历史对话，我建议...`,
 ],
 image: [
 '已收到图片，正在分析中...',
 '图片分析完成，检测到相关物体。',
 '👀看到图片了，有什么需要帮助的吗？',
 ],
 file: [
 '文件已接收，正在处理...',
 '文件处理完成，可以开始分析了。',
 ],
 default: [
 '消息已收到，正在处理中。',
 '处理完成，请查看结果。',
 ],
 };

 const category = responses[type] ? type : 'default';
 const options = responses[category];

 //根据消息ID选择回复（确保一致性）
 const index = (messageData.id?.length ||0) % options.length;
 const baseResponse = options[index];

 //添加上下文感知
 if (contextLength >0) {
 return {
 type: 'text',
 content: `${baseResponse}\n\n（基于${contextLength}条历史对话）`,
 };
 }

 return {
 type: 'text',
 content: baseResponse,
 };
 }

 /**
 *提取关键词（简单实现）
 */
 extractKeywords(text) {
 if (!text || typeof text !== 'string') {
 return '消息';
 }

 const words = text.toLowerCase().split(/\s+/);
 const commonWords = ['的', '了', '在', '是', '我', '你', '他', '她', '它', '和', '与', '或'];

 //找出非常见词
 const keywords = words
 .filter(word => word.length >1 && !commonWords.includes(word))
 .slice(0,3);

 return keywords.length >0 ? keywords.join('、') : '重要信息';
 }

 /**
 *获取技能列表
 */
 async getSkills() {
 try {
 if (!this.baseUrl) {
 return this.getMockSkills();
 }

 const response = await this.axiosInstance.get('/api/v1/skills');
 return response.data;
 } catch (error) {
 this.logger.error('获取技能列表失败', error);
 return this.getMockSkills();
 }
 }

 /**
 *获取模拟技能列表
 */
 getMockSkills() {
 return {
 success: true,
 data: [
 { id: 'weather', name: '天气查询', description: '查询城市天气情况' },
 { id: 'calculator', name: '计算器', description: '数学计算和单位转换' },
 { id: 'translator', name: '翻译器', description: '多语言翻译' },
 { id: 'news', name: '新闻摘要', description: '获取最新新闻摘要' },
 { id: 'reminder', name: '提醒设置', description: '设置定时提醒' },
 ],
 };
 }

 /**
 *调用特定技能
 */
 async invokeSkill(skillId, parameters, sessionContext = []) {
 try {
 if (!this.baseUrl) {
 return this.getMockSkillResponse(skillId, parameters);
 }

 const payload = {
 skillId,
 parameters,
 context: sessionContext,
 };

 const response = await this.axiosInstance.post('/api/v1/skills/invoke', payload);
 return response.data;
 } catch (error) {
 this.logger.error('调用技能失败', error);
 return this.getMockSkillResponse(skillId, parameters);
 }
 }

 /**
 *获取模拟技能响应
 */
 getMockSkillResponse(skillId, parameters) {
 const mockResponses = {
 weather: {
 type: 'text',
 content: `查询${parameters?.city || '北京'}的天气：晴，25°C，湿度60%`,
 },
 calculator: {
 type: 'text',
 content: `计算结果：${parameters?.expression || '1+1'} =2`,
 },
 translator: {
 type: 'text',
 content: `翻译"${parameters?.text || '你好'}"到${parameters?.targetLang || '英语'}：Hello`,
 },
 news: {
 type: 'text',
 content: '今日新闻摘要：AI技术取得新突破...',
 },
 reminder: {
 type: 'text',
 content: `提醒已设置：${parameters?.time || '1小时后'}提醒${parameters?.task || '完成任务'}`,
 },
 default: {
 type: 'text',
 content: `技能"${skillId}"执行完成，参数：${JSON.stringify(parameters)}`,
 },
 };

 return mockResponses[skillId] || mockResponses.default;
 }

 /**
 *健康检查
 */
 async healthCheck() {
 try {
 if (!this.baseUrl) {
 return { status: 'mock_mode', healthy: true };
 }

 const response = await this.axiosInstance.get('/health');
 return response.data;
 } catch (error) {
 this.logger.error('Openclaw健康检查失败', error);
 return { status: 'unreachable', healthy: false, error: error.message };
 }
 }
}

module.exports = new OpenclawClient();