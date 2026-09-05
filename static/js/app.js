(() => {
  "use strict";

  let MEDICAMENTOS = [];

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  async function api(path, options) {
    const res = await fetch(path, options);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.erro || "Erro inesperado na requisição.");
    }
    return data;
  }

  // ---------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------
  function initTabs() {
    $$(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".tab-btn").forEach((b) => b.classList.remove("active"));
        $$(".tab-panel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        $(`#tab-${btn.dataset.tab}`).classList.add("active");
      });
    });
  }

  // ---------------------------------------------------------------------
  // Carregamento inicial de medicamentos
  // ---------------------------------------------------------------------
  async function carregarMedicamentos() {
    MEDICAMENTOS = await api("/api/medicamentos");
    renderBulario(MEDICAMENTOS);
  }

  function popularSelectMedicamentos(select) {
    select.innerHTML = '<option value="">Selecione...</option>';
    MEDICAMENTOS.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${m.nome} (${m.classe})`;
      select.appendChild(opt);
    });
  }

  function popularSelectApresentacoes(select, medicamentoId) {
    const medicamento = MEDICAMENTOS.find((m) => m.id === medicamentoId);
    select.innerHTML = "";
    if (!medicamento) return;
    medicamento.apresentacoes.forEach((ap, idx) => {
      const opt = document.createElement("option");
      opt.value = idx;
      opt.textContent = `${ap.forma} (${ap.concentracao} ${ap.unidade})`;
      select.appendChild(opt);
    });
  }

  // ---------------------------------------------------------------------
  // Aba: Avaliar Prescrição
  // ---------------------------------------------------------------------
  function criarItemPrescricao() {
    const tpl = $("#template-item-prescricao");
    const node = tpl.content.cloneNode(true);
    const card = node.querySelector(".item-prescricao");

    const selectMed = node.querySelector(".select-medicamento");
    const selectApresentacao = node.querySelector(".select-apresentacao");
    const refInfo = node.querySelector(".ref-info");

    popularSelectMedicamentos(selectMed);

    selectMed.addEventListener("change", () => {
      popularSelectApresentacoes(selectApresentacao, selectMed.value);
      atualizarRefInfo(selectMed.value, refInfo);
    });

    node.querySelector(".btn-remove-item").addEventListener("click", () => {
      card.remove();
    });

    $("#lista-itens").appendChild(node);
  }

  function atualizarRefInfo(medicamentoId, refInfoEl) {
    const m = MEDICAMENTOS.find((x) => x.id === medicamentoId);
    if (!m) {
      refInfoEl.textContent = "";
      return;
    }
    const partes = [];
    if (m.dose_min_mg_kg_dose != null && m.dose_max_mg_kg_dose != null) {
      partes.push(`Faixa: ${m.dose_min_mg_kg_dose}–${m.dose_max_mg_kg_dose} mg/kg/dose`);
    }
    if (m.intervalo_horas_min != null) {
      partes.push(`Intervalo: ${m.intervalo_horas_min}–${m.intervalo_horas_max}h`);
    }
    if (m.dose_max_dia_mg_kg != null) {
      partes.push(`Máx.: ${m.dose_max_dia_mg_kg} mg/kg/dia`);
    }
    if (m.dose_max_absoluta_mg_dia != null) {
      partes.push(`Máx. absoluto: ${m.dose_max_absoluta_mg_dia} mg/dia`);
    }
    refInfoEl.textContent = partes.join(" · ");
  }

  function coletarItensPrescricao() {
    const itens = [];
    $$(".item-prescricao").forEach((card) => {
      const medicamentoId = card.querySelector(".select-medicamento").value;
      const apresentacaoIndex = card.querySelector(".select-apresentacao").value;
      const doseMg = card.querySelector(".input-dose-mg").value;
      const dosesDia = card.querySelector(".input-doses-dia").value;

      if (!medicamentoId || doseMg === "") return;

      itens.push({
        medicamento_id: medicamentoId,
        dose_prescrita_mg: parseFloat(doseMg),
        doses_por_dia: parseFloat(dosesDia || "1"),
        apresentacao_index: apresentacaoIndex !== "" ? parseInt(apresentacaoIndex, 10) : null,
      });
    });
    return itens;
  }

  function badgeStatus(status) {
    const labels = {
      adequada: "Dose adequada",
      abaixo: "Dose abaixo",
      acima: "Dose acima",
      sem_referencia: "Sem referência",
    };
    return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
  }

  function renderResultadoPrescricao(data) {
    const container = $("#resultado-prescricao");
    container.innerHTML = "";

    const itensHtml = data.itens
      .map((item) => {
        if (item.erro) {
          return `<div class="result-box"><h3>${item.nome || item.medicamento_id}</h3>
            <p class="error-text">${item.erro}</p></div>`;
        }
        const av = item.avaliacao;
        let doseUnitariaHtml = "";
        if (item.dose_unitaria) {
          doseUnitariaHtml = `<p><strong>Administrar:</strong> ${item.dose_unitaria.mensagem}</p>`;
        }
        return `
          <div class="result-box status-${av.status}">
            <h3>${item.nome} ${badgeStatus(av.status)}</h3>
            <p>${av.mensagem}</p>
            <p><strong>Dose calculada:</strong> ${av.dose_mg_kg_dose} mg/kg/dose ·
               ${av.dose_mg_kg_dia} mg/kg/dia</p>
            ${doseUnitariaHtml}
          </div>`;
      })
      .join("");

    let interacoesHtml;
    if (data.interacoes.length === 0) {
      interacoesHtml = `<div class="sem-interacoes">Nenhuma interação conhecida encontrada entre os medicamentos prescritos (base de dados interna).</div>`;
    } else {
      interacoesHtml = data.interacoes
        .map(
          (i) => `
          <div class="interacao-box gravidade-${i.gravidade}">
            <strong>${i.medicamento_a} + ${i.medicamento_b}</strong>
            <span class="badge badge-${i.gravidade}">${i.gravidade}</span>
            <p>${i.descricao}</p>
          </div>`
        )
        .join("");
    }

    container.innerHTML = `
      <h3>Avaliação de doses</h3>
      ${itensHtml}
      <h3>Interações medicamentosas</h3>
      ${interacoesHtml}
    `;
  }

  async function avaliarPrescricao() {
    const container = $("#resultado-prescricao");
    const peso = parseFloat($("#peso-paciente").value);
    if (!peso || peso <= 0) {
      container.innerHTML = `<p class="error-text">Informe o peso do paciente.</p>`;
      return;
    }
    const itens = coletarItensPrescricao();
    if (itens.length === 0) {
      container.innerHTML = `<p class="error-text">Adicione ao menos um medicamento com dose prescrita.</p>`;
      return;
    }

    try {
      const data = await api("/api/avaliar-prescricao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peso_kg: peso, itens }),
      });
      renderResultadoPrescricao(data);
    } catch (e) {
      container.innerHTML = `<p class="error-text">${e.message}</p>`;
    }
  }

  // ---------------------------------------------------------------------
  // Aba: Cálculo de Dose
  // ---------------------------------------------------------------------
  async function calcularDose() {
    const container = $("#resultado-dose");
    const peso = parseFloat($("#dose-peso").value);
    const mgkg = parseFloat($("#dose-mgkg").value);
    const freq = parseFloat($("#dose-frequencia").value);

    try {
      const data = await api("/api/calcular-dose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peso_kg: peso, dose_mg_kg: mgkg, doses_por_dia: freq }),
      });
      container.innerHTML = `
        <div class="result-box status-adequada">
          <p><strong>Dose por administração:</strong> ${data.dose_por_administracao_mg} mg</p>
          <p><strong>Dose diária total:</strong> ${data.dose_diaria_total_mg} mg/dia</p>
          <p><strong>Equivalente:</strong> ${data.dose_mg_kg_dose} mg/kg/dose · ${data.dose_mg_kg_dia} mg/kg/dia</p>
        </div>`;
    } catch (e) {
      container.innerHTML = `<p class="error-text">${e.message}</p>`;
    }
  }

  // ---------------------------------------------------------------------
  // Aba: Frascos / Ampolas
  // ---------------------------------------------------------------------
  async function calcularFrascos() {
    const container = $("#resultado-frascos");
    const doseTotal = parseFloat($("#frascos-dose-total").value);
    const porFrasco = parseFloat($("#frascos-por-frasco").value);
    const unidade = $("#frascos-unidade").value;

    try {
      const data = await api("/api/calcular-frascos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dose_total: doseTotal, quantidade_por_frasco: porFrasco, unidade }),
      });
      container.innerHTML = `
        <div class="result-box status-adequada">
          <p><strong>Frascos/ampolas necessários:</strong> ${data.numero_frascos}</p>
          <p><strong>Quantidade total disponível:</strong> ${data.quantidade_total_disponivel} ${data.unidade}</p>
          <p><strong>Sobra estimada:</strong> ${data.sobra} ${data.unidade}</p>
        </div>`;
    } catch (e) {
      container.innerHTML = `<p class="error-text">${e.message}</p>`;
    }
  }

  // ---------------------------------------------------------------------
  // Aba: Dose Unitária
  // ---------------------------------------------------------------------
  async function calcularDoseUnitaria() {
    const container = $("#resultado-unitaria");
    const doseMg = parseFloat($("#unit-dose-mg").value);
    const concentracao = parseFloat($("#unit-concentracao").value);
    const unidade = $("#unit-unidade").value;

    try {
      const data = await api("/api/calcular-dose-unitaria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dose_mg: doseMg, concentracao, unidade_concentracao: unidade }),
      });
      container.innerHTML = `
        <div class="result-box status-adequada">
          <p>${data.mensagem}</p>
        </div>`;
    } catch (e) {
      container.innerHTML = `<p class="error-text">${e.message}</p>`;
    }
  }

  // ---------------------------------------------------------------------
  // Aba: Bulário
  // ---------------------------------------------------------------------
  function renderBulario(lista) {
    const container = $("#lista-bulario");
    container.innerHTML = lista
      .map(
        (m) => `
        <div class="bulario-card card">
          <h3>${m.nome}</h3>
          <div class="classe">${m.classe} · ${m.vias.join(", ")}</div>
          <dl>
            <dt>Faixa de dose</dt>
            <dd>${m.dose_min_mg_kg_dose ?? "-"}–${m.dose_max_mg_kg_dose ?? "-"} mg/kg/dose</dd>
            <dt>Intervalo</dt>
            <dd>${m.intervalo_horas_min ?? "-"}–${m.intervalo_horas_max ?? "-"} h</dd>
            <dt>Dose máx. diária</dt>
            <dd>${m.dose_max_dia_mg_kg ?? "-"} mg/kg/dia (máx. absoluto: ${m.dose_max_absoluta_mg_dia ?? "-"} mg/dia)</dd>
            <dt>Apresentações</dt>
            <dd>${m.apresentacoes.map((a) => a.forma).join("; ")}</dd>
            <dt>Observações</dt>
            <dd>${m.observacoes || "-"}</dd>
          </dl>
        </div>`
      )
      .join("");
  }

  function initBularioFilter() {
    $("#filtro-bulario").addEventListener("input", (e) => {
      const termo = e.target.value.toLowerCase();
      const filtrados = MEDICAMENTOS.filter(
        (m) => m.nome.toLowerCase().includes(termo) || m.classe.toLowerCase().includes(termo)
      );
      renderBulario(filtrados);
    });
  }

  // ---------------------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", async () => {
    initTabs();
    initBularioFilter();
    await carregarMedicamentos();

    criarItemPrescricao();
    $("#btn-add-item").addEventListener("click", criarItemPrescricao);
    $("#btn-avaliar").addEventListener("click", avaliarPrescricao);
    $("#btn-calcular-dose").addEventListener("click", calcularDose);
    $("#btn-calcular-frascos").addEventListener("click", calcularFrascos);
    $("#btn-calcular-unitaria").addEventListener("click", calcularDoseUnitaria);
  });
})();
