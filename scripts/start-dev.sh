#!/bin/bash

#开发环境启动脚本

echo "🚀启动Mixin-Openclaw适配器开发环境..."

#检查Node.js版本
NODE_VERSION=$(node -v | cut -d'.' -f1 | tr -d 'v')
if [ "$NODE_VERSION" -lt18 ]; then
 echo "❌错误:需要Node.js 18或更高版本"
 exit1
fi

#检查Redis是否运行
if ! command -v redis-cli &> /dev/null; then
 echo "⚠️警告:redis-cli未安装，会话管理将使用内存存储"
else
 if redis-cli ping &> /dev/null; then
 echo "✅Redis服务正常"
 else
 echo "⚠️警告:Redis服务未运行，会话管理将使用内存存储"
 fi
fi

#检查环境变量
if [ ! -f ".env" ]; then
 echo "❌错误:未找到.env文件"
 echo "请运行以下命令进行配置:"
 echo " npm run setup"
 echo "或复制.env.example为.env并填写配置"
 exit1
fi

#安装依赖
echo "📦检查依赖..."
if [ ! -d "node_modules" ]; then
 echo "安装依赖..."
 npm install
else
 echo "依赖已安装"
fi

#启动开发服务器
echo "🔧启动开发服务器..."
npm run dev