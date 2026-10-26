import { describe, expect, it } from "vitest";
import type { Preferences } from "@/contracts";
import { initialTripForm, tripFormReducer, tripRequestFromForm } from "@/modules/trip-map/lib/form-state";

const stored: Preferences = {
  ...initialTripForm.preferences,
  roast: "dark",
  flavors: ["chocolate"],
  notes: "My saved preferences",
};

describe("trip form account prefill", () => {
  it("loads account preferences when no interaction has happened", () => {
    const form = tripFormReducer(initialTripForm, { type: "prefill", preferences: stored });
    expect(form.preferences).toEqual(stored);
    expect(form.loadedSaved).toBe(true);
    const request = tripRequestFromForm(form);
    expect(request.success && request.data.preferences).toEqual(stored);
  });

  it("keeps user edits when an account response arrives late", () => {
    let form = tripFormReducer(initialTripForm, { type: "preferences", patch: { notes: "My new trip", roast: "light" } });
    form = tripFormReducer(form, { type: "flavor", flavor: "floral" });
    form = tripFormReducer(form, { type: "prefill", preferences: stored });
    expect(form.preferences.notes).toBe("My new trip");
    expect(form.preferences.roast).toBe("light");
    expect(form.preferences.flavors).toEqual(["floral"]);
    expect(form.loadedSaved).toBe(false);
  });

  it("does not change the visible form after submission while prefill is still in flight", () => {
    const request = tripRequestFromForm(initialTripForm);
    let form = tripFormReducer(initialTripForm, { type: "submit" });
    form = tripFormReducer(form, { type: "prefill", preferences: stored });
    expect(form.preferences).toEqual(initialTripForm.preferences);
    expect(form.loadedSaved).toBe(false);
    expect(tripRequestFromForm(form)).toEqual(request);
  });

  it("sends explicit all-default preferences after clearing account prefill", () => {
    let form = tripFormReducer(initialTripForm, { type: "prefill", preferences: stored });
    form = tripFormReducer(form, { type: "preferences", patch: initialTripForm.preferences });
    const request = tripRequestFromForm(form);
    expect(request.success).toBe(true);
    if (!request.success) throw request.error;
    const serialized = JSON.parse(JSON.stringify(request.data));
    expect(serialized).toHaveProperty("preferences", initialTripForm.preferences);
  });

  it("preserves stop and saved-item choices and rejects out-of-range requests", () => {
    let form = tripFormReducer(initialTripForm, { type: "stops", count: 6 });
    form = tripFormReducer(form, { type: "saved-items", enabled: false });
    form = tripFormReducer(form, { type: "prefill", preferences: stored });
    const request = tripRequestFromForm(form);
    expect(request.success && request.data).toMatchObject({ stopCount: 6, useSavedItems: false });
    expect(tripRequestFromForm(tripFormReducer(form, { type: "stops", count: 7 })).success).toBe(false);
  });
});
