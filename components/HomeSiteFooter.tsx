"use client";

import { useCallback, useState } from "react";
import { FaqContent } from "@/components/info-content/FaqContent";
import { InfoModal } from "@/components/InfoModal";

type Panel = "about" | "sources" | "faq";

type Props = {
  aboutModal: React.ReactNode;
  museumModal: React.ReactNode;
};

export function HomeSiteFooter({ aboutModal, museumModal }: Props) {
  const [open, setOpen] = useState<Panel | null>(null);

  const goSourcesFromFaq = useCallback(() => {
    setOpen("sources");
  }, []);

  return (
    <>
      <footer className="mx-auto mt-[1.215rem] max-w-sm space-y-3 pb-4 text-center">
        <nav aria-label="Site pages">
          <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-neutral-600">
            <li>
              <button
                type="button"
                className="underline decoration-neutral-400 underline-offset-2 hover:text-neutral-900"
                onClick={() => setOpen("about")}
              >
                About
              </button>
            </li>
            <li>
              <button
                type="button"
                className="underline decoration-neutral-400 underline-offset-2 hover:text-neutral-900"
                onClick={() => setOpen("sources")}
              >
                Museum sources
              </button>
            </li>
            <li>
              <button
                type="button"
                className="underline decoration-neutral-400 underline-offset-2 hover:text-neutral-900"
                onClick={() => setOpen("faq")}
              >
                FAQ
              </button>
            </li>
          </ul>
        </nav>
        <p className="text-[11px] text-neutral-500">
          Designed by{" "}
          <a
            href="https://www.amirbh.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-neutral-600 underline decoration-neutral-400 underline-offset-2 hover:text-neutral-900"
          >
            Amir Ben-Harosh
          </a>
        </p>
      </footer>

      <InfoModal
        open={open === "about"}
        onClose={() => setOpen(null)}
        title="About"
        fullPageHref="/about"
      >
        {aboutModal}
      </InfoModal>

      <InfoModal
        open={open === "sources"}
        onClose={() => setOpen(null)}
        title="Museum sources"
        fullPageHref="/museum-sources"
      >
        {museumModal}
      </InfoModal>

      <InfoModal
        open={open === "faq"}
        onClose={() => setOpen(null)}
        title="FAQ"
        fullPageHref="/faq"
      >
        <FaqContent variant="modal" onMuseumSourcesClick={goSourcesFromFaq} />
      </InfoModal>
    </>
  );
}
