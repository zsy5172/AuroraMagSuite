import type { SearchResponse, TorrentNode } from './types';

export const magnetLink = (node: TorrentNode): string =>
  node.magnetUrl || (node.infoHash ? `magnet:?xt=urn:btih:${node.infoHash}` : '');

export async function searchTorrents(query: string, limit = 40, offset = 0, sort?: string, descending?: boolean): Promise<SearchResponse> {
  if (!query.trim()) {
    return { totalCount: 0, edges: [], hasMore: false };
  }
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    offset: String(offset),
  });
  if (sort) params.set('sort', sort);
  if (descending !== undefined) params.set('descending', String(descending));

  const resp = await fetch(`/api/search?${params.toString()}`);
  if (!resp.ok) {
    throw new Error('搜索请求失败');
  }
  return resp.json();
}
