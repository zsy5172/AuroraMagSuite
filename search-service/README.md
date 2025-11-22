# AuroraMag Search UI

React + Vite 搜索界面，使用 Bitmagnet GraphQL 提供结果，并附带图片缓存代理。文档已集中到 `doc/`。

## 开发
```bash
npm install
npm run dev -- --host   # 3336 前端 + 3335 媒体代理
```

环境变量（取自根 `.env`）：
- `VITE_GRAPHQL_URL`：Bitmagnet GraphQL（默认 http://localhost:3333）
- `VITE_BACKEND_URL`：FastAPI 后端（默认 http://localhost:3337）
- `VITE_MEDIA_PROXY_URL`：媒体代理（默认 http://localhost:3335）

更多使用方式见 `doc/run.md`。
