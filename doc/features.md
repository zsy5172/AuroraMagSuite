# 功能介绍

AuroraMag Suite 由前端搜索 UI 与后端富化代理组成，均以 Bitmagnet 作为唯一数据源，不自建业务数据库。

- **搜索体验（search-service）**：Vue 3 + Vite + Element Plus 前端，直接调用 Bitmagnet GraphQL，采用简洁的搜索引擎式界面。
- **富化代理（detail-service）**：FastAPI 异步实现的 Torznab 代理，只读取 Bitmagnet GraphQL/Torznab 原始数据，输出 JSON 与 HTML 详情页。
- **轻量架构**：后端不再做 TMDB/豆瓣匹配和缓存，保持纯查询逻辑；前端仅保留搜索和详情跳转所需的最小逻辑。
- **可移植性**：所有配置通过 `.env` 控制（BITMAGNET_URL、TMDB_API_KEY、PUBLIC_HOST/PROTOCOL 等），除数据库连接外均提供默认值；提供 Dockerfile + docker-compose 一键启动。
