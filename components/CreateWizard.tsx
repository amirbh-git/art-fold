"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WallSlotPayload } from "@/lib/art-sources/types";
import { slotCompositeKey } from "@/lib/art-sources/types";
import { ART_FILTERS_ENABLED } from "@/lib/feature-flags";
import {
  DEFAULT_MET_CARD_FILTERS,
  type MetCardFilters,
  appendMetCardFilterParams,
} from "@/lib/met-filters";
import { SLOT_COUNT } from "@/lib/wall-layout";
import { GalleryWall } from "./GalleryWall";
import { MetAttribution } from "./MetAttribution";
import { ArtCard } from "./ArtCard";
import { ExhibitTray } from "./ExhibitTray";
import { ArtDetailModal } from "./ArtDetailModal";
import { MatchFiltersModal } from "./MatchFiltersModal";

type Step = "swipe" | "theme" | "done";

const THEME_MAX = 280;
const NAME_MAX = 120;
const BUFFER_LOW = 3;
const FETCH_BATCH = 6;
const BUFFER_CAP = 12;

function origin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

type FetchCardsResult = {
  cards: WallSlotPayload[];
  /** Set when the response is not usable JSON or the route failed (e.g. wrong dev port → HTML 404). */
  error?: string;
};

async function fetchCards(
  count: number,
  excludeIds: Iterable<string>,
  filters: MetCardFilters,
): Promise<FetchCardsResult> {
  const effectiveFilters = ART_FILTERS_ENABLED
    ? filters
    : DEFAULT_MET_CARD_FILTERS;
  try {
    const params = new URLSearchParams();
    params.set("count", String(count));
    params.set("exclude", [...excludeIds].join(","));
    appendMetCardFilterParams(params, effectiveFilters);
    const res = await fetch(`/api/exhibits/cards?${params.toString()}`, {
      cache: "no-store",
    });
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      return {
        cards: [],
        error: `Expected JSON from /api/exhibits/cards but got ${res.status} (${ct || "unknown type"}). If Next switched ports (e.g. 3001), open that URL in the browser.`,
      };
    }
    const data = (await res.json()) as {
      cards?: WallSlotPayload[];
      error?: string;
    };
    if (!res.ok) {
      return {
        cards: [],
        error: data.error ?? `Request failed (${res.status})`,
      };
    }
    return { cards: data.cards ?? [] };
  } catch (e) {
    return {
      cards: [],
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

type PublishedMeta = {
  id: string;
  exhibitTitle: string;
  theme: string;
  curatorName: string;
};

export function CreateWizard() {
  const [step, setStep] = useState<Step>("swipe");
  const [buffer, setBuffer] = useState<WallSlotPayload[]>([]);
  const [currentCard, setCurrentCard] = useState<WallSlotPayload | null>(null);
  const [curated, setCurated] = useState<WallSlotPayload[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [detailCard, setDetailCard] = useState<WallSlotPayload | null>(null);
  const [loadingCards, setLoadingCards] = useState(true);
  const [exhibitTitleInput, setExhibitTitleInput] = useState("");
  const [themeDescription, setThemeDescription] = useState("");
  const [curatorNameInput, setCuratorNameInput] = useState("");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [published, setPublished] = useState<PublishedMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<MetCardFilters>(
    DEFAULT_MET_CARD_FILTERS,
  );
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [cardsFetchError, setCardsFetchError] = useState<string | null>(null);

  const fetchingRef = useRef(false);
  const seenRef = useRef(seenIds);
  seenRef.current = seenIds;

  const bufferRef = useRef(buffer);
  bufferRef.current = buffer;

  const filtersRef = useRef(appliedFilters);
  filtersRef.current = appliedFilters;

  const curatedRef = useRef(curated);
  curatedRef.current = curated;

  const refillBuffer = useCallback(async () => {
    if (fetchingRef.current) return;
    if (bufferRef.current.length >= BUFFER_CAP) return;
    fetchingRef.current = true;
    try {
      const { cards, error } = await fetchCards(
        FETCH_BATCH,
        seenRef.current,
        filtersRef.current,
      );
      if (error) setCardsFetchError(error);
      else if (cards.length > 0) setCardsFetchError(null);
      if (cards.length > 0) {
        setSeenIds((prev) => {
          const next = new Set(prev);
          cards.forEach((c) => next.add(slotCompositeKey(c)));
          return next;
        });
        setBuffer((prev) => [...prev, ...cards].slice(0, BUFFER_CAP));
      }
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  /** Full reload of the swipe deck (used when empty or after a failed fetch). */
  const retryLoadCards = useCallback(async () => {
    setLoadingCards(true);
    setCardsFetchError(null);
    const exclude = new Set(
      curatedRef.current.map((c) => slotCompositeKey(c)),
    );
    try {
      const { cards, error } = await fetchCards(
        FETCH_BATCH,
        exclude,
        filtersRef.current,
      );
      if (error) setCardsFetchError(error);
      if (cards.length > 0) {
        const [first, ...rest] = cards;
        setCurrentCard(first!);
        setBuffer(rest);
        setSeenIds((prev) => {
          const n = new Set(prev);
          cards.forEach((c) => n.add(slotCompositeKey(c)));
          return n;
        });
        if (!error) setCardsFetchError(null);
      } else if (error) {
        setCardsFetchError(error);
      }
    } finally {
      setLoadingCards(false);
    }
  }, []);

  const reloadCardsAfterFilterChange = useCallback(
    async (next: MetCardFilters) => {
      setLoadingCards(true);
      setAppliedFilters(next);
      const exclude = new Set(
        curatedRef.current.map((c) => slotCompositeKey(c)),
      );
      setSeenIds(exclude);
      setBuffer([]);
      setCurrentCard(null);
      try {
        const { cards, error } = await fetchCards(FETCH_BATCH, exclude, next);
        if (error) setCardsFetchError(error);
        else setCardsFetchError(null);
        if (cards.length > 0) {
          const [first, ...rest] = cards;
          setCurrentCard(first!);
          setBuffer(rest);
          setSeenIds((prev) => {
            const n = new Set(prev);
            cards.forEach((c) => n.add(slotCompositeKey(c)));
            return n;
          });
        }
      } catch {
        setCurrentCard(null);
        setBuffer([]);
        setCardsFetchError("Could not reload cards.");
      } finally {
        setLoadingCards(false);
      }
    },
    [],
  );

  // Initial load (try/finally: Strict Mode can cancel the first run; errors must clear loading)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCards(true);
      setCardsFetchError(null);
      try {
        const { cards, error } = await fetchCards(
          FETCH_BATCH,
          new Set(),
          DEFAULT_MET_CARD_FILTERS,
        );
        if (cancelled) return;
        if (error) setCardsFetchError(error);
        if (cards.length > 0) {
          const [first, ...rest] = cards;
          setCurrentCard(first!);
          setBuffer(rest);
          setSeenIds(new Set(cards.map((c) => slotCompositeKey(c))));
          setCardsFetchError(null);
        } else if (error) {
          setCardsFetchError(error);
        }
      } catch {
        if (!cancelled) {
          setCurrentCard(null);
          setBuffer([]);
        }
      } finally {
        if (!cancelled) setLoadingCards(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const advanceCard = useCallback(() => {
    setBuffer((prev) => {
      const [next, ...rest] = prev;
      setCurrentCard(next ?? null);
      if (rest.length < BUFFER_LOW) {
        void refillBuffer();
      }
      return rest;
    });
  }, [refillBuffer]);

  const handlePass = useCallback(() => {
    advanceCard();
  }, [advanceCard]);

  const handleCurate = useCallback(() => {
    if (!currentCard) return;
    setCurated((prev) => {
      if (prev.length >= SLOT_COUNT) return prev;
      return [...prev, currentCard];
    });
    advanceCard();
  }, [currentCard, advanceCard]);

  const handleRemoveFromTray = useCallback((index: number) => {
    setCurated((prev) => {
      const next = [...prev];
      const removed = next.splice(index, 1)[0];
      if (removed) {
        setSeenIds((s) => {
          const ns = new Set(s);
          ns.add(slotCompositeKey(removed));
          return ns;
        });
      }
      return next;
    });
  }, []);

  const isFull = curated.length >= SLOT_COUNT;

  const handleFinalize = useCallback(() => {
    if (curated.length < SLOT_COUNT) return;
    setStep("theme");
    setPublishError(null);
  }, [curated]);

  const publish = useCallback(async () => {
    if (curated.length !== SLOT_COUNT) return;

    setBusy(true);
    setPublishError(null);
    try {
      const res = await fetch("/api/exhibits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exhibitTitle: exhibitTitleInput,
          theme: themeDescription,
          curatorName: curatorNameInput,
          slots: curated,
        }),
      });
      const data = (await res.json()) as {
        id?: string;
        exhibitTitle?: string;
        theme?: string;
        curatorName?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      if (
        !data.id ||
        data.exhibitTitle === undefined ||
        data.theme === undefined ||
        data.curatorName === undefined
      ) {
        throw new Error("Invalid save response");
      }
      setPublished({
        id: data.id,
        exhibitTitle: data.exhibitTitle,
        theme: data.theme,
        curatorName: data.curatorName,
      });
      setStep("done");
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }, [curated, exhibitTitleInput, themeDescription, curatorNameInput]);

  const shareUrl = published ? `${origin()}/e/${published.id}` : "";

  return (
    <main className="min-h-dvh-safe overflow-auto bg-[var(--canvas)] px-4 pb-safe pt-6">
      <div className="mx-auto flex max-w-sm flex-col">
        <header className="mb-4 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            Art Match
          </h1>
        </header>

        {/* ─── SWIPE STEP ─── */}
        {step === "swipe" && (
          <section className="flex flex-col gap-4">
            {cardsFetchError && (
              <div className="rounded-lg border border-amber-400/70 bg-amber-50 px-3 py-2 text-left text-xs text-amber-950">
                <p className="font-medium">Could not load artworks</p>
                <p className="mt-1 text-amber-900/90">{cardsFetchError}</p>
                <button
                  type="button"
                  className="mt-2 font-semibold text-amber-950 underline"
                  onClick={() => void retryLoadCards()}
                >
                  Retry
                </button>
              </div>
            )}
            <div className="relative min-h-[280px]">
              {loadingCards && !currentCard && (
                <div className="flex h-[280px] items-center justify-center">
                  <div className="flex items-center gap-2 text-sm text-neutral-500">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-400/40 border-t-neutral-600" />
                    Loading artworks...
                  </div>
                </div>
              )}

              {!loadingCards && !currentCard && !isFull && (
                <div className="flex h-[280px] flex-col items-center justify-center gap-2 px-2 text-center">
                  <p className="text-sm text-neutral-500">
                    {cardsFetchError
                      ? "Fix the issue above, or retry."
                      : "No more artworks available right now."}
                  </p>
                  <button
                    type="button"
                    className="text-sm font-medium text-neutral-900 underline"
                    onClick={() => void retryLoadCards()}
                  >
                    Try again
                  </button>
                </div>
              )}

              {currentCard && !isFull && (
                <ArtCard
                  key={`${currentCard.source}:${currentCard.objectId}`}
                  card={currentCard}
                  onPass={handlePass}
                  onCurate={handleCurate}
                  onTapImage={() => setDetailCard(currentCard)}
                />
              )}

              {isFull && !currentCard && null}
              {isFull && currentCard && (
                <ArtCard
                  key={`${currentCard.source}:${currentCard.objectId}`}
                  card={currentCard}
                  onPass={handlePass}
                  onCurate={handleCurate}
                  onTapImage={() => setDetailCard(currentCard)}
                />
              )}
            </div>

            {currentCard && !isFull && (
              <div
                className={`flex items-center justify-center ${ART_FILTERS_ENABLED ? "gap-3" : "gap-4"}`}
              >
                <button
                  type="button"
                  onClick={handlePass}
                  className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-neutral-400/70 bg-white text-2xl font-bold text-neutral-500 shadow-sm transition-colors hover:border-red-400 hover:text-red-500"
                  aria-label="Pass"
                >
                  ✕
                </button>
                {ART_FILTERS_ENABLED && (
                  <button
                    type="button"
                    onClick={() => setFilterModalOpen(true)}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-400/80 bg-white text-lg text-neutral-600 shadow-sm transition-colors hover:border-neutral-600 hover:text-neutral-900"
                    aria-label="Filters"
                    title="Filters"
                  >
                    <span aria-hidden className="inline-block translate-y-px">
                      ⚙
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCurate}
                  className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-neutral-400/70 bg-white text-2xl font-bold text-green-600 shadow-sm transition-colors hover:border-green-500 hover:text-green-700"
                  aria-label="Curate"
                >
                  ✓
                </button>
              </div>
            )}

            {isFull && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleFinalize}
                  className="rounded-lg bg-neutral-900 px-8 py-3 text-lg font-semibold text-white shadow-sm hover:bg-neutral-800"
                >
                  Finalize exhibit
                </button>
              </div>
            )}

            <ExhibitTray curated={curated} onRemove={handleRemoveFromTray} />

            <div className="mt-1">
              <MetAttribution />
            </div>
          </section>
        )}

        {/* ─── THEME STEP ─── */}
        {step === "theme" && (
          <section className="flex flex-col gap-4">
            <GalleryWall
              slots={curated}
              interactive={false}
              showLockChrome={false}
              variant="theme"
            />
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="exhibit-name"
                  className="block text-left text-xs font-medium text-neutral-600"
                >
                  Name of exhibit
                </label>
                <input
                  id="exhibit-name"
                  type="text"
                  maxLength={NAME_MAX}
                  value={exhibitTitleInput}
                  onChange={(e) => setExhibitTitleInput(e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-lg border border-neutral-400/50 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-0 placeholder:text-neutral-400 focus:border-neutral-500"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="theme-desc"
                  className="block text-left text-xs font-medium text-neutral-600"
                >
                  Description
                </label>
                <p className="text-sm text-neutral-500">
                  Describe the theme of your exhibit.
                </p>
                <div className="rounded-lg border border-neutral-400/50 bg-white p-3 shadow-sm">
                  <textarea
                    id="theme-desc"
                    rows={3}
                    maxLength={THEME_MAX}
                    value={themeDescription}
                    onChange={(e) => setThemeDescription(e.target.value)}
                    placeholder="Optional"
                    className="w-full resize-none border-0 bg-transparent text-sm outline-none ring-0 placeholder:text-neutral-400"
                  />
                  <div className="mt-1 text-right text-xs text-neutral-400">
                    {themeDescription.length}/{THEME_MAX}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="curator-name"
                  className="block text-left text-xs font-medium text-neutral-600"
                >
                  Your name
                </label>
                <input
                  id="curator-name"
                  type="text"
                  maxLength={NAME_MAX}
                  value={curatorNameInput}
                  onChange={(e) => setCuratorNameInput(e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-lg border border-neutral-400/50 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-0 placeholder:text-neutral-400 focus:border-neutral-500"
                />
              </div>

              {publishError && (
                <p className="text-center text-sm text-red-700">
                  {publishError}
                </p>
              )}
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setStep("swipe")}
                  className="rounded-lg border border-neutral-400/70 bg-white px-5 py-2.5 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void publish()}
                  className="rounded-lg bg-neutral-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 disabled:opacity-50"
                >
                  Publish
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ─── DONE STEP ─── */}
        {step === "done" && published && (
          <section className="mx-auto max-w-lg space-y-6">
            <h2 className="text-center text-xl font-semibold">
              Your exhibit is live
            </h2>

            <GalleryWall
              slots={curated}
              interactive={false}
              showLockChrome={false}
              variant="theme"
            />

            <div className="space-y-1 text-center">
              <p className="text-lg font-semibold text-neutral-900">
                {published.exhibitTitle}
              </p>
              {published.theme.trim() ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
                  {published.theme}
                </p>
              ) : null}
              <p className="text-sm text-neutral-600">
                by {published.curatorName}
              </p>
            </div>

            <p className="text-center text-sm text-neutral-600">Share this link:</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-center">
              <code className="break-all rounded-lg border border-neutral-300/80 bg-white px-3 py-2 text-left text-xs shadow-sm">
                {shareUrl}
              </code>
              <button
                type="button"
                className="rounded-lg border border-neutral-400/70 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
                onClick={() => void navigator.clipboard.writeText(shareUrl)}
              >
                Copy link
              </button>
            </div>
            <div className="text-center">
              <a
                href={shareUrl}
                className="inline-block text-sm font-medium text-neutral-900 underline underline-offset-2"
              >
                View exhibit
              </a>
            </div>
            <p className="text-center text-xs text-neutral-500">
              To curate a new exhibit,{" "}
              <Link
                href="/"
                className="font-medium text-neutral-900 underline underline-offset-2"
              >
                go here
              </Link>
            </p>
          </section>
        )}
      </div>

      {detailCard && (
        <ArtDetailModal
          card={detailCard}
          onClose={() => setDetailCard(null)}
        />
      )}

      {ART_FILTERS_ENABLED && (
        <MatchFiltersModal
          open={filterModalOpen}
          onClose={() => setFilterModalOpen(false)}
          applied={appliedFilters}
          onApply={(next) => void reloadCardsAfterFilterChange(next)}
        />
      )}
    </main>
  );
}
