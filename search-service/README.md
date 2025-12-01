# AuroraMag Search UI

基于 Vue 3 + Vite + Element Plus 的搜索界面，直接调用后端 `/api/search`、`/details`。

## 开发
```bash
npm install
npm run dev -- --host --port 3336   # 仅前端开发服务器
```

环境变量（取自根 `.env`）：
- `VITE_BACKEND_URL`：FastAPI 后端（默认 http://localhost:3337）
