from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("usuarios", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                INSERT INTO rol (id_rol, nombre_rol, descripcion_rol, activo_rol)
                VALUES
                    (1, 'Superusuario / Admin', 'Rol con acceso total al sistema.', TRUE),
                    (2, 'Usuario con privilegios', 'Rol con permisos avanzados por módulo.', TRUE),
                    (3, 'Usuario base', 'Rol básico con permisos limitados.', TRUE)
                ON CONFLICT (id_rol)
                DO UPDATE SET
                    nombre_rol = EXCLUDED.nombre_rol,
                    descripcion_rol = EXCLUDED.descripcion_rol,
                    activo_rol = EXCLUDED.activo_rol;
            """,
            reverse_sql="""
                DELETE FROM rol
                WHERE id_rol IN (1, 2, 3)
                  AND nombre_rol IN (
                    'Superusuario / Admin',
                    'Usuario con privilegios',
                    'Usuario base'
                  );
            """,
        )
    ]