import MdblistAPI, {
  parseMdblistItems,
  parseMdblistListId,
} from '@server/api/mdblist';
import cacheManager from '@server/lib/cache';
import type {
  AxiosAdapter,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

class TestMdblistAPI extends MdblistAPI {
  public installAdapter(adapter: AxiosAdapter): void {
    this.axios.defaults.adapter = adapter;
  }
}

const getAxios = (api: MdblistAPI): AxiosInstance =>
  (api as unknown as { axios: AxiosInstance }).axios;

const axiosResponse = <T>(
  config: InternalAxiosRequestConfig,
  data: T
): AxiosResponse<T> => ({
  data,
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
  request: {},
});

describe('parseMdblistListId', () => {
  it('normalizes supported MDBList URLs and identifiers', () => {
    assert.equal(
      parseMdblistListId('https://www.mdblist.com/lists/official/movies'),
      'official/movies'
    );
    assert.equal(parseMdblistListId('/lists/12345'), '12345');
    assert.equal(parseMdblistListId('user/my-list'), 'user/my-list');
    assert.equal(
      parseMdblistListId('https://mdblist.com/lists/user/my-list'),
      'user/my-list'
    );
  });

  it('rejects arbitrary hosts, protocols, and path traversal', () => {
    assert.throws(() => parseMdblistListId('http://mdblist.com/lists/1'));
    assert.throws(() => parseMdblistListId('https://example.com/lists/1'));
    assert.throws(() => parseMdblistListId('https://mdblist.com/lists/../1'));
    assert.throws(() => parseMdblistListId('user/list?redirect=example.com'));
  });
});

describe('parseMdblistItems', () => {
  it('preserves order and keeps movie and TV IDs distinct', () => {
    assert.deepEqual(
      parseMdblistItems([
        { ids: { tmdb: 10 }, type: 'movie' },
        { ids: { tmdb: 10 }, type: 'show' },
        { ids: { tmdb: '11' }, media_type: 'tv' },
        { ids: { tmdb: 12 } },
        null,
      ]),
      [
        { tmdbId: 10, mediaType: 'movie' },
        { tmdbId: 10, mediaType: 'tv' },
        { tmdbId: 11, mediaType: 'tv' },
      ]
    );
  });

  it('parses the current split movies and shows response shape', () => {
    assert.deepEqual(
      parseMdblistItems([
        { id: 10, mediatype: 'movie' },
        { id: 20, mediatype: 'show' },
      ]),
      [
        { tmdbId: 10, mediaType: 'movie' },
        { tmdbId: 20, mediaType: 'tv' },
      ]
    );
  });
});

describe('MdblistAPI.getListItems', () => {
  beforeEach(() => cacheManager.getCache('mdblist').flush());
  afterEach(() => {
    mock.restoreAll();
    cacheManager.getCache('mdblist').flush();
  });

  it('caches paginated list responses', async () => {
    const api = new TestMdblistAPI('test-key');
    let requests = 0;
    api.installAdapter(async (config) => {
      requests++;
      return axiosResponse(config, {
        items: [{ ids: { tmdb: 1 }, type: 'movie' }],
        total: 1,
      });
    });

    await api.getListItems({ listId: 'user/list', page: 2, limit: 20 });
    const result = await api.getListItems({
      listId: 'https://mdblist.com/lists/user/list',
      page: 2,
      limit: 20,
    });

    assert.deepEqual(result, {
      items: [{ tmdbId: 1, mediaType: 'movie' }],
      totalResults: 1,
    });
    assert.equal(requests, 1);
  });

  it('parses movies and shows returned in separate arrays', async () => {
    const api = new TestMdblistAPI('test-key');
    api.installAdapter(async (config) =>
      axiosResponse(config, {
        movies: [{ ids: { tmdb: 1 }, mediatype: 'movie' }],
        shows: [{ id: 2, mediatype: 'show' }],
        pagination: { total: 2 },
      })
    );

    assert.deepEqual(await api.getListItems({ listId: 'user/list' }), {
      items: [
        { tmdbId: 1, mediaType: 'movie' },
        { tmdbId: 2, mediaType: 'tv' },
      ],
      totalResults: 2,
    });
  });

  it('tests an API key against the authenticated user endpoint', async () => {
    const api = new TestMdblistAPI('test-key');
    let endpoint = '';
    api.installAdapter(async (config) => {
      endpoint = config.url ?? '';
      return axiosResponse(config, []);
    });

    await api.test();

    assert.equal(endpoint, '/user');
  });

  it('preserves rate-limit errors and retry hints', async () => {
    const api = new TestMdblistAPI('test-key');
    const error = Object.assign(new Error('rate limited'), {
      isAxiosError: true,
      response: {
        status: 429,
        data: { error: 'API rate limit exceeded!' },
        headers: { 'retry-after': '30' },
      },
    });
    mock.method(getAxios(api), 'get', async () => {
      throw error;
    });

    await assert.rejects(
      () => api.getListItems({ listId: 'user/list' }),
      (caught: Error & { statusCode?: number; retryAfter?: string }) =>
        caught.message === 'API rate limit exceeded!' &&
        caught.statusCode === 429 &&
        caught.retryAfter === '30'
    );
  });
});
