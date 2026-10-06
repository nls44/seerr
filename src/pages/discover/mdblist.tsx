import PageTitle from '@app/components/Common/PageTitle';
import MediaSlider from '@app/components/MediaSlider';
import { encodeURIExtraParams } from '@app/hooks/useDiscover';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';

const MdblistDiscoverPage: NextPage = () => {
  useRouteGuard(Permission.REQUEST);
  const router = useRouter();
  const list = typeof router.query.list === 'string' ? router.query.list : '';

  return (
    <>
      <PageTitle title="MDBList" />
      {list && (
        <MediaSlider
          sliderKey={`mdblist-${list}`}
          title="MDBList"
          url="/api/v1/discover/mdblist"
          extraParams={`list=${encodeURIExtraParams(list)}`}
        />
      )}
    </>
  );
};

export default MdblistDiscoverPage;
