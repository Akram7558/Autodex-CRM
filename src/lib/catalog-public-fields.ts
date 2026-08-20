// ─────────────────────────────────────────────────────────────────────
// Public catalog column allow-lists
// ─────────────────────────────────────────────────────────────────────
// The public catalog is served to ANONYMOUS visitors, both by the SSR
// page (/s/[slug]) and the JSON route (/api/catalog/[slug]). Both used
// to `select('*')`, which shipped internal-only columns to the browser
// (vehicles.vin, vehicles.reserved_by_lead_id — an FK to a customer lead
// row — plus redundant tenant/state columns).
//
// These lists are the ONLY columns the public surface may expose. They
// live here so the SSR page and the API route can never drift apart, and
// so any column added to `vehicles` / `preorder_vehicles` later stays
// private unless it is explicitly added here.
//
// Kept deliberately: `carte_grise` and `reference` — both are rendered
// by the catalog UI (the "Carte grise" spec line and the customer-facing
// "Réf." shown on cards and in the WhatsApp message).
// ─────────────────────────────────────────────────────────────────────

/** Public columns of `vehicles`. Excludes: showroom_id, vin, status, reserved_by_lead_id, is_public. */
export const CATALOG_VEHICLE_FIELDS =
  'id, brand, model, year, color, price_dzd, image_url, photos_urls, ' +
  'kilometrage, etat_carrosserie, finition, carte_grise, type_moteur, ' +
  'reference, motorisation, created_at'

/** Public columns of `preorder_vehicles`. Excludes: showroom_id, disponible, updated_at. */
export const CATALOG_PREORDER_FIELDS =
  'id, marque, modele, annee, prix_estime, budget_dedouanement, ' +
  'description, image_url, delai_livraison, created_at'
