# Openclaw Mixin插件

将Mixin Messenger集成到Openclaw的通道插件。

##架构

```
Mixin用户发送消息
 ↓
Mixin Blaze服务器
 ↓
WebSocket长连接 →本插件
 ↓
转发给Openclaw Gateway
 ↓
Openclaw Agent处理AI逻辑
 ↓
Agent回复通过WebSocket返回
 ↓
本插件发送回复到Mixin
 ↓
Mixin用户收到AI回复
```

##安装

在Openclaw项目目录中：

```bash
npm install invago/openclaw-mixin
```

##配置

创建 `.env`文件：

```bash
# Mixin应用配置（从Mixin开发者平台获取）
MIXIN_APP_ID=your_app_id
MIXIN_SESSION_ID=your_session_id
MIXIN_SESSION_PRIVATE_KEY=your_private_key_base64

# Openclaw Gateway地址
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789

#管理员用户ID（可选，首次运行后从日志获取）
OPENCLAW_ADMIN_USER_IDS=
```

##启动

```bash
npm start
```

##使用

1.给Mixin机器人发送 `/start`
2.输入配对码完成认证
3.直接发送消息与AI对话

###命令列表

- `/start` -开始认证
- `/auth <code>` -提交配对码
- `/status` -查看状态
- `/help` -显示帮助

**管理员命令：**
- `/admin add <userId>` -添加管理员
- `/users` -查看用户列表
- `/stats` -查看统计

##特性

- WebSocket长连接接收消息
-用户认证与权限管理
-群组低打扰模式
-自动重连和离线消息处理

##许可证

MIT