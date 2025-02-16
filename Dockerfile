# 使用官方的Node.js镜像作为基础镜像
FROM node:22

# 设置工作目录
WORKDIR /app

# 复制package.json和package-lock.json文件
COPY package*.json ./

# 安装项目依赖
RUN npm install

# 复制项目文件
COPY . .

# 暴露应用运行的端口
EXPOSE 3000

# 定义Docker容器启动时运行的命令
CMD ["npm", "start"]