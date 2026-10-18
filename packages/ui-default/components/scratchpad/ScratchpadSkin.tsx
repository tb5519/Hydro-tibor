import React, { useEffect, useRef, useState } from 'react';
import { scratchpadSkinAsset, ScratchpadTheme } from './themes';

/** Artwork is a passive layer: code, keyboard focus and all editor state stay in place. */
export default function ScratchpadSkin({ theme }: { theme: ScratchpadTheme }) {
  const asset = scratchpadSkinAsset(theme, 'background');
  const mapping = theme.slots?.background;
  const video = useRef<HTMLVideoElement>(null);
  const [readyUrl, setReadyUrl] = useState('');
  const [failedUrl, setFailedUrl] = useState('');
  const [reducedMotion, setReducedMotion] = useState(false);
  const isVideo = asset?.type.startsWith('video/');
  const poster = theme.assets?.find((item) => item.id === theme.posterAssetId && item.type.startsWith('image/'));

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return undefined;
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    const element = video.current;
    if (!isVideo || !element || !asset) return undefined;
    let active = true;
    let frame: number;
    const reveal = () => {
      if (active && element.readyState >= 2) setReadyUrl(asset.url);
    };
    const play = () => {
      if (!active || document.visibilityState === 'hidden') return;
      // A decoded first frame replaces the poster; autoplay rejection simply
      // leaves the image visible and never adds an unwanted play button.
      if (reducedMotion) {
        element.pause();
        reveal();
      } else {
        const playback = element.play();
        playback?.then(() => {
          if ('requestVideoFrameCallback' in element) frame = element.requestVideoFrameCallback(reveal);
          else reveal();
        }).catch(() => {
          // A video-only package can still display its decoded first frame.
          if (!poster) reveal();
        });
      }
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') element.pause();
      else play();
    };
    element.addEventListener('loadeddata', play);
    element.addEventListener('playing', reveal);
    document.addEventListener('visibilitychange', visibility);
    if (element.readyState >= 2) play();
    return () => {
      active = false;
      if (frame && 'cancelVideoFrameCallback' in element) element.cancelVideoFrameCallback(frame);
      element.pause();
      element.removeEventListener('loadeddata', play);
      element.removeEventListener('playing', reveal);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [asset?.url, isVideo, reducedMotion]);

  if (!theme.badgeId) return null;
  const ready = asset && readyUrl === asset.url;
  const imageUrl = isVideo ? poster?.url : asset?.url;
  const style: React.CSSProperties = {
    backgroundImage: imageUrl ? `url(${JSON.stringify(imageUrl)})` : undefined,
    backgroundSize: mapping?.fit === 'stretch' ? '100% 100%' : mapping?.fit === 'tile' ? 'auto' : mapping?.fit || 'cover',
    backgroundRepeat: mapping?.fit === 'tile' ? 'repeat' : 'no-repeat',
    backgroundPosition: mapping?.position || 'center',
  };
  return (
    <>
      <div className="scratchpad__skin-background" style={style} aria-hidden="true">
        {isVideo && failedUrl !== asset.url && (
          <video
            ref={video}
            className={ready ? 'is-ready' : ''}
            key={asset.url}
            src={asset.url}
            poster={poster?.url}
            muted
            playsInline
            loop
            preload="auto"
            disablePictureInPicture
            disableRemotePlayback
            tabIndex={-1}
            onError={() => setFailedUrl(asset.url)}
            style={{
              objectFit: mapping?.fit === 'stretch' ? 'fill' : mapping?.fit === 'contain' ? 'contain' : 'cover',
              objectPosition: mapping?.position || 'center',
            }}
          />
        )}
      </div>
      {scratchpadSkinAsset(theme, 'corner') && <div className="scratchpad__skin-corner" aria-hidden="true" />}
    </>
  );
}
