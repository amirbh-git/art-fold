"use client";

import type { WallSlotPayload } from "@/lib/art-sources/types";
import { slotCompositeKey } from "@/lib/art-sources/types";
import { SLOT_COUNT } from "@/lib/wall-layout";
import type { WallDensity } from "@/lib/wall-density";

export type GalleryWallVariant = "selection" | "theme" | "public";

export type { WallDensity } from "@/lib/wall-density";

const TOKENS: Record<
  WallDensity,
  {
    gapPx: number;
    borderClass: string;
    lockIconClass: string;
    maxWallNarrow: string;
    maxWallPublic: string;
  }
> = {
  normal: {
    gapPx: 7,
    borderClass: "rounded-[2px] border-2",
    lockIconClass: "h-3.5 w-3.5",
    maxWallNarrow: "max-w-[18.5rem]",
    maxWallPublic: "max-w-[21rem] sm:max-w-[27rem]",
  },
  compact: {
    gapPx: 6,
    borderClass: "rounded-[2px] border-2",
    lockIconClass: "h-3 w-3",
    maxWallNarrow: "max-w-[17.5rem]",
    maxWallPublic: "max-w-[20rem] sm:max-w-[26rem]",
  },
  ultraCompact: {
    gapPx: 5,
    borderClass: "rounded-[2px] border-2",
    lockIconClass: "h-2.5 w-2.5",
    maxWallNarrow: "max-w-[16.5rem]",
    maxWallPublic: "max-w-[19rem] sm:max-w-[24rem]",
  },
};

const LEFT_INDICES = [0, 2, 4];
const RIGHT_INDICES = [1, 3, 5];

type Props = {
  slots: WallSlotPayload[];
  locked?: boolean[];
  interactive?: boolean;
  showLockChrome?: boolean;
  onToggleLock?: (index: number) => void;
  variant?: GalleryWallVariant;
  loading?: boolean;
  density?: WallDensity;
  /** Public (non-interactive) wall: open detail when a tile is activated. */
  onTileClick?: (slot: WallSlotPayload) => void;
};

function LockIcon({ locked, className }: { locked: boolean; className: string }) {
  if (locked) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <path
          d="M7 10V7a5 5 0 0 1 10 0v3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <rect
          x="5" y="10" width="14" height="11" rx="2"
          fill="none" stroke="currentColor" strokeWidth="2"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M7 10V7a5 5 0 0 1 9.8-1.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect
        x="5" y="10" width="14" height="11" rx="2"
        fill="none" stroke="currentColor" strokeWidth="2"
      />
      <path
        d="M19 10l2 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Tile({
  slot,
  index,
  isLocked,
  interactive,
  showLockChrome,
  onToggleLock,
  onTileClick,
  t,
}: {
  slot: WallSlotPayload;
  index: number;
  isLocked: boolean;
  interactive: boolean;
  showLockChrome: boolean;
  onToggleLock?: (index: number) => void;
  onTileClick?: (slot: WallSlotPayload) => void;
  t: (typeof TOKENS)[WallDensity];
}) {
  const showRing = interactive && showLockChrome && isLocked;

  const frameClass = [
    "group relative overflow-hidden border-neutral-600/75 bg-[var(--canvas)] shadow-sm transition-colors",
    t.borderClass,
    showRing
      ? "ring-2 ring-neutral-900 ring-offset-1 ring-offset-[var(--canvas)]"
      : "",
    interactive && showLockChrome
      ? "hover:border-neutral-700/85"
      : "",
  ].join(" ");

  const lockBadge = interactive && showLockChrome && (
    <span
      className={`pointer-events-none absolute right-1 top-1 rounded bg-[var(--canvas)]/95 p-0.5 shadow-sm ${
        isLocked
          ? "text-neutral-900"
          : "text-neutral-500 opacity-70 group-hover:opacity-100"
      }`}
    >
      <LockIcon locked={isLocked} className={t.lockIconClass} />
    </span>
  );

  const image = slot.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- natural aspect for collage tiles
    <img
      src={slot.imageUrl}
      alt={interactive ? "" : slot.title}
      className="block w-full max-w-full align-bottom"
      loading="lazy"
      decoding="async"
    />
  ) : (
    <div className="flex h-16 items-center justify-center text-center text-[10px] text-neutral-400">
      No image
    </div>
  );

  if (interactive) {
    return (
      <div className={frameClass}>
        <button
          type="button"
          onClick={() => onToggleLock?.(index)}
          className="relative flex w-full flex-col touch-manipulation p-0 leading-none text-left"
          aria-pressed={isLocked}
          aria-label={
            isLocked
              ? `Locked: ${slot.title}. Click to unlock.`
              : `Unlocked: ${slot.title}. Click to lock.`
          }
        >
          {image}
          {lockBadge}
        </button>
      </div>
    );
  }

  if (onTileClick) {
    return (
      <div className={frameClass}>
        <button
          type="button"
          onClick={() => onTileClick(slot)}
          className="relative flex w-full flex-col p-0 leading-none touch-manipulation text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 focus-visible:ring-offset-1"
          aria-label={`View details: ${slot.title}`}
        >
          {image}
        </button>
      </div>
    );
  }

  return (
    <div className={frameClass}>
      {image}
    </div>
  );
}

export function GalleryWall({
  slots,
  locked,
  interactive = false,
  showLockChrome = true,
  onToggleLock,
  variant = "selection",
  loading = false,
  density = "normal",
  onTileClick,
}: Props) {
  const lockState = locked ?? Array(SLOT_COUNT).fill(false);
  const t = TOKENS[density];
  const wallMaxWidth =
    variant === "public" ? t.maxWallPublic : t.maxWallNarrow;

  const leftSlots = LEFT_INDICES.map((i) => ({ slot: slots[i]!, index: i }));
  const rightSlots = RIGHT_INDICES.map((i) => ({ slot: slots[i]!, index: i }));

  const columnStyle = { gap: t.gapPx };

  return (
    <div className="relative w-full">
      <div
        className={`mx-auto flex w-full ${wallMaxWidth} items-center`}
        style={{ gap: t.gapPx }}
      >
        <div className="flex flex-1 flex-col" style={columnStyle}>
          {leftSlots.map(({ slot, index }) => (
            <Tile
              key={slotCompositeKey(slot)}
              slot={slot}
              index={index}
              isLocked={!!lockState[index]}
              interactive={interactive}
              showLockChrome={showLockChrome}
              onToggleLock={onToggleLock}
              onTileClick={onTileClick}
              t={t}
            />
          ))}
        </div>
        <div className="flex flex-1 flex-col" style={columnStyle}>
          {rightSlots.map(({ slot, index }) => (
            <Tile
              key={slotCompositeKey(slot)}
              slot={slot}
              index={index}
              isLocked={!!lockState[index]}
              interactive={interactive}
              showLockChrome={showLockChrome}
              onToggleLock={onToggleLock}
              onTileClick={onTileClick}
              t={t}
            />
          ))}
        </div>
      </div>
      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-[var(--canvas)]/55">
          <div className="flex items-center gap-2 rounded-full border border-neutral-500/40 bg-[var(--canvas)] px-3 py-1 text-xs text-neutral-700 shadow-sm">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-500/30 border-t-neutral-700" />
            Refreshing art...
          </div>
        </div>
      )}
    </div>
  );
}
