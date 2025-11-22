# 运行方式

## 环境变量
复制 `.env.example` 为 `.env` 并填写：
- 数据库（必填）：`POSTGRES_HOST`、`POSTGRES_PORT`、`POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB`（Bitmagnet 用）
- 后端可选：`BITMAGNET_URL`（默认 `http://bitmagnet:3333`）、`TMDB_API_KEY`、`PUBLIC_HOST`、`PUBLIC_PROTOCOL`
- 前端可选：`VITE_BACKEND_URL`、`VITE_MEDIA_PROXY_URL`、`VITE_GRAPHQL_URL` 等
- Compose 默认使用容器内主机名（`backend`/`bitmagnet`），本地开发可改为 `http://localhost:3337`、`http://localhost:3333`

除数据库连接外，其它值均有默认。

## 本地开发

后端：
```bash
cd detail-service
./start.sh   # 安装依赖并以 --reload 模式启动 uvicorn，端口 3337
```

前端：
```bash
cd search-service
./start.sh   # 安装依赖并启动 Vite(3336) + 媒体代理(3335)
```

## Docker Compose 一键启动
```bash
cp .env.example .env   # 填写数据库连接
docker compose up --build
```

包含服务：
- `bitmagnet`：官方镜像，读取 `.env` 中的数据库连接；自带 GraphQL/Torznab 端口 3333。
- `backend`：FastAPI 详情代理，端口 3337。
- `frontend`：Vite 开发服务器 + 媒体代理，端口 3336（前端）/3335（图片代理）。

> 注：compose 不内置 Postgres，请确保外部数据库可达，或在部署前准备好数据库服务。
