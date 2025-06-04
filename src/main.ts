import Koa from 'koa';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import cors from '@koa/cors';
import Router from 'koa-router';

interface Player {
    id: string;
    socket: Socket;
    isHost: boolean;
}

interface GameState {
    sequence: number;
}

interface Room {
    id: string;
    players: Player[];
    gameState: GameState;
    status: 'waiting' | 'playing';
}

// 初始化服务器
const app = new Koa();
const router = new Router();
const httpServer = createServer(app.callback());
const io = new Server(httpServer, {
    transports: ['websocket', 'polling'],// 允许所有传输方式
    pingTimeout: 60000, // 心跳超时为60秒
    pingInterval: 25000, // 心跳包发送间隔为25秒
    cors: {
        origin: "*",                      // 明确跨域配置
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type"],
        credentials: false
    },
});

// 使用 cors 中间件
app.use(cors({
    origin: "*", // 允许所有来源
    allowMethods: ['GET', 'POST'],
    allowHeaders: ['Content-Type'],
    credentials: false
}));
app.use(router.routes()).use(router.allowedMethods());

const rooms: Map<string, Room> = new Map();

// 连接处理
io.on('connection', (socket: Socket) => {
    let currentRoom: Room | null = null;
    // 创建双人房间
    socket.on('createDuelRoom', (callback: (response: { roomId: string, playerNumber: number }) => void) => {
        const roomId = uuidv4();
        const newRoom: Room = {
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
    socket.on('joinDuelRoom', (roomId: string, callback: (response: { error?: string, success?: boolean, playerNumber?: number }) => void) => {
        const room = rooms.get(roomId);
        if (!room) return callback({ error: '房间不存在' });
        if (room.players.length >= 2) return callback({ error: '房间已满' });

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
            // 使用io.emit将发送到所有成员
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

    socket.on("initDeck", (cards:Array<{name:string, id:string}>)=>{
        if (!currentRoom || currentRoom.status !== 'playing') return;
        socket.to(currentRoom.id).emit('syncInitDeck', cards);
    })
    //消息发送处理
    socket.on('battleMessage', (data) => {
        if (!currentRoom) return;

        // 添加发送者标识
        const sender = currentRoom.players.find(p => p.id === socket.id)?.isHost ? 'Host' : 'Guest';

        // 转发给房间其他成员
        socket.to(currentRoom.id).emit('battleMessage', {
            ...data,
            sender,
            isOpponent: true
        });
    });
    // 处理游戏事件
    socket.on('duelEvent', (event: any) => {
        if (!currentRoom || currentRoom.status !== 'playing') return;

        // 验证事件发送者是否为房间玩家
        if (!currentRoom.players.some(p => p.id === socket.id)) return;

        // 更新游戏状态序列号
        event.sequence = ++currentRoom.gameState.sequence;

        // 广播给对手（排除自己）
        socket.to(currentRoom.id).emit('duelEvent', event);
    });
    socket.on('turnOver', (data) => {
        if (!currentRoom || currentRoom.status !== 'playing') return;

        // 转发给对手
        socket.to(currentRoom.id).emit('turnOver', {
            cards: data,
            sequence: ++currentRoom.gameState.sequence
        });
    });
    socket.on('leaveRoom', ()=>{
        if (currentRoom) {
            rooms.delete(currentRoom.id);
            socket.to(currentRoom.id).emit('gameOver', {reason: '对手已离开房间'});
        }
    })
    // 断线处理
    socket.on('disconnect', () => {
        if (currentRoom) {
            currentRoom.players = currentRoom.players.filter(p => p.id !== socket.id);

            // 如果任意玩家断开，结束游戏
            if (currentRoom.status === 'playing') {
                io.to(currentRoom.id).emit('duelEnd', { reason: '对手断开连接' });
            }
            //
            if(currentRoom.players.length <= 0) {
                rooms.delete(currentRoom.id);
            }
        }
    });

});

// 启动服务器
const PORT = 3000;
httpServer.listen(PORT, () => {
    console.log(`双人对战服务器运行在端口 ${PORT}`);
});