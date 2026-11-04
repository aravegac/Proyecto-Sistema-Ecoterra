-- Ejecutar en Supabase antes de desplegar el backend que usa este campo.
BEGIN;
ALTER TABLE public.orden_compra
    ADD COLUMN IF NOT EXISTS tipo_operacion_oc varchar(20) NOT NULL DEFAULT 'Nacional';
COMMIT;
