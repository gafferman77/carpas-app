const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeCarpaId, isPending } = require("../server/carpas-web");
test("normaliza las distintas formas de buscar", () => {
  assert.equal(normalizeCarpaId("35"), "CARPA-035"); assert.equal(normalizeCarpaId("035"), "CARPA-035");
  assert.equal(normalizeCarpaId("carpa 35"), "CARPA-035"); assert.equal(normalizeCarpaId("CARPA-135"), "CARPA-135");
});
test("acepta solamente carpas 1 a 180", () => {
  assert.equal(normalizeCarpaId("1"), "CARPA-001"); assert.equal(normalizeCarpaId("180"), "CARPA-180");
  assert.equal(normalizeCarpaId("0"), ""); assert.equal(normalizeCarpaId("181"), "");
});
test("distingue trabajos abiertos de cerrados", () => {
  assert.equal(isPending({ estado: "pendiente" }), true); assert.equal(isPending({ estado: "en_reparacion" }), true); assert.equal(isPending({ estado: "reparada" }), false);
});
