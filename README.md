# spark-note — 小红书内容运营智能体（web 端）

在 spark-note 内容仓库之上搭建的独立单用户 web 应用骨架：
**对话**（驱动 agent 调 SKILL 产出内容）· **内容管理**（浏览 content/）· **Writing DNA**（写作风格可视化）。

## 技术栈

- **前端** `packages/client`：React 18 + Vite + TypeScript + Tailwind CSS + react-router
- **后端** `packages/server`：Node.js + Fastify 5（健康检查 API / 静态资源 / WebSocket 基础设施）

## 目录结构

```
packages/
  server/    # Fastify 后端
    src/index.ts      # 服务组装：/api/health、/ws、静态托管（含 SPA 回退）
    src/ws.ts         # WebSocket 连接集线器（send/broadcast/计数）
    src/config.ts     # 端口与环境配置
  client/    # React 前端
    src/App.tsx       # react-router 路由（对话 / 内容管理 / Writing DNA）
    src/components/   # Layout、HealthBadge（顶栏健康检查指示器）
    src/hooks/useWebSocket.ts
    src/pages/
```

## 快速开始

```bash
pnpm install        # 安装 workspace 依赖
pnpm dev            # 同时启动前后端（后端 :3001，前端 :5173）
```

浏览器打开 <http://localhost:5173>，顶栏绿色 **API ok** 即表示前端页已成功调用后端健康检查接口。

## 端口约定（{PORT} 占位符）

端口统一用环境变量驱动，部署/预览时可注入具体端口：

| 端口 | 环境变量 | 默认值 |
| --- | --- | --- |
| 后端 HTTP/WS | `PORT` / `SERVER_PORT` | 3001 |
| 前端 dev server | `CLIENT_PORT` | 5173 |

前端通过 Vite proxy 将 `/api` 与 `/ws` 转发到后端，浏览器侧无跨域问题。

## 构建与生产模式

```bash
pnpm build    # tsc + vite build（server 产出 dist/，client 产出 dist/）
pnpm start    # 后端托管 client 构建产物并监听 {PORT}
pnpm preview  # build 后启动生产模式（一键启动）
```

## 骨架已具备 / 待接入

- [x] 健康检查 API `GET /api/health`（返回 `{ status: 'ok' }`）
- [x] WebSocket 基础设施 `GET /ws`（ping / echo / broadcast）
- [x] 三个路由页面 + 顶栏健康指示器
- [x] 前端静态资源托管 + SPA 回退
- [ ] 对话：pi agent 会话流式事件推送（接入 `@earendil-works/pi-coding-agent`）
- [ ] 内容管理：content/ 列表、归档、新增
- [ ] Writing DNA：.claude/writing-dna 结构化渲染
