# AuroraMag Search UI

基于 Bitmagnet GraphQL 的现代化搜索界面，内置图片缓存代理与多数据源聚合，适用于 AuroraMag Suite。

## ✨ 功能特性

1. **🎨 美化界面** —— Tailwind + 自适应布局，支持深色渐变主题。
2. **🖼️ 图片缓存代理** —— 自动缓存 TMDB 图片，支持 WebP 转换与自定义尺寸。
3. **🌐 多元数据源** —— 统一访问 TMDB / OMDB / Fanart.tv，自动补全元数据。
4. **⚡ 性能优化** —— React 18 + React Query，懒加载 + 并行请求。
5. **📊 缓存统计** —— 内置面板实时查看图片代理缓存命中率与空间占用。

## 🚀 快速开始

### 安装依赖
```bash
npm install
```

### 启动开发服务器
```bash
npm run dev
```

这将同时启动：
- 前端开发服务器：http://localhost:3336
- 图片代理服务器：http://localhost:3335

### 构建生产版本
```bash
npm run build
npm run preview
```

## 🔧 配置

### 可选 API Keys

编辑 `.env` 文件（需要创建）：

```env
# OMDB API (免费申请: http://www.omdbapi.com/apikey.aspx)
OMDB_API_KEY=your_omdb_key

# Fanart.tv API (申请: https://fanart.tv/get-an-api-key/)
FANART_API_KEY=your_fanart_key
```

## 📦 架构说明

```
search-service/
├── proxy-server/         # 图片缓存代理服务器
│   └── index.js          # Express 服务器，处理图片缓存和 API 代理
├── src/
│   ├── components/       # React 组件
│   ├── api.js            # GraphQL / REST 封装
│   ├── App.jsx           # 主应用
│   └── main.jsx          # 入口文件
└── cache/                # 图片缓存目录（自动创建）
```

## 🌟 高级接口

### 图片代理
```javascript
GET /proxy/image?url=https://image.tmdb.org/t/p/w500/poster.jpg&width=300&quality=80
```

### 元数据代理
```javascript
GET /api/tmdb/movie/550?language=zh-CN
GET /api/omdb/tt0137523
GET /api/fanart/movie/550
```

## 📝 待办功能

- [ ] 高级筛选与排序
- [ ] 收藏 / 最近搜索
- [ ] 详情页跳转 AuroraMag Detail Proxy
- [ ] 离线缓存管理界面
- [ ] 数据导出

## 📄 许可证

MIT
