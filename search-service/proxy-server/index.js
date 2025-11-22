import express from 'express';
import fetch from 'node-fetch';
import sharp from 'sharp';
import { createHash } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const app = express();
const PORT = 3335;
const CACHE_DIR = './cache/images';

// 确保缓存目录存在
await mkdir(CACHE_DIR, { recursive: true });

// 图片缓存代理
app.get('/proxy/image', async (req, res) => {
  try {
    const { url, width, quality = 80 } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    // 生成缓存文件名
    const hash = createHash('md5').update(url).digest('hex');
    const cacheFile = path.join(CACHE_DIR, `${hash}_${width || 'original'}.webp`);

    // 检查缓存
    if (existsSync(cacheFile)) {
      const cached = await readFile(cacheFile);
      res.set('Content-Type', 'image/webp');
      res.set('X-Cache', 'HIT');
      return res.send(cached);
    }

    // 获取原始图片
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    let image = sharp(Buffer.from(buffer));

    // 调整大小和优化
    if (width) {
      image = image.resize(parseInt(width), null, { 
        fit: 'inside',
        withoutEnlargement: true 
      });
    }

    const processed = await image
      .webp({ quality: parseInt(quality) })
      .toBuffer();

    // 保存到缓存
    await writeFile(cacheFile, processed);

    res.set('Content-Type', 'image/webp');
    res.set('X-Cache', 'MISS');
    res.send(processed);
  } catch (error) {
    console.error('Image proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// TMDB API 代理（支持多语言）
app.get('/media/tmdb/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    const { language = 'zh-CN' } = req.query;
    
    const TMDB_API_KEY = '2d3f759b032bec6e59b095613f9c8114';
    const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_API_KEY}&language=${language}&append_to_response=images,credits`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fanart.tv API 代理（需要申请 API key）
app.get('/media/fanart/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    // 需要在 https://fanart.tv/get-an-api-key/ 申请
    const FANART_API_KEY = process.env.FANART_API_KEY || '';
    
    if (!FANART_API_KEY) {
      return res.json({ 
        info: 'Fanart.tv API key not configured. Get one at https://fanart.tv/get-an-api-key/' 
      });
    }
    
    const url = `https://webservice.fanart.tv/v3/${type}/${id}?api_key=${FANART_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// OMDB API 代理（IMDB 数据）
app.get('/media/omdb/:imdbId', async (req, res) => {
  try {
    const { imdbId } = req.params;
    // 在 http://www.omdbapi.com/apikey.aspx 申请免费 key
    const OMDB_API_KEY = process.env.OMDB_API_KEY || '';
    
    if (!OMDB_API_KEY) {
      return res.json({ 
        info: 'OMDB API key not configured. Get one at http://www.omdbapi.com/apikey.aspx' 
      });
    }
    
    const url = `http://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 缓存统计
app.get('/media/cache/stats', async (req, res) => {
  try {
    const { readdir, stat } = await import('fs/promises');
    const files = await readdir(CACHE_DIR);
    let totalSize = 0;
    
    for (const file of files) {
      const stats = await stat(path.join(CACHE_DIR, file));
      totalSize += stats.size;
    }
    
    res.json({
      files: files.length,
      totalSize: totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Proxy server running on http://localhost:${PORT}`);
  console.log(`📁 Cache directory: ${CACHE_DIR}`);
});
