-- ─────────────────────────────────────────────────────────────────────
-- migration_30_fix_suggest_vehicles.sql
-- ─────────────────────────────────────────────────────────────────────
-- Bug fix for migration_29_ai_features.sql:
--
--   When a lead has no linked vehicle (leads.vehicle_id IS NULL), the
--   reference SELECT INTO never ran, so v_ref stayed in PL/pgSQL's
--   "unassigned record" state. The next reference (v_ref.price_dzd
--   inside the coalesce on v_budget) then raised:
--
--     ERROR: record "v_ref" is not assigned yet
--     HINT:  The tuple structure of a not-yet-assigned record is
--            indeterminate.
--
-- Fix: replace the unassigned record with explicit scalar variables
-- (each defaults to NULL), so the comparison/COALESCE expressions are
-- safe whether or not the lead has a reference vehicle. Also guards
-- with an explicit RETURN when the lead can't be found.
--
-- Idempotent — CREATE OR REPLACE FUNCTION.
-- ─────────────────────────────────────────────────────────────────────

-- ── suggest_vehicles_for_lead ───────────────────────────────────────
create or replace function public.suggest_vehicles_for_lead(
  p_lead_id uuid,
  p_limit   integer default 3
)
returns table (
  vehicle_id    uuid,
  match_score   integer,
  match_reasons text[]
)
language plpgsql
security definer
stable
as $$
declare
  v_lead            record;
  v_ref_brand       text;
  v_ref_model       text;
  v_ref_color       text;
  v_ref_year        integer;
  v_ref_type_moteur text;
  v_ref_price       numeric;
  v_budget          numeric;
begin
  select * into v_lead from public.leads where id = p_lead_id;
  if not found then return; end if;

  -- Only populate the reference scalars when a linked vehicle exists.
  -- Each variable stays NULL otherwise so the COALESCE / equality
  -- checks below short-circuit cleanly (no "record not assigned yet").
  if v_lead.vehicle_id is not null then
    select brand, model, color, year, type_moteur, price_dzd
      into v_ref_brand, v_ref_model, v_ref_color, v_ref_year, v_ref_type_moteur, v_ref_price
      from public.vehicles
     where id = v_lead.vehicle_id;
  end if;

  v_budget := coalesce(v_ref_price, v_lead.budget_dzd);

  return query
  select v.id,
         (
           coalesce(case when v_ref_brand is not null and lower(v.brand) = lower(v_ref_brand) then 40 else 0 end, 0)
         + coalesce(case when v_ref_model is not null and lower(v.model) = lower(v_ref_model) then 20 else 0 end, 0)
         + coalesce(case when v_budget is not null and v.price_dzd is not null
                          and abs(v.price_dzd - v_budget) / nullif(v_budget,0) <= 0.20
                         then 20 else 0 end, 0)
         + coalesce(case when v_budget is not null and v.price_dzd is not null
                          and abs(v.price_dzd - v_budget) / nullif(v_budget,0) <= 0.10
                         then 10 else 0 end, 0)
         + coalesce(case when v_ref_color is not null and v.color is not null
                          and lower(v.color) = lower(v_ref_color) then 10 else 0 end, 0)
         + coalesce(case when v_ref_type_moteur is not null and v.type_moteur is not null
                          and lower(v.type_moteur) = lower(v_ref_type_moteur) then 5 else 0 end, 0)
         + coalesce(case when v_ref_year is not null and v.year is not null
                          and abs(v.year - v_ref_year) <= 1 then 5 else 0 end, 0)
         )::int as score,
         array_remove(array[
           case when v_ref_brand is not null and lower(v.brand) = lower(v_ref_brand) then 'Même marque' end,
           case when v_ref_model is not null and lower(v.model) = lower(v_ref_model) then 'Même modèle' end,
           case when v_budget is not null and v.price_dzd is not null
                 and abs(v.price_dzd - v_budget) / nullif(v_budget,0) <= 0.10 then 'Prix très proche'
                when v_budget is not null and v.price_dzd is not null
                 and abs(v.price_dzd - v_budget) / nullif(v_budget,0) <= 0.20 then 'Prix similaire' end,
           case when v_ref_color is not null and v.color is not null
                 and lower(v.color) = lower(v_ref_color) then 'Même couleur' end,
           case when v_ref_type_moteur is not null and v.type_moteur is not null
                 and lower(v.type_moteur) = lower(v_ref_type_moteur) then 'Même motorisation' end,
           case when v_ref_year is not null and v.year is not null
                 and abs(v.year - v_ref_year) <= 1 then 'Année proche' end
         ], null) as reasons
    from public.vehicles v
   where v.showroom_id = v_lead.showroom_id
     and v.status = 'available'
     and (v_lead.vehicle_id is null or v.id <> v_lead.vehicle_id)
   order by score desc, v.created_at desc
   limit p_limit;
end;
$$;

-- ── suggest_preorders_for_lead ──────────────────────────────────────
create or replace function public.suggest_preorders_for_lead(
  p_lead_id uuid,
  p_limit   integer default 2
)
returns table (
  preorder_id   uuid,
  match_score   integer,
  match_reasons text[]
)
language plpgsql
security definer
stable
as $$
declare
  v_lead       record;
  v_ref_brand  text;
  v_ref_model  text;
  v_ref_year   integer;
  v_ref_price  numeric;
  v_budget     numeric;
begin
  select * into v_lead from public.leads where id = p_lead_id;
  if not found then return; end if;

  if v_lead.vehicle_id is not null then
    select brand, model, year, price_dzd
      into v_ref_brand, v_ref_model, v_ref_year, v_ref_price
      from public.vehicles
     where id = v_lead.vehicle_id;
  end if;

  v_budget := coalesce(v_ref_price, v_lead.budget_dzd);

  return query
  select p.id,
         (
           coalesce(case when v_ref_brand is not null and lower(p.marque) = lower(v_ref_brand) then 40 else 0 end, 0)
         + coalesce(case when v_ref_model is not null and lower(p.modele) = lower(v_ref_model) then 20 else 0 end, 0)
         + coalesce(case when v_budget is not null and p.prix_estime is not null
                          and abs(p.prix_estime - v_budget) / nullif(v_budget,0) <= 0.20
                         then 20 else 0 end, 0)
         + coalesce(case when v_budget is not null and p.prix_estime is not null
                          and abs(p.prix_estime - v_budget) / nullif(v_budget,0) <= 0.10
                         then 10 else 0 end, 0)
         + coalesce(case when v_ref_year is not null and p.annee is not null
                          and abs(p.annee - v_ref_year) <= 1 then 5 else 0 end, 0)
         )::int as score,
         array_remove(array[
           case when v_ref_brand is not null and lower(p.marque) = lower(v_ref_brand) then 'Même marque' end,
           case when v_ref_model is not null and lower(p.modele) = lower(v_ref_model) then 'Même modèle' end,
           case when v_budget is not null and p.prix_estime is not null
                 and abs(p.prix_estime - v_budget) / nullif(v_budget,0) <= 0.10 then 'Prix très proche'
                when v_budget is not null and p.prix_estime is not null
                 and abs(p.prix_estime - v_budget) / nullif(v_budget,0) <= 0.20 then 'Prix similaire' end,
           case when v_ref_year is not null and p.annee is not null
                 and abs(p.annee - v_ref_year) <= 1 then 'Année proche' end
         ], null) as reasons
    from public.preorder_vehicles p
   where p.showroom_id = v_lead.showroom_id
     and p.disponible = true
   order by score desc, p.created_at desc
   limit p_limit;
end;
$$;

grant execute on function public.suggest_vehicles_for_lead(uuid, int)   to authenticated;
grant execute on function public.suggest_preorders_for_lead(uuid, int)  to authenticated;
