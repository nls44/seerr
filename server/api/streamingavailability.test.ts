import StreamingAvailabilityAPI, {
  parseStreamingAvailabilityServices,
} from '@server/api/streamingavailability';
import { parseStreamingAvailabilitySliderData } from '@server/constants/streamingAvailability';
import cacheManager from '@server/lib/cache';
import type {
  AxiosAdapter,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

class TestStreamingAvailabilityAPI extends StreamingAvailabilityAPI {
  public installAdapter(adapter: AxiosAdapter): void {
    this.axios.defaults.adapter = adapter;
  }
}

const getAxios = (api: StreamingAvailabilityAPI): AxiosInstance =>
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
});

describe('parseStreamingAvailabilityServices', () => {
  it('keeps valid services in the configured order and removes duplicates', () => {
    assert.deepEqual(
      parseStreamingAvailabilityServices('netflix|prime|netflix'),
      ['netflix', 'prime']
    );
  });

  it('rejects services without official top-list support when requested', () => {
    assert.throws(() =>
      parseStreamingAvailabilityServices('paramount', { topOnly: true })
    );
  });
});

describe('parseStreamingAvailabilitySliderData', () => {
  it('parses country-aware slider data', () => {
    assert.deepEqual(parseStreamingAvailabilitySliderData('BE,netflix|prime'), {
      country: 'BE',
      services: 'netflix|prime',
    });
  });

  it('keeps legacy service-only slider data compatible', () => {
    assert.deepEqual(parseStreamingAvailabilitySliderData('netflix|prime'), {
      services: 'netflix|prime',
    });
  });
});

describe('StreamingAvailabilityAPI', () => {
  beforeEach(() => cacheManager.getCache('streamingavailability').flush());
  afterEach(() => cacheManager.getCache('streamingavailability').flush());

  it('maps new changes to Seerr TMDB references', async () => {
    const api = new TestStreamingAvailabilityAPI('test-key');
    api.installAdapter(async (config) =>
      axiosResponse(config, {
        changes: [
          { itemType: 'show', showId: '1', showType: 'series' },
          { itemType: 'show', showId: '2', showType: 'movie' },
        ],
        shows: {
          '1': { showType: 'series', tmdbId: 'tv/1399' },
          '2': { showType: 'movie', tmdbId: 'movie/550' },
        },
      })
    );

    assert.deepEqual(
      await api.getNewShows({
        country: 'be',
        services: ['netflix'],
        showType: 'series',
        language: 'en',
      }),
      [
        {
          tmdbId: 1399,
          mediaType: 'tv',
          streamingServiceIds: ['netflix'],
        },
        {
          tmdbId: 550,
          mediaType: 'movie',
          streamingServiceIds: ['netflix'],
        },
      ]
    );
  });

  it('requests official top lists for each selected service', async () => {
    const api = new TestStreamingAvailabilityAPI('test-key');
    const requests: string[] = [];
    api.installAdapter(async (config) => {
      requests.push(getAxios(api).getUri(config));
      return axiosResponse(config, [{ showType: 'series', tmdbId: 'tv/1399' }]);
    });

    assert.deepEqual(
      await api.getTopShows({
        country: 'be',
        services: ['netflix', 'prime'],
        showType: 'series',
        language: 'en',
      }),
      [
        {
          tmdbId: 1399,
          mediaType: 'tv',
          streamingServiceIds: ['netflix', 'prime'],
        },
      ]
    );
    assert.equal(requests.length, 2);
    assert.ok(
      requests.every((request) => request.includes('show_type=series'))
    );
  });

  it('caches repeated requests with the same parameters', async () => {
    const api = new TestStreamingAvailabilityAPI('test-key');
    let requestCount = 0;
    api.installAdapter(async (config) => {
      requestCount += 1;
      return axiosResponse(config, [{ showType: 'series', tmdbId: 'tv/1399' }]);
    });

    const options = {
      country: 'be',
      services: ['netflix'] as ['netflix'],
      showType: 'series' as const,
      language: 'en',
    };

    await api.getTopShows(options);
    await api.getTopShows(options);

    assert.equal(requestCount, 1);
  });

  it('maps regional service metadata to logo badges', async () => {
    const api = new TestStreamingAvailabilityAPI('test-key');
    api.installAdapter(async (config) =>
      axiosResponse(config, {
        services: [
          {
            id: 'netflix',
            name: 'Netflix',
            imageSet: {
              darkThemeImage: 'https://example.com/netflix.svg',
            },
          },
        ],
      })
    );

    assert.deepEqual(
      await api.getServiceLogos({
        country: 'be',
        services: ['netflix'],
        language: 'en',
      }),
      [
        {
          id: 'netflix',
          name: 'Netflix',
          logoPath: 'https://example.com/netflix.svg',
        },
      ]
    );
  });
});
