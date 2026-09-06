/**
 * Motor de cálculos para avaliação de prescrições pediátricas — ICAM.
 *
 * Porta em JavaScript (100% client-side) da lógica originalmente escrita
 * em Python (ver calculos.py + tests/test_calculos.py no repositório).
 * Mantida deliberadamente próxima da versão Python para reduzir o risco
 * de divergência entre as duas implementações.
 */
(function (global) {
  "use strict";

  const ORDEM_GRAVIDADE = { grave: 3, moderada: 2, leve: 1 };

  function round(valor, casas) {
    const fator = Math.pow(10, casas);
    return Math.round((valor + Number.EPSILON) * fator) / fator;
  }

  function calcularDose(pesoKg, doseMgKg, dosesPorDia) {
    if (!(pesoKg > 0)) throw new Error("Peso deve ser maior que zero.");
    if (doseMgKg < 0) throw new Error("Dose mg/kg não pode ser negativa.");
    if (!(dosesPorDia > 0)) throw new Error("Número de doses por dia deve ser maior que zero.");

    const dosePorAdministracao = pesoKg * doseMgKg;
    const doseDiariaTotal = dosePorAdministracao * dosesPorDia;
    const doseMgKgDia = doseMgKg * dosesPorDia;

    return {
      dose_por_administracao_mg: round(dosePorAdministracao, 3),
      dose_diaria_total_mg: round(doseDiariaTotal, 3),
      dose_mg_kg_dose: round(doseMgKg, 3),
      dose_mg_kg_dia: round(doseMgKgDia, 3),
    };
  }

  function avaliarDosePrescrita(medicamento, pesoKg, dosePrescritaMg, dosesPorDia) {
    const doseMgKgDose = dosePrescritaMg / pesoKg;
    const doseMgKgDia = doseMgKgDose * dosesPorDia;
    const doseDiariaTotalMg = dosePrescritaMg * dosesPorDia;

    const faixaMin = medicamento.dose_min_mg_kg_dose;
    const faixaMax = medicamento.dose_max_mg_kg_dose;
    const maxDiaKg = medicamento.dose_max_dia_mg_kg;
    const maxAbsoluta = medicamento.dose_max_absoluta_mg_dia;

    const excedeAbsoluta = !!maxAbsoluta && doseDiariaTotalMg > maxAbsoluta;
    const excedeDiaKg = !!maxDiaKg && doseMgKgDia > maxDiaKg;

    let status, mensagem;
    if (faixaMin == null || faixaMax == null) {
      status = "sem_referencia";
      mensagem = "Não há faixa de referência cadastrada para este medicamento; avalie clinicamente.";
    } else if (doseMgKgDose < faixaMin) {
      status = "abaixo";
      const percentual = faixaMin ? (doseMgKgDose / faixaMin) * 100 : 0;
      mensagem = `Dose abaixo da faixa recomendada (${faixaMin}-${faixaMax} mg/kg/dose). Corresponde a ${percentual.toFixed(0)}% do mínimo recomendado.`;
    } else if (doseMgKgDose > faixaMax) {
      status = "acima";
      const percentual = faixaMax ? (doseMgKgDose / faixaMax) * 100 : 0;
      mensagem = `Dose ACIMA da faixa recomendada (${faixaMin}-${faixaMax} mg/kg/dose). Corresponde a ${percentual.toFixed(0)}% do máximo recomendado.`;
    } else {
      status = "adequada";
      mensagem = `Dose dentro da faixa recomendada (${faixaMin}-${faixaMax} mg/kg/dose).`;
    }

    if (excedeDiaKg) {
      mensagem += ` ATENÇÃO: dose diária total (${doseMgKgDia.toFixed(2)} mg/kg/dia) excede o máximo diário recomendado (${maxDiaKg} mg/kg/dia).`;
    }
    if (excedeAbsoluta) {
      mensagem += ` ATENÇÃO: dose diária total (${doseDiariaTotalMg.toFixed(1)} mg/dia) excede a dose máxima absoluta recomendada (${maxAbsoluta} mg/dia).`;
    }

    return {
      status,
      mensagem,
      dose_mg_kg_dose: round(doseMgKgDose, 3),
      dose_mg_kg_dia: round(doseMgKgDia, 3),
      faixa_min_mg_kg_dose: faixaMin ?? null,
      faixa_max_mg_kg_dose: faixaMax ?? null,
      excede_dose_maxima_absoluta: excedeAbsoluta,
      excede_dose_maxima_dia: excedeDiaKg,
    };
  }

  function calcularDoseUnitaria(doseMg, concentracao, unidadeConcentracao) {
    if (!(concentracao > 0)) throw new Error("Concentração deve ser maior que zero.");
    const quantidade = doseMg / concentracao;
    const partes = String(unidadeConcentracao).split("/");
    const unidadeDestino = partes.length > 1 ? partes[partes.length - 1] : "unidade(s)";
    const q = round(quantidade, 3);
    return {
      quantidade: q,
      unidade: unidadeDestino,
      mensagem: `Administrar ${q} ${unidadeDestino} para atingir ${doseMg} mg.`,
    };
  }

  function calcularNumeroFrascos(doseTotal, quantidadePorFrasco, unidade) {
    unidade = unidade || "mg";
    if (!(quantidadePorFrasco > 0)) throw new Error("Quantidade por frasco deve ser maior que zero.");
    if (doseTotal < 0) throw new Error("Dose total não pode ser negativa.");

    let numeroFrascos = Math.ceil(round(doseTotal / quantidadePorFrasco, 6));
    numeroFrascos = doseTotal > 0 ? Math.max(numeroFrascos, 1) : 0;
    const quantidadeDisponivel = numeroFrascos * quantidadePorFrasco;
    const sobra = round(quantidadeDisponivel - doseTotal, 3);

    return {
      numero_frascos: numeroFrascos,
      quantidade_total_disponivel: round(quantidadeDisponivel, 3),
      sobra,
      unidade,
    };
  }

  function verificarInteracoes(idsMedicamentos, medicamentosDb, interacoesDb) {
    const idsUnicos = [...new Set(idsMedicamentos)];
    const mapaInteracoes = new Map();
    for (const interacao of interacoesDb) {
      const chave = [...interacao.medicamentos].sort().join("||");
      mapaInteracoes.set(chave, interacao);
    }

    const encontradas = [];
    for (let i = 0; i < idsUnicos.length; i++) {
      for (let j = i + 1; j < idsUnicos.length; j++) {
        const chave = [idsUnicos[i], idsUnicos[j]].sort().join("||");
        const interacao = mapaInteracoes.get(chave);
        if (interacao) {
          const nomeA = medicamentosDb[idsUnicos[i]]?.nome || idsUnicos[i];
          const nomeB = medicamentosDb[idsUnicos[j]]?.nome || idsUnicos[j];
          encontradas.push({
            medicamento_a: nomeA,
            medicamento_b: nomeB,
            gravidade: interacao.gravidade,
            descricao: interacao.descricao,
          });
        }
      }
    }

    encontradas.sort((a, b) => (ORDEM_GRAVIDADE[b.gravidade] || 0) - (ORDEM_GRAVIDADE[a.gravidade] || 0));
    return encontradas;
  }

  global.Calculos = {
    calcularDose,
    avaliarDosePrescrita,
    calcularDoseUnitaria,
    calcularNumeroFrascos,
    verificarInteracoes,
  };
})(window);
