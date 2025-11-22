# 构建方法

## 依赖
- Node.js 18+、npm
- Python 3.12+
- （可选）Docker / Docker Compose

## 本地构建

### 后端（FastAPI）
```bash
cd detail-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# 运行测试
pytest
```

### 前端（React + Vite）
```bash
cd search-service
npm install
npm run build
npm run preview
```

## Docker 构建

后端与前端均提供 Dockerfile：
```bash
docker build -t auroramag-backend ./detail-service
docker build -t auroramag-frontend ./search-service
```

或使用根目录的 `docker-compose.yml` 统一构建（见 doc/run.md）。
