#!/bin/bash
echo "🚀 启动 AuroraMag Search UI"
echo ""
echo "📦 安装依赖中..."
npm install

echo ""
echo "🔥 启动开发服务器..."
echo "   - 前端: http://localhost:3336"
echo "   - 媒体代理: http://localhost:3335"
echo ""
npm run dev -- --host
