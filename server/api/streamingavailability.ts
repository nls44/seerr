import ExternalAPI from '@server/api/externalapi';
import { MediaType } from '@server/constants/media';
import {
  STREAMING_AVAILABILITY_SERVICE_IDS,
  STREAMING_AVAILABILITY_TOP_SERVICE_IDS,
  type StreamingAvailabilityServiceId,
} from '@server/constants/streamingAvailability';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';
import axios from 'axios';

export type StreamingAvailabilityShowType = 'movie' | 'series';

export interface StreamingAvailabilityShow {
  showType: StreamingAvailabilityShowType;
  tmdbId: string;
  title?: string;
}

interface StreamingAvailabilityServiceInfo {
  id: string;
  name: string;
  imageSet?: {
    lightThemeImage?: string;
    darkThemeImage?: string;
    whiteImage?: string;
  };
}

interface StreamingAvailabilityCountryResponse {
  services?: StreamingAvailabilityServiceInfo[];
}

interface StreamingAvailabilityChange {
  itemType: 'show' | 'season' | 'episode';
  showId: string;
  showType: StreamingAvailabilityShowType;
  service?: Pick<StreamingAvailabilityServiceInfo, 'id'>;
}

interface StreamingAvailabilityChangesResponse {
  changes?: StreamingAvailabilityChange[];
  shows?: Record<string, StreamingAvailabilityShow>;
}

export interface StreamingAvailabilityItemReference {
  tmdbId: number;
  mediaType: MediaType;
  streamingServiceIds: StreamingAvailabilityServiceId[];
}

export interface StreamingAvailabilityServiceLogo {
  id: StreamingAvailabilityServiceId;
  name: string;
  logoPath: string;
}

export class StreamingAvailabilityApiError extends Error {
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'StreamingAvailabilityApiError';
    this.statusCode = statusCode;
  }
}

export const parseStreamingAvailabilityServices = (
  value: unknown,
  { topOnly = false }: { topOnly?: boolean } = {}
): StreamingAvailabilityServiceId[] => {
  if (typeof value !== 'string') {
    throw new Error('At least one streaming service is required.');
  }

  const allowedServices = new Set(
    topOnly
      ? STREAMING_AVAILABILITY_TOP_SERVICE_IDS
      : STREAMING_AVAILABILITY_SERVICE_IDS
  );
  const services = [...new Set(value.split('|').filter(Boolean))].filter(
    (service): service is StreamingAvailabilityServiceId =>
      allowedServices.has(service as StreamingAvailabilityServiceId)
  );

  if (!services.length) {
    throw new Error('At least one valid streaming service is required.');
  }

  return services;
};

const parseReference = (
  show: StreamingAvailabilityShow | undefined,
  streamingServiceIds: StreamingAvailabilityServiceId[] = []
): StreamingAvailabilityItemReference | undefined => {
  if (!show) {
    return undefined;
  }

  const tmdbId = /^(movie|tv)\/(\d+)$/.exec(show.tmdbId);
  if (!tmdbId) {
    return undefined;
  }

  return {
    tmdbId: Number(tmdbId[2]),
    mediaType: show.showType === 'movie' ? MediaType.MOVIE : MediaType.TV,
    streamingServiceIds,
  };
};

const dedupeReferences = (
  references: (StreamingAvailabilityItemReference | undefined)[]
): StreamingAvailabilityItemReference[] => {
  const deduped = new Map<string, StreamingAvailabilityItemReference>();

  references.forEach((reference) => {
    if (!reference) {
      return;
    }

    const key = `${reference.mediaType}:${reference.tmdbId}`;
    const existing = deduped.get(key);
    if (existing) {
      existing.streamingServiceIds = [
        ...new Set([
          ...existing.streamingServiceIds,
          ...reference.streamingServiceIds,
        ]),
      ];
      return;
    }

    deduped.set(key, reference);
  });

  return [...deduped.values()];
};

class StreamingAvailabilityAPI extends ExternalAPI {
  private readonly apiKey: string;

  constructor(apiKey = getSettings().streamingAvailability.apiKey) {
    super(
      'https://api.movieofthenight.com/v4',
      {},
      {
        headers: { 'X-API-Key': apiKey },
        nodeCache: cacheManager.getCache('streamingavailability').data,
        rateLimit: { maxRequests: 5, maxRPS: 10 },
      }
    );
    this.apiKey = apiKey;
  }

  public async getNewShows({
    country,
    services,
    showType,
    language,
  }: {
    country: string;
    services: StreamingAvailabilityServiceId[];
    showType: StreamingAvailabilityShowType;
    language: string;
  }): Promise<StreamingAvailabilityItemReference[]> {
    this.assertConfigured();

    try {
      const data = await this.get<StreamingAvailabilityChangesResponse>(
        '/changes',
        {
          params: {
            country,
            catalogs: services.join(','),
            change_type: 'new',
            item_type: 'show',
            show_type: showType,
            output_language: language,
            order_direction: 'desc',
          },
        },
        900
      );

      return dedupeReferences(
        (data.changes ?? [])
          .filter((change) => change.itemType === 'show')
          .map((change) => {
            const serviceId = change.service?.id;
            const service = STREAMING_AVAILABILITY_SERVICE_IDS.includes(
              serviceId as StreamingAvailabilityServiceId
            )
              ? [serviceId as StreamingAvailabilityServiceId]
              : services;

            return parseReference(data.shows?.[change.showId], service);
          })
      ).slice(0, 20);
    } catch (error) {
      throw this.toApiError(error);
    }
  }

  public async getTopShows({
    country,
    services,
    showType,
    language,
  }: {
    country: string;
    services: StreamingAvailabilityServiceId[];
    showType: StreamingAvailabilityShowType;
    language: string;
  }): Promise<StreamingAvailabilityItemReference[]> {
    this.assertConfigured();

    try {
      const serviceResults = await Promise.all(
        services.map(async (service) => ({
          service,
          shows: await this.get<StreamingAvailabilityShow[]>(
            '/shows/top',
            {
              params: {
                country,
                service,
                show_type: showType,
                output_language: language,
              },
            },
            900
          ),
        }))
      );

      return dedupeReferences(
        serviceResults.flatMap(({ service, shows }) =>
          shows.map((show) => parseReference(show, [service]))
        )
      ).slice(0, 20);
    } catch (error) {
      throw this.toApiError(error);
    }
  }

  public async getServiceLogos({
    country,
    services,
    language,
  }: {
    country: string;
    services: StreamingAvailabilityServiceId[];
    language: string;
  }): Promise<StreamingAvailabilityServiceLogo[]> {
    this.assertConfigured();

    try {
      const data = await this.get<StreamingAvailabilityCountryResponse>(
        `/countries/${country}`,
        { params: { output_language: language } },
        900
      );
      const servicesById = new Map(
        (data.services ?? []).map((service) => [service.id, service])
      );

      return services.flatMap((serviceId) => {
        const service = servicesById.get(serviceId);
        const logoPath =
          service?.imageSet?.darkThemeImage ??
          service?.imageSet?.whiteImage ??
          service?.imageSet?.lightThemeImage;

        if (!service || !logoPath) {
          return [];
        }

        return [
          {
            id: serviceId,
            name: service.name,
            logoPath,
          },
        ];
      });
    } catch (error) {
      throw this.toApiError(error);
    }
  }

  public async test(): Promise<void> {
    this.assertConfigured();

    try {
      await this.get('/countries', undefined, 0);
    } catch (error) {
      throw this.toApiError(error);
    }
  }

  private assertConfigured(): void {
    if (!this.apiKey) {
      throw new StreamingAvailabilityApiError(
        'Streaming Availability API key is not configured.',
        503
      );
    }
  }

  private toApiError(error: unknown): StreamingAvailabilityApiError {
    if (error instanceof StreamingAvailabilityApiError) {
      return error;
    }

    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;
      const responseMessage =
        typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : 'Streaming Availability API request failed.';
      return new StreamingAvailabilityApiError(responseMessage, statusCode);
    }

    return new StreamingAvailabilityApiError(
      'Streaming Availability API request failed.'
    );
  }
}

export default StreamingAvailabilityAPI;
