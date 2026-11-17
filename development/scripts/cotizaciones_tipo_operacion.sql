-- Ejecutar en Supabase antes de desplegar el backend que usa este campo.
BEGIN;
ALTER TABLE public.cotizacion
    ADD COLUMN IF NOT EXISTS tipo_operacion_cotizacion varchar(20) NOT NULL DEFAULT 'Nacional';
COMMIT;
