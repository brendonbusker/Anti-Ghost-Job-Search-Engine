import { createOrUpdateAlertAction } from "@/app/actions/alerts";
import { alertCadenceOptions } from "@/lib/alert-schedule";

type SearchAlertFormProps = {
  savedSearchId: string;
  returnTo: string;
  currentCadence?: string | null;
  actionLabel?: string;
};

export function SearchAlertForm({
  savedSearchId,
  returnTo,
  currentCadence,
  actionLabel = "Create alert",
}: SearchAlertFormProps) {
  return (
    <form action={createOrUpdateAlertAction} className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <input type="hidden" name="savedSearchId" value={savedSearchId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <select
        name="cadence"
        defaultValue={currentCadence ?? alertCadenceOptions[0].value}
        className="rounded-full border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none transition focus:border-line-strong"
      >
        {alertCadenceOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-full border border-line-strong px-5 py-3 text-sm font-medium text-foreground transition hover:bg-panel-strong"
      >
        {actionLabel}
      </button>
    </form>
  );
}
