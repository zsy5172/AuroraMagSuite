# AuroraMag Suite (FastAPI + Vue)

AuroraMag = Bitmagnet 驱动的搜索 UI + Torznab 代理。后端重写为 FastAPI，专注 Bitmagnet GraphQL/Torznab 查询（无 TMDB/豆瓣调用），前端使用 Vue 3 + Vite + Element Plus，所有配置集中在 `.env`。

## 快速开始
1) 复制 `.env.example` → `.env`，填写数据库连接（必填 `POSTGRES_*`）。
2) 本地开发：
```bash
cd detail-service && ./start.sh   # FastAPI on 3337
cd search-service && ./start.sh   # Vite on 3336
```

3) Docker Compose：
```bash
docker compose up --build
```
包含 `bitmagnet`（无内置 Postgres）、`backend`（FastAPI 3337）、`frontend`（Vite 3336）。

## 目录
- `detail-service/`：FastAPI 详情代理 + tests + Dockerfile
- `search-service/`：Vue/Vite 搜索 UI + Dockerfile
- `doc/`：文档（功能、构建、运行、开发计划），`doc/archive/` 保留旧版说明

更多细节：
- 功能介绍：`doc/features.md`
- 构建方法：`doc/build.md`
- 运行方式：`doc/run.md`
- 开发计划：`doc/roadmap.md`
