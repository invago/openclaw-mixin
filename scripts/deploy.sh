#!/bin/bash

#生产环境部署脚本

set -e

echo "🚀开始部署Mixin-Openclaw适配器..."

#检查环境
check_environment() {
 echo "🔍检查环境..."

 #检查Docker
 if ! command -v docker &> /dev/null; then
 echo "❌错误:Docker未安装"
 exit1
 fi

 #检查Docker Compose
 if ! command -v docker-compose &> /dev/null; then
 echo "❌错误:Docker Compose未安装"
 exit1
 fi

 #检查环境变量文件
 if [ ! -f ".env.production" ]; then
 if [ -f ".env" ]; then
 echo "⚠️警告:使用.env文件作为生产环境配置"
 cp .env .env.production
 else
 echo "❌错误:未找到环境变量文件"
 echo "请创建.env.production文件"
 exit1
 fi
 fi

 echo "✅环境检查通过"
}

#构建镜像
build_images() {
 echo "🔨构建Docker镜像..."
 docker-compose -f docker-compose.yml build
}

#停止旧服务
stop_services() {
 echo "🛑停止现有服务..."
 docker-compose -f docker-compose.yml down || true
}

#启动服务
start_services() {
 echo "🚀启动服务..."
 docker-compose -f docker-compose.yml up -d
}

#检查服务状态
check_services() {
 echo "🔍检查服务状态..."

 #等待服务启动
 echo "等待服务启动..."
 sleep10

 #检查Redis
 if docker-compose -f docker-compose.yml exec -T redis redis-cli ping &> /dev/null; then
 echo "✅Redis服务正常"
 else
 echo "❌Redis服务异常"
 exit1
 fi

 #检查应用
 if curl -f http://localhost:${PORT:-3000}/webhook/health &> /dev/null; then
 echo "✅应用服务正常"
 else
 echo "❌应用服务异常"
 exit1
 fi
}

#显示部署信息
show_deployment_info() {
 local ip=$(hostname -I | awk '{print $1}')
 local port=${PORT:-3000}

 echo "
🎉部署完成！

服务信息:
-应用URL: http://${ip}:${port}
-健康检查: http://${ip}:${port}/webhook/health
-Webhook端点: http://${ip}:${port}/webhook/mixin

容器状态:
$(docker-compose -f docker-compose.yml ps)

日志查看:
-应用日志: docker-compose logs app
-Redis日志: docker-compose logs redis
-所有日志: docker-compose logs -f

管理命令:
-停止服务: docker-compose down
-重启服务: docker-compose restart
-查看状态: docker-compose ps
-更新部署: ./scripts/deploy.sh
"
}

#主部署流程
main() {
 echo "=========================================="
 echo "Mixin-Openclaw适配器生产环境部署"
 echo "=========================================="

 check_environment
 stop_services
 build_images
 start_services
 check_services
 show_deployment_info

 echo "✅部署完成！"
}

#运行主函数
main "$@"