import { z } from "zod";
import { itemReferenceSchema } from "./common";

export const preferencesSchema = z.strictObject({
  acidity: z.enum(["low", "medium", "high", "any"]),
  sweetness: z.enum(["low", "medium", "high", "any"]),
  roast: z.enum(["light", "medium", "dark", "any"]),
  milk: z.enum(["none", "dairy", "plant", "any"]),
  flavors: z.array(z.string().trim().min(1).max(60)).max(12),
  preparationMethods: z.array(z.enum(["espresso", "filter", "immersion", "cold"])).max(4),
  notes: z.string().trim().max(1000),
});
export type Preferences = z.infer<typeof preferencesSchema>;

export interface SessionUser {
  id: string;
  displayName: string | null;
  email: string | null;
}

export type SessionState =
  | { status: "signed-in"; user: SessionUser }
  | { status: "signed-out"; user: null }
  | { status: "unavailable"; user: null };

export const savedItemInputSchema = itemReferenceSchema;
export interface SavedItem {
  itemType: "bean" | "drink";
  itemId: string;
  savedAt: string;
}

/** Reserved integration name. The team must agree on a real paid benefit before enabling it. */
export const PAID_CAPABILITY = "personalized-discovery" as const;
export type PaidAccess = {
  capability: typeof PAID_CAPABILITY;
} & (
  | { status: "granted"; allowed: true }
  | { status: "denied" | "unavailable"; allowed: false }
);

/** No client-supplied user, price, entitlement, or redirect can authorize a purchase. */
export const checkoutInputSchema = z.strictObject({ capability: z.literal(PAID_CAPABILITY) });
export type CheckoutInput = z.infer<typeof checkoutInputSchema>;
export interface CheckoutSession { url: string }
/** What the one-time unlock costs, read from the configured Stripe price. Amount is in the currency's minor unit. */
export interface CheckoutOffer {
  capability: typeof PAID_CAPABILITY;
  price: { unitAmount: number; currency: string } | null;
}

/** Registration and sign-in bodies for /api/auth/*. Passwords never leave the server after this. */
export const signUpInputSchema = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(60).nullable(),
});
export const signInInputSchema = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});
export type SignUpInput = z.infer<typeof signUpInputSchema>;
export type SignInInput = z.infer<typeof signInInputSchema>;

/**
 * The agreed paid benefit: every signed-in user gets this many AI
 * recommendations free; a one-time Stripe test payment for PAID_CAPABILITY
 * unlocks unlimited recommendations.
 */
export const FREE_RECOMMENDATION_LIMIT = 3;
export interface RecommendationAllowance {
  paid: boolean;
  freeLimit: number;
  freeUsed: number;
  /** 0 once the free quota is used; irrelevant when paid. */
  freeRemaining: number;
}

/** Server-only input for the AI trip map: the current user's stored taste and saves. */
export interface PlanningContext {
  preferences: Preferences | null;
  saved: SavedItem[];
}

export const checkoutSessionIdSchema = z.string().regex(/^cs_(test|live)_[A-Za-z0-9]{1,250}$/);
export type CheckoutStatus = "open" | "processing" | "paid" | "failed" | "expired";
export interface CheckoutState {
  status: CheckoutStatus;
  access: PaidAccess;
}
