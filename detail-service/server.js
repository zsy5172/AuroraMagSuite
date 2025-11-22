import express from 'express';
import fetch from 'node-fetch';
import xml2js from 'xml2js';
import NodeCache from 'node-cache';

const app = express();
const PORT = 3337;
const BITMAGNET_URL = 'http://localhost:3333';
const TMDB_API_KEY = '2d3f759b032bec6e59b095613f9c8114';

// 公网访问地址配置
const PUBLIC_HOST = process.env.PUBLIC_HOST || '117.72.71.38:9696';
const PUBLIC_PROTOCOL = process.env.PUBLIC_PROTOCOL || 'http';

// 缓存配置
const tmdbCache = new NodeCache({ 
  stdTTL: 86400,  // TMDB 数据缓存 24 小时
  checkperiod: 3600,  // 每小时检查过期
  useClones: false  // 性能优化，不克隆对象
});

const graphqlCache = new NodeCache({ 
  stdTTL: 3600,  // GraphQL 查询缓存 1 小时
  checkperiod: 600,  // 每 10 分钟检查过期
  useClones: false
});

const torrentDetailsCache = new NodeCache({ 
  stdTTL: 7200,  // 种子详情缓存 2 小时
  checkperiod: 600,
  useClones: false
});

const doubanCache = new NodeCache({ 
  stdTTL: 604800,  // 豆瓣数据缓存 7 天
  checkperiod: 3600,
  useClones: false
});

// 缓存统计
let cacheStats = {
  tmdb: { hits: 0, misses: 0 },
  graphql: { hits: 0, misses: 0 },
  details: { hits: 0, misses: 0 },
  douban: { hits: 0, misses: 0 }
};

// 带缓存的 GraphQL 查询
async function queryBitmagnetCached(query, variables = {}) {
  const cacheKey = JSON.stringify({ query, variables });
  const cached = graphqlCache.get(cacheKey);
  
  if (cached) {
    cacheStats.graphql.hits++;
    console.log('✅ GraphQL cache HIT:', Object.keys(variables)[0] || 'query');
    return cached;
  }
  
  cacheStats.graphql.misses++;
  console.log('❌ GraphQL cache MISS:', Object.keys(variables)[0] || 'query');
  
  const result = await queryBitmagnet(query, variables);
  if (result && !result.errors) {
    graphqlCache.set(cacheKey, result);
  }
  return result;
}

// 带缓存的 TMDB 请求
async function fetchTMDBCached(url) {
  const cached = tmdbCache.get(url);
  
  if (cached) {
    cacheStats.tmdb.hits++;
    console.log('✅ TMDB cache HIT');
    return cached;
  }
  
  cacheStats.tmdb.misses++;
  console.log('❌ TMDB cache MISS');
  
  try {
    const response = await fetch(url, { timeout: 5000 });
    const data = await response.json();
    if (data && !data.status_code) {  // TMDB 错误会有 status_code
      tmdbCache.set(url, data);
    }
    return data;
  } catch (error) {
    console.error('TMDB fetch error:', error.message);
    return null;
  }
}

// 豆瓣搜索和评分获取
async function searchDouban(title, year) {
  try {
    let searchQuery = '';
    
    // 策略1: 优先提取连续的英文词（最少2个单词）
    const multiWordMatch = title.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/);
    if (multiWordMatch) {
      searchQuery = multiWordMatch[1]
        .replace(/^(The|A|An)\s+/i, '') // 去掉冠词
        .split(/\s+/)
        .filter(w => !w.match(/^(II|III|IV|V|VI|Revolutions?|Reloaded|Resurrection)$/i))
        .slice(0, 3) // 最多取3个词
        .join(' ');
    }
    
    // 策略2: 如果没找到，尝试单个长英文单词
    if (!searchQuery || searchQuery.length < 3) {
      const singleWordMatch = title.match(/\b([A-Z][a-z]{3,})\b/);
      if (singleWordMatch) {
        searchQuery = singleWordMatch[1];
      }
    }
    
    // 策略3: 使用中文标题
    if (!searchQuery || searchQuery.length < 3) {
      const chineseMatch = title.match(/^[\u4e00-\u9fa5]+/);
      if (chineseMatch) {
        searchQuery = chineseMatch[0]
          .replace(/[特效字幕]/g, '')
          .replace(/\d+/g, '')
          .substring(0, 10);
      }
    }
    
    // 清理搜索词
    searchQuery = searchQuery.trim();
    
    if (searchQuery.length < 2) {
      console.log('豆瓣搜索词无效，跳过');
      return null;
    }
    
    console.log(`🔍 豆瓣搜索词: "${searchQuery}" (年份: ${year || '无'})`);
    
    // 检查缓存
    const cacheKey = `${searchQuery}_${year || 'noyear'}`;
    const cached = doubanCache.get(cacheKey);
    
    if (cached) {
      cacheStats.douban.hits++;
      console.log('✅ Douban cache HIT');
      return cached;
    }
    
    cacheStats.douban.misses++;
    
    // 豆瓣搜索 API
    const searchUrl = `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(searchQuery)}`;
    
    const response = await fetch(searchUrl, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://movie.douban.com'
      }
    });
    
    if (!response.ok) {
      console.log('豆瓣搜索API失败:', response.status);
      return null;
    }
    
    const results = await response.json();
    
    if (!results || results.length === 0) {
      console.log('豆瓣无搜索结果');
      doubanCache.set(cacheKey, null);
      return null;
    }
    
    // 选择最佳匹配
    let bestMatch = results[0];
    if (year && results.length > 1) {
      const yearMatch = results.find(r => r.year && r.year.includes(year));
      if (yearMatch) {
        bestMatch = yearMatch;
      }
    }
    
    const doubanId = bestMatch.id;
    const doubanUrl = `https://movie.douban.com/subject/${doubanId}/`;
    
    const doubanData = {
      id: doubanId,
      title: bestMatch.title || bestMatch.sub_title,
      year: bestMatch.year,
      url: doubanUrl,
      rating: null,
      rating_count: null,
      poster: bestMatch.img || null
    };
    
    // 获取评分
    try {
      const detailUrl = `https://movie.douban.com/j/subject_abstract?subject_id=${doubanId}`;
      const detailResponse = await fetch(detailUrl, {
        timeout: 3000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': doubanUrl
        }
      });
      
      if (detailResponse.ok) {
        const detailData = await detailResponse.json();
        if (detailData.subject) {
          doubanData.rating = detailData.subject.rate || null;
          doubanData.rating_count = detailData.subject.votes || null;
        }
      }
    } catch (e) {
      // 评分获取失败不影响基本信息
    }
    
    doubanCache.set(cacheKey, doubanData);
    console.log(`✅ 豆瓣: ${doubanData.title} - ${doubanData.rating || '无评分'}/10`);
    
    return doubanData;
    
  } catch (error) {
    console.error('Douban error:', error.message);
    return null;
  }
}

// 从标题中提取关键词（通用）
function extractKeywords(title, category) {
  const keywords = [];
  
  // 提取年份（优先）
  const yearMatch = title.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) {
    keywords.push(yearMatch[0]);
  }
  
  // 清理标题
  let cleanTitle = title
    .replace(/\[.*?\]/g, ' ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/【.*?】/g, ' ')
    .replace(/\d{3,4}p/gi, ' ')
    .replace(/\b(HEVC|x264|x265|H\.264|H\.265|AVC|X264|XVID|DIVX)\b/gi, ' ')
    .replace(/\b(BluRay|BRRip|WEB-DL|WEBRip|HDTV|DVDRip|BDRip|BD\d+P)\b/gi, ' ')
    .replace(/\b(AAC|DTS|AC3|MP3|FLAC|TrueHD|Atmos|DTS-HD\.MA|MA)\b/gi, ' ')
    .replace(/\b(PROPER|REPACK|INTERNAL|LIMITED|UNRATED|EXTENDED|SDR|HDR)\b/gi, ' ')
    .replace(/\b(English|Mandarin|CHS|CHT|ENG|中英|字幕|特效)\b/gi, ' ')
    .replace(/&/g, ' ');
  
  if (category === 'movie' || category === 'tv') {
    // 找出所有大写开头的英文单词
    const allWords = cleanTitle.split(/[\s\.\-_,:：]+/).filter(w => 
      w.match(/^[A-Z]/) && w.match(/^[A-Za-z]+$/) && w.length >= 3
    );
    
    // 过滤掉技术词汇
    const meaningfulWords = allWords.filter(w => 
      !w.match(/^(FFans|星星|Fans)$/i)
    );
    
    // 查找连续的有意义单词（通常是片名）
    if (meaningfulWords.length >= 2) {
      const titleCandidate = meaningfulWords.slice(0, Math.min(4, meaningfulWords.length)).join(' ');
      keywords.push(titleCandidate);
      
      meaningfulWords.slice(0, 4).forEach(word => {
        if (!word.match(/^(The|And)$/i)) {
          keywords.push(word);
        }
      });
    }
    
    // 提取系列/续集信息
    const sequelPatterns = [
      /\b(Part|Vol|Volume|Chapter|Episode|Season|Series)\s*(\d+|[IVX]+)\b/gi,
      /\b(II|III|IV|V|VI|VII|VIII|IX|X)\b/g,
      /[第]\s*[一二三四五六七八九十\d]+\s*[季部集]/g
    ];
    
    sequelPatterns.forEach(pattern => {
      const matches = title.match(pattern);
      if (matches) matches.forEach(m => keywords.push(m));
    });
    
  } else if (category === 'pc-games' || category === 'console-games') {
    const versionPatterns = [
      /\b(GOTY|Game of the Year|Deluxe|Ultimate|Complete|Definitive|Enhanced)\b/gi,
      /\b(v\d+\.\d+|\d+\.\d+\.\d+)\b/gi,
      /\b(DLC|Expansion|Update)\b/gi
    ];
    
    versionPatterns.forEach(pattern => {
      const matches = cleanTitle.match(pattern);
      if (matches) matches.forEach(m => keywords.push(m));
    });
    
    const gameWords = cleanTitle.split(/[\s\.\-_]+/).filter(w => w.length >= 3 && w.length <= 30 && w.match(/[a-zA-Z]/)).slice(0, 4);
    keywords.push(...gameWords);
    
  } else if (category === 'pc-0day' || category === 'pc') {
    const versionMatch = cleanTitle.match(/\b(v?\d+\.\d+[\.\d]*)\b/i);
    if (versionMatch) keywords.push(versionMatch[0]);
    
    const softwareWords = cleanTitle.split(/[\s\.\-_]+/).filter(w => w.length >= 2 && w.length <= 30 && w.match(/[a-zA-Z]/)).slice(0, 3);
    keywords.push(...softwareWords);
    
  } else {
    const words = cleanTitle.split(/[\s\.\-_]+/).filter(w => w.length >= 3 && w.length <= 30 && w.match(/[a-zA-Z]/)).slice(0, 4);
    keywords.push(...words);
  }
  
  const filtered = [...new Set(keywords)]
    .filter(k => k && k.trim().length >= 2)
    .filter(k => !k.match(/^(The|And|For|With|From|Of|In|On|At|By)$/i))
    .map(k => k.trim());
  
  console.log(`🔍 关键词提取: ${filtered.join(', ')}`);
  return filtered.slice(0, 8);
}

// 生成关联关键词（基于主关键词扩展）
function generateRelatedKeywords(keywords, category, title) {
  const relatedKeywords = [...keywords];
  
  // 电影/电视剧的关联词
  if (category === 'movie' || category === 'tv') {
    // 如果有年份，添加前后一年
    const yearMatch = keywords.find(k => k.match(/^(19|20)\d{2}$/));
    if (yearMatch) {
      const year = parseInt(yearMatch);
      relatedKeywords.push((year - 1).toString());
      relatedKeywords.push((year + 1).toString());
    }
    
    // 如果有续集标记，添加相邻续集
    const sequelMatch = keywords.find(k => k.match(/\b(Part|Vol|II|III|IV|V)\b/i));
    if (sequelMatch) {
      // 添加系列主名（去掉续集标记）
      const mainTitle = keywords.find(k => k.length >= 4 && k !== sequelMatch);
      if (mainTitle) {
        relatedKeywords.push(mainTitle);
      }
    }
    
    // 添加常见系列关联
    const seriesMap = {
      'Marvel': ['MCU', 'Avengers', 'Spider', 'Iron Man', 'Captain'],
      'DC': ['Batman', 'Superman', 'Justice League', 'Wonder Woman'],
      'Star Wars': ['Skywalker', 'Mandalorian', 'Jedi', 'Sith'],
      'Star Trek': ['Enterprise', 'Voyager', 'Discovery', 'Picard'],
      'Harry Potter': ['Wizarding', 'Fantastic Beasts', 'Hogwarts'],
      'Lord of the Rings': ['Hobbit', 'Middle Earth', 'LOTR'],
      'Fast': ['Furious', 'Fast and Furious'],
      'Mission Impossible': ['MI', 'Impossible'],
    };
    
    Object.entries(seriesMap).forEach(([key, related]) => {
      if (title.toLowerCase().includes(key.toLowerCase())) {
        relatedKeywords.push(...related);
      }
    });
  }
  
  // 游戏的关联词
  if (category === 'pc-games' || category === 'console-games') {
    const gameSeriesMap = {
      'Call of Duty': ['COD', 'Modern Warfare', 'Black Ops', 'Warzone'],
      'Assassin': ['AC', 'Creed', 'Ubisoft'],
      'Grand Theft Auto': ['GTA', 'Rockstar'],
      'Elder Scrolls': ['Skyrim', 'Oblivion', 'Morrowind', 'TES'],
      'Fallout': ['Bethesda', 'Wasteland'],
      'Witcher': ['Geralt', 'CD Projekt'],
      'Dark Souls': ['Elden Ring', 'Bloodborne', 'Sekiro', 'FromSoftware'],
      'Final Fantasy': ['FF', 'Square Enix'],
    };
    
    Object.entries(gameSeriesMap).forEach(([key, related]) => {
      if (title.toLowerCase().includes(key.toLowerCase())) {
        relatedKeywords.push(...related);
      }
    });
  }
  
  return [...new Set(relatedKeywords)].slice(0, 10);
}

// 查找相关内容（通用）- 使用 Torznab API
async function findRelatedContent(keywords, infoHash, category, title) {
  try {
    if (!keywords || keywords.length === 0) {
      return [];
    }
    
    // 生成关联关键词
    const relatedKeywords = generateRelatedKeywords(keywords, category, title);
    const searchTerms = relatedKeywords.slice(0, 4); // 最多搜索4个关联词
    
    console.log(`🔍 智能搜索: [${searchTerms.join(', ')}]`);
    
    // 使用 Torznab API 并行搜索（更可靠）
    const searchPromises = searchTerms.map(async term => {
      try {
        const searchUrl = `${BITMAGNET_URL}/torznab/?t=search&q=${encodeURIComponent(term)}&limit=8`;
        const response = await fetch(searchUrl);
        const xmlText = await response.text();
        
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(xmlText);
        
        const items = result.rss?.channel?.[0]?.item || [];
        return items.map(item => ({
          infoHash: item.guid[0],
          name: item.title[0],
          size: parseInt(item.size[0]),
          publishedAt: item.pubDate[0],
          seeders: parseInt(item['torznab:attr']?.find(a => a.$.name === 'seeders')?.$.value || 0),
          leechers: parseInt(item['torznab:attr']?.find(a => a.$.name === 'peers')?.$.value || 0)
        }));
      } catch (e) {
        console.error(`搜索 "${term}" 失败:`, e.message);
        return [];
      }
    });
    
    const results = await Promise.all(searchPromises);
    
    // 合并结果并去重
    const allItems = [];
    const seenHashes = new Set([infoHash]);
    
    results.forEach(items => {
      items.forEach(item => {
        if (!seenHashes.has(item.infoHash)) {
          seenHashes.add(item.infoHash);
          allItems.push(item);
        }
      });
    });
    
    console.log(`🔍 找到 ${allItems.length} 个相关内容`);
    
    // 按相关性排序（基于关键词匹配度）
    const scoredItems = allItems.map(item => {
      let matchScore = 0;
      const itemTitleLower = item.name.toLowerCase();
      
      // 计算关键词匹配分数
      keywords.forEach(keyword => {
        if (itemTitleLower.includes(keyword.toLowerCase())) {
          matchScore += 2;
        }
      });
      
      relatedKeywords.forEach(keyword => {
        if (itemTitleLower.includes(keyword.toLowerCase())) {
          matchScore += 1;
        }
      });
      
      return {
        ...item,
        matchScore
      };
    });
    
    // 按匹配分数排序
    return scoredItems
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 12);
    
  } catch (error) {
    console.error('Find related content error:', error);
    return [];
  }
}

// 质量分析（基于文件大小）
function analyzeQuality(size) {
  const sizeGB = size / (1024 * 1024 * 1024);
  
  if (sizeGB < 1) return { quality: 'SD', label: '标清', color: '#94a3b8' };
  if (sizeGB < 3) return { quality: 'HD', label: '高清', color: '#3b82f6' };
  if (sizeGB < 8) return { quality: 'FHD', label: '全高清', color: '#8b5cf6' };
  return { quality: '4K', label: '超高清', color: '#f59e0b' };
}

// 计算推荐分数（综合健康度、质量、时间）
function calculateRecommendationScore(item) {
  const qualityInfo = analyzeQuality(item.size);
  const qualityScore = { 'SD': 1, 'HD': 2, 'FHD': 3, '4K': 4 }[qualityInfo.quality] || 1;
  const healthScore = (item.seeders || 0) * 2 + (item.leechers || 0);
  const daysOld = item.publishedAt ? 
    (Date.now() - new Date(item.publishedAt).getTime()) / (1000 * 60 * 60 * 24) : 365;
  const recencyScore = Math.max(0, 100 - daysOld / 3.65); // 100分递减到0（1年）
  
  return qualityScore * 10 + healthScore / 10 + recencyScore / 10;
}

// 从种子标题提取图片的辅助函数
function extractImagesFromTitle(title, infoHash) {
  const images = [];
  
  // 1. 使用 infoHash 生成预览图（通过 btdig.com 等服务）
  images.push({
    type: 'torrent_preview',
    url: `https://btdig.com/search?q=${infoHash}`,
    thumbnail: null,
    source: 'BTDig'
  });
  
  // 2. 从文件名提取可能的标识符（IMDB, TMDB等）
  const imdbMatch = title.match(/tt\d{7,8}/i);
  if (imdbMatch) {
    const imdbId = imdbMatch[0];
    images.push({
      type: 'imdb',
      url: `https://www.imdb.com/title/${imdbId}/`,
      thumbnail: null,
      source: 'IMDB'
    });
  }
  
  // 3. 从标题搜索图片
  const cleanTitle = title.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();
  if (cleanTitle) {
    // 可以添加更多图片搜索引擎
    images.push({
      type: 'search',
      url: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(cleanTitle)}`,
      thumbnail: null,
      source: 'Google Images'
    });
  }
  
  return images;
}

// 从文件列表中提取图片文件作为预览
function extractImageFiles(files) {
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
  return files.filter(file => {
    const ext = file.path.split('.').pop().toLowerCase();
    return imageExtensions.includes(ext);
  }).slice(0, 12); // 最多12张
}

// 文件类型映射
const FILE_TYPE_ICONS = {
  video: { icon: '🎬', extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', 'ts', 'm2ts'] },
  audio: { icon: '🎵', extensions: ['mp3', 'flac', 'wav', 'aac', 'ogg', 'wma', 'm4a', 'ape', 'dts', 'ac3'] },
  subtitle: { icon: '💬', extensions: ['srt', 'ass', 'ssa', 'sub', 'vtt', 'idx', 'sup'] },
  image: { icon: '🖼️', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'] },
  document: { icon: '📄', extensions: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'] },
  archive: { icon: '📦', extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'] },
  other: { icon: '📁', extensions: ['nfo', 'md', 'xml', 'json', 'exe', 'dll'] }
};

// 获取文件类型
function getFileType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  for (const [type, config] of Object.entries(FILE_TYPE_ICONS)) {
    if (config.extensions.includes(ext)) {
      return { type, icon: config.icon, ext };
    }
  }
  return { type: 'other', icon: '📄', ext };
}

// 分析文件列表统计
function analyzeFiles(files) {
  const stats = {
    byType: {},
    totalSize: 0,
    largestFile: null,
    fileCount: files.length
  };
  
  files.forEach(file => {
    const fileInfo = getFileType(file.path);
    const type = fileInfo.type;
    
    if (!stats.byType[type]) {
      stats.byType[type] = {
        count: 0,
        size: 0,
        icon: fileInfo.icon,
        files: []
      };
    }
    
    stats.byType[type].count++;
    stats.byType[type].size += file.size;
    stats.byType[type].files.push(file);
    stats.totalSize += file.size;
    
    if (!stats.largestFile || file.size > stats.largestFile.size) {
      stats.largestFile = file;
    }
  });
  
  return stats;
}

// GraphQL 查询辅助函数
async function queryBitmagnet(query, variables = {}) {
  const response = await fetch(`${BITMAGNET_URL}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  return response.json();
}

// 通过 infoHash 获取详细信息
async function getTorrentDetails(infoHash) {
  // 检查缓存
  const cached = torrentDetailsCache.get(infoHash);
  if (cached) {
    cacheStats.details.hits++;
    console.log(`✅ Details cache HIT: ${infoHash.substring(0, 8)}...`);
    return cached;
  }
  
  cacheStats.details.misses++;
  console.log(`❌ Details cache MISS: ${infoHash.substring(0, 8)}...`);
  
  try {
    // 先通过搜索 API 获取基本信息
    const searchUrl = `${BITMAGNET_URL}/torznab/?t=search&q=${infoHash}`;
    const response = await fetch(searchUrl);
    const xmlText = await response.text();
    
    // 解析 XML
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlText);
    
    if (!result.rss?.channel?.[0]?.item?.[0]) {
      return null;
    }
    
    const item = result.rss.channel[0].item[0];
    
    // 提取基本信息
    const torrentData = {
      infoHash,
      title: item.title[0],
      size: parseInt(item.size[0]),
      magnetUrl: item.enclosure[0].$.url,
      category: item.category?.[0] || 'other',
      pubDate: item.pubDate[0],
      attrs: {},
      files: []
    };
    
    // 提取关键词并尝试获取相关推荐
    const keywords = extractKeywords(torrentData.title, torrentData.category);
    if (keywords.length > 0) {
      console.log(`🔍 提取关键词: ${keywords.join(', ')}`);
      const relatedContent = await findRelatedContent(keywords, infoHash, torrentData.category, torrentData.title);
      
      if (relatedContent.length > 0) {
        torrentData.relatedContent = relatedContent.map(item => ({
          ...item,
          qualityInfo: analyzeQuality(item.size),
          score: calculateRecommendationScore(item)
        })).sort((a, b) => b.score - a.score).slice(0, 12);
        
        console.log(`✅ 找到 ${torrentData.relatedContent.length} 个相关推荐`);
      }
    }
    
    // 提取所有 torznab 属性
    if (item['torznab:attr']) {
      item['torznab:attr'].forEach(attr => {
        torrentData.attrs[attr.$.name] = attr.$.value;
      });
    }
    
    // 尝试通过 GraphQL 获取文件列表
    try {
      const filesQuery = `
        query GetFiles($infoHash: Hash20!) {
          torrent {
            files(input: { infoHashes: [$infoHash] }) {
              totalCount
              items {
                index
                path
                size
              }
            }
          }
        }
      `;
      
      const filesResult = await queryBitmagnet(filesQuery, { infoHash });
      if (filesResult?.data?.torrent?.files?.items?.length > 0) {
        torrentData.files = filesResult.data.torrent.files.items;
        torrentData.hasFilesInfo = true;
        // 分析文件统计
        torrentData.fileStats = analyzeFiles(torrentData.files);
        // 提取图片文件作为预览
        torrentData.imageFiles = extractImageFiles(torrentData.files);
      } else {
        torrentData.hasFilesInfo = false;
        torrentData.imageFiles = [];
      }
    } catch (e) {
      console.error('Files query error:', e);
      torrentData.hasFilesInfo = false;
      torrentData.imageFiles = [];
    }
    
    // 提取其他可能的图片来源
    torrentData.alternativeImages = extractImagesFromTitle(torrentData.title, infoHash);
    
    // 尝试获取 TMDB 元数据
    const tmdbId = torrentData.attrs.tmdb || torrentData.attrs.tmdbid;
    if (tmdbId && torrentData.category === 'movie') {
      try {
        // 先尝试中文，失败则用英文
        let tmdbData;
        const zhUrl = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=zh-CN&append_to_response=credits,images,videos`;
        const enUrl = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=credits,images,videos`;
        
        try {
          tmdbData = await fetchTMDBCached(zhUrl);
        } catch (zhError) {
          console.log('Chinese TMDB failed, trying English...');
          tmdbData = await fetchTMDBCached(enUrl);
        }
        
        if (tmdbData && !tmdbData.status_code) {
          torrentData.tmdb = tmdbData;
        }
      } catch (e) {
        console.error('TMDB fetch error:', e.message);
      }
    }
    
    // 尝试获取豆瓣数据（电影和电视剧）
    if (torrentData.category === 'movie' || torrentData.category === 'tv') {
      try {
        // 提取年份
        const yearMatch = torrentData.title.match(/\b(19\d{2}|20\d{2})\b/);
        const year = yearMatch ? yearMatch[0] : (torrentData.tmdb?.release_date ? torrentData.tmdb.release_date.substring(0, 4) : null);
        
        const doubanData = await searchDouban(torrentData.title, year);
        if (doubanData) {
          torrentData.douban = doubanData;
          console.log('✅ 豆瓣数据已添加:', doubanData.title, doubanData.rating);
        }
      } catch (e) {
        console.error('Douban fetch error:', e.message);
      }
    }
    
    // 缓存结果
    torrentDetailsCache.set(infoHash, torrentData);
    
    return torrentData;
  } catch (error) {
    console.error('getTorrentDetails error:', error);
    return null;
  }
}

// 增强 Torznab XML 响应
function enhanceTorznabXML(xmlData, detailedData) {
  // 这里可以添加自定义字段到 XML
  // Prowlarr 会在详情页显示这些信息
  return xmlData;
}

// Torznab 能力声明 - 支持多种路由格式
app.get(['/torznab/', '/torznab/api'], async (req, res) => {
  const { t, q, imdbid, tmdbid } = req.query;
  
  try {
    // 转发到原始 Bitmagnet Torznab API
    const params = new URLSearchParams(req.query);
    const response = await fetch(`${BITMAGNET_URL}/torznab/?${params}`);
    let xmlText = await response.text();
    
    // 如果是搜索请求，增强响应
    if (t === 'search' || t === 'movie-search' || t === 'tv-search') {
      const parser = new xml2js.Parser();
      const builder = new xml2js.Builder();
      const xmlObj = await parser.parseStringPromise(xmlText);
      
      if (xmlObj.rss?.channel?.[0]?.item) {
        // 优先使用公网地址，如果没有配置则从 headers 获取
        let baseUrl;
        if (PUBLIC_HOST && PUBLIC_HOST !== 'localhost:3337') {
          baseUrl = `${PUBLIC_PROTOCOL}://${PUBLIC_HOST}`;
          console.log('Using configured PUBLIC_HOST:', baseUrl);
        } else {
          const protocol = req.headers['x-forwarded-proto'] || 'http';
          const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3337';
          baseUrl = `${protocol}://${host}`;
          console.log('Using request headers:', baseUrl);
        }
        
        // 调试日志
        console.log('Request headers:', {
          'x-forwarded-proto': req.headers['x-forwarded-proto'],
          'x-forwarded-host': req.headers['x-forwarded-host'],
          'host': req.headers.host,
          'baseUrl': baseUrl
        });
        
        // 为每个结果添加增强信息
        for (const item of xmlObj.rss.channel[0].item) {
          const infoHash = item.guid[0];
          
          // 添加详情页链接
          if (!item.comments) {
            item.comments = [`${baseUrl}/details/${infoHash}`];
          }
          
          // 添加自定义属性
          if (!item['torznab:attr']) {
            item['torznab:attr'] = [];
          }
          
          // 添加图片 URL（如果有 TMDB ID）
          const tmdbAttr = item['torznab:attr']?.find(a => a.$.name === 'tmdbid');
          if (tmdbAttr) {
            const tmdbId = tmdbAttr.$.value;
            const posterUrl = `https://image.tmdb.org/t/p/w500/placeholder.jpg`; // 需要实际查询 TMDB
            
            item['torznab:attr'].push({
              $: { name: 'posterurl', value: posterUrl }
            });
            
            item['torznab:attr'].push({
              $: { name: 'backdropurl', value: `https://image.tmdb.org/t/p/original/placeholder.jpg` }
            });
          }
          
          // 添加详情 URL
          item['torznab:attr'].push({
            $: { name: 'details', value: `${baseUrl}/details/${infoHash}` }
          });
        }
        
        xmlText = builder.buildObject(xmlObj);
      }
    }
    
    res.set('Content-Type', 'application/xml');
    res.send(xmlText);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// 详情页 API（返回 JSON，供 Web UI 使用）
app.get('/api/details/:infoHash', async (req, res) => {
  const { infoHash } = req.params;
  
  try {
    const details = await getTorrentDetails(infoHash);
    
    if (!details) {
      return res.status(404).json({ error: 'Torrent not found' });
    }
    
    res.json(details);
  } catch (error) {
    console.error('Details API error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 详情页 HTML（在浏览器中显示）
app.get('/details/:infoHash', async (req, res) => {
  const { infoHash } = req.params;
  
  try {
    const details = await getTorrentDetails(infoHash);
    
    if (!details) {
      return res.status(404).send('Torrent not found');
    }
    
    // 生成 HTML 详情页
    const posterUrl = details.tmdb?.poster_path 
      ? `https://image.tmdb.org/t/p/w500${details.tmdb.poster_path}`
      : (details.douban?.poster || '');
    
    const backdropUrl = details.tmdb?.backdrop_path
      ? `https://image.tmdb.org/t/p/original${details.tmdb.backdrop_path}`
      : '';
    
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${details.title} - AuroraMag</title>
  <style>
    :root {
      /* Light theme (default) */
      --bg-gradient-start: #FAF3F0;
      --bg-gradient-mid: #F5EDE4;
      --bg-gradient-end: #EDE3D9;
      --bg-primary: rgba(255, 255, 255, 0.95);
      --bg-secondary: rgba(255, 255, 255, 0.9);
      --bg-card: rgba(255, 190, 152, 0.15);
      --bg-hover: rgba(255, 190, 152, 0.2);
      --text-primary: #3E2723;
      --text-secondary: #5D4037;
      --text-muted: #8D6E63;
      --accent-primary: #A47864;
      --accent-secondary: #FFBE98;
      --border-color: rgba(212, 165, 165, 0.25);
      --shadow-color: rgba(164, 120, 100, 0.15);
      --backdrop-overlay: rgba(250, 243, 240, 0.3);
      --backdrop-bottom: rgba(250, 243, 240, 1);
    }
    
    [data-theme="dark"] {
      /* Dark theme */
      --bg-gradient-start: #1a1a1a;
      --bg-gradient-mid: #242424;
      --bg-gradient-end: #2a2a2a;
      --bg-primary: rgba(30, 30, 30, 0.98);
      --bg-secondary: rgba(40, 40, 40, 0.95);
      --bg-card: rgba(60, 60, 60, 0.3);
      --bg-hover: rgba(80, 80, 80, 0.4);
      --text-primary: #e0e0e0;
      --text-secondary: #c0c0c0;
      --text-muted: #a0a0a0;
      --accent-primary: #FFBE98;
      --accent-secondary: #FFD4B8;
      --border-color: rgba(100, 100, 100, 0.3);
      --shadow-color: rgba(0, 0, 0, 0.4);
      --backdrop-overlay: rgba(26, 26, 26, 0.5);
      --backdrop-bottom: rgba(26, 26, 26, 1);
    }
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, var(--bg-gradient-start) 0%, var(--bg-gradient-mid) 50%, var(--bg-gradient-end) 100%);
      color: var(--text-primary);
      min-height: 100vh;
      transition: background 0.3s ease, color 0.3s ease;
    }
    .backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 50vh;
      background: linear-gradient(180deg, var(--backdrop-overlay) 0%, var(--backdrop-bottom) 100%),
                  url('${backdropUrl}') center/cover no-repeat;
      z-index: -1;
      transition: background 0.3s ease;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 1rem 2rem;
      width: 100%;
      box-sizing: border-box;
    }
    @media (max-width: 768px) {
      .container {
        padding: 0.5rem 1rem;
      }
    }
    .content {
      background: var(--bg-primary);
      backdrop-filter: blur(10px);
      border-radius: 1.5rem;
      padding: 2rem;
      margin-top: 12vh;
      box-shadow: 0 8px 40px var(--shadow-color);
      border: 1px solid var(--border-color);
      max-width: 100%;
      overflow-x: hidden;
      transition: all 0.3s ease;
    }
    @media (max-width: 768px) {
      .content {
        padding: 1rem;
        margin-top: 8vh;
        border-radius: 1rem;
      }
    }
    .header {
      display: flex;
      gap: 2rem;
      margin-bottom: 2rem;
      flex-wrap: wrap;
    }
    
    /* Theme toggle button */
    .theme-toggle {
      position: fixed;
      top: 2rem;
      right: 2rem;
      z-index: 1000;
      background: var(--bg-primary);
      border: 2px solid var(--border-color);
      border-radius: 50%;
      width: 50px;
      height: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 1.5rem;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px var(--shadow-color);
    }
    .theme-toggle:hover {
      transform: scale(1.1) rotate(15deg);
      box-shadow: 0 6px 20px var(--shadow-color);
    }
    @media (max-width: 768px) {
      .theme-toggle {
        top: 1rem;
        right: 1rem;
        width: 45px;
        height: 45px;
        font-size: 1.25rem;
      }
    }
    
    /* Keyboard hint button */
    .keyboard-hint {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      z-index: 1000;
      background: var(--bg-primary);
      border: 2px solid var(--border-color);
      border-radius: 50%;
      width: 45px;
      height: 45px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 1.25rem;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px var(--shadow-color);
      opacity: 0.6;
    }
    .keyboard-hint:hover {
      transform: scale(1.1);
      opacity: 1;
      box-shadow: 0 6px 20px var(--shadow-color);
    }
    @media (max-width: 768px) {
      .keyboard-hint {
        bottom: 1rem;
        right: 1rem;
        width: 40px;
        height: 40px;
        font-size: 1rem;
      }
    }
    
    .poster {
      flex-shrink: 0;
      width: 280px;
      border-radius: 1rem;
      box-shadow: 0 12px 35px rgba(164, 120, 100, 0.25);
      border: 3px solid rgba(212, 165, 165, 0.3);
    }
    .info {
      flex: 1;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
    }
    .info h1 {
      font-size: 2rem;
      margin-bottom: 1rem;
      background: linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      word-wrap: break-word;
      overflow-wrap: break-word;
      max-width: 100%;
    }
    @media (max-width: 768px) {
      .info h1 {
        font-size: 1.5rem;
      }
    }
    .overview {
      margin-top: 1rem;
      line-height: 1.8;
      color: var(--text-secondary);
      max-width: 100%;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .metadata {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      margin-top: 1.5rem;
    }
    .meta-item {
      background: linear-gradient(135deg, var(--bg-card), var(--bg-card));
      padding: 1rem;
      border-radius: 0.75rem;
      border: 1px solid var(--border-color);
      transition: all 0.3s;
    }
    .meta-item:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px var(--shadow-color);
      background: var(--bg-hover);
    }
    .meta-label {
      color: var(--text-muted);
      font-size: 0.875rem;
      margin-bottom: 0.5rem;
      font-weight: 500;
    }
    .meta-value {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--text-primary);
    }
      color: #3E2723;
    }
    .magnet-btn {
      display: inline-block;
      margin-top: 1.5rem;
      padding: 1rem 2.5rem;
      background: linear-gradient(135deg, #A47864 0%, #FFBE98 100%);
      color: white;
      text-decoration: none;
      border-radius: 2rem;
      font-weight: 600;
      transition: all 0.3s;
      box-shadow: 0 6px 20px rgba(164, 120, 100, 0.3);
      border: 2px solid rgba(255, 255, 255, 0.3);
    }
    .magnet-btn:hover {
      transform: translateY(-3px);
      box-shadow: 0 8px 25px rgba(164, 120, 100, 0.4);
    }
    
    /* 复制按钮 */
    .copy-btn {
      display: inline-block;
      margin-top: 1.5rem;
      margin-left: 1rem;
      padding: 1rem 2rem;
      background: var(--bg-secondary);
      color: var(--accent-primary);
      text-decoration: none;
      border-radius: 2rem;
      font-weight: 600;
      transition: all 0.3s;
      border: 2px solid var(--accent-primary);
      cursor: pointer;
      font-size: 1rem;
    }
    .copy-btn:hover {
      background: var(--bg-hover);
      transform: translateY(-3px);
      box-shadow: 0 4px 15px var(--shadow-color);
    }
    .copy-btn.copied {
      background: linear-gradient(135deg, #66bb6a, #43a047);
      color: white;
      border-color: #66bb6a;
    }
    
    /* 健康度信息 */
    .health-info {
      display: flex;
      gap: 1.5rem;
      margin-top: 1rem;
      padding: 1rem;
      background: linear-gradient(135deg, rgba(255, 245, 240, 0.6), rgba(250, 243, 240, 0.6));
      border-radius: 1rem;
      border: 1px solid rgba(212, 165, 165, 0.25);
    }
    .health-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .health-icon {
      font-size: 1.5rem;
    }
    .health-label {
      font-size: 0.875rem;
      color: #8D6E63;
    }
    .health-value {
      font-size: 1.25rem;
      font-weight: 700;
      color: #3E2723;
    }
    .health-good { color: #66bb6a; }
    .health-medium { color: #ff9800; }
    .health-poor { color: #f44336; }
    
    .files-section {
      margin-top: 2rem;
      background: linear-gradient(135deg, rgba(255, 245, 240, 0.6), rgba(250, 243, 240, 0.6));
      border-radius: 1rem;
      padding: 1.5rem;
      border: 1px solid rgba(212, 165, 165, 0.25);
    }
    .files-title {
      font-size: 1.5rem;
      margin-bottom: 1rem;
      color: #5D4037;
      font-weight: 600;
    }
    
    /* 文件搜索/过滤 */
    .file-controls {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }
    .search-box {
      flex: 1;
      min-width: 200px;
    }
    .search-input {
      width: 100%;
      padding: 0.75rem 1rem;
      border: 2px solid rgba(212, 165, 165, 0.3);
      border-radius: 2rem;
      font-size: 0.875rem;
      background: rgba(255, 255, 255, 0.9);
      color: #3E2723;
      transition: all 0.3s;
    }
    .search-input:focus {
      outline: none;
      border-color: #A47864;
      box-shadow: 0 0 0 3px rgba(164, 120, 100, 0.1);
    }
    .filter-buttons {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .filter-btn {
      padding: 0.5rem 1rem;
      border: 2px solid rgba(212, 165, 165, 0.3);
      border-radius: 1.5rem;
      background: rgba(255, 255, 255, 0.8);
      color: #5D4037;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.3s;
      font-weight: 500;
    }
    .filter-btn:hover {
      border-color: #A47864;
      background: rgba(255, 190, 152, 0.2);
    }
    .filter-btn.active {
      background: linear-gradient(135deg, #A47864, #FFBE98);
      color: white;
      border-color: #A47864;
    }
    .file-stats-mini {
      font-size: 0.875rem;
      color: #8D6E63;
      margin-top: 0.5rem;
    }
    
    .files-list {
      max-height: 400px;
      overflow-y: auto;
    }
    .file-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.875rem;
      margin-bottom: 0.5rem;
      background: rgba(255, 255, 255, 0.8);
      border-radius: 0.75rem;
      transition: all 0.3s;
      border: 1px solid rgba(212, 165, 165, 0.2);
    }
    .file-item:hover {
      background: rgba(255, 255, 255, 1);
      border-color: rgba(164, 120, 100, 0.4);
      transform: translateX(8px);
      box-shadow: 0 2px 8px rgba(164, 120, 100, 0.1);
    }
    .file-path {
      flex: 1;
      color: #5D4037;
      font-family: 'Courier New', monospace;
      font-size: 0.875rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-right: 1rem;
    }
    .file-size {
      color: #A47864;
      font-size: 0.875rem;
      white-space: nowrap;
      font-weight: 600;
    }
    .no-files {
      color: #8D6E63;
      font-style: italic;
      text-align: center;
      padding: 2rem;
    }
    .files-list::-webkit-scrollbar {
      width: 10px;
    }
    .files-list::-webkit-scrollbar-track {
      background: rgba(245, 237, 228, 0.5);
      border-radius: 5px;
    }
    .files-list::-webkit-scrollbar-thumb {
      background: rgba(164, 120, 100, 0.4);
      border-radius: 5px;
    }
    .files-list::-webkit-scrollbar-thumb:hover {
      background: rgba(164, 120, 100, 0.6);
    }
    .file-icon {
      margin-right: 0.5rem;
      font-size: 1.2rem;
    }
    
    /* TMDB 画廊 */
    .gallery-section {
      margin-top: 2rem;
      background: linear-gradient(135deg, rgba(255, 245, 240, 0.6), rgba(250, 243, 240, 0.6));
      border-radius: 1rem;
      padding: 1.5rem;
      border: 1px solid rgba(212, 165, 165, 0.25);
    }
    .gallery-title {
      font-size: 1.5rem;
      margin-bottom: 1rem;
      color: #5D4037;
      font-weight: 600;
    }
    .gallery-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1rem;
    }
    .gallery-item {
      position: relative;
      border-radius: 1rem;
      overflow: hidden;
      cursor: pointer;
      transition: all 0.4s;
      border: 2px solid rgba(212, 165, 165, 0.2);
    }
    .gallery-item:hover {
      transform: scale(1.08) rotate(2deg);
      border-color: rgba(164, 120, 100, 0.5);
      box-shadow: 0 8px 25px rgba(164, 120, 100, 0.25);
    }
    .gallery-item img {
      width: 100%;
      height: 300px;
      object-fit: cover;
      display: block;
    }
    
    /* 演员列表 */
    .cast-section {
      margin-top: 2rem;
      background: linear-gradient(135deg, rgba(255, 245, 240, 0.6), rgba(250, 243, 240, 0.6));
      border-radius: 1rem;
      padding: 1.5rem;
      border: 1px solid rgba(212, 165, 165, 0.25);
    }
    .cast-title {
      font-size: 1.5rem;
      margin-bottom: 1rem;
      color: #5D4037;
      font-weight: 600;
    }
    .cast-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: 1.25rem;
    }
    .cast-item {
      text-align: center;
      transition: transform 0.4s;
    }
    .cast-item:hover {
      transform: translateY(-8px) scale(1.05);
    }
    .cast-photo {
      width: 100%;
      height: 180px;
      object-fit: cover;
      border-radius: 1rem;
      margin-bottom: 0.75rem;
      background: linear-gradient(135deg, rgba(255, 190, 152, 0.2), rgba(212, 165, 165, 0.2));
      border: 3px solid rgba(212, 165, 165, 0.3);
      transition: all 0.3s;
    }
    .cast-item:hover .cast-photo {
      border-color: rgba(164, 120, 100, 0.6);
      box-shadow: 0 6px 20px rgba(164, 120, 100, 0.2);
    }
    .cast-name {
      font-size: 0.875rem;
      color: #3E2723;
      margin-bottom: 0.25rem;
      font-weight: 600;
    }
    .cast-character {
      font-size: 0.75rem;
      color: #8D6E63;
    }
    
    /* 文件类型分布 */
    .stats-section {
      margin-top: 2rem;
      background: linear-gradient(135deg, rgba(255, 245, 240, 0.6), rgba(250, 243, 240, 0.6));
      border-radius: 1rem;
      padding: 1.5rem;
      border: 1px solid rgba(212, 165, 165, 0.25);
    }
    .stats-title {
      font-size: 1.5rem;
      margin-bottom: 1rem;
      color: #5D4037;
      font-weight: 600;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 1.25rem;
    }
    .stat-card {
      background: linear-gradient(135deg, rgba(255, 190, 152, 0.15), rgba(255, 255, 255, 0.9));
      padding: 1.25rem;
      border-radius: 1rem;
      text-align: center;
      border: 2px solid rgba(212, 165, 165, 0.25);
      transition: all 0.4s;
    }
    .stat-card:hover {
      transform: translateY(-5px) rotate(-2deg);
      box-shadow: 0 8px 20px rgba(164, 120, 100, 0.2);
      border-color: rgba(164, 120, 100, 0.5);
      background: linear-gradient(135deg, rgba(255, 190, 152, 0.25), rgba(255, 255, 255, 1));
    }
    .stat-icon {
      font-size: 2.5rem;
      margin-bottom: 0.75rem;
      filter: drop-shadow(0 2px 4px rgba(164, 120, 100, 0.1));
    }
    .stat-label {
      color: #8D6E63;
      font-size: 0.875rem;
      margin-bottom: 0.5rem;
      font-weight: 500;
    }
    .stat-value {
      color: #3E2723;
      font-size: 1.375rem;
      font-weight: 700;
    }
    .stat-size {
      color: #A47864;
      font-size: 0.875rem;
      margin-top: 0.5rem;
      font-weight: 500;
    }
    
    /* 模态框（图片放大） */
    .modal {
      display: none;
      position: fixed;
      z-index: 1000;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      justify-content: center;
      align-items: center;
    }
    .modal.active {
      display: flex;
    }
    .modal img {
      max-width: 90%;
      max-height: 90%;
      border-radius: 0.5rem;
    }
    .modal-close {
      position: absolute;
      top: 2rem;
      right: 2rem;
      font-size: 3rem;
      color: white;
      cursor: pointer;
    }
    
    /* 信息框和链接 */
    .info-box {
      background: rgba(255, 255, 255, 0.8);
      padding: 1.5rem;
      border-radius: 1rem;
      border: 1px solid rgba(212, 165, 165, 0.25);
    }
    .link-list {
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
    }
    .external-link {
      display: flex;
      align-items: center;
      padding: 1rem 1.25rem;
      background: linear-gradient(135deg, rgba(255, 190, 152, 0.1), rgba(255, 255, 255, 0.95));
      border-radius: 0.75rem;
      color: #3E2723;
      text-decoration: none;
      transition: all 0.3s;
      border-left: 4px solid #A47864;
      border: 1px solid rgba(212, 165, 165, 0.25);
    }
    .external-link:hover {
      background: linear-gradient(135deg, rgba(255, 190, 152, 0.2), rgba(255, 255, 255, 1));
      transform: translateX(8px);
      border-left-color: #FFBE98;
      box-shadow: 0 4px 12px rgba(164, 120, 100, 0.2);
    }
    
    /* 预告片样式 */
    .trailers-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.5rem;
      margin-top: 1.5rem;
    }
    .trailer-card {
      background: rgba(255, 255, 255, 0.9);
      border-radius: 1rem;
      overflow: hidden;
      border: 1px solid rgba(212, 165, 165, 0.25);
      transition: all 0.3s;
    }
    .trailer-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 8px 25px rgba(164, 120, 100, 0.3);
    }
    .trailer-thumbnail {
      position: relative;
      cursor: pointer;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      background: #000;
    }
    .trailer-thumbnail img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s;
    }
    .trailer-thumbnail:hover img {
      transform: scale(1.05);
    }
    .play-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s;
    }
    .trailer-thumbnail:hover .play-overlay {
      opacity: 1;
    }
    .play-icon {
      width: 80px;
      height: 80px;
      background: rgba(255, 255, 255, 0.95);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      transition: transform 0.3s;
    }
    .trailer-thumbnail:hover .play-icon {
      transform: scale(1.1);
    }
    .trailer-info {
      padding: 1rem;
    }
    .trailer-name {
      font-weight: 600;
      color: #5D4037;
      margin-bottom: 0.5rem;
      font-size: 1rem;
    }
    .trailer-type {
      color: #A47864;
      font-size: 0.875rem;
    }
    .trailer-modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.9);
      z-index: 10000;
      align-items: center;
      justify-content: center;
    }
    .trailer-modal.active {
      display: flex;
    }
    .trailer-modal-content {
      position: relative;
      width: 90%;
      max-width: 1200px;
      aspect-ratio: 16 / 9;
    }
    .close-trailer {
      position: absolute;
      top: -50px;
      right: 0;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border: none;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      font-size: 1.5rem;
      cursor: pointer;
      transition: all 0.3s;
    }
    .close-trailer:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: rotate(90deg);
    }
    #trailerPlayer {
      width: 100%;
      height: 100%;
    }
    #trailerPlayer iframe {
      width: 100%;
      height: 100%;
      border: none;
      border-radius: 0.5rem;
    }
    
    .section-title {
      font-size: 1.75rem;
      margin-bottom: 1.5rem;
      color: #5D4037;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    /* 推荐内容卡片 */
    .recommend-section {
      margin-top: 2rem;
      background: linear-gradient(135deg, rgba(255, 245, 240, 0.5), rgba(250, 243, 240, 0.5));
      border-radius: 1.5rem;
      padding: 2rem;
      border: 2px solid rgba(212, 165, 165, 0.25);
    }
    .recommend-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1.5rem;
    }
    .recommend-card {
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(255, 250, 245, 0.95));
      border-radius: 1.25rem;
      padding: 1.5rem;
      border: 2px solid rgba(212, 165, 165, 0.25);
      transition: all 0.4s;
      text-decoration: none;
      display: block;
      position: relative;
      overflow: hidden;
    }
    .recommend-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(90deg, #A47864, #FFBE98, #D4A5A5);
      transform: scaleX(0);
      transform-origin: left;
      transition: transform 0.4s;
    }
    .recommend-card:hover::before {
      transform: scaleX(1);
    }
    .recommend-card:hover {
      transform: translateY(-8px) scale(1.02);
      box-shadow: 0 12px 35px rgba(164, 120, 100, 0.25);
      border-color: rgba(164, 120, 100, 0.5);
    }
    .recommend-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
      gap: 0.5rem;
    }
    .recommend-title {
      color: #3E2723;
      font-size: 1rem;
      line-height: 1.6;
      margin-bottom: 0.5rem;
      flex: 1;
    }
    .quality-badge {
      padding: 0.3rem 0.8rem;
      border-radius: 0.75rem;
      font-size: 0.7rem;
      font-weight: 700;
      color: white;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      white-space: nowrap;
    }
    .recommend-stats {
      display: flex;
      gap: 1rem;
      margin-bottom: 0.75rem;
      flex-wrap: wrap;
    }
    .recommend-stat-item {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.875rem;
      color: #5D4037;
      font-weight: 600;
      background: rgba(255, 255, 255, 0.7);
      padding: 0.25rem 0.75rem;
      border-radius: 1rem;
      border: 1px solid rgba(212, 165, 165, 0.2);
    }
    .recommend-stat-icon {
      font-size: 1rem;
    }
    .recommend-date {
      font-size: 0.8rem;
      color: #8D6E63;
      font-weight: 500;
    }

  </style>
</head>
<body>
  <div class="backdrop"></div>
  
  <!-- Theme Toggle Button -->
  <button class="theme-toggle" onclick="toggleTheme()" aria-label="Toggle theme" title="切换主题">
    <span id="themeIcon">🌙</span>
  </button>
  
  <!-- Keyboard Shortcuts Hint -->
  <button class="keyboard-hint" onclick="showKeyboardHelp()" aria-label="Keyboard shortcuts" title="键盘快捷键 (按 H 或 ?)">
    ⌨️
  </button>
  
  <div class="container">
    <div class="content">
      <div class="header">
        ${posterUrl ? `<img src="${posterUrl}" class="poster" alt="Poster">` : ''}
        <div class="info">
          <h1>${details.title}</h1>
          ${details.tmdb?.overview ? `<p class="overview">${details.tmdb.overview}</p>` : ''}
          
          <div class="metadata">
            <div class="meta-item">
              <div class="meta-label">文件大小</div>
              <div class="meta-value">${(details.size / 1024 / 1024 / 1024).toFixed(2)} GB</div>
            </div>
            
            ${details.attrs.seeders ? `
            <div class="meta-item">
              <div class="meta-label">做种 / 下载</div>
              <div class="meta-value">
                <span style="color: #10b981;">↑ ${details.attrs.seeders}</span> / 
                <span style="color: #ef4444;">↓ ${details.attrs.leechers}</span>
              </div>
            </div>
            ` : ''}
            
            ${details.attrs.resolution ? `
            <div class="meta-item">
              <div class="meta-label">分辨率</div>
              <div class="meta-value">${details.attrs.resolution}</div>
            </div>
            ` : ''}
            
            ${details.attrs.video ? `
            <div class="meta-item">
              <div class="meta-label">编码</div>
              <div class="meta-value">${details.attrs.video}</div>
            </div>
            ` : ''}
            
            ${details.tmdb?.vote_average ? `
            <div class="meta-item">
              <div class="meta-label">TMDB 评分</div>
              <div class="meta-value">⭐ ${details.tmdb.vote_average.toFixed(1)}/10</div>
            </div>
            ` : ''}
            
            ${details.douban?.rating ? `
            <div class="meta-item" style="cursor: pointer;" onclick="window.open('${details.douban.url}', '_blank')">
              <div class="meta-label">豆瓣评分 🔗</div>
              <div class="meta-value" style="color: #00b51d;">⭐ ${details.douban.rating}/10</div>
              ${details.douban.rating_count ? `<div style="font-size: 0.75rem; color: #8D6E63; margin-top: 0.25rem;">${details.douban.rating_count} 人评价</div>` : ''}
            </div>
            ` : ''}
            
            ${details.tmdb?.release_date ? `
            <div class="meta-item">
              <div class="meta-label">上映日期</div>
              <div class="meta-value">${details.tmdb.release_date}</div>
            </div>
            ` : ''}
          </div>
          
          <a href="${details.magnetUrl}" class="magnet-btn">🧲 下载磁力链接</a>
          <button class="copy-btn" onclick="copyMagnetLink('${details.magnetUrl}')">
            📋 复制链接
          </button>
          
          ${details.douban?.url ? `
          <a href="${details.douban.url}" target="_blank" class="douban-btn" style="display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: linear-gradient(135deg, #00b51d 0%, #00a619 100%); color: white; text-decoration: none; border-radius: 0.5rem; font-weight: 600; box-shadow: 0 2px 8px rgba(0, 181, 29, 0.3); transition: all 0.3s ease;">
            🔗 查看豆瓣页面
          </a>
          ` : ''}
          
          <!-- 健康度信息 -->
          <div class="health-info">
            <div class="health-item">
              <span class="health-icon">📊</span>
              <div>
                <div class="health-label">总大小</div>
                <div class="health-value">${formatFileSize(details.size)}</div>
              </div>
            </div>
            <div class="health-item">
              <span class="health-icon">📅</span>
              <div>
                <div class="health-label">发布时间</div>
                <div class="health-value" style="font-size: 0.9rem;">${new Date(details.pubDate).toLocaleDateString('zh-CN')}</div>
              </div>
            </div>
            ${details.hasFilesInfo ? `
            <div class="health-item">
              <span class="health-icon">📁</span>
              <div>
                <div class="health-label">文件数量</div>
                <div class="health-value">${details.files.length}</div>
              </div>
            </div>
            ` : ''}
          </div>
        </div>
      </div>
      
      <!-- 视频信息预览 -->
      ${details.tmdb?.videos?.results && details.tmdb.videos.results.length > 0 ? `
      <div class="video-preview-section">
        <h2 class="video-preview-title">
          <span>🎬 预告片</span>
        </h2>
        
        <div class="trailers-grid">
          ${details.tmdb.videos.results.slice(0, 3).map(video => `
            <div class="trailer-card">
              <div class="trailer-thumbnail" onclick="playTrailer('${video.key}', '${video.site}')">
                <img src="https://img.youtube.com/vi/${video.key}/maxresdefault.jpg" 
                     onerror="this.src='https://img.youtube.com/vi/${video.key}/hqdefault.jpg'"
                     alt="${video.name}">
                <div class="play-overlay">
                  <div class="play-icon">▶️</div>
                </div>
              </div>
              <div class="trailer-info">
                <div class="trailer-name">${video.name}</div>
                <div class="trailer-type">${video.type}</div>
              </div>
            </div>
          `).join('')}
        </div>
        
        <div id="trailerModal" class="trailer-modal" onclick="closeTrailer()">
          <div class="trailer-modal-content" onclick="event.stopPropagation()">
            <button class="close-trailer" onclick="closeTrailer()">✕</button>
            <div id="trailerPlayer"></div>
          </div>
        </div>
      </div>
      ` : ''}
      
      ${details.relatedContent && details.relatedContent.length > 0 ? `
      <!-- 通用内容推荐 -->
      <div class="recommend-section">
        <h2 class="section-title">🎯 相关推荐</h2>
        <div class="recommend-grid">
          ${details.relatedContent.map(item => `
            <a href="/details/${item.infoHash}" class="recommend-card">
              <div class="recommend-card-header">
                <div class="recommend-title" style="font-size: 1rem; margin-bottom: 0.5rem;">
                  ${item.name.substring(0, 80)}${item.name.length > 80 ? '...' : ''}
                </div>
                ${item.qualityInfo ? `
                <span class="quality-badge" style="background: ${item.qualityInfo.color};">
                  ${item.qualityInfo.label}
                </span>
                ` : ''}
              </div>
              <div class="recommend-stats">
                <span class="recommend-stat-item">
                  <span class="recommend-stat-icon" style="color: #10b981;">↑</span>
                  ${item.seeders || 0}
                </span>
                <span class="recommend-stat-item">
                  <span class="recommend-stat-icon" style="color: #ef4444;">↓</span>
                  ${item.leechers || 0}
                </span>
                <span class="recommend-stat-item">
                  📦 ${formatFileSize(item.size)}
                </span>
                ${item.matchScore ? `
                <span class="recommend-stat-item" title="相关度评分">
                  ⭐ ${item.matchScore}
                </span>
                ` : ''}
              </div>
              <div class="recommend-date">
                📅 ${new Date(item.publishedAt).toLocaleDateString('zh-CN')}
              </div>
            </a>
          `).join('')}
        </div>
      </div>
      ` : ''}
      
      ${details.hasFilesInfo && details.files.length > 0 ? `
      <!-- 文件列表 -->
      <div class="files-section">
        <h2 class="files-title">📂 文件列表 (共 <span id="totalFiles">${details.files.length}</span> 个文件)</h2>
        
        <!-- 搜索和过滤 -->
        <div class="file-controls">
          <div class="search-box">
            <input type="text" id="fileSearch" class="search-input" placeholder="🔍 搜索文件名..." onkeyup="filterFiles()">
          </div>
          <div class="filter-buttons">
            <button class="filter-btn active" data-type="all" onclick="setFileTypeFilter('all')">全部</button>
            <button class="filter-btn" data-type="video" onclick="setFileTypeFilter('video')">🎬 视频</button>
            <button class="filter-btn" data-type="audio" onclick="setFileTypeFilter('audio')">🎵 音频</button>
            <button class="filter-btn" data-type="subtitle" onclick="setFileTypeFilter('subtitle')">📝 字幕</button>
            <button class="filter-btn" data-type="image" onclick="setFileTypeFilter('image')">🖼️ 图片</button>
            <button class="filter-btn" data-type="other" onclick="setFileTypeFilter('other')">📄 其他</button>
          </div>
        </div>
        <div class="file-stats-mini">
          显示 <span id="visibleFiles">${details.files.length}</span> / ${details.files.length} 个文件
        </div>
        
        <div class="files-list" id="filesList">
          ${details.files.map(file => {
            const fileType = getFileType(file.path);
            return `
              <div class="file-item" data-filename="${file.path.toLowerCase()}" data-type="${fileType.type}">
                <div class="file-path" title="${file.path}">
                  <span class="file-icon">${fileType.icon}</span>${file.path}
                </div>
                <div class="file-size">${formatFileSize(file.size)}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      ` : details.hasFilesInfo === false ? `
      <div class="files-section">
        <div class="no-files">📦 暂无文件列表信息</div>
      </div>
      ` : ''}
      
      ${(details.tmdb?.images?.backdrops?.length > 0 || details.tmdb?.images?.posters?.length > 0) ? `
      <!-- TMDB 剧照画廊 -->
      <div class="gallery-section">
        ${(() => {
          const backdrops = details.tmdb.images.backdrops || [];
          const posters = details.tmdb.images.posters || [];
          const images = backdrops.length > 0 ? backdrops : posters;
          const imageType = backdrops.length > 0 ? '剧照' : '海报';
          return `
            <h2 class="gallery-title">🖼️ ${imageType}画廊 (${Math.min(images.length, 12)} 张)</h2>
            <div class="gallery-grid">
              ${images.slice(0, 12).map((img, idx) => `
                <div class="gallery-item" onclick="openModal('https://image.tmdb.org/t/p/original${img.file_path}')">
                  <img src="https://image.tmdb.org/t/p/w500${img.file_path}" alt="${imageType} ${idx + 1}" loading="lazy">
                </div>
              `).join('')}
            </div>
          `;
        })()}
      </div>
      ` : details.imageFiles?.length > 0 ? `
      <!-- 种子内图片预览 -->
      <div class="gallery-section">
        <h2 class="gallery-title">🖼️ 种子内的图片 (${details.imageFiles.length} 张)</h2>
        <div class="info-box">
          <p style="margin-bottom: 1rem; opacity: 0.8;">
            ℹ️ 种子包含以下图片文件，下载后可查看完整内容
          </p>
          <div class="files-list" style="max-height: 300px;">
            ${details.imageFiles.map((img, idx) => `
              <div class="file-item">
                <div class="file-path">
                  <span class="file-icon">🖼️</span>${img.path}
                </div>
                <div class="file-size">${formatFileSize(img.size)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      ` : details.alternativeImages?.length > 0 ? `
      <!-- 相关图片链接 -->
      <div class="gallery-section">
        <h2 class="gallery-title">🔗 相关图片资源</h2>
        <div class="info-box">
          <p style="margin-bottom: 1rem; opacity: 0.8;">
            💡 以下链接可能包含相关图片：
          </p>
          <div class="link-list">
            ${details.alternativeImages.map(link => `
              <a href="${link.url}" target="_blank" class="external-link">
                <span style="margin-right: 0.5rem;">${link.type === 'imdb' ? '🎬' : link.type === 'search' ? '🔍' : '🔗'}</span>
                ${link.source}
              </a>
            `).join('')}
          </div>
        </div>
      </div>
      ` : ''}
      
      ${details.tmdb?.credits?.cast?.length > 0 ? `
      <!-- 演员列表 -->
      <div class="cast-section">
        <h2 class="cast-title">🎭 主要演员 (前 12 位)</h2>
        <div class="cast-grid">
          ${details.tmdb.credits.cast.slice(0, 12).map(actor => `
            <div class="cast-item">
              <img 
                src="${actor.profile_path ? `https://image.tmdb.org/t/p/w185${actor.profile_path}` : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="185" height="278"%3E%3Crect fill="%23334155" width="185" height="278"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" fill="%2394a3b8" font-size="48"%3E👤%3C/text%3E%3C/svg%3E'}" 
                alt="${actor.name}" 
                class="cast-photo"
                loading="lazy"
              >
              <div class="cast-name">${actor.name}</div>
              <div class="cast-character">${actor.character}</div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}
    </div>
  </div>
  
  <!-- 图片查看模态框 -->
  <div id="imageModal" class="modal" onclick="closeModal()">
    <span class="modal-close">&times;</span>
    <img id="modalImage" src="" alt="放大查看">
  </div>
  
  <script>
    function getFileType(filename) {
      const ext = filename.split('.').pop().toLowerCase();
      const types = {
        video: { icon: '🎬', exts: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', 'ts', 'm2ts'] },
        audio: { icon: '🎵', exts: ['mp3', 'flac', 'wav', 'aac', 'ogg', 'wma', 'm4a', 'ape', 'dts', 'ac3'] },
        subtitle: { icon: '💬', exts: ['srt', 'ass', 'ssa', 'sub', 'vtt', 'idx', 'sup'] },
        image: { icon: '🖼️', exts: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'] },
        document: { icon: '📄', exts: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'] },
        archive: { icon: '📦', exts: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'] },
      };
      
      for (const [type, config] of Object.entries(types)) {
        if (config.exts.includes(ext)) {
          return { type, icon: config.icon };
        }
      }
      return { type: 'other', icon: '📄' };
    }
    
    function formatFileSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    function openModal(imageSrc) {
      const modal = document.getElementById('imageModal');
      const modalImg = document.getElementById('modalImage');
      modal.classList.add('active');
      modalImg.src = imageSrc;
    }
    
    function closeModal() {
      const modal = document.getElementById('imageModal');
      modal.classList.remove('active');
    }
    
    // ESC 键关闭模态框
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        closeModal();
      }
    });
    
    // 复制磁力链接
    function copyMagnetLink(magnetUrl) {
      navigator.clipboard.writeText(magnetUrl).then(() => {
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ 已复制';
        btn.classList.add('copied');
        
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.classList.remove('copied');
        }, 2000);
      }).catch(err => {
        alert('复制失败，请手动复制');
        console.error('复制失败:', err);
      });
    }
    
    // 文件搜索
    let currentTypeFilter = 'all';
    
    function filterFiles() {
      const searchText = document.getElementById('fileSearch').value.toLowerCase();
      const fileItems = document.querySelectorAll('.file-item');
      let visibleCount = 0;
      
      fileItems.forEach(item => {
        const filename = item.getAttribute('data-filename');
        const fileType = item.getAttribute('data-type');
        
        const matchesSearch = filename.includes(searchText);
        const matchesType = currentTypeFilter === 'all' || fileType === currentTypeFilter;
        
        if (matchesSearch && matchesType) {
          item.style.display = 'flex';
          visibleCount++;
        } else {
          item.style.display = 'none';
        }
      });
      
      document.getElementById('visibleFiles').textContent = visibleCount;
    }
    
    function setFileTypeFilter(type) {
      currentTypeFilter = type;
      
      // 更新按钮状态
      document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
      });
      event.target.classList.add('active');
      
      // 执行过滤
      filterFiles();
    }
    
    // 预告片播放
    function playTrailer(videoKey, site) {
      const modal = document.getElementById('trailerModal');
      const player = document.getElementById('trailerPlayer');
      
      if (site === 'YouTube') {
        player.innerHTML = \`
          <iframe 
            src="https://www.youtube.com/embed/\${videoKey}?autoplay=1"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
          ></iframe>
        \`;
      }
      
      modal.classList.add('active');
    }
    
    function closeTrailer() {
      const modal = document.getElementById('trailerModal');
      const player = document.getElementById('trailerPlayer');
      
      player.innerHTML = '';
      modal.classList.remove('active');
    }
    
    // Theme Toggle
    function toggleTheme() {
      const html = document.documentElement;
      const currentTheme = html.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      const icon = document.getElementById('themeIcon');
      
      html.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      icon.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    }
    
    // Load saved theme on page load
    (function() {
      const savedTheme = localStorage.getItem('theme') || 'light';
      const icon = document.getElementById('themeIcon');
      
      document.documentElement.setAttribute('data-theme', savedTheme);
      icon.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    })();
    
    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      // Ignore shortcuts when typing in input fields
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }
      
      const key = e.key.toLowerCase();
      
      switch(key) {
        case 'm':
          // Copy magnet link
          e.preventDefault();
          const copyBtn = document.querySelector('.copy-btn');
          if (copyBtn) copyBtn.click();
          break;
          
        case 't':
          // Toggle theme
          e.preventDefault();
          toggleTheme();
          break;
          
        case '/':
          // Focus file search (if exists)
          e.preventDefault();
          const searchInput = document.getElementById('fileSearch');
          if (searchInput) searchInput.focus();
          break;
          
        case 'escape':
          // Close trailer modal
          const modal = document.getElementById('trailerModal');
          if (modal && modal.classList.contains('active')) {
            closeTrailer();
          }
          break;
          
        case 'h':
        case '?':
          // Show help
          e.preventDefault();
          showKeyboardHelp();
          break;
      }
    });
    
    // Show keyboard shortcuts help
    function showKeyboardHelp() {
      const helpText = \`
🎹 Keyboard Shortcuts:
━━━━━━━━━━━━━━━━━━━━
M - Copy magnet link
T - Toggle dark/light theme
/ - Focus file search
ESC - Close modals
H or ? - Show this help
━━━━━━━━━━━━━━━━━━━━
      \`.trim();
      
      alert(helpText);
    }
  </script>
</body>
</html>
    `;
    
    // 添加辅助函数到模板上下文
    function formatFileSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    res.send(html);
  } catch (error) {
    console.error('Details page error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// 健康检查
app.get('/health', (req, res) => {
  const totalHits = cacheStats.tmdb.hits + cacheStats.graphql.hits + cacheStats.details.hits + cacheStats.douban.hits;
  const totalRequests = totalHits + cacheStats.tmdb.misses + cacheStats.graphql.misses + cacheStats.details.misses + cacheStats.douban.misses;
  const hitRate = totalRequests > 0 ? ((totalHits / totalRequests) * 100).toFixed(2) : 0;
  
  res.json({ 
    status: 'ok', 
    upstream: BITMAGNET_URL,
    cache: {
      stats: cacheStats,
      hitRate: `${hitRate}%`,
      sizes: {
        tmdb: tmdbCache.keys().length,
        douban: doubanCache.keys().length,
        graphql: graphqlCache.keys().length,
        details: torrentDetailsCache.keys().length
      }
    }
  });
});

// 缓存统计详情
app.get('/cache/stats', (req, res) => {
  const tmdbKeys = tmdbCache.keys().length;
  const graphqlKeys = graphqlCache.keys().length;
  const detailsKeys = torrentDetailsCache.keys().length;
  const doubanKeys = doubanCache.keys().length;
  
  const totalHits = cacheStats.tmdb.hits + cacheStats.graphql.hits + cacheStats.details.hits + cacheStats.douban.hits;
  const totalMisses = cacheStats.tmdb.misses + cacheStats.graphql.misses + cacheStats.details.misses + cacheStats.douban.misses;
  const totalRequests = totalHits + totalMisses;
  
  res.json({
    caches: {
      tmdb: {
        keys: tmdbKeys,
        hits: cacheStats.tmdb.hits,
        misses: cacheStats.tmdb.misses,
        hitRate: cacheStats.tmdb.hits + cacheStats.tmdb.misses > 0 
          ? `${((cacheStats.tmdb.hits / (cacheStats.tmdb.hits + cacheStats.tmdb.misses)) * 100).toFixed(2)}%` 
          : '0%'
      },
      douban: {
        keys: doubanKeys,
        hits: cacheStats.douban.hits,
        misses: cacheStats.douban.misses,
        hitRate: cacheStats.douban.hits + cacheStats.douban.misses > 0 
          ? `${((cacheStats.douban.hits / (cacheStats.douban.hits + cacheStats.douban.misses)) * 100).toFixed(2)}%` 
          : '0%'
      },
      graphql: {
        keys: graphqlKeys,
        hits: cacheStats.graphql.hits,
        misses: cacheStats.graphql.misses,
        hitRate: cacheStats.graphql.hits + cacheStats.graphql.misses > 0 
          ? `${((cacheStats.graphql.hits / (cacheStats.graphql.hits + cacheStats.graphql.misses)) * 100).toFixed(2)}%` 
          : '0%'
      },
      details: {
        keys: detailsKeys,
        hits: cacheStats.details.hits,
        misses: cacheStats.details.misses,
        hitRate: cacheStats.details.hits + cacheStats.details.misses > 0 
          ? `${((cacheStats.details.hits / (cacheStats.details.hits + cacheStats.details.misses)) * 100).toFixed(2)}%` 
          : '0%'
      }
    },
    overall: {
      totalKeys: tmdbKeys + graphqlKeys + detailsKeys,
      totalHits: totalHits,
      totalMisses: totalMisses,
      totalRequests: totalRequests,
      hitRate: totalRequests > 0 ? `${((totalHits / totalRequests) * 100).toFixed(2)}%` : '0%'
    }
  });
});

// 清空缓存
app.post('/cache/clear', (req, res) => {
  const { type } = req.query;
  
  if (type === 'tmdb' || type === 'all') {
    tmdbCache.flushAll();
  }
  if (type === 'graphql' || type === 'all') {
    graphqlCache.flushAll();
  }
  if (type === 'details' || type === 'all') {
    torrentDetailsCache.flushAll();
  }
  
  // 重置统计
  if (type === 'all') {
    cacheStats = {
      tmdb: { hits: 0, misses: 0 },
      graphql: { hits: 0, misses: 0 },
      details: { hits: 0, misses: 0 }
    };
  }
  
  res.json({ 
    message: `Cache cleared: ${type || 'all'}`,
    success: true
  });
});

// Cache statistics endpoint
app.get('/api/cache/stats', (req, res) => {
  const tmdbStats = {
    keys: tmdbCache.keys().length,
    hits: cacheStats.tmdb.hits,
    misses: cacheStats.tmdb.misses,
    hitRate: cacheStats.tmdb.hits + cacheStats.tmdb.misses > 0
      ? ((cacheStats.tmdb.hits / (cacheStats.tmdb.hits + cacheStats.tmdb.misses)) * 100).toFixed(2) + '%'
      : '0%'
  };
  
  const graphqlStats = {
    keys: graphqlCache.keys().length,
    hits: cacheStats.graphql.hits,
    misses: cacheStats.graphql.misses,
    hitRate: cacheStats.graphql.hits + cacheStats.graphql.misses > 0
      ? ((cacheStats.graphql.hits / (cacheStats.graphql.hits + cacheStats.graphql.misses)) * 100).toFixed(2) + '%'
      : '0%'
  };
  
  const detailsStats = {
    keys: torrentDetailsCache.keys().length,
    hits: cacheStats.details.hits,
    misses: cacheStats.details.misses,
    hitRate: cacheStats.details.hits + cacheStats.details.misses > 0
      ? ((cacheStats.details.hits / (cacheStats.details.hits + cacheStats.details.misses)) * 100).toFixed(2) + '%'
      : '0%'
  };
  
  res.json({
    tmdb: tmdbStats,
    graphql: graphqlStats,
    details: detailsStats,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 AuroraMag Detail Proxy running on http://localhost:${PORT}`);
  console.log(`📡 Upstream: ${BITMAGNET_URL}`);
  console.log(`🌐 Public URL: ${PUBLIC_PROTOCOL}://${PUBLIC_HOST}`);
  console.log(`\n📋 Configure in Prowlarr:`);
  console.log(`   URL: http://localhost:${PORT}/torznab/`);
  console.log(`   API Key: (leave empty)`);
  console.log(`\n⚙️  Environment variables:`);
  console.log(`   PUBLIC_HOST=${PUBLIC_HOST}`);
  console.log(`   PUBLIC_PROTOCOL=${PUBLIC_PROTOCOL}`);
});
