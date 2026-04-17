"use client";

import { useEffect, useState } from "react";
import type { MetCardFilters } from "@/lib/met-filters";
import {
  DEPARTMENT_OPTIONS,
  ERA_OPTIONS,
  MEDIUM_OPTIONS,
  REGION_OPTIONS,
  isAllDepartmentsSelected,
  isAllErasSelected,
  isAllMediumsSelected,
  isAllRegionsSelected,
} from "@/lib/met-filters";

type Expanded = {
  departmentIds: number[];
  eraIds: string[];
  mediumIds: string[];
  regionIds: string[];
};

function expandFromApplied(f: MetCardFilters): Expanded {
  return {
    departmentIds:
      f.departmentIds.length === 0 || isAllDepartmentsSelected(f.departmentIds)
        ? DEPARTMENT_OPTIONS.map((d) => d.departmentId)
        : [...f.departmentIds],
    eraIds:
      f.eraIds.length === 0 || isAllErasSelected(f.eraIds)
        ? ERA_OPTIONS.map((e) => e.id)
        : [...f.eraIds],
    mediumIds:
      f.mediumIds.length === 0 || isAllMediumsSelected(f.mediumIds)
        ? MEDIUM_OPTIONS.map((m) => m.id)
        : [...f.mediumIds],
    regionIds:
      f.regionIds.length === 0 || isAllRegionsSelected(f.regionIds)
        ? REGION_OPTIONS.map((r) => r.id)
        : [...f.regionIds],
  };
}

function collapseToApplied(e: Expanded): MetCardFilters {
  return {
    departmentIds: isAllDepartmentsSelected(e.departmentIds)
      ? []
      : e.departmentIds,
    eraIds: isAllErasSelected(e.eraIds) ? [] : e.eraIds,
    mediumIds: isAllMediumsSelected(e.mediumIds) ? [] : e.mediumIds,
    regionIds: isAllRegionsSelected(e.regionIds) ? [] : e.regionIds,
  };
}

type Props = {
  open: boolean;
  onClose: () => void;
  applied: MetCardFilters;
  onApply: (next: MetCardFilters) => void;
};

function ChipToggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-neutral-800 bg-neutral-900 text-white"
          : "border-neutral-300 bg-white text-neutral-600 hover:border-neutral-400"
      }`}
    >
      {label}
    </button>
  );
}

export function MatchFiltersModal({ open, onClose, applied, onApply }: Props) {
  const [draft, setDraft] = useState<Expanded>(() => expandFromApplied(applied));

  useEffect(() => {
    if (open) setDraft(expandFromApplied(applied));
  }, [open, applied]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function toggle<T>(arr: T[], id: T, minOne: boolean): T[] {
    const has = arr.includes(id);
    if (has) {
      if (minOne && arr.length <= 1) return arr;
      return arr.filter((x) => x !== id);
    }
    return [...arr, id];
  }

  const handleApply = () => {
    onApply(collapseToApplied(draft));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-2xl bg-[var(--canvas)] shadow-2xl sm:rounded-2xl"
        role="dialog"
        aria-label="Art filters"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200/80 px-4 py-3">
          <h2 className="text-base font-semibold text-neutral-900">Filters</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-lg leading-none text-neutral-500 hover:bg-neutral-200/60"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p className="mb-4 text-xs text-neutral-500">
            Turn options off to narrow what you see. All on = the full mix (same
            as when you started). Culture/region uses artist nationality and
            artwork data (not only search-index geography).
          </p>

          <section className="mb-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Department
            </h3>
            <div className="flex flex-wrap gap-2">
              {DEPARTMENT_OPTIONS.map((d) => (
                <ChipToggle
                  key={d.id}
                  label={d.label}
                  active={draft.departmentIds.includes(d.departmentId)}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      departmentIds: toggle(
                        prev.departmentIds,
                        d.departmentId,
                        true,
                      ),
                    }))
                  }
                />
              ))}
            </div>
          </section>

          <section className="mb-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Era
            </h3>
            <div className="flex flex-wrap gap-2">
              {ERA_OPTIONS.map((e) => (
                <ChipToggle
                  key={e.id}
                  label={e.label}
                  active={draft.eraIds.includes(e.id)}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      eraIds: toggle(prev.eraIds, e.id, true),
                    }))
                  }
                />
              ))}
            </div>
          </section>

          <section className="mb-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Medium
            </h3>
            <div className="flex flex-wrap gap-2">
              {MEDIUM_OPTIONS.map((m) => (
                <ChipToggle
                  key={m.id}
                  label={m.label}
                  active={draft.mediumIds.includes(m.id)}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      mediumIds: toggle(prev.mediumIds, m.id, true),
                    }))
                  }
                />
              ))}
            </div>
          </section>

          <section className="mb-2">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Culture / region
            </h3>
            <div className="flex flex-wrap gap-2">
              {REGION_OPTIONS.map((r) => (
                <ChipToggle
                  key={r.id}
                  label={r.label}
                  active={draft.regionIds.includes(r.id)}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      regionIds: toggle(prev.regionIds, r.id, true),
                    }))
                  }
                />
              ))}
            </div>
          </section>
        </div>

        <div className="flex gap-2 border-t border-neutral-200/80 px-4 py-3 pb-safe">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-neutral-300 bg-white py-2.5 text-sm font-medium text-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex-1 rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white"
          >
            Apply filters
          </button>
        </div>
      </div>
    </div>
  );
}
