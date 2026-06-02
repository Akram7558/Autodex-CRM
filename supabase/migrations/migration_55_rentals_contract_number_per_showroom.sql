BEGIN;
ALTER TABLE public.rentals DROP CONSTRAINT IF EXISTS rentals_contract_number_key;
ALTER TABLE public.rentals ADD CONSTRAINT rentals_showroom_contract_number_key UNIQUE (showroom_id, contract_number);
COMMIT;
