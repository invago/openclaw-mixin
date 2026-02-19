#更新日志

所有对项目的显著更改都将记录在此文件中。

格式基于[Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/),
并遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.0] -2026-02-19

###新增
-初始版本发布
-完整的Mixin Messenger集成
-支持文本、图片、文件等多种消息类型
-会话管理和上下文维护
-命令系统（/help, /clear, /status等）
-独立运行模式和Openclaw插件模式
-健康检查端点
-完整的API文档
- Docker和Docker Compose支持
-详细的配置指南
-模拟测试工具

###功能
-接收Mixin Webhook消息
-异步消息处理
-调用Openclaw AI助手
-发送回复到Mixin Messenger
-会话状态持久化（Redis支持）
- Webhook签名验证
-错误处理和重试机制

###技术架构
-基于Node.js和Express
-模块化插件设计
-支持多种部署方式
-完整的开发和生产环境配置
-详细的错误日志和监控