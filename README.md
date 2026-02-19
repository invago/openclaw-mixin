# Openclaw Mixin通道插件

作为**Openclaw的通道适配器**，将Mixin Messenger集成到Openclaw中。用户可以通过Mixin Messenger与Openclaw AI助手对话，就像使用飞书、Telegram等其他通道一样。

##架构说明

本插件作为**消息通道桥梁**，工作流程如下：

```
Mixin用户发送消息
    ↓
Mixin服务器 → Webhook →本插件
    ↓
通过WebSocket转发给Openclaw Gateway
    ↓
Openclaw Agent处理AI逻辑
    ↓
Agent回复通过WebSocket返回
    ↓
本插件发送回复到Mixin
    ↓
Mixin用户收到AI回复
```

**注意**：本插件不处理AI逻辑，只负责消息传递。所有AI处理能力由Openclaw提供。

##特性

- ✅作为Openclaw通道适配器运行
- ✅接收Mixin Messenger消息（Webhook）
- ✅通过WebSocket与Openclaw Gateway通信
- ✅支持文本、图片、文件等多种消息类型
- ✅自动重连和错误处理
- ✅健康检查和状态监控
- ✅**用户认证与权限管理系统**
 -配对码认证流程
 -管理员/普通用户角色区分
 -群组消息智能过滤（低打扰模式）
 -管理员命令（/admin, /users, /broadcast等）
- 🔄多租户支持（待开发）

##安装方式

###1.作为Openclaw插件安装

```bash
#在Openclaw项目目录中
npm install openclaw-mixin

#或使用GitHub直接安装
npm install invago/openclaw-mixin
```

###2.独立运行模式

```bash
#克隆仓库
git clone https://github.com/yourusername/openclaw-mixin.git
cd openclaw-mixin

#安装依赖
npm install

#运行配置向导
npm run setup

#启动服务器
npm start
```

##快速开始

###1.配置环境

```bash
#运行交互式配置
npm run setup

#或手动创建.env文件
cp .env.example .env
#编辑.env文件填写您的Mixin应用信息
```

###2.启动服务

```bash
#开发模式
npm run dev

#独立模式
npm start

#作为Openclaw插件
npm run plugin
```

###3.配置Mixin Webhook

1.访问[Mixin开发者平台](https://developers.mixin.one/dashboard)
2.在您的应用中配置Webhook URL：
 ```
 http://your-server.com:3000/webhook/mixin
 ```
3.使用ngrok进行本地测试：
 ```bash
 ngrok http3000
 #配置Webhook URL为：https://xxxx-xx-xx-xx-xx.ngrok.io/webhook/mixin
 ```

##配置说明

###必需的环境变量

```bash
# Mixin应用配置
MIXIN_APP_ID=your_mixin_app_id
MIXIN_SESSION_ID=your_mixin_session_id
MIXIN_SESSION_PRIVATE_KEY=your_session_private_key_base64

#服务器配置
PORT=3000
NODE_ENV=development
WEBHOOK_SECRET=your_webhook_secret

# Redis配置（可选）
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

###可选配置

```bash
# Openclaw API配置（待集成）
OPENCLAW_API_URL=https://api.openclaw.example.com
OPENCLAW_API_KEY=your_openclaw_api_key

#安全配置
JWT_SECRET=your_jwt_secret_key
ADMIN_API_KEY=your_admin_api_key
```

##API端点

### Webhook端点
- `POST /webhook/mixin` -接收Mixin消息
- `GET /webhook/verify` - Webhook验证

###管理端点
- `GET /health` -健康检查
- `GET /info` -插件信息
- `GET /message/{id}/status` -消息状态查询

###根端点
- `GET /` -服务信息

##消息处理流程

```
用户消息 → Mixin服务器 → Webhook →插件 → Openclaw API →回复 → Mixin用户
```

###支持的消息类型

- `PLAIN_TEXT` -文本消息
- `PLAIN_IMAGE` -图片消息
- `PLAIN_DATA` -文件消息
- `PLAIN_STICKER` -贴纸消息
- `PLAIN_CONTACT` -联系人消息
- `PLAIN_LOCATION` -位置消息

###命令系统

- `/help` -显示帮助信息
- `/clear` -清空当前会话
- `/status` -查看当前状态
- `/settings` -管理设置

##部署

### Docker部署

```bash
#构建镜像
docker build -t openclaw-mixin .

#运行容器
docker run -p3000:3000 \
 -e MIXIN_APP_ID=your_app_id \
 -e MIXIN_SESSION_ID=your_session_id \
 -e MIXIN_SESSION_PRIVATE_KEY=your_private_key \
 openclaw-mixin
```

### Docker Compose部署

```yaml
version:'3.8'
services:
 mixin-plugin:
 build:.
 ports:
 -"3000:3000"
 environment:
 - MIXIN_APP_ID=${MIXIN_APP_ID}
 - MIXIN_SESSION_ID=${MIXIN_SESSION_ID}
 - MIXIN_SESSION_PRIVATE_KEY=${MIXIN_SESSION_PRIVATE_KEY}
```

##开发指南

###项目结构

```
openclaw-mixin/
├── src/
│ ├── config/ #配置管理
│ ├── controllers/ #控制器
│ ├── middleware/ #中间件
│ ├── models/ #数据模型
│ ├── services/ #业务服务
│ ├── utils/ #工具函数
│ ├── plugin.js #插件主类
│ ├── standalone.js #独立服务器
│ └── index.js #旧入口（兼容）
├── scripts/
│ └── setup.js #初始化脚本
├── test/
│ └── mock-webhook.js #测试工具
├── index.js #主入口
├── claw.config.js #插件配置
├── package.json
├── README.md
└── LICENSE
```

###添加新功能

1. **添加新的消息处理器**：
 -在`src/services/MessageProcessor.js`中添加处理方法
 -在`messageHandlers`映射中注册

2. **添加新的API端点**：
 -创建新的控制器方法
 -在`src/routes/`中添加路由定义

3. **集成Openclaw API**：
 -修改`src/services/OpenclawClient.js`中的API调用逻辑

###测试

```bash
#运行模拟测试
npm run test:webhook

#发送单个测试消息
npm run test:single -- "测试消息"

#发送图片测试
npm run test:image -- "https://example.com/image.jpg"
```

##故障排除

###常见问题

1. **Webhook签名验证失败**
 -检查`.env`中的`WEBHOOK_SECRET`配置
 -确保Mixin后台配置的Webhook URL正确

2. **Redis连接失败**
 -检查Redis服务是否运行
 -验证Redis配置信息

##贡献指南

1. Fork项目
2.创建功能分支
3.提交更改
4.推送分支
5.创建Pull Request

##许可证

MIT许可证-详见[LICENSE](LICENSE)文件

##联系方式

-作者：invago
-邮箱：invago@cnawake.com
- GitHub：[invago](https://github.com/invago)

##致谢

-感谢[Openclaw](https://clawd.org.cn)项目
-参考了飞书和Telegram插件的实现方式
-基于Node.js和Express构建

##功能特性

- ✅接收Mixin Messenger消息
- ✅文本消息处理
- ✅图片消息处理
- ✅会话管理（Redis支持）
- ✅命令系统（/help, /clear, /status等）
- ✅健康检查端点
- 🔄 Openclaw API集成（开发中）
- 🔄用户认证系统
- 🔄多租户支持

##快速开始

###1.环境准备

```bash
#安装Node.js（版本18+）
#安装Redis（用于会话管理）
```

###2.安装依赖

```bash
npm install
```

###3.配置环境变量

```bash
#复制环境变量模板
cp .env.example .env

#编辑.env文件，填写您的配置
```

###4.启动服务

```bash
#开发模式
npm run dev

#生产模式
npm start
```

##配置说明

### Mixin应用配置

1.访问[Mixin开发者平台](https://developers.mixin.one/dashboard)
2.创建新应用，获取以下信息：
 - `MIXIN_CLIENT_ID`
 - `MIXIN_CLIENT_SECRET`
 - `MIXIN_SESSION_ID`
 - `MIXIN_PRIVATE_KEY`（Base64编码）

3.配置Webhook URL：
 -开发环境：使用ngrok等工具获取公网URL
 -生产环境：您的服务器地址 + `/webhook/mixin`

### Redis配置

项目使用Redis存储会话数据，确保Redis服务正常运行。

## API端点

### Webhook端点
- `POST /webhook/mixin` -接收Mixin消息
- `GET /webhook/verify` - Webhook验证
- `GET /webhook/health` -健康检查

###管理端点
- `GET /webhook/message/{id}/status` -消息状态查询（需要API密钥）

##消息处理流程

```
用户消息 → Mixin服务器 → Webhook →适配器 → Openclaw API →回复 → Mixin用户
```

###支持的消息类型

- `PLAIN_TEXT` -文本消息
- `PLAIN_IMAGE` -图片消息
- `PLAIN_DATA` -文件消息
- `PLAIN_STICKER` -贴纸消息
- `PLAIN_CONTACT` -联系人消息
- `PLAIN_LOCATION` -位置消息

###命令系统

- `/help` -显示帮助信息
- `/clear` -清空当前会话
- `/status` -查看当前状态
- `/settings` -管理设置

##开发指南

###项目结构

```
src/
├── config/ #配置管理
├── controllers/ #控制器
├── middleware/ #中间件
├── models/ #数据模型
├── routes/ #路由定义
├── services/ #业务服务
├── utils/ #工具函数
└── index.js #应用入口
```

###添加新功能

1. **添加新的消息处理器**：
 -在`src/services/MessageProcessor.js`中添加处理方法
 -在`messageHandlers`映射中注册

2. **添加新的API端点**：
 -创建新的控制器方法
 -在`src/routes/`中添加路由定义

3. **集成Openclaw API**：
 -修改`src/services/MessageProcessor.js`中的`callOpenclawAPI`方法
 -实现实际的API调用逻辑

###测试

```bash
#运行模拟测试
node test/mock-webhook.js

#发送单个测试消息
node test/mock-webhook.js --single "测试消息"

#发送图片测试
node test/mock-webhook.js --image "https://example.com/image.jpg"
```

##部署

### Docker部署

```dockerfile
# Dockerfile示例
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE3000
CMD ["npm", "start"]
```

###环境变量

生产环境需要设置以下变量：

```bash
NODE_ENV=production
PORT=3000
MIXIN_CLIENT_ID=your_client_id
MIXIN_CLIENT_SECRET=your_client_secret
MIXIN_SESSION_ID=your_session_id
MIXIN_PRIVATE_KEY=your_private_key_base64
REDIS_HOST=redis-host
REDIS_PORT=6379
JWT_SECRET=your_jwt_secret
WEBHOOK_SECRET=your_webhook_secret
```

##故障排除

###常见问题

1. **Webhook签名验证失败**
 -检查`.env`中的`WEBHOOK_SECRET`配置
 -确保Mixin后台配置的Webhook URL正确

2. **Redis连接失败**
 -检查Redis服务是否运行
 -验证Redis配置信息

3. **Mixin API调用失败**
 -验证Mixin应用配置信息
 -检查网络连接

###日志查看

```bash
#查看应用日志
tail -f logs/app.log

#查看错误日志
tail -f logs/error.log
```

##贡献指南

1. Fork项目
2.创建功能分支
3.提交更改
4.推送分支
5.创建Pull Request

##许可证

MIT License