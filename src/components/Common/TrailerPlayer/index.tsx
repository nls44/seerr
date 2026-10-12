import Button from '@app/components/Common/Button';
import { useLockBodyScroll } from '@app/hooks/useLockBodyScroll';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;
const mobileMediaQuery = '(max-width: 639px)';

interface TrailerPlayerProps {
  embedUrl: string;
  title: string;
  closeLabel: string;
  onClose: () => void;
}

const TrailerPlayer = ({
  embedUrl,
  title,
  closeLabel,
  onClose,
}: TrailerPlayerProps) => {
  const autoplayEmbedUrl = `${embedUrl}${embedUrl.includes('?') ? '&' : '?'}autoplay=1`;
  const playerRef = useRef<HTMLDivElement>(null);
  const [isMobile] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia(mobileMediaQuery).matches
  );

  useLockBodyScroll(true);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useIsomorphicLayoutEffect(() => {
    if (!isMobile || !playerRef.current) {
      return;
    }

    const player = playerRef.current;
    const orientation = screen.orientation as
      | (ScreenOrientation & {
          lock?: (orientation: 'landscape') => Promise<void>;
        })
      | undefined;
    let orientationLocked = false;

    const enterFullscreen = async () => {
      try {
        if (!document.fullscreenElement && player.requestFullscreen) {
          await player.requestFullscreen();
        }

        if (orientation?.lock) {
          await orientation.lock('landscape');
          orientationLocked = true;
        }
      } catch {
        // Some browsers do not allow fullscreen or orientation locking from an
        // asynchronously mounted component. The mobile CSS layout remains a
        // fullscreen fallback in those cases.
      }
    };

    void enterFullscreen();

    return () => {
      if (orientationLocked && orientation?.unlock) {
        orientation.unlock();
      }

      if (document.fullscreenElement === player) {
        void document.exitFullscreen().catch(() => undefined);
      }
    };
  }, [isMobile]);

  return (
    <div
      className={`fixed inset-0 z-50 flex h-full w-full items-center justify-center bg-black/80 ${
        isMobile ? 'p-0' : 'p-4'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={playerRef}
        className={`relative flex w-full flex-col overflow-hidden bg-gray-950 shadow-xl ${
          isMobile
            ? 'h-full max-w-none'
            : 'h-auto max-w-5xl rounded-lg ring-1 ring-gray-700'
        }`}
      >
        <div
          className={`flex items-center justify-between gap-4 text-sm font-medium text-gray-200 ${
            isMobile
              ? 'absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-3 pb-6 pt-2'
              : 'relative bg-transparent px-4 py-2'
          }`}
        >
          <span className="truncate">{title}</span>
          <Button
            buttonType="ghost"
            buttonSize="sm"
            aria-label={closeLabel}
            title={closeLabel}
            onClick={onClose}
          >
            <XMarkIcon className="h-5 w-5" />
          </Button>
        </div>
        <div
          className={`min-h-0 w-full ${
            isMobile ? 'flex-1' : 'aspect-video flex-none'
          }`}
        >
          <iframe
            className="h-full w-full"
            src={autoplayEmbedUrl}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
};

export default TrailerPlayer;
