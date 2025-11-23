import { useEffect, useRef, useState, useCallback } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { searchTorrents } from './api';
import TorrentCard from './components/TorrentCard';
import SearchBar from './components/SearchBar';
import CacheStats from './components/CacheStats';

function App() {
  const [activeSearch, setActiveSearch] = useState('');
  const loaderRef = useRef(null);
  const PAGE_SIZE = 50;

  const {
    data,
    error,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['torrents', activeSearch],
    queryFn: ({ pageParam = 0 }) => searchTorrents(activeSearch, PAGE_SIZE, pageParam),
    enabled: activeSearch.length > 0,
    getNextPageParam: (lastPage, pages) => {
      if (lastPage?.hasMore) {
        return pages.reduce((acc, p) => acc + (p?.edges?.length || 0), 0);
      }
      return undefined;
    },
  });

  const results = data ? data.pages.flatMap((p) => p?.edges || []) : [];
  const totalCount = data?.pages?.[0]?.totalCount ?? 0;

  const handleSearch = (query) => {
    setActiveSearch(query);
    if (query.length > 0) {
      refetch();
    }
  };

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        handleLoadMore();
      }
    });
    const current = loaderRef.current;
    if (current) observer.observe(current);
    return () => {
      if (current) observer.unobserve(current);
      observer.disconnect();
    };
  }, [loaderRef, hasNextPage, isFetchingNextPage, handleLoadMore]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 mb-2">
            🧲 AuroraMag
          </h1>
          <p className="text-slate-400">Bitmagnet 驱动的 AuroraMag Search UI · 内建图片缓存与多元数据源</p>
        </header>

        <SearchBar onSearch={(q) => handleSearch(q, 50)} />
        
        <CacheStats />

        <div className="mt-8">
          {isLoading && (
            <div className="flex justify-center items-center py-20">
              <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500"></div>
            </div>
          )}

          {error && (
            <div className="bg-red-900/20 border border-red-500 text-red-200 px-6 py-4 rounded-lg">
              错误: {error.message}
            </div>
          )}

          {results.length > 0 && (
            <>
              <div className="mb-6 text-slate-300">
                找到 <span className="text-purple-400 font-bold">{totalCount}</span> 个结果
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {results.map(({ node }) => (
                  <TorrentCard key={node.infoHash} torrent={node} />
                ))}
              </div>
              <div ref={loaderRef} className="h-10 mt-6 flex items-center justify-center text-slate-400">
                {isFetchingNextPage && <span>加载中...</span>}
                {!hasNextPage && !isFetchingNextPage && <span>没有更多了</span>}
              </div>
            </>
          )}

          {!activeSearch && !isLoading && results.length === 0 && (
            <div className="text-center py-20 text-slate-400">
              <div className="text-6xl mb-4">🔍</div>
              <p className="text-xl">输入关键词开始搜索</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
