import { updateSavedJobNoteAction } from "@/app/actions/saved-jobs";

type SavedJobNoteFormProps = {
  canonicalJobId: string;
  note: string | null;
  returnTo: string;
};

export function SavedJobNoteForm({
  canonicalJobId,
  note,
  returnTo,
}: SavedJobNoteFormProps) {
  return (
    <form action={updateSavedJobNoteAction} className="space-y-3">
      <input type="hidden" name="canonicalJobId" value={canonicalJobId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Your note</span>
        <textarea
          name="note"
          rows={3}
          defaultValue={note ?? ""}
          placeholder="Why this made the shortlist, what to verify, who referred you..."
          className="mt-2 w-full rounded-[22px] border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none transition focus:border-line-strong"
        />
      </label>
      <button
        type="submit"
        className="rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-foreground transition hover:bg-panel"
      >
        Save note
      </button>
    </form>
  );
}
