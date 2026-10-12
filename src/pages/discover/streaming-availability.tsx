import PageTitle from '@app/components/Common/PageTitle';
import MediaSlider from '@app/components/MediaSlider';
import { encodeURIExtraParams } from '@app/hooks/useDiscover';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';

const StreamingAvailabilityDiscoverPage: NextPage = () => {
  useRouteGuard(Permission.REQUEST);
  const router = useRouter();

  const mode = router.query.mode === 'popular' ? 'popular' : 'new';
  const mediaType = router.query.mediaType === 'tv' ? 'tv' : 'movie';
  const country =
    typeof router.query.country === 'string' ? router.query.country : undefined;
  const services =
    typeof router.query.services === 'string' ? router.query.services : '';
  const title = `Streaming: ${
    mode === 'popular' ? 'Most Popular' : 'New'
  } ${mediaType === 'tv' ? 'Series' : 'Movies'}`;
  const extraParams = [
    `mode=${mode}`,
    `mediaType=${mediaType}`,
    country ? `country=${encodeURIExtraParams(country)}` : undefined,
    `services=${encodeURIExtraParams(services)}`,
  ]
    .filter((param): param is string => param !== undefined)
    .join('&');

  return (
    <>
      <PageTitle title={title} />
      {router.isReady && services && (
        <MediaSlider
          sliderKey={`streaming-availability-${mode}-${mediaType}-${country ?? 'default'}-${services}`}
          title={title}
          url="/api/v1/discover/streaming-availability"
          layout="grid"
          showAllResults
          extraParams={extraParams}
        />
      )}
    </>
  );
};

export default StreamingAvailabilityDiscoverPage;
