// =============================================================================
// ★★ 프로필 사진 편집기 (R039 / D-184)
//
// ★ 건우: "사진을 첨부하면 원 모양(인스타그램처럼)으로 늘리고 줄이고 잘라서 쓰게. 미리보기 가이드라인도 보여서 직접 확인하고 등록."
// ★ 동작: 사진 고르기 → 원형 틀 안에서 끌어서 위치 · 확대/축소(슬라이더 · 휠 · 두 손가락) → 작은 미리보기 두 개(실제 크기) → 등록
// ★ 브라우저에서 256×256 으로 줄여(webp) 올린다. 원본은 올리지 않는다. 너무 큰 파일(20MB 초과)은 막는다.
// =============================================================================

import { useEffect, useRef, useState } from 'react';

const STAGE = 260;
const OUT = 256;
const MAX_FILE = 20 * 1024 * 1024;

interface Props {
  file: File;
  onCancel: () => void;
  /** 잘라 낸 결과 (서버로 보낼 이미지) */
  onDone: (blob: Blob) => Promise<void>;
}

export default function ProfileEditor({ file, onCancel, onDone }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const prev64 = useRef<HTMLCanvasElement>(null);
  const prev32 = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);

  // ── 사진 읽기
  useEffect(() => {
    if (file.size > MAX_FILE) {
      setError('사진이 너무 큽니다 (20MB 이하).');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => setImg(im);
    im.onerror = () => setError('이 사진은 열 수 없습니다 (jpg · png · webp 를 써 주세요).');
    im.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const base = img ? Math.max(STAGE / img.naturalWidth, STAGE / img.naturalHeight) : 1;
  const W = img ? img.naturalWidth * base * zoom : STAGE;
  const H = img ? img.naturalHeight * base * zoom : STAGE;
  /** 틀(원)을 벗어나 빈 곳이 보이지 않게 위치를 묶는다 */
  const clamp = (o: { x: number; y: number }, w = W, h = H) => ({
    x: Math.max(-(w - STAGE) / 2, Math.min((w - STAGE) / 2, o.x)),
    y: Math.max(-(h - STAGE) / 2, Math.min((h - STAGE) / 2, o.y)),
  });
  const left = STAGE / 2 - W / 2 + off.x;
  const top = STAGE / 2 - H / 2 + off.y;

  const draw = (canvas: HTMLCanvasElement | null, size: number) => {
    if (!canvas || !img) return;
    canvas.width = size;
    canvas.height = size;
    const c = canvas.getContext('2d');
    if (!c) return;
    const s = base * zoom;
    c.imageSmoothingQuality = 'high';
    c.clearRect(0, 0, size, size);
    c.drawImage(img, -left / s, -top / s, STAGE / s, STAGE / s, 0, 0, size, size);
  };
  useEffect(() => {
    draw(prev64.current, 64);
    draw(prev32.current, 32);
  });

  const setZoomKeep = (z: number) => {
    const nz = Math.max(1, Math.min(4, z));
    const w = img ? img.naturalWidth * base * nz : STAGE;
    const h = img ? img.naturalHeight * base * nz : STAGE;
    setZoom(nz);
    setOff((o) => clamp({ x: (o.x * nz) / zoom, y: (o.y * nz) / zoom }, w, h));
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), z: zoom };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      setZoomKeep((pinch.current.z * d) / pinch.current.d);
      return;
    }
    setOff((o) => clamp({ x: o.x + dx, y: o.y + dy }));
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const save = async () => {
    if (!img) return;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      draw(canvas, OUT);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.86));
      if (!blob) throw new Error('사진을 만들지 못했습니다.');
      await onDone(blob);
    } catch (err) {
      setError((err as Error).message || '올리지 못했습니다.');
      setBusy(false);
    }
  };

  return (
    <div className="modal-back" role="dialog" aria-label="프로필 사진">
      <div className="modal profile-editor">
        <p className="modal-title">프로필 사진</p>
        {error ? (
          <p className="form-error">{error}</p>
        ) : (
          <>
            <div
              className="crop-stage"
              style={{ width: STAGE, height: STAGE }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onWheel={(e) => setZoomKeep(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
            >
              {img && (
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  style={{ width: W, height: H, transform: `translate(${left}px, ${top}px)` }}
                />
              )}
              {/* ★ 원형 가이드 — 원 밖은 어둡게. 원 안이 그대로 프사가 된다 */}
              <div className="crop-mask" aria-hidden="true" />
            </div>
            <input
              type="range"
              className="crop-zoom"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              aria-label="확대"
              onChange={(e) => setZoomKeep(Number(e.target.value))}
            />
            <div className="crop-preview" aria-label="미리보기">
              <canvas ref={prev64} className="pv64" />
              <canvas ref={prev32} className="pv32" />
              <span className="dim">끌어서 위치 · 휠/두 손가락으로 크기</span>
            </div>
          </>
        )}
        <div className="field-row" data-arrow-nav>
          <button type="button" className="primary" disabled={!img || busy || Boolean(error)} onClick={() => void save()}>
            {busy ? '올리는 중…' : '등록'}
          </button>
          <button type="button" className="ghost" onClick={onCancel}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
