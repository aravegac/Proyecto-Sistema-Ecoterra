-- Ejecutar en Supabase antes de desplegar el backend que usa estos campos.
BEGIN;
ALTER TABLE public.factura
    ADD COLUMN IF NOT EXISTS fecha_anulacion_factura timestamptz NULL,
    ADD COLUMN IF NOT EXISTS motivo_anulacion_factura text NULL,
    ADD COLUMN IF NOT EXISTS id_usuario_anulacion_factura integer NULL REFERENCES public.usuario(id_usuario),
    ADD COLUMN IF NOT EXISTS fecha_pago_factura timestamptz NULL,
    ADD COLUMN IF NOT EXISTS id_usuario_pago_factura integer NULL REFERENCES public.usuario(id_usuario);
COMMIT;
