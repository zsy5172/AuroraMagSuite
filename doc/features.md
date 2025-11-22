# 功能介绍

AuroraMag Suite 由前端搜索 UI 与后端富化代理组成，均以 Bitmagnet 作为唯一数据源，不自建业务数据库。

- **搜索体验（search-service）**：React + Vite 前端，直接调用 Bitmagnet GraphQL，带图片缓存/转码代理，支持多源元数据聚合。
- **富化代理（detail-service）**：FastAPI 异步实现的 Torznab 代理，透传 Bitmagnet 并补充 TMDB/豆瓣数据，输出 JSON 与 HTML 详情页，同时提供缓存统计与健康检查。
- **缓存与性能**：后端对 TMDB、GraphQL、豆瓣、详情数据做 TTL 缓存；前端图片代理落地本地磁盘缓存并支持 WebP 转码。
- **可移植性**：所有配置通过 `.env` 控制（BITMAGNET_URL、TMDB_API_KEY、PUBLIC_HOST/PROTOCOL 等），除数据库连接外均提供默认值；提供 Dockerfile + docker-compose 一键启动。
