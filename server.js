const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 房间管理
const rooms = new Map();
// roomId -> {
//   clients: Map<ws, { id: string, name: string, isSharing: boolean }>,
//   messages: Array
// }

function generateUserId() {
  return Math.random().toString(36).substring(2, 10);
}

function getRoomInfo(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  const members = [];
  room.clients.forEach((info, ws) => {
    members.push({ id: info.id, name: info.name, isSharing: info.isSharing });
  });
  return { roomId, members, count: members.length };
}

function broadcastToRoom(roomId, message, excludeWs = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  const data = JSON.stringify(message);
  room.clients.forEach((info, ws) => {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

function sendToClient(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

wss.on('connection', (ws) => {
  let currentRoomId = null;
  let userId = null;
  let userName = null;

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      return;
    }

    switch (data.type) {
      case 'join':
        handleJoin(ws, data);
        break;
      case 'leave':
        handleLeave(ws);
        break;
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        handleSignaling(ws, data);
        break;
      case 'chat':
        handleChat(ws, data);
        break;
      case 'screen-start':
        handleScreenStart(ws, data);
        break;
      case 'screen-end':
        handleScreenEnd(ws);
        break;
      case 'screen-offer':
      case 'screen-answer':
      case 'screen-ice-candidate':
        handleScreenSignaling(ws, data);
        break;
      case 'mute':
        handleMute(ws, data);
        break;
    }
  });

  ws.on('close', () => {
    handleLeave(ws);
  });

  function handleJoin(ws, data) {
    const { roomId, name } = data;
    if (!roomId || !name) return;

    // 如果已在其他房间，先离开
    if (currentRoomId) {
      handleLeave(ws);
    }

    userId = generateUserId();
    userName = name;
    currentRoomId = roomId;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        clients: new Map(),
        messages: []
      });
    }

    const room = rooms.get(roomId);
    room.clients.set(ws, { id: userId, name, isSharing: false });

    // 告诉新用户自己的信息
    sendToClient(ws, {
      type: 'joined',
      userId,
      roomId,
      members: getRoomInfo(roomId).members
    });

    // 通知房间里其他人有新成员加入
    broadcastToRoom(roomId, {
      type: 'member-join',
      member: { id: userId, name, isSharing: false }
    }, ws);

    // 发送历史聊天记录
    if (room.messages.length > 0) {
      sendToClient(ws, {
        type: 'chat-history',
        messages: room.messages.slice(-50)
      });
    }

    console.log(`[加入] 房间 ${roomId} | 用户 ${name} (${userId}) | 当前 ${room.clients.size} 人`);
  }

  function handleLeave(ws) {
    if (!currentRoomId) return;

    const room = rooms.get(currentRoomId);
    if (!room) {
      currentRoomId = null;
      return;
    }

    const wasSharing = room.clients.get(ws)?.isSharing;
    room.clients.delete(ws);

    broadcastToRoom(currentRoomId, {
      type: 'member-leave',
      userId
    });

    if (wasSharing) {
      broadcastToRoom(currentRoomId, {
        type: 'screen-stopped',
        userId
      });
    }

    console.log(`[离开] 房间 ${currentRoomId} | 用户 ${userName} (${userId}) | 剩余 ${room.clients.size} 人`);

    // 房间空了就清理
    if (room.clients.size === 0) {
      rooms.delete(currentRoomId);
      console.log(`[清理] 房间 ${currentRoomId} 已清空`);
    }

    currentRoomId = null;
    userId = null;
    userName = null;
  }

  function handleSignaling(ws, data) {
    if (!currentRoomId) return;
    const { to } = data;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    // 找到目标客户端
    let targetWs = null;
    room.clients.forEach((info, clientWs) => {
      if (info.id === to) {
        targetWs = clientWs;
      }
    });

    if (targetWs) {
      sendToClient(targetWs, {
        ...data,
        from: userId
      });
    }
  }

  function handleChat(ws, data) {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const chatMsg = {
      type: 'chat',
      userId,
      userName,
      text: String(data.text || '').slice(0, 500),
      time: Date.now()
    };

    room.messages.push(chatMsg);
    if (room.messages.length > 200) {
      room.messages = room.messages.slice(-200);
    }

    broadcastToRoom(currentRoomId, chatMsg);
  }

  function handleScreenStart(ws, data) {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const info = room.clients.get(ws);
    if (info) {
      info.isSharing = true;
    }

    broadcastToRoom(currentRoomId, {
      type: 'screen-started',
      userId,
      userName
    }, ws);
  }

  function handleScreenEnd(ws) {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const info = room.clients.get(ws);
    if (info) {
      info.isSharing = false;
    }

    broadcastToRoom(currentRoomId, {
      type: 'screen-stopped',
      userId
    });
  }

  function handleScreenSignaling(ws, data) {
    if (!currentRoomId) return;
    const { to } = data;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    let targetWs = null;
    room.clients.forEach((info, clientWs) => {
      if (info.id === to) {
        targetWs = clientWs;
      }
    });

    if (targetWs) {
      sendToClient(targetWs, {
        ...data,
        from: userId
      });
    }
  }

  function handleMute(ws, data) {
    if (!currentRoomId) return;
    broadcastToRoom(currentRoomId, {
      type: 'mute-update',
      userId,
      muted: data.muted
    }, ws);
  }
});

server.listen(PORT, () => {
  console.log(`云会通网页轻量版已启动`);
  console.log(`访问地址: http://localhost:${PORT}`);
  console.log(`WebSocket 端口: ${PORT}`);
});
