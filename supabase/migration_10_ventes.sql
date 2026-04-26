-- Sales ledger. Each row is one closed deal logged when a vehicle is
-- marked sold from the Rendez-vous page (or any "Vendu" cascade).
create table if not exists ventes (
  id uuid default gen_random_uuid() primary key,
  lead_id uuid references leads(id),
  vehicle_id uuid references vehicles(id),
  client_name text,
  vehicle_name text,
  vehicle_reference text,
  prix_vente bigint,
  date_vente timestamptz default now()
);

create index if not exists idx_ventes_date_vente on ventes(date_vente desc);
