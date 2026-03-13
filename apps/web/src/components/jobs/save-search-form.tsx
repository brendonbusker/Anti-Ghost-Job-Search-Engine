import Link from "next/link";

import { createSavedSearchAction } from "@/app/actions/saved-searches";
import { buildSignInHref } from "@/lib/auth";

type SaveSearchFormProps = {
  filtersJson: string;
  returnTo: string;
  signedIn: boolean;
};

export function SaveSearchForm({ filtersJson, returnTo, signedIn }: SaveSearchFormProps) {
  if (!signedIn) {
    return (
      <Link
        href={buildSignInHref(returnTo)}
        className="inline-flex rounded-full border border-line-strong px-5 py-3 text-sm font-medium text-foreground transition hover:bg-panel"
      >
        Sign in to save this search
      </Link>
    );
  }

  return (
    <form action={createSavedSearchAction} className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <input type="hidden" name="filters" value={filtersJson} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input
        type="text"
        name="name"
        placeholder="Optional search name"
        className="min-w-[220px] rounded-full border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none transition focus:border-line-strong"
      />
      <button
        type="submit"
        className="rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition hover:opacity-90"
      >
        Save search
      </button>
    </form>
  );
}
