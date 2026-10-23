import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import { createRequire } from "node:module"
import ts from "typescript"

const require = createRequire(import.meta.url)
// Transpila el archivo TypeScript y lo ejecuta en un contexto aislado con las dependencias simuladas.
function load(source, imports, globals = {}) {
  const output = ts.transpileModule(fs.readFileSync(source, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText
  const exports = {}
  vm.runInNewContext(output, { exports, require: imports, URL, ...globals })
  return exports
}
const shared = load(new URL("../src/shared.tsx", import.meta.url), require)
const user = { token: "test-token" }

// Prepara respuestas HTTP simuladas y registra las solicitudes realizadas al consultar el PDF.
function setup(responses) {
  const calls = []
  const { getDocumentPdfUrl } = load(new URL("../src/documentPdf.ts", import.meta.url), /* Devuelve shared al invocarse este callback. */ () => shared, {
    window: { location: { origin: "http://localhost" } },
    fetch: /* Simula la respuesta de la API y registra las solicitudes para las pruebas del PDF. */ async (url, options) => {
      calls.push({ url, options })
      const item = responses.shift()
      if (item instanceof Error) throw item
      assert.ok(item, "Unexpected request")
      return { status: item.status, ok: item.status >= 200 && item.status < 300,
        json: /* Simula la respuesta de la API y registra las solicitudes para las pruebas del PDF. */ async () => { if (item.invalidJson) throw new Error("Invalid JSON"); return item.data } }
    },
  })
  return { get: /* Ejecuta getDocumentPdfUrl("/api/cotizaciones/42", user) al invocarse este callback. */ () => getDocumentPdfUrl("/api/cotizaciones/42", user), getDocumentPdfUrl, calls }
}

test("consulta PDF existente sin regenerarlo y envía token", /* Comprueba que consulta PDF existente sin regenerarlo y envía token. */ async () => {
  const { get, calls } = setup([{ status: 200, data: { url: "https://storage.example/file.pdf" } }])
  assert.equal(await get(), "https://storage.example/file.pdf")
  assert.equal(calls.length, 1)
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-token")
  assert.equal(calls[0].options.cache, "no-store")
})
test("genera archivo faltante y consulta su enlace", /* Comprueba que genera archivo faltante y consulta su enlace. */ async () => {
  const { get, calls } = setup([{ status: 404 }, { status: 200 },
    { status: 200, data: { url: "https://storage.example/new.pdf" } }])
  assert.equal(await get(), "https://storage.example/new.pdf")
  assert.equal(calls[1].url, "/api/cotizaciones/42/generar-pdf/")
  assert.equal(calls[1].options.method, "POST")
  assert.equal(calls.length, 3)
})
test("rechaza falta de sesión sin hacer solicitudes", /* Comprueba que rechaza falta de sesión sin hacer solicitudes. */ async () => {
  const { getDocumentPdfUrl, calls } = setup([])
  await assert.rejects(getDocumentPdfUrl("/api/facturas/42", null), /Inicia sesión/)
  assert.equal(calls.length, 0)
})
test("no genera documentos ante permisos insuficientes", /* Comprueba que no genera documentos ante permisos insuficientes. */ async () => {
  const { get, calls } = setup([{ status: 403, data: { detail: "Sin permiso" } }])
  await assert.rejects(get(), /Sin permiso/)
  assert.equal(calls.length, 1)
})
test("propaga error de almacenamiento sin intentar abrir un enlace", /* Comprueba que propaga error de almacenamiento sin intentar abrir un enlace. */ async () => {
  const { get, calls } = setup([{ status: 404 }, { status: 502, data: { error: "Storage no disponible" } }])
  await assert.rejects(get(), /Storage no disponible/)
  assert.equal(calls.length, 2)
})
test("rechaza respuesta sin enlace y respuesta no JSON", /* Comprueba que rechaza respuesta sin enlace y respuesta no JSON. */ async () => {
  for (const response of [{ status: 200, data: {} }, { status: 502, invalidJson: true }]) {
    await assert.rejects(setup([response]).get(), /No se pudo consultar/)
  }
})
test("rechaza protocolos ejecutables", /* Comprueba que rechaza protocolos ejecutables. */ async () => {
  await assert.rejects(setup([{ status: 200, data: { url: "javascript:alert(1)" } }]).get(), /inválido/)
})
test("propaga fallo de red", /* Comprueba que propaga fallo de red. */ async () => {
  await assert.rejects(setup([new Error("Network unavailable")]).get(), /Network unavailable/)
})
