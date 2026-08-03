import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * 服务端口配置。
 *
 * 端口统一走环境变量驱动（任务约定的 {PORT} 占位符语义：部署/预览时可注入具体端口）：
 *   - 直接端口：PORT
 *   - 回退：SERVER_PORT
 *   - 均未设置时使用默认值 3001
 */
export const SERVER_PORT = Number(process.env.PORT ?? process.env.SERVER_PORT ?? 3001);

/** 监听地址。默认仅本机回环；容器/局域网访问可设为 0.0.0.0。 */
export const HOST = process.env.HOST ?? '127.0.0.1';

/** 前端 build 产物目录（生产模式静态托管用）。默认 packages/client/dist。 */
const serverSrcDir = path.dirname(fileURLToPath(import.meta.url));

/** 仓库根目录（config.ts 位于 packages/server/src/，向上三级）。 */
const repoRoot = path.resolve(serverSrcDir, '../../..');
export const CLIENT_DIST =
  process.env.CLIENT_DIST ?? path.resolve(serverSrcDir, '../../client/dist');

/** Writing DNA 文档目录。默认仓库根下 .claude/writing-dna（spark-note 的只读数据源）。 */
export const DNA_DIR = process.env.DNA_DIR ?? path.join(repoRoot, '.claude', 'writing-dna');
