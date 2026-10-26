import { type Preferences, tripRequestSchema } from "@/contracts";

export interface TripFormState {
  preferences: Preferences;
  stopCount: number;
  useSavedItems: boolean;
  loadedSaved: boolean;
  acceptsPrefill: boolean;
}

export const initialTripForm: TripFormState = {
  preferences: {
    acidity: "any", sweetness: "any", roast: "any", milk: "any", flavors: [], preparationMethods: [], notes: "",
  },
  stopCount: 4,
  useSavedItems: true,
  loadedSaved: false,
  acceptsPrefill: true,
};

type Action =
  | { type: "prefill"; preferences: Preferences }
  | { type: "preferences"; patch: Partial<Preferences> }
  | { type: "flavor"; flavor: string }
  | { type: "stops"; count: number }
  | { type: "saved-items"; enabled: boolean }
  | { type: "submit" };

/** Account prefill is optional and must never replace an interaction or submitted answers. */
export function tripFormReducer(state: TripFormState, action: Action): TripFormState {
  if (action.type === "prefill") {
    return state.acceptsPrefill ? { ...state, preferences: action.preferences, loadedSaved: true, acceptsPrefill: false } : state;
  }
  const edited = { ...state, acceptsPrefill: false };
  switch (action.type) {
    case "preferences":
      return { ...edited, preferences: { ...state.preferences, ...action.patch } };
    case "flavor": {
      const { flavors } = state.preferences;
      return {
        ...edited,
        preferences: {
          ...state.preferences,
          flavors: flavors.includes(action.flavor)
            ? flavors.filter((flavor) => flavor !== action.flavor)
            : [...flavors, action.flavor].slice(0, 12),
        },
      };
    }
    case "stops":
      return { ...edited, stopCount: action.count };
    case "saved-items":
      return { ...edited, useSavedItems: action.enabled };
    case "submit":
      return edited;
  }
}

/** Even an all-default form is explicit; clearing it must not restore stored account taste. */
export function tripRequestFromForm(state: TripFormState) {
  return tripRequestSchema.safeParse({
    preferences: state.preferences,
    stopCount: state.stopCount,
    useSavedItems: state.useSavedItems,
  });
}
