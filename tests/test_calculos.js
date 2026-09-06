// Testes do motor de cálculo client-side (static/js/calculos.js).
// Rodar com: node tests/test_calculos.js
// Mantido em paralelo a tests/test_calculos.py para garantir que as duas
// implementações (Python de referência / JS usada no site estático)
// produzam os mesmos resultados.
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function carregarCalculos() {
  const codigo = fs.readFileSync(path.join(ROOT, "static/js/calculos.js"), "utf8");
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(codigo, sandbox);
  return sandbox.window.Calculos;
}

function carregarJson(nome) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "data", nome), "utf8"));
}

function medicamentosPorId(lista) {
  const mapa = {};
  for (const m of lista) mapa[m.id] = m;
  return mapa;
}

const Calculos = carregarCalculos();
let falhas = 0;

function teste(nome, fn) {
  try {
    fn();
    console.log(`OK   ${nome}`);
  } catch (e) {
    falhas++;
    console.error(`FAIL ${nome}`);
    console.error(`     ${e.message}`);
  }
}

teste("calcularDose: cálculo básico", () => {
  const r = Calculos.calcularDose(10, 10, 3);
  assert.equal(r.dose_por_administracao_mg, 100);
  assert.equal(r.dose_diaria_total_mg, 300);
  assert.equal(r.dose_mg_kg_dia, 30);
});

teste("calcularDose: peso inválido lança erro", () => {
  assert.throws(() => Calculos.calcularDose(0, 10, 1));
});

teste("avaliarDosePrescrita: dentro da faixa", () => {
  const medicamento = { dose_min_mg_kg_dose: 10, dose_max_mg_kg_dose: 15 };
  const a = Calculos.avaliarDosePrescrita(medicamento, 10, 120, 4);
  assert.equal(a.status, "adequada");
  assert.equal(a.dose_mg_kg_dose, 12);
});

teste("avaliarDosePrescrita: abaixo da faixa", () => {
  const medicamento = { dose_min_mg_kg_dose: 10, dose_max_mg_kg_dose: 15 };
  const a = Calculos.avaliarDosePrescrita(medicamento, 10, 50, 1);
  assert.equal(a.status, "abaixo");
});

teste("avaliarDosePrescrita: acima da faixa", () => {
  const medicamento = { dose_min_mg_kg_dose: 10, dose_max_mg_kg_dose: 15 };
  const a = Calculos.avaliarDosePrescrita(medicamento, 10, 200, 1);
  assert.equal(a.status, "acima");
});

teste("avaliarDosePrescrita: sem referência", () => {
  const a = Calculos.avaliarDosePrescrita({}, 10, 100, 1);
  assert.equal(a.status, "sem_referencia");
});

teste("calcularDoseUnitaria: mL", () => {
  const r = Calculos.calcularDoseUnitaria(250, 50, "mg/mL");
  assert.equal(r.quantidade, 5);
  assert.equal(r.unidade, "mL");
});

teste("calcularNumeroFrascos: com sobra", () => {
  const r = Calculos.calcularNumeroFrascos(750, 500);
  assert.equal(r.numero_frascos, 2);
  assert.equal(r.quantidade_total_disponivel, 1000);
  assert.equal(r.sobra, 250);
});

teste("verificarInteracoes: encontra par conhecido (gentamicina + vancomicina)", () => {
  const medicamentos = medicamentosPorId(carregarJson("medicamentos.json"));
  const interacoes = carregarJson("interacoes.json");
  const r = Calculos.verificarInteracoes(["gentamicina", "vancomicina"], medicamentos, interacoes);
  assert.equal(r.length, 1);
  assert.equal(r[0].gravidade, "grave");
});

teste("verificarInteracoes: nenhuma interação entre paracetamol e amoxicilina_comp", () => {
  const medicamentos = medicamentosPorId(carregarJson("medicamentos.json"));
  const interacoes = carregarJson("interacoes.json");
  const r = Calculos.verificarInteracoes(["paracetamol", "amoxicilina_comp"], medicamentos, interacoes);
  assert.equal(r.length, 0);
});

teste("dados: todas as interações referenciam medicamentos existentes", () => {
  const medicamentos = medicamentosPorId(carregarJson("medicamentos.json"));
  const interacoes = carregarJson("interacoes.json");
  for (const it of interacoes) {
    for (const id of it.medicamentos) {
      assert.ok(medicamentos[id], `Interação referencia medicamento inexistente: ${id}`);
    }
  }
});

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam.`);
  process.exit(1);
} else {
  console.log("\nTodos os testes JS passaram.");
}
