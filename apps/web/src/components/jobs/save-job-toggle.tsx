import Link from "next/link";

import { removeSavedJobAction, saveJobAction } from "@/app/actions/saved-jobs";
import { buildSignInHref } from "@/lib/auth";

type SaveJobToggleProps = {
  canonicalJobId: string;
  isSaved: boolean;
  returnTo: string;
  signedIn: boolean;
  compact?: boolean;
};

export function SaveJobToggle({
  canonicalJobId,
  isSaved,
  returnTo,
  signedIn,
  compact = false,
}: SaveJobToggleProps) {
  if (!signedIn) {
    return (
      <Link
        href={buildSignInHref(returnTo)}
        className={`rounded-full border border-line text-sm font-medium text-foreground transition hover:bg-panel-strong ${
          compact ? "px-4 py-2" : "px-5 py-3"
        }`}
      >
        Sign in to save
      </Link>
    );
  }

  const action = isSaved ? removeSavedJobAction : saveJobAction;

  return (
    <form action={action}>
      <input type="hidden" name="canonicalJobId" value={canonicalJobId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        className={`rounded-full border text-sm font-medium transition ${
          compact ? "px-4 py-2" : "px-5 py-3"
        } ${
          isSaved
            ? "border-line-strong bg-panel-strong text-foreground hover:bg-panel"
            : "border-line bg-panel text-foreground hover:bg-panel-strong"
        }`}
      >
        {isSaved ? "Saved" : "Save job"}
      </button>
    </form>
  );
}
