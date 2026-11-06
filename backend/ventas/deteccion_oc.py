# backend/ventas/deteccion_oc.py
# Detecta N° de OC, cliente y tipo de operación a partir del texto de un PDF.
import re
import unicodedata

RUT_RE = re.compile(r"\b(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK])\b")
OC_TOKEN_RE = re.compile(r"\b(OC[-_][A-Z0-9][A-Z0-9\-_/]*)", re.IGNORECASE)
OC_LABEL_RE = re.compile(
    r"(?:orden\s+de\s+compra|\bO\.?\s?C\.?)\s*(?:n[°ºo]\.?|nro\.?|numero|#)?\s*[:\-]?\s*"
    r"([A-Z0-9][A-Z0-9\-_/]*\d[A-Z0-9\-_/]*)",
    re.IGNORECASE,
)
TIPO_RE = re.compile(r"\btipo\s+de\s+operacion\s*[:\-]\s*(nacional|internacional)\b")
PAIS_RE = re.compile(r"\bpais(?:\s+de\s+origen)?\s*[:\-]\s*([a-z][a-z ]{1,40})")


# Quita tildes y pasa a minúsculas para comparar textos.
def normalizar(texto):
    sin_tildes = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return re.sub(r"[ \t]+", " ", sin_tildes.lower())


def normalizar_rut(rut):
    return re.sub(r"[^0-9K]", "", (rut or "").upper())


def tipo_por_pais(pais):
    pais = normalizar(pais or "").strip()
    if not pais:
        return None
    return "Nacional" if pais.startswith("chile") else "Internacional"


def detectar_numero_oc(texto):
    for patron in (OC_TOKEN_RE, OC_LABEL_RE):
        coincidencia = patron.search(texto)
        if coincidencia:
            return coincidencia.group(1).strip("-_/.").upper()[:50]
    return None


# clientes: iterable de (id, rut, razon_social, pais).
def detectar_cliente(texto, clientes):
    clientes = list(clientes)
    ruts = [normalizar_rut(rut) for rut in RUT_RE.findall(texto)]
    por_rut = {normalizar_rut(c[1]): c for c in clientes if c[1]}
    for rut in ruts:
        if rut in por_rut:
            return por_rut[rut]
    plano = normalizar(texto)
    nombres = [(normalizar(c[2]).strip(), c) for c in clientes if c[2] and len(c[2].strip()) >= 4]
    encontrados = [c for nombre, c in sorted(nombres, key=lambda n: -len(n[0])) if nombre in plano]
    return encontrados[0] if encontrados else None


def detectar_datos_oc(texto, clientes):
    cliente = detectar_cliente(texto, clientes)
    plano = normalizar(texto)
    tipo_doc = TIPO_RE.search(plano)
    pais_doc = PAIS_RE.search(plano)
    # Orden de prioridad: tipo escrito en el documento, país escrito en el documento, país registrado del cliente.
    pais = pais_doc.group(1).strip() if pais_doc else (cliente[3] if cliente else "")
    return {
        "numero_oc": detectar_numero_oc(texto),
        "id_cliente": cliente[0] if cliente else None,
        "tipo_operacion_oc": tipo_doc.group(1).capitalize() if tipo_doc else tipo_por_pais(pais),
        "pais": pais or None,
    }
