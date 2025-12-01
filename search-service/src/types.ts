export interface TorrentNode {
  infoHash: string;
  title?: string;
  name?: string;
  size?: number;
  category?: string;
  seeders?: number;
  leechers?: number;
  publishedAt?: string;
  pubDate?: string;
  magnetUrl?: string;
  attrs?: Record<string, unknown>;
  filesCount?: number;
}

export interface SearchResponse {
  totalCount: number;
  edges: { node: TorrentNode }[];
  hasMore: boolean;
}

export type SortOption = 'relevance' | 'size' | 'seeders' | 'leechers' | 'published_at';
