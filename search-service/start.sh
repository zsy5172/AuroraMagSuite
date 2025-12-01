#!/bin/bash
echo "🚀 启动 AuroraMag Search UI"
echo ""
echo "📦 安装依赖中..."
npm install

echo ""
echo "🔥 启动开发服务器..."
echo "   - 前端: http://localhost:3336"
echo ""
npm run dev -- --host --port 3336
