import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 端口统一走环境变量（{PORT} 占位符语义），部署/预览时可注入具体端口。
// 后端 HTTP/WS 端口与 packages/server/src/config.ts 保持一致，默认 3001。
const SERVER_PORT = Number(process.env.SERVER_PORT ?? process.env.PORT ?? 3001);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5173);

export default defineConfig({
  plugins: [react()],
  // 让 .ts/.tsx 优先于同名遗留 .js 编译产物（src 下残留的 App.js / main.js / useWebSocket.js 等旧骨架文件），
  // 否则 `import App from './App'` 会解析到旧的 .js，react-router 应用（App.tsx + pages/*.tsx）无法被构建。
  resolve: {
    extensions: ['.tsx', '.ts', '.mts', '.mjs', '.jsx', '.js', '.json'],
  },
  server: {
    host: true,
    port: CLIENT_PORT,
    proxy: {
      // HTTP API：转发到 Fastify 后端
      '/api': {
        target: `http://localhost:${SERVER_PORT}`,
        changeOrigin: true,
      },
      // WebSocket：转发到 Fastify /ws
      '/ws': {
        target: `ws://localhost:${SERVER_PORT}`,
        ws: true,
      },
    },
  },
});
