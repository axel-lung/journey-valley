import { Card, EmptyState, Meter, inputClass, secondaryButtonClass } from "@/components/ui";
import type { ChecklistItem } from "@/lib/types";
import {
  addChecklistItemAction,
  addChecklistTemplateAction,
  deleteChecklistItemAction,
  toggleChecklistItemAction,
} from "../actions";

/**
 * The preparation list — the part of a trip that is not about money at all.
 * Every row is its own form, so it works without a line of client JavaScript.
 */
export function Checklist({
  tripId,
  items,
  editable,
}: {
  tripId: number;
  items: ChecklistItem[];
  editable: boolean;
}) {
  const done = items.filter((item) => item.done).length;
  const percent = items.length === 0 ? 0 : Math.round((done / items.length) * 100);

  return (
    <Card
      title="Avant de partir"
      action={
        items.length > 0 ? (
          <span className="text-sm text-stone-500">
            {done} / {items.length}
          </span>
        ) : null
      }
    >
      {items.length === 0 ? (
        <EmptyState
          title="Rien à préparer pour l'instant"
          hint="Passeport, assurance, adaptateur… ajoutez ce qu'il ne faut pas oublier."
          action={
            editable ? (
              <form action={addChecklistTemplateAction}>
                <input type="hidden" name="trip_id" value={tripId} />
                <button type="submit" className={secondaryButtonClass}>
                  Ajouter les essentiels
                </button>
              </form>
            ) : null
          }
        />
      ) : (
        <>
          <div className="px-5 pt-4">
            <Meter percent={percent} />
          </div>

          <ul className="mt-2 divide-y divide-stone-100">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-5 py-2.5">
                <form action={toggleChecklistItemAction} className="flex flex-1 items-center gap-3">
                  <input type="hidden" name="item_id" value={item.id} />
                  <button
                    type="submit"
                    disabled={!editable}
                    aria-label={item.done ? `Décocher ${item.label}` : `Cocher ${item.label}`}
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border text-xs transition ${
                      item.done
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-stone-300 bg-white text-transparent hover:border-brand-400"
                    }`}
                  >
                    ✓
                  </button>
                  <span
                    className={`text-sm ${item.done ? "text-stone-400 line-through" : "text-stone-800"}`}
                  >
                    {item.label}
                  </span>
                </form>

                {editable && (
                  <form action={deleteChecklistItemAction}>
                    <input type="hidden" name="item_id" value={item.id} />
                    <button
                      type="submit"
                      className="text-xs text-stone-400 hover:text-rose-600"
                      aria-label={`Supprimer ${item.label}`}
                    >
                      Supprimer
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {editable && items.length > 0 && (
        <form
          action={addChecklistItemAction}
          className="flex gap-2 border-t border-stone-100 px-5 py-3.5"
        >
          <input type="hidden" name="trip_id" value={tripId} />
          <input
            name="label"
            required
            maxLength={140}
            placeholder="Ajouter une chose à faire"
            className={`${inputClass} flex-1`}
          />
          <button type="submit" className={secondaryButtonClass}>
            Ajouter
          </button>
        </form>
      )}
    </Card>
  );
}
