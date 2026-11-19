import React, { useEffect, useState } from 'react';
import { useTr } from '../../lang/ui';
import { Product, ProductMedia } from '../../domain/types';
import { MAX_PRODUCT_IMAGES, MAX_PRODUCT_VIDEOS, MAX_VIDEO_SECONDS } from '../../app/shared';

export function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
    };
    video.onloadedmetadata = () => {
      const duration = video.duration;
      cleanup();
      resolve(duration);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error(`Could not read the duration of ${file.name}.`));
    };
    video.src = url;
  });
}

export async function validateProductMedia(files: File[]): Promise<void> {
  const images = files.filter(file => file.type.startsWith('image/'));
  const videos = files.filter(file => file.type.startsWith('video/'));
  if (images.length > MAX_PRODUCT_IMAGES) throw new Error(`Choose up to ${MAX_PRODUCT_IMAGES} photos.`);
  if (videos.length > MAX_PRODUCT_VIDEOS) throw new Error('Choose one product video at a time.');
  if (files.length !== images.length + videos.length) throw new Error('Choose image or video files only.');
  if (images.some(file => file.size > 10 * 1024 * 1024)) throw new Error('Each photo must be smaller than 10 MB.');
  if (videos.some(file => file.size > 50 * 1024 * 1024)) throw new Error('The product video must be smaller than 50 MB.');
  if (videos.length && !['video/mp4', 'video/webm', 'video/quicktime'].includes(videos[0].type)) {
    throw new Error('Use an MP4, WebM, or QuickTime video.');
  }
  if (videos.length && await readVideoDuration(videos[0]) > MAX_VIDEO_SECONDS) {
    throw new Error(`Keep the product video to ${MAX_VIDEO_SECONDS} seconds or less.`);
  }
}

export function MediaLightbox({
  items,
  startIndex,
  name,
  onClose,
}: {
  items: ProductMedia[];
  startIndex: number;
  name: string;
  onClose: () => void;
}) {
  const tr = useTr();
  const [index, setIndex] = useState(startIndex);
  const current = items[Math.min(index, items.length - 1)];
  const go = (delta: number) => setIndex(value => (value + delta + items.length) % items.length);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const arrowStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.15)',
    border: 'none',
    color: '#fff',
    fontSize: '2.2rem',
    width: '48px',
    height: '64px',
    borderRadius: '8px',
    cursor: 'pointer',
    flex: '0 0 48px',
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${name} photos and video`}
      onClick={onClose}
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.92)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '1rem' }}
    >
      <button type="button" aria-label={tr('Close')} onClick={onClose} style={{ position: 'absolute', top: '10px', right: '16px', background: 'none', border: 'none', color: '#fff', fontSize: '2rem', cursor: 'pointer' }}>✕</button>
      {items.length > 1 && (
        <button type="button" aria-label={tr('Previous')} onClick={event => { event.stopPropagation(); go(-1); }} style={arrowStyle}>‹</button>
      )}
      <div onClick={event => event.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
        {current.type === 'video' ? (
          <video src={current.url} controls autoPlay playsInline style={{ maxWidth: '85vw', maxHeight: '82vh' }} />
        ) : (
          <img src={current.url} alt={name} style={{ maxWidth: '85vw', maxHeight: '82vh', objectFit: 'contain' }} />
        )}
        <span style={{ color: '#fff', fontSize: '0.85rem' }}>{name}{items.length > 1 ? ` · ${index + 1} / ${items.length}` : ''}</span>
      </div>
      {items.length > 1 && (
        <button type="button" aria-label={tr('Next')} onClick={event => { event.stopPropagation(); go(1); }} style={arrowStyle}>›</button>
      )}
    </div>
  );
}

export function ProductGallery({ product, badges = [], onView, overlay }: { product: Product; badges?: string[]; onView?: () => void; overlay?: React.ReactNode }) {
  const tr = useTr();
  const media: ProductMedia[] = product.media?.length
    ? product.media
    : [{ url: product.image, type: 'image' }];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const selectedMedia = media[Math.min(selectedIndex, media.length - 1)];
  const openViewer = () => {
    setViewerOpen(true);
    onView?.();
  };

  useEffect(() => setSelectedIndex(0), [product.id]);

  return (
    <div>
      <div className="mr-zoomable" style={{ position: 'relative', cursor: 'zoom-in' }} onClick={openViewer}>
        {selectedMedia.type === 'video' ? (
          <video src={selectedMedia.url} controls playsInline preload="metadata" onClick={event => event.stopPropagation()} style={{ width: '100%', aspectRatio: '4 / 5', objectFit: 'cover', display: 'block' }} />
        ) : (
          <img src={selectedMedia.url} alt={product.name} loading="lazy" style={{ width: '100%', aspectRatio: '4 / 5', objectFit: 'cover', display: 'block', background: 'var(--mr-tint)' }} />
        )}
        <button
          type="button"
          aria-label={`View ${product.name} full size`}
          onClick={event => { event.stopPropagation(); openViewer(); }}
          style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '999px', padding: '0.3rem 0.7rem', fontSize: '0.75rem', cursor: 'pointer' }}
        >
          {tr('⤢ View full')}
        </button>
        {overlay}
        {badges.length > 0 && (
          <div style={{ position: 'absolute', top: '8px', left: '8px', display: 'flex', flexDirection: 'column', gap: '4px', pointerEvents: 'none' }}>
            {badges.map(badge => (
              <span key={badge} className={`mr-badge${badge === 'NEW' ? ' mr-badge-new' : ''}`}>{badge}</span>
            ))}
          </div>
        )}
      </div>
      {media.length > 1 && (
        <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', padding: '0.5rem' }}>
          {media.map((item, index) => (
            <button
              key={`${item.url}-${index}`}
              type="button"
              aria-label={`Show ${item.type === 'video' ? 'video' : 'photo'} ${index + 1}`}
              aria-pressed={selectedIndex === index}
              onClick={() => setSelectedIndex(index)}
              style={{ width: '56px', height: '48px', flex: '0 0 56px', padding: 0, border: selectedIndex === index ? '2px solid var(--mr-primary)' : '1px solid #ccc', cursor: 'pointer' }}
            >
              {item.type === 'video' ? (
                <video src={item.url} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </button>
          ))}
        </div>
      )}
      {viewerOpen && <MediaLightbox items={media} startIndex={selectedIndex} name={product.name} onClose={() => setViewerOpen(false)} />}
    </div>
  );
}
