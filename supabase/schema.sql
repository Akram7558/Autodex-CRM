-- ============================================================
-- Autodex — Schéma de base de données
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- Showrooms
-- ============================================================
create table if not exists showrooms (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  city        text not null,
  address     text,
  phone       text,
  created_at  timestamptz default now()
);

insert into showrooms (name, city, address, phone) values
  ('Autodex Auto Alger Centre',  'Alger',    '12 Rue Didouche Mourad, Alger',       '023 XX XX XX'),
  ('Autodex Auto Oran',          'Oran',     '45 Boulevard Millénium, Oran',         '041 XX XX XX'),
  ('Autodex Auto Constantine',   'Constantine', '7 Rue Larbi Ben M''hidi, Constantine', '031 XX XX XX'),
  ('Autodex Auto Annaba',        'Annaba',   '23 Avenue du 1er Novembre, Annaba',    '038 XX XX XX');

-- ============================================================
-- Users (sales agents & managers)
-- ============================================================
create table if not exists users (
  id           uuid primary key default uuid_generate_v4(),
  showroom_id  uuid references showrooms(id) on delete set null,
  email        text unique not null,
  full_name    text not null,
  role         text not null check (role in ('admin', 'manager', 'agent')),
  avatar_url   text,
  is_active    boolean default true,
  created_at   timestamptz default now()
);

insert into users (email, full_name, role) values
  ('demo@autodex.store',        'Compte Démo',         'admin'),
  ('karim.boudiaf@autodex.store', 'Karim Boudiaf',     'manager'),
  ('amina.hadj@autodex.store',  'Amina Hadj',          'agent'),
  ('youcef.kaci@autodex.store', 'Youcef Kaci',         'agent');

-- ============================================================
-- Vehicles
-- ============================================================
create table if not exists vehicles (
  id           uuid primary key default uuid_generate_v4(),
  showroom_id  uuid references showrooms(id) on delete set null,
  brand        text not null,
  model        text not null,
  year         int,
  color        text,
  vin          text unique,
  price_dzd    numeric(14, 2),
  status       text default 'available' check (status in ('available', 'reserved', 'sold')),
  created_at   timestamptz default now()
);

insert into vehicles (brand, model, year, color, price_dzd, status) values
  ('Toyota',   'Corolla',   2024, 'Blanc',    4800000, 'available'),
  ('Hyundai',  'Tucson',    2024, 'Gris',     6200000, 'available'),
  ('Kia',      'Sportage',  2023, 'Noir',     5950000, 'reserved'),
  ('Renault',  'Symbol',    2024, 'Rouge',    3400000, 'available'),
  ('Peugeot',  '208',       2024, 'Bleu',     4100000, 'sold'),
  ('Volkswagen','Golf',     2023, 'Blanc',    5500000, 'available');

-- ============================================================
-- Leads
-- ============================================================
create table if not exists leads (
  id             uuid primary key default uuid_generate_v4(),
  showroom_id    uuid references showrooms(id) on delete set null,
  assigned_to    uuid references users(id) on delete set null,
  vehicle_id     uuid references vehicles(id) on delete set null,
  full_name      text not null,
  phone          text,
  email          text,
  wilaya         text,
  source         text default 'walk-in' check (source in ('walk-in', 'phone', 'website', 'referral', 'social')),
  status         text default 'new' check (status in ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost')),
  notes          text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

insert into leads (full_name, phone, email, wilaya, source, status, notes) values
  ('Mohamed Benali',    '0555 12 34 56', 'mbenali@gmail.com',    'Alger',       'walk-in',  'new',       'Intéressé par Toyota Corolla'),
  ('Fatima Zerrouk',    '0661 98 76 54', 'fzerrouk@hotmail.com', 'Blida',       'phone',    'contacted', 'Rappel prévu jeudi'),
  ('Rachid Taïbi',      '0770 45 67 89', null,                   'Oran',        'social',   'qualified', 'Budget ~5 500 000 DZD'),
  ('Houria Mansouri',   '0550 32 11 00', 'hmansouri@gmail.com',  'Tizi Ouzou',  'website',  'proposal',  'Devis envoyé par email'),
  ('Abderrahmane Slimani','0699 87 65 43',null,                  'Constantine', 'referral', 'won',       'Kia Sportage vendue'),
  ('Nadia Oukaci',      '0555 55 44 33', 'noukaci@yahoo.fr',     'Béjaïa',      'phone',    'lost',      'Parti chez la concurrence');

-- ============================================================
-- Activities (timeline / historique)
-- ============================================================
create table if not exists activities (
  id          uuid primary key default uuid_generate_v4(),
  lead_id     uuid references leads(id) on delete cascade,
  user_id     uuid references users(id) on delete set null,
  type        text not null check (type in ('call', 'email', 'meeting', 'note', 'status_change')),
  title       text not null,
  body        text,
  scheduled_at timestamptz,
  done        boolean default false,
  created_at  timestamptz default now()
);

insert into activities (type, title, body, done) values
  ('call',    'Appel de qualification',        'Client intéressé par 2 modèles',           true),
  ('meeting', 'Essai routier',                 'Rendez-vous showroom Alger Centre',         false),
  ('email',   'Envoi de la fiche technique',   'PDF Hyundai Tucson 2024 envoyé',            true),
  ('note',    'Note interne',                  'Client hésite entre Kia et Hyundai',        true),
  ('status_change', 'Statut → Gagné',          'Bon de commande signé',                     true);

-- ============================================================
-- Row Level Security (à activer selon votre config Supabase)
-- ============================================================
-- alter table showrooms  enable row level security;
-- alter table users      enable row level security;
-- alter table vehicles   enable row level security;
-- alter table leads      enable row level security;
-- alter table activities enable row level security;
