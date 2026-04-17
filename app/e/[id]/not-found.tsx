import Link from "next/link";

export default function ExhibitNotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-xl font-semibold">Exhibit not found</h1>
      <p className="mt-2 text-sm text-neutral-600">
        This link may be wrong or the exhibit was removed.
      </p>
      <Link
        href="/"
        prefetch={false}
        className="mt-6 inline-block text-sm font-medium text-neutral-900 underline underline-offset-2"
      >
        Start a new exhibit
      </Link>
    </main>
  );
}
