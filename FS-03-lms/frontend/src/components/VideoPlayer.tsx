import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

type Props = {
  src: string;
  startAt?: number;
  onProgress?: (watchedSec: number) => void; // called about every 15 s and on pause/end
  onEnded?: () => void;
};

type YouTubePlayer = {
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  destroy: () => void;
};

type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars: Record<string, number | string>;
      events: {
        onReady: (event: { target: YouTubePlayer }) => void;
        onStateChange: (event: { data: number; target: YouTubePlayer }) => void;
        onError: () => void;
      };
    },
  ) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YouTubeApi> | undefined;

export function getYouTubeVideoId(src: string) {
  try {
    const url = new URL(src);
    let id: string | null = null;
    if (url.hostname === 'youtu.be') {
      id = url.pathname.split('/').filter(Boolean)[0] ?? null;
    } else if (['youtube.com', 'www.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
      id = url.searchParams.get('v') ?? url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1] ?? null;
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YouTube player API did not initialize'));
    };

    let script = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => reject(new Error('YouTube player API could not be loaded'));
      document.head.appendChild(script);
    } else {
      script.addEventListener('error', () => reject(new Error('YouTube player API could not be loaded')), { once: true });
    }
  }).catch((error: unknown) => {
    youtubeApiPromise = undefined;
    throw error;
  });

  return youtubeApiPromise;
}

/** Plays HLS streams or embedded YouTube lessons while reporting watch progress. */
export default function VideoPlayer({ src, startAt = 0, onProgress, onEnded }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const youtubeTargetRef = useRef<HTMLDivElement>(null);
  const lastReport = useRef(0);
  const [youtubeError, setYoutubeError] = useState('');
  const youtubeId = getYouTubeVideoId(src);

  useEffect(() => {
    if (youtubeId) {
      setYoutubeError('');
      let player: YouTubePlayer | null = null;
      let progressTimer: number | undefined;
      let cancelled = false;
      const report = () => {
        const t = Math.floor(player?.getCurrentTime() ?? 0);
        if (t > 0) onProgress?.(t);
      };
      const stopProgress = () => {
        if (progressTimer !== undefined) window.clearInterval(progressTimer);
        progressTimer = undefined;
      };

      loadYouTubeApi()
        .then((YT) => {
          if (cancelled || !youtubeTargetRef.current) return;
          player = new YT.Player(youtubeTargetRef.current, {
            videoId: youtubeId,
            playerVars: { enablejsapi: 1, origin: window.location.origin, playsinline: 1, rel: 0 },
            events: {
              onReady: ({ target }) => {
                player = target;
                setYoutubeError('');
                if (startAt > 0) target.seekTo(startAt, true);
              },
              onStateChange: ({ data, target }) => {
                player = target;
                if (data === 1) {
                  if (progressTimer === undefined) progressTimer = window.setInterval(report, 15000);
                } else {
                  stopProgress();
                  report();
                  if (data === 0) onEnded?.();
                }
              },
              onError: () => {
                stopProgress();
                setYoutubeError('This video cannot be embedded. Open it on YouTube instead.');
              },
            },
          });
        })
        .catch(() => {
          if (!cancelled) setYoutubeError('Could not load the YouTube player. Check your internet connection.');
        });

      return () => {
        cancelled = true;
        stopProgress();
        player?.destroy();
      };
    }

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

  if (youtubeId) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        <div ref={youtubeTargetRef} className="absolute inset-0 h-full w-full" />
        {youtubeError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950 p-4 text-center text-white">
            <p>{youtubeError}</p>
            <a className="underline" href={src} target="_blank" rel="noreferrer">Open video on YouTube</a>
          </div>
        )}
      </div>
    );
  }

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
