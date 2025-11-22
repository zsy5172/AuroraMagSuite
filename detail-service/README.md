# AuroraMag Detail Proxy (FastAPI)

FastAPI 实现的 Torznab/详情代理，聚合 Bitmagnet 数据并补充 TMDB/豆瓣元数据，提供 JSON、HTML 详情页与缓存接口。

## 运行
```bash
./start.sh          # 以 --reload 启动 uvicorn，端口 3337
# 或
uvicorn app.main:app --host 0.0.0.0 --port 3337
```

环境变量（取自根 `.env`）：
- `BITMAGNET_URL`：Bitmagnet GraphQL/Torznab 地址，默认 `http://bitmagnet:3333`
- `TMDB_API_KEY`：TMDB API Key（可为空）
- `PUBLIC_HOST` / `PUBLIC_PROTOCOL`：生成详情链接时的对外地址
- 缓存/超时参数：`TMDB_CACHE_TTL`、`GRAPHQL_CACHE_TTL`、`DETAILS_CACHE_TTL`、`DOUBAN_CACHE_TTL`、`CACHE_MAXSIZE`

主要路由：
- `/torznab/`：代理 Bitmagnet Torznab 并增加详情链接
- `/api/details/{infoHash}`：返回 JSON 详情
- `/details/{infoHash}`：返回 HTML 详情页
- `/api/cache/stats` 与 `/cache/clear`：缓存状态与清理

测试：
```bash
pytest
```
