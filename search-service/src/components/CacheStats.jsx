import { useQuery } from '@tanstack/react-query';
import { getCacheStats } from '../api';

export default function CacheStats() {
  const { data } = useQuery({
    queryKey: ['cacheStats'],
    queryFn: getCacheStats,
    refetchInterval: 10000, // 每10秒刷新一次
  });

  if (!data) return null;

  return (
    <div className="mt-4 p-4 bg-slate-800/30 border border-slate-700 rounded-lg">
      <div className="flex items-center gap-4 text-sm text-slate-300">
        <span className="flex items-center gap-2">
          📦 缓存文件: <strong className="text-purple-400">{data.files}</strong>
        </span>
        <span className="flex items-center gap-2">
          💾 缓存大小: <strong className="text-purple-400">{data.totalSizeMB} MB</strong>
        </span>
      </div>
    </div>
  );
}
