-- Auto-generated vehicle reference code, e.g. "REN-2023-4821".
-- Format: [MARQUE 3 letters]-[ANNEE]-[4 random digits]
alter table vehicles
  add column if not exists reference text;

-- Unique when present (allows multiple NULLs during backfill).
create unique index if not exists vehicles_reference_unique
  on vehicles(reference) where reference is not null;
