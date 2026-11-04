-- Ejecutar en Supabase antes de desplegar el backend que usa esta columna.
-- Los documentos anteriores se trataban como CLP en Ecoterra.
BEGIN;
ALTER TABLE public.factura
    ADD COLUMN IF NOT EXISTS moneda_factura varchar(3) NOT NULL DEFAULT 'CLP';
COMMIT;
