import "server-only";
import { catalogService } from "@/modules/catalog/server/service";
import { accountsService } from "@/modules/accounts/server/service";
import { recommendationService } from "@/modules/recommendations/server/service";
import { tripService } from "@/modules/trip-map/server/service";

/** Shared integration point; Member 3 coordinates changes after the foundation handoff. */
export const services = {
  catalog: catalogService,
  accounts: accountsService,
  recommendations: recommendationService,
  trips: tripService,
};
