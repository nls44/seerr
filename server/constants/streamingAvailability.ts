export const STREAMING_AVAILABILITY_SERVICES = [
  { id: 'netflix', name: 'Netflix', supportsTop: true },
  { id: 'prime', name: 'Prime Video', supportsTop: true },
  { id: 'disney', name: 'Disney+', supportsTop: true },
  { id: 'apple', name: 'Apple TV+', supportsTop: true },
  { id: 'hbo', name: 'Max', supportsTop: true },
  { id: 'hulu', name: 'Hulu', supportsTop: true },
  { id: 'crunchyroll', name: 'Crunchyroll', supportsTop: true },
  { id: 'crave', name: 'Crave', supportsTop: true },
  { id: 'paramount', name: 'Paramount+', supportsTop: false },
  { id: 'peacock', name: 'Peacock', supportsTop: false },
  { id: 'mubi', name: 'MUBI', supportsTop: false },
  { id: 'skyshowtime', name: 'SkyShowtime', supportsTop: false },
] as const;

export type StreamingAvailabilityServiceId =
  (typeof STREAMING_AVAILABILITY_SERVICES)[number]['id'];

export const STREAMING_AVAILABILITY_SERVICE_IDS =
  STREAMING_AVAILABILITY_SERVICES.map((service) => service.id);

export const STREAMING_AVAILABILITY_TOP_SERVICE_IDS =
  STREAMING_AVAILABILITY_SERVICES.filter((service) => service.supportsTop).map(
    (service) => service.id
  );
