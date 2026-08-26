# 云会通网页轻量版

基于 WebRTC 的网页端语音会议系统，支持语音通话、屏幕共享和文字聊天。

## 功能特性

- 🎙️ **语音通话** - 基于 WebRTC 的实时语音，带回声消除和噪声抑制
- 🖥️ **屏幕共享** - 一键共享屏幕，支持全屏观看
- 💬 **文字聊天** - 实时文字消息，与语音同步
- 👥 **多人会议** - 支持多人同时在线（网状拓扑，建议 2-6 人）
- 🔢 **会议号机制** - 通过会议号快速加入
- 📱 **响应式设计** - 适配电脑和手机浏览器

## 技术栈

- **前端**: 原生 HTML/CSS/JavaScript（无需框架）
- **后端**: Node.js + Express + WebSocket
- **通信**: WebRTC (P2P) + WebSocket (信令)

## 快速开始

### 1. 安装依赖

```bash
cd yunhuitong
npm install
```

### 2. 本地运行

```bash
npm start
```

启动后访问：http://localhost:3000

> ⚠️ **注意**：本地使用 `http://localhost` 可以正常使用麦克风和屏幕共享。
> 但如果用其他设备访问，必须使用 HTTPS，否则浏览器会拒绝访问麦克风和屏幕。

## 部署到服务器

### 方式一：Nginx 反向代理 + HTTPS（推荐）

1. **上传代码到服务器**

2. **安装依赖并启动**
```bash
cd yunhuitong
npm install
npm start
```

3. **配置 Nginx 反向代理**

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

4. **配置 HTTPS（必须）**

使用 Let's Encrypt 免费证书：
```bash
certbot --nginx -d your-domain.com
```

### 方式二：使用 PM2 守护进程

```bash
npm install -g pm2
pm2 start server.js --name yunhuitong
pm2 save
pm2 startup
```

## 使用说明

### 创建会议
1. 输入昵称
2. 点击「快速会议」（会自动生成一个会议号）
3. 允许浏览器访问麦克风
4. 把会议号分享给其他人

### 加入会议
1. 输入会议号
2. 输入昵称
3. 点击「加入会议」

### 功能操作
- **开麦/闭麦**：点击麦克风按钮
- **开/关声音**：点击扬声器按钮
- **共享屏幕**：点击屏幕共享按钮，选择要共享的窗口或屏幕
- **全屏观看**：点击全屏按钮
- **发送消息**：在聊天框输入文字，按 Enter 发送

## 关于 TURN 服务器

WebRTC 在大多数情况下可以直接 P2P 连接，但在某些复杂网络环境下（如对称 NAT、企业防火墙），需要 TURN 服务器做中继转发。

当前配置只使用了公共 STUN 服务器，如果遇到无法连接的情况，可以：

### 方案一：使用付费 TURN 服务
- Xirsys
- Twilio NAT Traversal

### 方案二：自己搭建 coturn
```bash
# Ubuntu/Debian
apt install coturn

# 配置 /etc/turnserver.conf
listening-port=3478
fingerprint
lt-cred-mech
user=username:password
realm=your-domain.com
```

然后在 `public/app.js` 的 `iceConfig` 中添加你的 TURN 服务器：
```javascript
const iceConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:your-turn-server.com:3478',
      username: 'username',
      credential: 'password'
    }
  ]
};
```

## 浏览器兼容性

| 浏览器 | 语音 | 屏幕共享 |
|--------|------|----------|
| Chrome | ✅ | ✅ |
| Edge | ✅ | ✅ |
| Firefox | ✅ | ✅ |
| Safari | ✅ | ✅ (13+) |
| 手机 Chrome | ✅ | ❌ |
| 手机 Safari | ✅ | ❌ |

> 手机浏览器通常不支持屏幕共享。

## 已知限制

1. **人数限制**：网状拓扑（每个成员互相连接），建议 2-6 人使用
2. **网络穿透**：未配置 TURN 服务器时，部分网络环境可能无法连接
3. **移动端**：手机浏览器不支持屏幕共享
4. **回声问题**：建议使用耳机，避免扬声器的声音被麦克风捕捉

## 项目结构

```
yunhuitong/
├── package.json          # 项目配置
├── server.js             # Node.js 信令服务器
├── README.md             # 说明文档
└── public/               # 前端静态文件
    ├── index.html        # 页面结构
    ├── style.css         # 样式
    └── app.js            # 业务逻辑 (WebRTC + 聊天)
```

## 常见问题

**Q: 为什么听不到对方声音？**
A: 1. 检查是否允许了麦克风权限 2. 检查是否点了「开启声音」 3. 检查设备音量 4. 如果是跨网络，可能需要 TURN 服务器

**Q: 屏幕共享打不开？**
A: 1. 必须是 HTTPS 环境（localhost 除外）2. 浏览器需要最新版本 3. 点击共享后在弹窗中选择要共享的内容

**Q: 最多支持多少人？**
A: 网状架构下，建议不超过 6 人。如果需要更多人，需要改用 SFU 架构（如 mediasoup、Janus 等）。

**Q: 可以对接安卓/iOS App 吗？**
A: 可以。WebRTC 是跨平台的标准，移动端也有对应的 WebRTC SDK，只要信令协议对齐就能互通。

## License

MIT
