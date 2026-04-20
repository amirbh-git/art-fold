import Link from "next/link";
import { INFO_ARTICLE_CLASS } from "@/components/info-content/prose";
import { SiteNavLinks } from "@/components/SiteNavLinks";
import { SITE_NAME } from "@/lib/site";

type Props = {
  children: React.ReactNode;
};

export function StaticInfoShell({ children }: Props) {
  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-[var(--canvas)] px-4 py-10">
      <div className="mb-8 text-center">
        <p className="text-sm text-neutral-600">
          <Link
            href="/"
            prefetch={false}
            className="font-medium text-neutral-900 underline underline-offset-2"
          >
            {SITE_NAME}
          </Link>
        </p>
        <SiteNavLinks className="mt-3" />
      </div>
      <article className={INFO_ARTICLE_CLASS}>
        {children}
      </article>
    </main>
  );
}
