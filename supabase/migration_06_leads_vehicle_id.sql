-- Ensure leads.vehicle_id exists (FK to vehicles).
-- Used by the prospect edit modal to record which vehicle an offer / sale concerns.
alter table leads
  add column if not exists vehicle_id uuid references vehicles(id) on delete set null;

create index if not exists idx_leads_vehicle_id on leads(vehicle_id);
