import Button from '@app/components/Common/Button';
import { XMarkIcon } from '@heroicons/react/24/outline';

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
}: TrailerPlayerProps) => (
  <div className="mx-auto mt-4 w-full max-w-5xl overflow-hidden rounded-lg bg-gray-950 shadow-xl ring-1 ring-gray-700">
    <div className="flex items-center justify-between gap-4 px-3 py-2 text-sm font-medium text-gray-200 sm:px-4">
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
    <div className="aspect-video w-full">
      <iframe
        className="h-full w-full"
        src={embedUrl}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  </div>
);

export default TrailerPlayer;
