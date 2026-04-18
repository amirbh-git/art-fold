import Link from "next/link";

const ITEMS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/museum-sources", label: "Museum sources" },
  { href: "/faq", label: "FAQ" },
] as const;

type Props = {
  className?: string;
};

export function SiteNavLinks({ className }: Props) {
  return (
    <nav className={className} aria-label="Site pages">
      <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-neutral-600">
        {ITEMS.map(({ href, label }) => (
          <li key={href}>
            <Link
              href={href}
              prefetch={false}
              className="underline decoration-neutral-400 underline-offset-2 hover:text-neutral-900"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
