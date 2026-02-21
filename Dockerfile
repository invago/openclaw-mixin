#使用Node.js18 Alpine作为基础镜像
FROM node:18-alpine

#安装必要的系统依赖
RUN apk add --no-cache \
 bash \
 curl \
 && rm -rf /var/cache/apk/*

#创建应用目录
WORKDIR /app

#复制package.json和package-lock.json
COPY package*.json ./

#安装生产依赖
RUN npm ci --only=production

#复制应用源代码
COPY . .

#创建非root用户
RUN addgroup -g1001 -S nodejs \
 && adduser -S nodejs -u1001

#更改文件所有权
RUN chown -R nodejs:nodejs /app

#切换到非root用户
USER nodejs

#暴露端口
EXPOSE3000

#健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

#启动命令
CMD ["npm", "start"]