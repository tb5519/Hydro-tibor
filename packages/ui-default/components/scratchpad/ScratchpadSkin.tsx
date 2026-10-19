import React, { useLayoutEffect, useRef } from 'react';
import { takePreparedScratchpadVideo } from './themeAssets';
import { scratchpadSkinAsset, ScratchpadTheme } from './themes';

/** Artwork is a passive layer: code, keyboard focus and all editor state stay in place. */
export default function ScratchpadSkin({ theme }: { theme: ScratchpadTheme }) {
  const asset = scratchpadSkinAsset(theme, 'background');
  const mapping = theme.slots?.background;
  const host = useRef<HTMLDivElement>(null);
  const isVideo = asset?.type.startsWith('video/');
  const poster = theme.assets?.find((item) => item.id === theme.posterAssetId && item.type.startsWith('image/'));

  useLayoutEffect(() => {
    if (!isVideo || !asset || !host.current) return undefined;
    // Move the already-decoded video into place before the collective fade-in.
    // Creating a second <video src> here would repeat its first-frame loading
    // and reveal it separately from the rest of the prepared theme.
    const element = takePreparedScratchpadVideo(asset.url) || document.createElement('video');
    element.muted = true;
    element.playsInline = true;
    element.loop = true;
    element.preload = 'auto';
    element.disablePictureInPicture = true;
    element.disableRemotePlayback = true;
    element.tabIndex = -1;
    if (poster) element.poster = poster.url;
    element.style.objectFit = mapping?.fit === 'stretch' ? 'fill' : mapping?.fit === 'contain' ? 'contain' : 'cover';
    element.style.objectPosition = mapping?.position || 'center';
    if (element.getAttribute('src') !== asset.url) element.src = asset.url;
    const reveal = () => {
      if (element.readyState >= 2) element.classList.add('is-ready');
    };
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let failed = false;
    const play = () => {
      if (failed) return;
      reveal();
      if (document.visibilityState === 'hidden' || motion?.matches) element.pause();
      else element.play()?.catch(() => { /* Keep the decoded first frame if autoplay is unavailable. */ });
    };
    const fail = () => {
      failed = true;
      element.pause();
      element.remove();
    };
    element.addEventListener('loadeddata', play);
    element.addEventListener('playing', reveal);
    element.addEventListener('error', fail);
    document.addEventListener('visibilitychange', play);
    motion?.addEventListener?.('change', play);
    reveal();
    host.current.appendChild(element);
    play();
    return () => {
      document.removeEventListener('visibilitychange', play);
      motion?.removeEventListener?.('change', play);
      element.removeEventListener('loadeddata', play);
      element.removeEventListener('playing', reveal);
      element.removeEventListener('error', fail);
      element.pause();
      element.remove();
      element.removeAttribute('src');
      element.load();
    };
  }, [asset?.url, isVideo, poster?.url, mapping?.fit, mapping?.position]);

  if (!theme.badgeId) return null;
  const imageUrl = isVideo ? poster?.url : asset?.url;
  const style: React.CSSProperties = {
    backgroundImage: imageUrl ? `url(${JSON.stringify(imageUrl)})` : undefined,
    backgroundSize: mapping?.fit === 'stretch' ? '100% 100%' : mapping?.fit === 'tile' ? 'auto' : mapping?.fit || 'cover',
    backgroundRepeat: mapping?.fit === 'tile' ? 'repeat' : 'no-repeat',
    backgroundPosition: mapping?.position || 'center',
  };
  return (
    <>
      <div ref={host} className="scratchpad__skin-background" style={style} aria-hidden="true" />
      {scratchpadSkinAsset(theme, 'corner') && <div className="scratchpad__skin-corner" aria-hidden="true" />}
    </>
  );
}
