"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const koa_1 = __importDefault(require("koa"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const uuid_1 = require("uuid");
const cors_1 = __importDefault(require("@koa/cors"));
const koa_router_1 = __importDefault(require("koa-router"));
// 初始化服务器
const app = new koa_1.default();
const router = new koa_router_1.default();
const httpServer = (0, http_1.createServer)(app.callback());
const io = new socket_io_1.Server(httpServer, {
    transports: ['polling', 'websocket'], // 允许所有传输方式
    pingTimeout: 60000,
    pingInterval: 25000,
    cors: {
        origin: "*", // 明确跨域配置
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type"],
        credentials: true
    }
});
app.use((0, cors_1.default)());
app.use(router.routes()).use(router.allowedMethods());
const rooms = new Map();
// 连接处理
io.on('connection', (socket) => {
    let currentRoom = null;
    // 创建双人房间
    socket.on('createDuelRoom', (callback) => {
        const roomId = (0, uuid_1.v4)();
        const newRoom = {
            id: roomId,
            players: [{
                    id: socket.id,
                    socket,
                    isHost: true
                }],
            gameState: { sequence: 0 },
            status: 'waiting'
        };
        rooms.set(roomId, newRoom);
        socket.join(roomId);
        currentRoom = newRoom;
        callback({
            roomId,
            playerNumber: 1
        });
    });
    // 加入双人房间
    socket.on('joinDuelRoom', (roomId, callback) => {
        const room = rooms.get(roomId);
        if (!room)
            return callback({ error: '房间不存在' });
        if (room.players.length >= 2)
            return callback({ error: '房间已满' });
        room.players.push({
            id: socket.id,
            socket,
            isHost: false
        });
        socket.join(roomId);
        currentRoom = room;
        // 房间满员时开始游戏
        if (room.players.length === 2) {
            room.status = 'playing';
            io.to(roomId).emit('duelStart', {
                players: room.players.map(p => p.id),
                initialSequence: room.gameState.sequence
            });
        }
        callback({
            success: true,
            playerNumber: room.players.length
        });
    });
    // 处理游戏事件
    socket.on('duelEvent', (event) => {
        if (!currentRoom || currentRoom.status !== 'playing')
            return;
        // 验证事件发送者是否为房间玩家
        if (!currentRoom.players.some(p => p.id === socket.id))
            return;
        // 更新游戏状态序列号
        event.sequence = ++currentRoom.gameState.sequence;
        // 广播给对手（排除自己）
        socket.to(currentRoom.id).emit('duelEvent', event);
    });
    // 断线处理
    socket.on('disconnect', () => {
        if (currentRoom) {
            currentRoom.players = currentRoom.players.filter(p => p.id !== socket.id);
            // 如果任意玩家断开，结束游戏
            if (currentRoom.status === 'playing') {
                io.to(currentRoom.id).emit('duelEnd', { reason: '对手断开连接' });
                rooms.delete(currentRoom.id);
            }
        }
    });
});
// 启动服务器
const PORT = 3002;
httpServer.listen(PORT, () => {
    console.log(`双人对战服务器运行在端口 ${PORT}`);
});
