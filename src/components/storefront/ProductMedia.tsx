import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

/**
 * A picture you can look around in: scroll the mouse wheel or pinch to zoom, move the mouse to look around (or drag with a
 * finger), double-tap to zoom in and out, and use the + / - buttons.
 */
function ZoomableImage({ src, alt, onZoom }: { src: string; alt: string; onZoom: (zoomed: boolean) => void }) {
  const tr = useTr();
  const MAX = 5;
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [moving, setMoving] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pointList = (): Array<{ x: number; y: number }> => Array.from(pointers.current.values());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const lastTap = useRef(0);
  const scaleRef = useRef(1);
  const posRef = useRef({ x: 0, y: 0 });

  const apply = (nextScale: number, nextPos: { x: number; y: number }) => {
    const rect = box.current?.getBoundingClientRect();
    const limitX = rect ? (rect.width * (nextScale - 1)) / 2 : 0;
    const limitY = rect ? (rect.height * (nextScale - 1)) / 2 : 0;
    const clean = { x: Math.max(-limitX, Math.min(limitX, nextPos.x)), y: Math.max(-limitY, Math.min(limitY, nextPos.y)) };
    scaleRef.current = nextScale;
    posRef.current = nextScale <= 1 ? { x: 0, y: 0 } : clean;
    setScale(nextScale);
    setPos(posRef.current);
    onZoom(nextScale > 1);
  };

  /** Zoom to a new level while keeping the point under (cx, cy) in place. */
  const zoomAt = (nextScale: number, cx?: number, cy?: number) => {
    const rect = box.current?.getBoundingClientRect();
    const level = Math.max(1, Math.min(MAX, nextScale));
    if (!rect || cx === undefined || cy === undefined) { apply(level, posRef.current); return; }
    const fromCenterX = cx - rect.left - rect.width / 2;
    const fromCenterY = cy - rect.top - rect.height / 2;
    const ratio = level / scaleRef.current;
    apply(level, { x: fromCenterX - ratio * (fromCenterX - posRef.current.x), y: fromCenterY - ratio * (fromCenterY - posRef.current.y) });
  };

  // The mouse wheel needs a non-passive listener so the page does not scroll while zooming.
  useEffect(() => {
    const element = box.current;
    if (!element) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(scaleRef.current * Math.exp(-event.deltaY * 0.0022), event.clientX, event.clientY);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (event.pointerType !== 'mouse') (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = pointList();
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: scaleRef.current };
      drag.current = null;
    } else if (pointers.current.size === 1) {
      drag.current = { x: event.clientX, y: event.clientY, px: posRef.current.x, py: posRef.current.y };
      setMoving(true);
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = box.current?.getBoundingClientRect();
    if (event.pointerType === 'mouse' && event.buttons === 0) {
      // Hover: with the picture zoomed in, moving the mouse looks around it.
      if (rect && scaleRef.current > 1) {
        const fx = (event.clientX - rect.left) / rect.width - 0.5;
        const fy = (event.clientY - rect.top) / rect.height - 0.5;
        apply(scaleRef.current, { x: -fx * rect.width * (scaleRef.current - 1), y: -fy * rect.height * (scaleRef.current - 1) });
      }
      return;
    }
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = pointList();
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((pinch.current.scale * distance) / pinch.current.dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (drag.current && scaleRef.current > 1) {
      apply(scaleRef.current, { x: drag.current.px + event.clientX - drag.current.x, y: drag.current.py + event.clientY - drag.current.y });
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      drag.current = null;
      setMoving(false);
      // Double tap or double click: zoom in at that spot, or back out.
      const now = Date.now();
      if (now - lastTap.current < 320) {
        if (scaleRef.current > 1) apply(1, { x: 0, y: 0 });
        else zoomAt(2.6, event.clientX, event.clientY);
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
    }
  };

  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  const button = { width: '40px', height: '40px', borderRadius: '50%', border: 0, background: 'rgba(16,29,56,0.85)', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' } as const;

  return (
    <div
      ref={box}
      className="mr-zoombox"
      style={{ touchAction: scale > 1 ? 'none' : 'pan-y', cursor: scale > 1 ? 'grab' : 'zoom-in' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={event => { if (event.pointerType === 'mouse') { pointers.current.delete(event.pointerId); setMoving(false); } }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, transition: moving ? 'none' : 'transform 0.12s ease-out' }}
      />
      <div className="mr-zoomtools" onClick={stop} onPointerDown={stop} onPointerUp={stop}>
        <button type="button" style={button} aria-label={tr('Zoom out')} onClick={() => zoomAt(scaleRef.current / 1.5)} disabled={scale <= 1}>−</button>
        <span style={{ color: '#fff', fontSize: '0.8rem', minWidth: '3rem', textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
        <button type="button" style={button} aria-label={tr('Zoom in')} onClick={() => zoomAt(scaleRef.current * 1.5)} disabled={scale >= MAX}>+</button>
        {scale > 1 && <button type="button" style={{ ...button, width: 'auto', padding: '0 0.8rem', fontSize: '0.8rem' }} onClick={() => apply(1, { x: 0, y: 0 })}>{tr('Fit')}</button>}
      </div>
    </div>
  );
}

export function MediaLightbox({
  items,
  startIndex,
  name,
  product,
  onClose,
}: {
  items: ProductMedia[];
  startIndex: number;
  name: string;
  product?: Product;
  onClose: () => void;
}) {
  const tr = useTr();
  const [index, setIndex] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchStart = useRef<number | null>(null);
  const current = items[Math.min(index, items.length - 1)];
  const go = (delta: number) => { setZoomed(false); setIndex(value => (value + delta + items.length) % items.length); };

  useEffect(() => {
    closeRef.current?.focus();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const price = product ? product.offerPrice || product.price : 0;

  // Drawn straight onto the page (a portal), so no pop-up around it can hide the Close button.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${name} photos and details`} className="mr-fullview" onClick={onClose}>
      <div className="mr-fullview-panel" onClick={event => event.stopPropagation()}>
        <div className="mr-fullview-bar">
          <strong className="mr-fullview-title">{name}</strong>
          <button ref={closeRef} type="button" className="mr-fullview-close" onClick={onClose}>✕ {tr('Close')}</button>
        </div>

        <div
          className="mr-fullview-stage"
          style={{ overflow: 'hidden' }}
          onTouchStart={event => { touchStart.current = event.touches[0].clientX; }}
          onTouchEnd={event => {
            if (touchStart.current === null || items.length < 2 || zoomed) return;
            const delta = event.changedTouches[0].clientX - touchStart.current;
            touchStart.current = null;
            if (Math.abs(delta) > 60) go(delta < 0 ? 1 : -1);
          }}
        >
          {current.type === 'video'
            ? <video src={current.url} controls autoPlay playsInline style={{ maxWidth: '100%', maxHeight: '78dvh' }} />
            : <ZoomableImage key={current.url} src={current.url} alt={name} onZoom={setZoomed} />}
          {items.length > 1 && !zoomed && (
            <>
              <button type="button" className="mr-fullview-nav" style={{ left: '8px' }} aria-label={tr('Previous')} onClick={() => go(-1)}>‹</button>
              <button type="button" className="mr-fullview-nav" style={{ right: '8px' }} aria-label={tr('Next')} onClick={() => go(1)}>›</button>
            </>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', padding: '0.5rem 0.8rem' }}>
          {items.length > 1 && <span style={{ fontSize: '0.8rem', color: '#666' }}>{index + 1} / {items.length} · {tr('swipe or use the arrows')}</span>}
          {current.type !== 'video' && <span style={{ fontSize: '0.78rem', color: '#777' }}>{tr('Scroll or pinch to zoom, move the mouse to look around, double-tap to zoom.')}</span>}
        </div>

        {items.length > 1 && (
          <div className="mr-fullview-thumbs">
            {items.map((item, position) => (
              <button key={item.url} type="button" aria-current={position === index} aria-label={`${tr('Photo')} ${position + 1}`} onClick={() => { setZoomed(false); setIndex(position); }}>
                {item.type === 'video' ? <span style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', background: '#111a30', color: '#fff' }}>▶</span> : <img src={item.url} alt="" />}
              </button>
            ))}
          </div>
        )}

        {product && (
          <div className="mr-fullview-details">
            <h3 style={{ margin: '0.3rem 0', color: 'var(--mr-primary)', fontSize: '1.5rem' }}>{product.name}</h3>
            <div style={{ fontWeight: 700, color: 'var(--mr-primary)', fontSize: '1.2rem' }}>
              ₹{price}{product.offerPrice ? <s style={{ marginLeft: '0.5rem', fontWeight: 400, color: '#888', fontSize: '0.95rem' }}>₹{product.price}</s> : null}
            </div>
            <div style={{ color: '#555', fontSize: '0.88rem', margin: '0.3rem 0 0.6rem' }}>
              {[product.category, product.color, product.size].filter(Boolean).join(' · ')}{product.itemCode ? <> · <code>{product.itemCode}</code></> : null}
            </div>
            <p style={{ margin: 0, lineHeight: 1.55, color: '#333' }}>{product.description}</p>
          </div>
        )}

        <div className="mr-fullview-back">
          <button type="button" className="mr-btn" style={{ width: '100%' }} onClick={onClose}>{tr('Close and go back')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ProductGallery({ product, badges = [], onView, overlay, fit = 'cover' }: { product: Product; badges?: string[]; onView?: () => void; overlay?: React.ReactNode; fit?: 'cover' | 'contain' }) {
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
          <video src={selectedMedia.url} controls playsInline preload="metadata" onClick={event => event.stopPropagation()} style={fit === 'contain' ? { width: '100%', maxHeight: '72dvh', display: 'block', background: 'var(--mr-tint)' } : { width: '100%', aspectRatio: '4 / 5', objectFit: 'cover', display: 'block' }} />
        ) : (
          <img src={selectedMedia.url} alt={product.name} loading="lazy" style={fit === 'contain' ? { width: '100%', height: 'auto', maxHeight: '72dvh', objectFit: 'contain', display: 'block', background: 'var(--mr-tint)' } : { width: '100%', aspectRatio: '4 / 5', objectFit: 'cover', display: 'block', background: 'var(--mr-tint)' }} />
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
      {viewerOpen && <MediaLightbox items={media} startIndex={selectedIndex} name={product.name} product={product} onClose={() => setViewerOpen(false)} />}
    </div>
  );
}
