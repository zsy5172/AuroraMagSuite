# AuroraMag Suite

> AuroraMag Suite = AuroraMag Search UI + AuroraMag Detail Proxy，一套围绕 Bitmagnet 打造的精致搜索 & 详情体验，默认剔除所有成人/JAV 逻辑，适合直接开源发布。

## 模块构成

- **AuroraMag Search UI (`search-service/`)**：React + Vite 前端，直接消费 Bitmagnet GraphQL，内置图片代理、缓存统计、磁力复制等功能。
- **AuroraMag Detail Proxy (`detail-service/`)**：基于 Express 的 Torznab 代理 + 富详情页服务，聚合 Bitmagnet GraphQL/Torznab、TMDB、豆瓣等数据，为 Prowlarr/Sonarr/Radarr 提供一致体验。

AuroraMag Suite 将搜索与详情拆分为两个独立服务：
- Search UI 负责「发现与浏览」。
- Detail Proxy 负责「富化、预告片、文件树与 Torznab 协议」。

两者仍以 **Bitmagnet** 为唯一数据源。

## 目录结构

```
.
├── detail-service/    # AuroraMag Detail Proxy 源码
└── search-service/    # AuroraMag Search UI 源码
```

## 前置条件

1. **已运行的 Bitmagnet**（默认 GraphQL/Torznab 暴露在 `http://localhost:3333`）。
2. **Node.js 18+** 与 npm。
3. 可选：**Prowlarr**（集中管理索引器）。

> 如果 Bitmagnet 不在本机，请在 `detail-service/server.js` 内更新 `BITMAGNET_URL`，并在 `search-service/vite.config.js` 中调整 `/graphql` 代理目标。

## AuroraMag Detail Proxy（detail-service）

1. 安装与启动：
   ```bash
   cd detail-service
   npm install
   npm run start      # 或 npm run dev
   ```
2. 默认监听 `http://0.0.0.0:3337`，内部会：
   - 调用 Bitmagnet Torznab 搜索获取基础种子数据；
   - 调用 Bitmagnet GraphQL 查询文件树；
   - 读取 TMDB / 豆瓣 / Fanart 信息，生成富 JSON 与 HTML 页面；
   - 缓存 TMDB、GraphQL、详情数据并暴露 `/api/cache/*` 状态接口。
3. 环境变量：
   ```bash
   PUBLIC_HOST=example.com:9696   # 对外可访问的域名:端口，用于生成详情页链接
   PUBLIC_PROTOCOL=https          # http / https，默认 http
   ```
4. 接入 Prowlarr：
   1. Settings → Indexers → Add → *Generic Torznab*
   2. URL: `http://<detail-service-host>:3337/torznab/`
   3. API Key 留空，Categories 按需勾选（如 2000,5000）
   4. Test → Save。此后在 Sonarr/Radarr 中点击结果即可跳转到 AuroraMag 富化详情页。

## AuroraMag Search UI（search-service）

1. 安装与启动：
   ```bash
   cd search-service
   npm install
   npm run dev   # 同时启动 Vite(3336) + 图片代理(3335)
   ```
2. 访问 `http://localhost:3336` 体验前端。开发代理默认：
   - `/graphql` → `http://localhost:3333`
   - `/api`、`/proxy` → `http://localhost:3335`
3. 生产构建：
   ```bash
   npm run build
   npm run preview   # 本地校验 dist
   ```
   将 `dist/` 部署到任意静态站点，并部署 `proxy-server/index.js` 以提供图片缓存/跨域代理。
4. 可选 `.env`（项目根目录）配置第三方 API：
   ```env
   OMDB_API_KEY=xxxx
   FANART_API_KEY=yyyy
   ```

## AuroraMag x Bitmagnet x Prowlarr 工作流

1. **Bitmagnet** 从 DHT/Torznab 汇聚数据，并暴露 GraphQL + Torznab 接口。
2. **AuroraMag Detail Proxy** 调用 Bitmagnet，融合 TMDB/豆瓣图片、预告片、文件树，生成 Torznab 结果与 `/details/{infoHash}` 页面。
3. **Prowlarr** 将 Detail Proxy 作为索引器注入 Sonarr/Radarr，统一搜索入口。
4. **AuroraMag Search UI** 直接使用 Bitmagnet GraphQL，提供更优雅的搜索体验，可在 UI 中附加 Detail Proxy 外链。

## 自检清单

| 目标 | 命令 / URL |
|------|------------|
| Torznab 能力声明 | `curl "http://localhost:3337/torznab/?t=caps"` |
| 富化详情页 | `http://localhost:3337/details/<infoHash>` |
| JSON API | `curl http://localhost:3337/api/details/<infoHash> | jq` |
| 启动 Search UI | `npm run dev`（search-service）→ `http://localhost:3336` |
| 前端构建 | `npm run build`（search-service） |

## 已移除内容

- 所有成人/JAV 相关函数、样式、演示数据已删除。
- AuroraMag 仅保留通用关键词提取 + 推荐逻辑，欢迎在 `extractKeywords / generateRelatedKeywords / findRelatedContent` 上拓展其他垂直场景。

## 后续建议

- 通过 `.env` 暴露 `BITMAGNET_URL`、`PUBLIC_HOST` 等配置，方便多环境部署。
- 在 Search UI 内加入跳转 AuroraMag Detail Proxy 的按钮，打通端到端体验。
- 以 Docker Compose 打包 Bitmagnet、AuroraMag Detail Proxy、AuroraMag Search UI、Prowlarr，形成一键启动方案。

欢迎基于 AuroraMag Suite 继续扩展并对外发布！
