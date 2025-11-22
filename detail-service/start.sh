#!/bin/bash
cd "$(dirname "$0")"

# 设置公网访问地址
export PUBLIC_HOST="${PUBLIC_HOST:-117.72.71.38:9696}"
export PUBLIC_PROTOCOL="${PUBLIC_PROTOCOL:-http}"

echo "🚀 启动 AuroraMag Detail Proxy..."
echo "🌐 公网地址: ${PUBLIC_PROTOCOL}://${PUBLIC_HOST}"
echo ""

npm install
echo ""
echo "✅ 服务器启动成功！"
echo "📡 本地访问: http://localhost:3337"
echo "🌐 公网访问: ${PUBLIC_PROTOCOL}://${PUBLIC_HOST}/details/"
echo ""
echo "📋 在 Prowlarr 中配置:"
echo "   URL: http://localhost:3337/torznab/"
echo ""
npm start
