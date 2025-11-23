import { useEffect, useState } from 'react';
import { getTMDBPoster, getDetailUrl, fetchFileCount } from '../api';

export default function TorrentCard({ torrent }) {
  const [imageError, setImageError] = useState(false);
  const content = torrent.content || {};
  const attrs = torrent.attrs || {};
  const [filesCount, setFilesCount] = useState(torrent.filesCount || attrs.files || null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  
  const formatSize = (bytes) => {
    const gb = bytes / (1024 ** 3);
    return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / (1024 ** 2)).toFixed(2)} MB`;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('zh-CN');
  };

  // 尝试从内容属性中提取海报
  const getPosterUrl = () => {
    if (!content || !content.attributes) return null;
    
    const posterAttr = content.attributes?.find(
      attr => attr.key === 'poster_path' || attr.key === 'tmdb_poster'
    );
    
    if (posterAttr?.value) {
      return getTMDBPoster(posterAttr.value, 300);
    }
    return null;
  };

  const posterUrl = getPosterUrl();
  const isVideo = content.type === 'movie' || content.type === 'tv_show' || torrent.category === 'tv_show';

  useEffect(() => {
    const loadFiles = async () => {
      if (filesCount !== null) return;
      setLoadingFiles(true);
      try {
        const count = await fetchFileCount(torrent.infoHash);
        if (count !== null && count !== undefined) {
          setFilesCount(count);
        }
      } catch (e) {
        // ignore errors
      } finally {
        setLoadingFiles(false);
      }
    };
    loadFiles();
  }, [torrent.infoHash, filesCount]);

  return (
    <div className="relative bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl overflow-hidden hover:border-purple-500 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/20 group">
      <a
        href={getDetailUrl(torrent.infoHash)}
        target="_blank"
        rel="noreferrer"
        className="absolute inset-0 z-0"
        aria-label="查看详情"
      />
      <div className="relative z-10 pointer-events-none">
        {/* 海报区域 */}
        {isVideo && posterUrl && !imageError ? (
          <div className="relative aspect-[2/3] overflow-hidden bg-slate-900">
            <img
              src={posterUrl}
              alt={torrent.name}
              onError={() => setImageError(true)}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent opacity-60"></div>
            
            {/* 年份标签 */}
            {content?.releaseYear && (
              <div className="absolute top-2 left-2 px-2 py-1 bg-purple-600/90 text-white text-xs font-bold rounded">
                {content.releaseYear}
              </div>
            )}
            
            {/* 种子健康度 */}
            <div className="absolute top-2 right-2 flex gap-1">
              <span className="px-2 py-1 bg-green-600/90 text-white text-xs font-bold rounded">
                ↑{torrent.seeders}
              </span>
              <span className="px-2 py-1 bg-red-600/90 text-white text-xs font-bold rounded">
                ↓{torrent.leechers}
              </span>
            </div>
          </div>
        ) : (
          <div className="relative aspect-[2/3] bg-gradient-to-br from-purple-900 to-pink-900 flex items-center justify-center">
            <div className="text-6xl opacity-30">
              {isVideo ? '🎬' : content?.type === 'software' ? '💿' : '📦'}
            </div>
            
            {/* 种子健康度 */}
            <div className="absolute top-2 right-2 flex gap-1">
              <span className="px-2 py-1 bg-green-600/90 text-white text-xs font-bold rounded">
                ↑{torrent.seeders}
              </span>
              <span className="px-2 py-1 bg-red-600/90 text-white text-xs font-bold rounded">
                ↓{torrent.leechers}
              </span>
            </div>
          </div>
        )}

        {/* 信息区域 */}
        <div className="p-4">
          <h3 className="text-white font-semibold mb-2 line-clamp-2 text-sm leading-tight">
            {content?.title || torrent.title || torrent.name}
          </h3>

          {/* 类型标签 */}
          {(content?.type || torrent.category) && (
            <div className="mb-2">
              <span className="inline-block px-2 py-0.5 bg-purple-600/30 text-purple-300 text-xs rounded">
                {content.type || torrent.category}
              </span>
            </div>
          )}

          {/* 统计信息 */}
          <div className="space-y-1 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>大小:</span>
              <span className="text-slate-300">{formatSize(torrent.size)}</span>
            </div>
            <div className="flex justify-between">
              <span>文件:</span>
              <span className="text-slate-300">
                {loadingFiles ? '...' : (filesCount ?? '—')} 个
              </span>
            </div>
            {(torrent.publishedAt || torrent.pubDate) && (
              <div className="flex justify-between">
                <span>发布:</span>
                <span className="text-slate-300">{formatDate(torrent.publishedAt || torrent.pubDate)}</span>
              </div>
            )}
          </div>

        {/* 操作按钮 */}
        <div className="flex gap-2 mt-4 pointer-events-auto">
          <button
            onClick={() => window.open(attrs.magneturl || `magnet:?xt=urn:btih:${torrent.infoHash}`, '_blank')}
            className="w-full px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition font-medium text-sm"
          >
            🧲 磁力链接
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
