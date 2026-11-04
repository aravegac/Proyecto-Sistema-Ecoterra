-- Ejecutar en Supabase antes de desplegar el backend que usa este campo.
BEGIN;
ALTER TABLE public.factura
    ADD COLUMN IF NOT EXISTS observacion_factura text NOT NULL DEFAULT '';
COMMIT;
