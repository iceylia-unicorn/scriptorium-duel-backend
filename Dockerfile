# 构建阶段
FROM node:22 AS builder

WORKDIR /app
COPY package.json pnpm-lock.yaml ./

# 启用Corepack避免全局安装pnpm
RUN corepack enable
RUN pnpm install

COPY . .
RUN pnpm build

# 生产阶段
FROM node:22

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY package.json pnpm-lock.yaml ./

# 仅安装生产依赖
RUN corepack enable && pnpm install --prod

EXPOSE 3000
CMD ["node", "dist/src/main.js"]