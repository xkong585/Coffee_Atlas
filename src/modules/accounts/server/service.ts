import "server-only";
import type { AccountsService } from "@/contracts";
import { catalogService } from "@/modules/catalog/server/service";
import { createAccounts } from "./accounts";
import { openDatabase } from "./db";
import { stripeGateway } from "./stripe";

/**
 * Accounts, preferences, saved items, recommendation quota and Stripe test
 * payments. Without DATABASE_URL and AUTH_SECRET every operation reports the
 * explicit unavailable state, never a pretend signed-in user.
 */
const accounts = createAccounts({
  database: openDatabase,
  secret: () => process.env.AUTH_SECRET?.trim() || null,
  catalog: catalogService,
  payments: stripeGateway,
  appUrl: () => process.env.APP_URL?.trim() || null,
  now: () => new Date(),
});

export const accountsService: AccountsService = accounts.service;
export const authService = accounts.auth;
export const handleStripeWebhook = accounts.handleStripeWebhook;
export const checkoutOffer = accounts.checkoutOffer;
