import { GraphQLClient } from 'graphql-request';

export const graphqlClient = new GraphQLClient('/graphql');

export const searchTorrents = async (query, limit = 20) => {
  const gql = `
    query SearchTorrents($query: String!, $limit: Int!) {
      torrents(
        query: { queryString: $query }
        limit: $limit
      ) {
        totalCount
        edges {
          node {
            infoHash
            name
            size
            filesCount
            seeders
            leechers
            publishedAt
            content {
              type
              title
              releaseYear
              collections {
                name
                type
              }
              attributes {
                key
                value
              }
            }
          }
        }
      }
    }
  `;
  
  return graphqlClient.request(gql, { query, limit });
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
  const response = await fetch(`/api/tmdb/${type}/${id}`);
  return response.json();
};

export const fetchOMDBDetails = async (imdbId) => {
  const response = await fetch(`/api/omdb/${imdbId}`);
  return response.json();
};

export const fetchFanartImages = async (type, id) => {
  const response = await fetch(`/api/fanart/${type}/${id}`);
  return response.json();
};

export const getCacheStats = async () => {
  const response = await fetch('/api/cache/stats');
  return response.json();
};
