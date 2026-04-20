-- ============================================================
-- Autodex — Données de démonstration (Algérie)
-- ============================================================
-- IMPORTANT: Exécutez d'abord schema.sql, puis ce fichier.
-- Pour la connexion démo, créez un utilisateur Auth dans
-- Supabase Dashboard : demo@autodex.store / Demo1234!
-- ============================================================

-- Nettoyage (optionnel — désactiver si vous voulez conserver les données)
truncate table activities  restart identity cascade;
truncate table leads       restart identity cascade;
truncate table vehicles    restart identity cascade;
truncate table users       restart identity cascade;
truncate table showrooms   restart identity cascade;

-- ============================================================
-- Showrooms
-- ============================================================
insert into showrooms (id, name, city, address, phone) values
  ('a1000000-0000-0000-0000-000000000001', 'Autodex Auto Alger',      'Alger',       '12 Rue Didouche Mourad, Hussein Dey', '023 45 67 89'),
  ('a1000000-0000-0000-0000-000000000002', 'Autodex Auto Oran',       'Oran',        '45 Boulevard du 1er Novembre, Oran',  '041 23 45 67'),
  ('a1000000-0000-0000-0000-000000000003', 'Autodex Auto Constantine','Constantine', '7 Rue Larbi Ben M''hidi, Constantine','031 87 65 43'),
  ('a1000000-0000-0000-0000-000000000004', 'Autodex Auto Annaba',     'Annaba',      '23 Avenue du 8 Mai 1945, Annaba',     '038 12 34 56'),
  ('a1000000-0000-0000-0000-000000000005', 'Autodex Auto Sétif',      'Sétif',       '3 Rue de l''Indépendance, Sétif',     '036 98 76 54');

-- ============================================================
-- Users (agents commerciaux)
-- ============================================================
insert into users (id, showroom_id, email, full_name, role) values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'demo@autodex.store',          'Compte Démo',      'admin'),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'karim.benali@autodex.store',  'Karim Benali',     'manager'),
  ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000002', 'youcef.amrani@autodex.store', 'Youcef Amrani',    'agent'),
  ('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000003', 'rachid.meziani@autodex.store','Rachid Meziani',   'agent'),
  ('b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000004', 'hamza.slimani@autodex.store', 'Hamza Slimani',    'agent');

-- ============================================================
-- Vehicles (Geely, Chery, Fiat, Renault, DFSK)
-- ============================================================
insert into vehicles (id, showroom_id, brand, model, year, color, price_dzd, status) values
  -- Alger
  ('c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Geely',   'Emgrand',   2024, 'Blanc Perle',  3_850_000, 'available'),
  ('c1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'Geely',   'Coolray',   2024, 'Gris Titan',   4_950_000, 'available'),
  ('c1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'Chery',   'Tiggo 4',   2024, 'Noir Minuit',  4_250_000, 'reserved'),
  ('c1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'Chery',   'Tiggo 7',   2024, 'Bleu Saphir',  5_600_000, 'available'),
  -- Oran
  ('c1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000002', 'Renault', 'Symbol',    2024, 'Blanc',        3_200_000, 'available'),
  ('c1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000002', 'Renault', 'Sandero',   2023, 'Rouge',        2_950_000, 'sold'),
  ('c1000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000002', 'Fiat',    '500X',      2024, 'Jaune',        4_700_000, 'available'),
  ('c1000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000002', 'Fiat',    'Tipo',      2024, 'Gris',         3_500_000, 'available'),
  -- Constantine
  ('c1000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000003', 'DFSK',    'Glory 500', 2024, 'Blanc',        3_100_000, 'available'),
  ('c1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000003', 'DFSK',    'Glory 580', 2024, 'Gris Argent',  3_850_000, 'reserved'),
  -- Annaba
  ('c1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000004', 'Geely',   'Atlas Pro', 2024, 'Noir',         6_200_000, 'available'),
  -- Sétif
  ('c1000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000005', 'Chery',   'Arrizo 6',  2024, 'Blanc Nacré',  4_100_000, 'available');

-- ============================================================
-- Leads (prospects)
-- ============================================================
insert into leads (id, showroom_id, assigned_to, vehicle_id, full_name, phone, email, wilaya, source, status, notes, created_at) values
  -- Gagné
  ('d1000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000002',
   'c1000000-0000-0000-0000-000000000001',
   'Karim Benali', '0555 11 22 33', 'k.benali@gmail.com',
   'Alger', 'walk-in', 'won',
   'Bon de commande signé. Livraison prévue sous 15 jours.',
   now() - interval '30 days'),

  ('d1000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000002',
   'b1000000-0000-0000-0000-000000000003',
   'c1000000-0000-0000-0000-000000000006',
   'Youcef Amrani', '0661 44 55 66', null,
   'Oran', 'phone', 'won',
   'Renault Sandero vendue. Paiement comptant.',
   now() - interval '20 days'),

  -- En cours
  ('d1000000-0000-0000-0000-000000000003',
   'a1000000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000002',
   'c1000000-0000-0000-0000-000000000003',
   'Rachid Meziani', '0770 77 88 99', 'r.meziani@outlook.com',
   'Alger', 'social', 'proposal',
   'Devis envoyé pour Chery Tiggo 4. Hésite encore sur la couleur.',
   now() - interval '10 days'),

  ('d1000000-0000-0000-0000-000000000004',
   'a1000000-0000-0000-0000-000000000003',
   'b1000000-0000-0000-0000-000000000004',
   null,
   'Hamza Slimani', '0699 00 11 22', null,
   'Constantine', 'referral', 'qualified',
   'Cherche un SUV ≤ 5 000 000 DZD. Veut comparer DFSK et Chery.',
   now() - interval '7 days'),

  ('d1000000-0000-0000-0000-000000000005',
   'a1000000-0000-0000-0000-000000000002',
   'b1000000-0000-0000-0000-000000000003',
   'c1000000-0000-0000-0000-000000000007',
   'Nadia Bensalem', '0555 33 44 55', 'n.bensalem@gmail.com',
   'Oran', 'website', 'contacted',
   'A demandé une fiche technique Fiat 500X. Rappel prévu vendredi.',
   now() - interval '5 days'),

  ('d1000000-0000-0000-0000-000000000006',
   'a1000000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000002',
   null,
   'Fatima Zerrouk', '0661 66 77 88', 'f.zerrouk@hotmail.fr',
   'Blida', 'phone', 'new',
   'Appel entrant. Intéressée par Geely Coolray. Pas encore qualifiée.',
   now() - interval '2 days'),

  ('d1000000-0000-0000-0000-000000000007',
   'a1000000-0000-0000-0000-000000000004',
   'b1000000-0000-0000-0000-000000000005',
   'c1000000-0000-0000-0000-000000000011',
   'Amar Khelifi', '0550 99 88 77', null,
   'Annaba', 'walk-in', 'new',
   'Visite spontanée showroom. Intéressé par Geely Atlas Pro.',
   now() - interval '1 day'),

  -- Perdu
  ('d1000000-0000-0000-0000-000000000008',
   'a1000000-0000-0000-0000-000000000005',
   'b1000000-0000-0000-0000-000000000004',
   null,
   'Sofiane Merad', '0770 22 33 44', null,
   'Sétif', 'phone', 'lost',
   'Parti chez la concurrence. Prix jugé trop élevé.',
   now() - interval '15 days');

-- ============================================================
-- Activities (historique)
-- ============================================================
insert into activities (lead_id, user_id, type, title, body, done, created_at) values
  -- Karim Benali (gagné)
  ('d1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002',
   'call', 'Premier contact téléphonique',
   'Client très intéressé. Souhaite voir la Geely Emgrand en blanc.', true,
   now() - interval '28 days'),
  ('d1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002',
   'meeting', 'Essai routier Geely Emgrand',
   'Test conduite positif. Client séduit par le confort intérieur.', true,
   now() - interval '25 days'),
  ('d1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002',
   'status_change', 'Statut → Gagné',
   'Bon de commande signé. Acompte de 500 000 DZD versé.', true,
   now() - interval '22 days'),

  -- Youcef Amrani (gagné)
  ('d1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000003',
   'call', 'Appel de qualification',
   'Budget 3 000 000 DZD. Cherche une citadine économique.', true,
   now() - interval '18 days'),
  ('d1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000003',
   'status_change', 'Statut → Gagné',
   'Renault Sandero vendue. Paiement comptant en 1 fois.', true,
   now() - interval '15 days'),

  -- Rachid Meziani (offre)
  ('d1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000002',
   'email', 'Envoi devis Chery Tiggo 4',
   'PDF devis + fiche technique envoyés. Relance prévue dans 3 jours.', true,
   now() - interval '8 days'),
  ('d1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000002',
   'note', 'Note interne',
   'Client hésite entre rouge et noir. Proposer remise sur accessoires.', true,
   now() - interval '5 days'),

  -- Hamza Slimani (qualifié)
  ('d1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000004',
   'call', 'Appel entrant qualification',
   'Budget confirmé : 4 500 000 à 5 000 000 DZD. Veut un SUV récent.', true,
   now() - interval '6 days'),
  ('d1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000004',
   'meeting', 'Présentation DFSK Glory 580',
   'RDV showroom Constantine. Client apprécié les finitions.', false,
   now() + interval '2 days'),

  -- Nadia Bensalem (contacté)
  ('d1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000003',
   'email', 'Fiche technique Fiat 500X',
   'Brochure + tarif envoyés par email.', true,
   now() - interval '4 days'),

  -- Sofiane Merad (perdu)
  ('d1000000-0000-0000-0000-000000000008', 'b1000000-0000-0000-0000-000000000004',
   'call', 'Appel de suivi',
   'Client a finalement opté pour un autre concessionnaire.', true,
   now() - interval '12 days'),
  ('d1000000-0000-0000-0000-000000000008', 'b1000000-0000-0000-0000-000000000004',
   'status_change', 'Statut → Perdu',
   'Raison : prix. À noter pour ajuster la politique tarifaire.', true,
   now() - interval '10 days');
