class Message {
 constructor({
 id,
 conversation_id,
 user_id,
 category,
 data,
 message_id,
 created_at,
 }) {
 this.id = id;
 this.conversation_id = conversation_id;
 this.user_id = user_id;
 this.category = category;
 this.data = data;
 this.message_id = message_id;
 this.created_at = created_at || new Date().toISOString();
 }

 /**
 *从Mixin Webhook数据解析消息
 */
 static fromMixinWebhook(webhookData) {
 const { data } = webhookData;
 const messageData = data.data;

 return new Message({
 id: data.message_id,
 conversation_id: data.conversation_id,
 user_id: data.user_id,
 category: data.category,
 data: messageData,
 message_id: data.message_id,
 created_at: data.created_at,
 });
 }

 /**
 *获取消息文本内容
 */
 getTextContent() {
 if (this.category === 'PLAIN_TEXT') {
 try {
 return Buffer.from(this.data, 'base64').toString('utf-8');
 } catch (error) {
 console.error('解码文本消息失败:', error);
 return '';
 }
 }
 return null;
 }

 /**
 *获取图片消息信息
 */
 getImageInfo() {
 if (this.category === 'PLAIN_IMAGE') {
 try {
 const dataStr = Buffer.from(this.data, 'base64').toString('utf-8');
 return JSON.parse(dataStr);
 } catch (error) {
 console.error('解析图片消息失败:', error);
 return null;
 }
 }
 return null;
 }

 /**
 *转换为Openclaw消息格式
 */
 toOpenclawFormat() {
 const baseMessage = {
 id: this.id,
 userId: this.user_id,
 conversationId: this.conversation_id,
 timestamp: this.created_at,
 };

 switch (this.category) {
 case 'PLAIN_TEXT':
 return {
 ...baseMessage,
 type: 'text',
 content: this.getTextContent(),
 };

 case 'PLAIN_IMAGE':
 const imageInfo = this.getImageInfo();
 return {
 ...baseMessage,
 type: 'image',
 content: imageInfo?.url || '',
 thumbnail: imageInfo?.thumbnail || '',
 };

 case 'PLAIN_DATA':
 return {
 ...baseMessage,
 type: 'file',
 content: this.data,
 };

 case 'PLAIN_STICKER':
 return {
 ...baseMessage,
 type: 'sticker',
 content: this.data,
 };

 default:
 return {
 ...baseMessage,
 type: 'unknown',
 content: this.data,
 };
 }
 }

 /**
 *转换为Mixin消息格式
 */
 static toMixinFormat(openclawResponse, conversationId) {
 const { type, content, thumbnail } = openclawResponse;

 switch (type) {
 case 'text':
 return {
 conversation_id: conversationId,
 category: 'PLAIN_TEXT',
 data: Buffer.from(content).toString('base64'),
 };

 case 'image':
 return {
 conversation_id: conversationId,
 category: 'PLAIN_IMAGE',
 data: Buffer.from(JSON.stringify({
 url: content,
 thumbnail: thumbnail || '',
 })).toString('base64'),
 };

 case 'file':
 return {
 conversation_id: conversationId,
 category: 'PLAIN_DATA',
 data: content,
 };

 default:
 return {
 conversation_id: conversationId,
 category: 'PLAIN_TEXT',
 data: Buffer.from(`[${type}消息] ${content}`).toString('base64'),
 };
 }
 }
}

module.exports = Message;