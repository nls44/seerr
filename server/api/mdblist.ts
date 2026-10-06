import ExternalAPI from '@server/api/externalapi';
import { MediaType } from '@server/constants/media';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';
import axios from 'axios';

const MDBLIST_HOSTS = new Set(['mdblist.com', 'www.mdblist.com']);
const LIST_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface MdblistListItem {
  ids?: { tmdb?: number | string };
  tmdb?: number | string;
  tmdb_id?: number | string;
  tmdbid?: number | string;
  media_type?: string;
  mediaType?: string;
  mediatype?: string;
  type?: string;
  [key: string]: unknown;
}

export interface MdblistListResponse {
  items?: unknown[];
  total?: number;
  total_results?: number;
  totalResults?: number;
  item_count?: number;
  count?: number;
  [key: string]: unknown;
}

type MdblistResponse = MdblistListResponse | unknown[];

export interface MdblistItemReference {
  tmdbId: number;
  mediaType: MediaType;
}

export interface MdblistPage {
  items: MdblistItemReference[];
  totalResults?: number;
}

/**
 * Accepts a MDBList URL, /lists/... path, or canonical list identifier and
 * returns only the path components used by the fixed MDBList API host.
 */
export const parseMdblistListId = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('MDBList list URL or identifier is required.');
  }

  const input = value.trim();
  let path = input;

  if (/(^|\/)\.\.?($|\/)/.test(input)) {
    throw new Error(
      'MDBList list identifier contains an invalid path segment.'
    );
  }

  if (/^https?:\/\//i.test(input)) {
    const url = new URL(input);
    if (url.protocol !== 'https:' || !MDBLIST_HOSTS.has(url.hostname)) {
      throw new Error('MDBList list URL must use https://mdblist.com.');
    }
    if (url.search || url.hash) {
      throw new Error('MDBList list URL must not contain a query or fragment.');
    }
    path = url.pathname;
  }

  path = path.replace(/^\/+|\/+$/g, '');
  if (path.toLowerCase().startsWith('lists/')) {
    path = path.slice('lists/'.length);
  }

  const segments = path.split('/');
  if (
    (segments.length !== 1 && segments.length !== 2) ||
    segments.some((segment) => !LIST_SEGMENT.test(segment))
  ) {
    throw new Error(
      'MDBList list must be a numeric ID or a username/list-name identifier.'
    );
  }

  return segments.join('/');
};

const parseTmdbId = (value: unknown): number | undefined => {
  const id = typeof value === 'string' ? Number(value) : value;
  return typeof id === 'number' && Number.isInteger(id) && id > 0
    ? id
    : undefined;
};

const parseMediaType = (value: unknown): MediaType | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  switch (value.toLowerCase()) {
    case 'movie':
    case 'movies':
      return MediaType.MOVIE;
    case 'show':
    case 'shows':
    case 'series':
    case 'tv':
      return MediaType.TV;
    default:
      return undefined;
  }
};

export const parseMdblistItems = (items: unknown[]): MdblistItemReference[] => {
  const references: MdblistItemReference[] = [];
  const seen = new Set<string>();

  for (const value of items) {
    if (!value || typeof value !== 'object') {
      continue;
    }

    const item = value as MdblistListItem;
    const tmdbId = parseTmdbId(
      item.ids?.tmdb ?? item.tmdb ?? item.tmdb_id ?? item.tmdbid
    );
    const mediaType = parseMediaType(
      item.media_type ?? item.mediaType ?? item.mediatype ?? item.type
    );

    if (!tmdbId || !mediaType) {
      continue;
    }

    const key = `${mediaType}:${tmdbId}`;
    if (!seen.has(key)) {
      seen.add(key);
      references.push({ tmdbId, mediaType });
    }
  }

  return references;
};

export class MdblistApiError extends Error {
  public readonly statusCode?: number;
  public readonly retryAfter?: string;

  constructor(message: string, statusCode?: number, retryAfter?: string) {
    super(message);
    this.name = 'MdblistApiError';
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;
  }
}

const getTotalResults = (data: MdblistListResponse): number | undefined => {
  const total =
    data.total ??
    data.total_results ??
    data.totalResults ??
    data.item_count ??
    data.count;

  return typeof total === 'number' && Number.isFinite(total) && total >= 0
    ? total
    : undefined;
};

class MdblistAPI extends ExternalAPI {
  private readonly apiKey: string;

  constructor(apiKey = getSettings().mdblist.apiKey) {
    super(
      'https://api.mdblist.com',
      { apikey: apiKey },
      {
        nodeCache: cacheManager.getCache('mdblist').data,
        rateLimit: { maxRequests: 5, maxRPS: 10 },
      }
    );
    this.apiKey = apiKey;
  }

  public async getListItems({
    listId,
    page = 1,
    limit = 20,
  }: {
    listId: string;
    page?: number;
    limit?: number;
  }): Promise<MdblistPage> {
    if (!this.apiKey) {
      throw new MdblistApiError('MDBList API key is not configured.', 503);
    }

    const canonicalListId = parseMdblistListId(listId);
    const offset = (Math.max(1, page) - 1) * limit;
    const encodedListId = canonicalListId
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    try {
      const data = await this.get<MdblistResponse>(
        `/lists/${encodedListId}/items`,
        { params: { limit, offset } },
        900
      );
      const rawItems = Array.isArray(data)
        ? data
        : Array.isArray(data.items)
          ? data.items
          : [];

      return {
        items: parseMdblistItems(rawItems),
        totalResults: Array.isArray(data) ? undefined : getTotalResults(data),
      };
    } catch (error) {
      if (error instanceof MdblistApiError) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status;
        const responseMessage =
          typeof error.response?.data?.error === 'string'
            ? error.response.data.error
            : 'MDBList request failed.';
        throw new MdblistApiError(
          responseMessage,
          statusCode,
          error.response?.headers?.['retry-after']
        );
      }

      throw new MdblistApiError('MDBList request failed.');
    }
  }
}

export default MdblistAPI;
