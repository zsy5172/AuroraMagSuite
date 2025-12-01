# AuroraMag Detail Proxy (FastAPI)

FastAPI 实现的 Torznab/详情代理，只依赖 Bitmagnet 的 GraphQL/Torznab 数据，不再调用 TMDB/豆瓣等外部接口，也不做本地缓存。

## 运行
```bash
./start.sh          # 以 --reload 启动 uvicorn，端口 3337
# 或
uvicorn app.main:app --host 0.0.0.0 --port 3337
```

环境变量（取自根 `.env`）：
- `BITMAGNET_URL`：Bitmagnet GraphQL/Torznab 地址，默认 `http://bitmagnet:3333`
- `PUBLIC_HOST` / `PUBLIC_PROTOCOL`：生成详情链接时的对外地址
- `REQUEST_TIMEOUT`：HTTP 请求超时，秒

主要路由：
- `/torznab/`：代理 Bitmagnet Torznab 并增加详情链接
- `/api/details/{infoHash}`：返回 GraphQL 驱动的 JSON 详情
- `/details/{infoHash}`：返回 HTML 详情页
- `/graphql`：GraphQL 透传
- `/api/search`：基于 Bitmagnet GraphQL 的搜索（保留 limit/offset 分页）

测试：
```bash
pytest
```
