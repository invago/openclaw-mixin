# Openclaw Mixin 插件

将 Mixin Messenger 集成到 Openclaw 的通道插件，类似官方 Feishu 频道插件。

## 安装方式

### 方式一：通过 GitHub 安装（当前可用）

由于包尚未正式发布到 npm，目前可以通过 GitHub 直接安装：

```bash
npm install invago/openclaw-mixin
```

或者

```bash
npm install github:invago/openclaw-mixin
```

### 方式二：本地安装（开发调试）

```bash
openclaw plugins install ./extensions/mixin
```

### 注意事项

- 此插件完全兼容 Openclaw 插件系统，功能与官方 Feishu 频道插件相同
- 配置方式、CLI 命令等均按照 Openclaw 标准实现
- 未来计划发布到 npm，届时可通过 `npm install openclaw-mixin-channel` 安装

## 配置方式

### 方式一：通过 Openclaw CLI 配置（推荐）

```bash
# 1. 先安装插件
npm install invago/openclaw-mixin

# 2. 使用交互式命令添加频道（如果支持）
openclaw channels add
# 在交互界面中选择 "Mixin" 并按提示完成配置
```

**注意：** 如果 `channels add` 命令不显示 Mixin 频道，请尝试以下备选方法。

### 方式二：手动配置（推荐备选方案）

```bash
# 直接设置配置项（无需 channels add）
openclaw config set channels.mixin.enabled true
openclaw config set channels.mixin.appId "your_app_id"
openclaw config set channels.mixin.sessionId "your_session_id"
openclaw config set channels.mixin.privateKey "your_private_key"
```

### 方式三：直接编辑配置文件

1. 编辑 `~/.openclaw/openclaw.json`：

```json5
{
  channels: {
    mixin: {
      enabled: true,
      appId: "your_app_id",
      sessionId: "your_session_id",
      privateKey: "your_private_key_base64"
    }
  }
}
```

2. 重启 Openclaw Gateway 使配置生效

### 方式四：使用环境变量

```bash
export MIXIN_APP_ID="your_app_id"
export MIXIN_SESSION_ID="your_session_id"
export MIXIN_SESSION_PRIVATE_KEY="your_private_key_base64"
export OPENCLAW_GATEWAY_URL="ws://127.0.0.1:18789"
```

### 方式三：使用环境变量

```bash
export MIXIN_APP_ID="your_app_id"
export MIXIN_SESSION_ID="your_session_id"
export MIXIN_SESSION_PRIVATE_KEY="your_private_key_base64"
export OPENCLAW_GATEWAY_URL="ws://127.0.0.1:18789"
```

## 启动服务

```bash
# 启动 Openclaw Gateway（包含所有已启用的频道）
openclaw gateway

# 查看运行状态
openclaw gateway status
```

## 使用流程

### 1. 首次使用认证

1. 在 Mixin Messenger 中给机器人发送 `/start`
2. 机器人返回配对码
3. 在 Mixin 中输入配对码完成认证

### 2. 与 AI 对话

认证后，直接发送消息即可与 AI 对话。

### 命令列表

| 命令 | 说明 |
|------|------|
| `/start` | 开始认证 |
| `/auth <code>` | 提交配对码 |
| `/status` | 查看状态 |
| `/help` | 显示帮助 |

**管理员命令：**

| 命令 | 说明 |
|------|------|
| `/admin add <userId>` | 添加管理员 |
| `/users` | 查看用户列表 |
| `/stats` | 查看统计 |

## 架构说明

```
Mixin 用户发送消息
     ↓
Mixin Blaze 服务器（WebSocket）
     ↓
本插件接收消息
     ↓
转发给 Openclaw Gateway
     ↓
Openclaw Agent 处理 AI 逻辑
     ↓
Agent 回复通过 WebSocket 返回
     ↓
本插件发送回复到 Mixin
     ↓
Mixin 用户收到 AI 回复
```

## 特性

- **WebSocket 长连接**：实时接收消息，无需 HTTP Webhook 配置
- **用户认证与权限管理**：支持配对码认证和管理员权限
- **群组低打扰模式**：仅在@机器人时响应群聊消息
- **自动重连**：断线自动重连，支持离线消息处理
- **消息类型支持**：支持文本、图片等消息类型

## 开发调试

```bash
# 本地开发模式
npm run dev

# 运行测试
npm test
```

## 许可证

MIT
