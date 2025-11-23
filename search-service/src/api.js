const MEDIA_BASE = import.meta.env.VITE_MEDIA_BASE || '/media';
const BACKEND_BASE = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '');

export const searchTorrents = async (query, limit = 20, offset = 0) => {
  const resp = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`);
  if (!resp.ok) {
    throw new Error('搜索请求失败');
  }
  return resp.json();
};

export const getImageProxy = (url, width = 300) => {
  if (!url) return null;
  return `/proxy/image?url=${encodeURIComponent(url)}&width=${width}`;
};

export const getTMDBPoster = (path, width = 300) => {
  if (!path) return null;
  const tmdbUrl = `https://image.tmdb.org/t/p/w${width}${path}`;
  return getImageProxy(tmdbUrl, width);
};

export const fetchTMDBDetails = async (type, id) => {
  const response = await fetch(`${MEDIA_BASE}/tmdb/${type}/${id}`);
  return response.json();
};

export const fetchOMDBDetails = async (imdbId) => {
  const response = await fetch(`${MEDIA_BASE}/omdb/${imdbId}`);
  return response.json();
};

export const fetchFanartImages = async (type, id) => {
  const response = await fetch(`${MEDIA_BASE}/fanart/${type}/${id}`);
  return response.json();
};

export const getCacheStats = async () => {
  const response = await fetch(`${MEDIA_BASE}/cache/stats`);
  return response.json();
};

export const getDetailUrl = (infoHash) => {
  const base = BACKEND_BASE || '';
  return `${base}/details/${infoHash}`;
};
