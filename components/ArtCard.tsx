"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { WallSlotPayload } from "@/lib/art-sources/types";
import type { ArtCardHandle } from "./art-card-handle";

type Direction = "left" | "right";

export type { ArtCardHandle } from "./art-card-handle";

type Props = {
  card: WallSlotPayload;
  onPass: () => void;
  onCurate: () => void;
  onTapImage: () => void;
};

const SWIPE_THRESHOLD = 80;
export const ART_CARD_FLY_MS = 320;

/** Image viewport + title band; sync CreateWizard loading / empty placeholders. */
export const ART_CARD_TOTAL_HEIGHT_CLASS = "h-[404px]";

export const ArtCard = forwardRef<ArtCardHandle, Props>(function ArtCard(
  { card, onPass, onCurate, onTapImage },
  ref,
) {
  const [offset, setOffset] = useState(0);
  const [flying, setFlying] = useState<Direction | null>(null);
  const startX = useRef<number | null>(null);
  const dragging = useRef(false);
  const flyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (flyTimerRef.current != null) {
        clearTimeout(flyTimerRef.current);
        flyTimerRef.current = null;
      }
    };
  }, []);

  const flyOut = useCallback(
    (dir: Direction) => {
      if (committedRef.current) return;
      committedRef.current = true;
      setFlying(dir);
      if (flyTimerRef.current != null) clearTimeout(flyTimerRef.current);
      flyTimerRef.current = setTimeout(() => {
        flyTimerRef.current = null;
        if (!mountedRef.current) return;
        if (dir === "left") onPass();
        else onCurate();
      }, ART_CARD_FLY_MS);
    },
    [onPass, onCurate],
  );

  useImperativeHandle(
    ref,
    () => ({
      playPass: () => flyOut("left"),
      playCurate: () => flyOut("right"),
    }),
    [flyOut],
  );

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (committedRef.current) return;
    startX.current = e.clientX;
    dragging.current = false;
    setOffset(0);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (committedRef.current) return;
    if (startX.current == null) return;
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > 4) dragging.current = true;
    setOffset(dx);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (committedRef.current) return;
    if (startX.current == null) return;
    startX.current = null;
    if (offset > SWIPE_THRESHOLD) {
      flyOut("right");
    } else if (offset < -SWIPE_THRESHOLD) {
      flyOut("left");
    } else {
      setOffset(0);
    }
  }, [offset, flyOut]);

  const handleImageClick = useCallback(() => {
    if (!dragging.current) onTapImage();
  }, [onTapImage]);

  const rotation = Math.min(Math.max(offset / 20, -15), 15);
  const opacity = flying ? 0 : 1;

  const transform = flying
    ? `translateX(${flying === "left" ? "-120%" : "120%"}) rotate(${flying === "left" ? -20 : 20}deg)`
    : `translateX(${offset}px) rotate(${rotation}deg)`;

  return (
    <div className="animate-art-card-enter flex w-full flex-col items-center">
      <div
        className={`flex w-full max-w-sm cursor-grab touch-pan-y select-none flex-col overflow-hidden rounded-xl border border-neutral-300/80 bg-white shadow-lg active:cursor-grabbing ${ART_CARD_TOTAL_HEIGHT_CLASS}`}
        style={{
          transform,
          opacity,
          transition:
            flying || offset === 0
              ? `transform ${ART_CARD_FLY_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity ${ART_CARD_FLY_MS}ms ease`
              : "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div className="flex h-[319px] w-full shrink-0 items-center justify-center bg-neutral-100/50">
          {/* eslint-disable-next-line @next/next/no-img-element -- letterboxed in fixed frame */}
          <img
            src={card.imageUrl}
            alt=""
            className="max-h-full max-w-full object-contain"
            draggable={false}
            onClick={handleImageClick}
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-center py-2">
          <div
            className="shrink-0 border-t border-neutral-300/80"
            aria-hidden
          />
          <div className="px-4 pt-2">
            <p className="truncate text-left text-base font-medium leading-snug text-neutral-900">
              {card.title}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});

ArtCard.displayName = "ArtCard";
