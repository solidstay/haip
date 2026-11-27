-- Existing accommodation remains fee-free.
ALTER TABLE room_types ADD COLUMN cleaning_fee_service_id uuid REFERENCES services(id);
