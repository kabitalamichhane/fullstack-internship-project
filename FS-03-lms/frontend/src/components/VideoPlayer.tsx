import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

type Props = {
  src: string; // HLS master playlist (.m3u8) served from CloudFront
  startAt?: number;
  onProgress?: (watchedSec: number) => void; // called about every 15 s and on pause/end
  onEnded?: () => void;
};

/** Adaptive-bitrate HLS player: hls.js in Chrome/Firefox/Edge, native HLS in Safari. */
export default function VideoPlayer({ src, startAt = 0, onProgress, onEnded }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const lastReport = useRef(0);

  useEffect(() => {
    const video = ref.current!;
    let hls: Hls | null = null;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
    } else if (Hls.isSupported()) {
      hls = new Hls({ startPosition: startAt });
      hls.loadSource(src);
      hls.attachMedia(video);
    }
    const onLoaded = () => {
      if (startAt && video.currentTime < 1) video.currentTime = startAt;
    };
    video.addEventListener('loadedmetadata', onLoaded);
    return () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      hls?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const report = () => {
    const t = Math.floor(ref.current?.currentTime ?? 0);
    if (t > 0) onProgress?.(t);
  };

  return (
    <video
      ref={ref}
      controls
      playsInline
      className="aspect-video w-full rounded-xl bg-black"
      onTimeUpdate={() => {
        const now = Date.now();
        if (now - lastReport.current > 15000) {
          lastReport.current = now;
          report();
        }
      }}
      onPause={report}
      onEnded={() => {
        report();
        onEnded?.();
      }}
    />
  );
}
