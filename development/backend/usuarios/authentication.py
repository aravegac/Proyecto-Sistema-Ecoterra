# backend/usuarios/authentication.py
from django.core import signing
from django.core.signing import BadSignature, SignatureExpired

from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import BasePermission
from rest_framework.authentication import get_authorization_header

from .models import Usuario


# Los tokens tendrán una vigencia de 8 horas.
TOKEN_MAX_AGE = 8 * 60 * 60
TOKEN_SALT = "ecoterra.api.auth"


# Genera un token firmado que contiene el identificador del usuario.
def crear_token(usuario):
    """Genera un token firmado para el usuario autenticado."""
    return signing.dumps(
        {"user_id": usuario.pk},
        salt=TOKEN_SALT,
        compress=True,
    )


class BearerTokenAuthentication(BaseAuthentication):
    """Autentica solicitudes que incluyen Authorization: Bearer <token>."""

    # Valida el token Bearer y su vigencia de ocho horas y devuelve el usuario activo asociado.
    def authenticate(self, request):
        auth = get_authorization_header(request).split()

        # Sin token: DRF decidirá si la vista permite acceso anónimo.
        if not auth:
            return None

        if len(auth) != 2 or auth[0].lower() != b"bearer":
            raise AuthenticationFailed(
                "Encabezado de autenticación inválido."
            )

        try:
            token = auth[1].decode("utf-8")
            payload = signing.loads(
                token,
                salt=TOKEN_SALT,
                max_age=TOKEN_MAX_AGE,
            )
        except SignatureExpired:
            raise AuthenticationFailed("El token ha expirado.")
        except (BadSignature, UnicodeDecodeError):
            raise AuthenticationFailed("El token no es válido.")

        user_id = payload.get("user_id")

        if user_id is None:
            raise AuthenticationFailed("Token inválido.")

        usuario = Usuario.objects.filter(
            pk=user_id,
            activo=True,
        ).first()

        if usuario is None:
            raise AuthenticationFailed(
                "Usuario inexistente o inactivo."
            )

        return (usuario, token)

    # Indica Bearer como esquema de autenticación en las respuestas de acceso no autorizado.
    def authenticate_header(self, request):
        return "Bearer"


class IsUsuarioAutenticado(BasePermission):
    """Permite el acceso solo a usuarios autenticados y activos."""

    # Permite el acceso únicamente cuando la solicitud contiene un usuario del sistema activo.
    def has_permission(self, request, view):
        usuario = request.user

        return (
            isinstance(usuario, Usuario)
            and usuario.activo
        )
