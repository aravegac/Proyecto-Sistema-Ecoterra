# Generated manually for the usuarios app.

from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Usuario",
            fields=[
                (
                    "id",
                    models.AutoField(
                        db_column="id_usuario",
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("id_rol", models.IntegerField(db_column="id_rol", default=3)),
                ("nombre", models.CharField(db_column="nombre_usuario", max_length=150)),
                (
                    "email",
                    models.EmailField(db_column="correo_usuario", max_length=150, unique=True),
                ),
                (
                    "contrasena",
                    models.CharField(db_column="contrasena_usuario", default="", max_length=255),
                ),
                ("activo", models.BooleanField(db_column="activo_usuario", default=True)),
            ],
            options={
                "db_table": "usuario",
                "ordering": ["nombre"],
                "verbose_name": "usuario",
                "verbose_name_plural": "usuarios",
            },
        ),
    ]