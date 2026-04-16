"use client";

import { useCallback, useRef, useState } from "react";
import type { WallSlotPayload } from "@/lib/art-sources/types";

type Direction = "left" | "right";

type Props = {
  card: WallSlotPayload;
  onPass: () => void;
  onCurate: () => void;
  onTapImage: () => void;
};

const SWIPE_THRESHOLD = 80;
const FLY_DURATION = 300;

export function ArtCard({ card, onPass, onCurate, onTapImage }: Props) {
  const [offset, setOffset] = useState(0);
  const [flying, setFlying] = useState<Direction | null>(null);
  const startX = useRef<number | null>(null);
  const dragging = useRef(false);

  const flyOut = useCallback(
    (dir: Direction) => {
      setFlying(dir);
      setTimeout(() => {
        if (dir === "left") onPass();
        else onCurate();
      }, FLY_DURATION);
    },
    [onPass, onCurate],
  );

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    startX.current = e.clientX;
    dragging.current = false;
    setOffset(0);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (startX.current == null) return;
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > 4) dragging.current = true;
    setOffset(dx);
  }, []);

  const handlePointerUp = useCallback(() => {
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
    <div className="flex flex-col items-center">
      <div
        className="w-full max-w-sm cursor-grab touch-pan-y select-none overflow-hidden rounded-xl border border-neutral-300/80 bg-white shadow-lg active:cursor-grabbing"
        style={{
          transform,
          opacity,
          transition: flying || offset === 0 ? `transform ${FLY_DURATION}ms ease, opacity ${FLY_DURATION}ms ease` : "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- natural aspect */}
        <img
          src={card.imageUrl}
          alt=""
          className="block w-full"
          draggable={false}
          onClick={handleImageClick}
          loading="eager"
          decoding="async"
        />
        <div className="px-4 py-3">
          <p className="text-base font-medium leading-snug text-neutral-900">
            {card.title}
          </p>
        </div>
      </div>
    </div>
  );
}
