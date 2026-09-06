(() => {
  "use strict";

  let MEDICAMENTOS = [];
  let MEDICAMENTOS_POR_ID = {};
  let INTERACOES = [];
  let CATEGORIAS = [];

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  async function carregarJson(caminho) {
    const res = await fetch(caminho);
    if (!res.ok) throw new Error(`Falha ao carregar ${caminho} (HTTP ${res.status})`);
    return res.json();
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
  // Carregamento inicial de dados
  // ---------------------------------------------------------------------
  async function carregarDados() {
    const [medicamentos, interacoes] = await Promise.all([
      carregarJson("data/medicamentos.json"),
      carregarJson("data/interacoes.json"),
    ]);
    MEDICAMENTOS = medicamentos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    MEDICAMENTOS_POR_ID = {};
    MEDICAMENTOS.forEach((m) => (MEDICAMENTOS_POR_ID[m.id] = m));
    INTERACOES = interacoes;
    CATEGORIAS = [...new Set(MEDICAMENTOS.map((m) => m.categoria))].sort((a, b) => a.localeCompare(b, "pt-BR"));

    popularSelectCategorias($("#filtro-categoria"), true);
    renderBulario(MEDICAMENTOS);

    popularSelectCategorias($("#filtro-categoria-hospital"), true);
    renderStatsHospital(MEDICAMENTOS);
    aplicarFiltrosHospital();
  }

  function popularSelectCategorias(select, comTodas) {
    const atual = select.value;
    select.innerHTML = "";
    if (comTodas) {
      const optTodas = document.createElement("option");
      optTodas.value = "";
      optTodas.textContent = comTodas === true ? "Todas as categorias" : comTodas;
      select.appendChild(optTodas);
    }
    CATEGORIAS.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      select.appendChild(opt);
    });
    if (atual) select.value = atual;
  }

  function popularSelectMedicamentos(select, categoria) {
    const atual = select.value;
    select.innerHTML = '<option value="">Selecione...</option>';
    const lista = categoria ? MEDICAMENTOS.filter((m) => m.categoria === categoria) : MEDICAMENTOS;
    lista.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.nome;
      select.appendChild(opt);
    });
    if (atual && MEDICAMENTOS_POR_ID[atual] && (!categoria || MEDICAMENTOS_POR_ID[atual].categoria === categoria)) {
      select.value = atual;
    }
  }

  function popularSelectApresentacoes(select, medicamentoId) {
    const medicamento = MEDICAMENTOS_POR_ID[medicamentoId];
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

    const selectCategoria = node.querySelector(".select-categoria");
    const selectMed = node.querySelector(".select-medicamento");
    const selectApresentacao = node.querySelector(".select-apresentacao");
    const refInfo = node.querySelector(".ref-info");

    popularSelectCategorias(selectCategoria, "Todas as categorias");
    popularSelectMedicamentos(selectMed, "");

    selectCategoria.addEventListener("change", () => {
      popularSelectMedicamentos(selectMed, selectCategoria.value);
      popularSelectApresentacoes(selectApresentacao, selectMed.value);
      atualizarRefInfo(selectMed.value, refInfo);
    });

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
    const m = MEDICAMENTOS_POR_ID[medicamentoId];
    if (!m) {
      refInfoEl.textContent = "";
      return;
    }
    const partes = [];
    if (m.dose_min_mg_kg_dose != null && m.dose_max_mg_kg_dose != null) {
      partes.push(`Faixa: ${m.dose_min_mg_kg_dose}–${m.dose_max_mg_kg_dose} mg/kg/dose`);
    } else {
      partes.push("Sem faixa mg/kg cadastrada");
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

  function avaliarPrescricaoLocal(pesoKg, itens) {
    const resultadosItens = [];
    const idsParaInteracao = [];

    for (const item of itens) {
      const medicamento = MEDICAMENTOS_POR_ID[item.medicamento_id];
      if (!medicamento) {
        resultadosItens.push({ medicamento_id: item.medicamento_id, erro: "Medicamento não encontrado na base de dados." });
        continue;
      }

      const avaliacao = Calculos.avaliarDosePrescrita(medicamento, pesoKg, item.dose_prescrita_mg, item.doses_por_dia);
      const itemResultado = { medicamento_id: item.medicamento_id, nome: medicamento.nome, categoria: medicamento.categoria, avaliacao };

      if (item.apresentacao_index != null && medicamento.apresentacoes[item.apresentacao_index]) {
        const apresentacao = medicamento.apresentacoes[item.apresentacao_index];
        itemResultado.apresentacao = apresentacao;
        itemResultado.dose_unitaria = Calculos.calcularDoseUnitaria(item.dose_prescrita_mg, apresentacao.concentracao, apresentacao.unidade);
      }

      resultadosItens.push(itemResultado);
      idsParaInteracao.push(item.medicamento_id);
    }

    const interacoes = Calculos.verificarInteracoes(idsParaInteracao, MEDICAMENTOS_POR_ID, INTERACOES);
    return { peso_kg: pesoKg, itens: resultadosItens, interacoes };
  }

  function renderResultadoPrescricao(data) {
    const container = $("#resultado-prescricao");

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
      interacoesHtml = `<div class="sem-interacoes">✅ Nenhuma interação conhecida encontrada entre os medicamentos prescritos (base de dados interna).</div>`;
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

  function avaliarPrescricao() {
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
      const data = avaliarPrescricaoLocal(peso, itens);
      renderResultadoPrescricao(data);
    } catch (e) {
      container.innerHTML = `<p class="error-text">${e.message}</p>`;
    }
  }

  // ---------------------------------------------------------------------
  // Aba: Cálculo de Dose
  // ---------------------------------------------------------------------
  function calcularDose() {
    const container = $("#resultado-dose");
    const peso = parseFloat($("#dose-peso").value);
    const mgkg = parseFloat($("#dose-mgkg").value);
    const freq = parseFloat($("#dose-frequencia").value);

    try {
      const data = Calculos.calcularDose(peso, mgkg, freq);
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
  function calcularFrascos() {
    const container = $("#resultado-frascos");
    const doseTotal = parseFloat($("#frascos-dose-total").value);
    const porFrasco = parseFloat($("#frascos-por-frasco").value);
    const unidade = $("#frascos-unidade").value;

    try {
      const data = Calculos.calcularNumeroFrascos(doseTotal, porFrasco, unidade);
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
  function calcularDoseUnitaria() {
    const container = $("#resultado-unitaria");
    const doseMg = parseFloat($("#unit-dose-mg").value);
    const concentracao = parseFloat($("#unit-concentracao").value);
    const unidade = $("#unit-unidade").value;

    try {
      const data = Calculos.calcularDoseUnitaria(doseMg, concentracao, unidade);
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
    const contador = $("#contador-bulario");
    contador.textContent = `${lista.length} medicamento(s) encontrado(s) de ${MEDICAMENTOS.length} no formulário do ICAM.`;

    if (lista.length === 0) {
      container.innerHTML = `<div class="empty-state">Nenhum medicamento encontrado com esse filtro.</div>`;
      return;
    }

    container.innerHTML = lista
      .map(
        (m) => `
        <div class="bulario-card card">
          <span class="badge badge-categoria">${m.categoria}</span>
          <h3>${m.nome}</h3>
          <div class="classe">${m.classe} · ${m.vias.join(", ")}</div>
          <dl>
            <dt>Faixa de dose</dt>
            <dd>${m.dose_min_mg_kg_dose ?? "—"}${m.dose_max_mg_kg_dose != null ? "–" + m.dose_max_mg_kg_dose : ""} mg/kg/dose</dd>
            <dt>Intervalo</dt>
            <dd>${m.intervalo_horas_min ?? "—"}${m.intervalo_horas_max != null ? "–" + m.intervalo_horas_max : ""} h</dd>
            <dt>Dose máx. diária</dt>
            <dd>${m.dose_max_dia_mg_kg ?? "—"} mg/kg/dia (máx. absoluto: ${m.dose_max_absoluta_mg_dia ?? "—"} mg/dia)</dd>
            <dt>Apresentações</dt>
            <dd>${m.apresentacoes.map((a) => a.forma).join("; ")}</dd>
            <dt>Observações</dt>
            <dd>${m.observacoes || "—"}</dd>
          </dl>
        </div>`
      )
      .join("");
  }

  function aplicarFiltrosBulario() {
    const termo = $("#filtro-bulario").value.toLowerCase();
    const categoria = $("#filtro-categoria").value;
    const filtrados = MEDICAMENTOS.filter((m) => {
      const bateTermo = !termo || m.nome.toLowerCase().includes(termo) || m.classe.toLowerCase().includes(termo);
      const bateCategoria = !categoria || m.categoria === categoria;
      return bateTermo && bateCategoria;
    });
    renderBulario(filtrados);
  }

  function initBularioFiltros() {
    $("#filtro-bulario").addEventListener("input", aplicarFiltrosBulario);
    $("#filtro-categoria").addEventListener("change", aplicarFiltrosBulario);
  }

  // ---------------------------------------------------------------------
  // Aba: Medicamentos do Hospital (classificação e controle)
  // ---------------------------------------------------------------------
  const FILTROS_HOSPITAL_ATIVOS = new Set();

  function flagIcone(valor) {
    return valor ? '<span class="flag-sim" title="Sim">✓</span>' : '<span class="flag-nao" title="Não">–</span>';
  }

  function renderStatsHospital(lista) {
    const total = lista.length;
    const contar = (campo) => lista.filter((m) => m[campo]).length;
    const stats = [
      { label: "Total no formulário", valor: total },
      { label: "Disponíveis", valor: contar("disponivel") },
      { label: "Uso controlado", valor: contar("uso_controlado") },
      { label: "Portaria 344", valor: contar("portaria_344") },
      { label: "Requerem dose unitária", valor: contar("requer_dose_unitaria") },
      { label: "Farmacêutico define frascos", valor: contar("farmaceutico_define_frascos") },
      { label: "Uso coletivo", valor: contar("uso_coletivo") },
    ];
    $("#stats-hospital").innerHTML = stats
      .map((s) => `<div class="stat-card"><span class="stat-numero">${s.valor}</span><span class="stat-label">${s.label}</span></div>`)
      .join("");
  }

  function renderTabelaHospital(lista) {
    const corpo = $("#tabela-hospital-corpo");
    const contador = $("#contador-hospital");
    contador.textContent = `${lista.length} medicamento(s) encontrado(s) de ${MEDICAMENTOS.length} no formulário do ICAM.`;

    if (lista.length === 0) {
      corpo.innerHTML = `<tr><td colspan="8" class="empty-state">Nenhum medicamento encontrado com esses filtros.</td></tr>`;
      return;
    }

    corpo.innerHTML = lista
      .map((m) => {
        const portariaSub = m.portaria_344 && m.portaria_344_lista ? `<span class="subtexto">${m.portaria_344_lista}</span>` : "";
        return `
        <tr>
          <td>${m.nome}<span class="subtexto">${m.classe}</span></td>
          <td>${m.categoria}</td>
          <td>${flagIcone(m.disponivel)}</td>
          <td>${flagIcone(m.uso_controlado)}</td>
          <td>${flagIcone(m.portaria_344)}${portariaSub}</td>
          <td>${flagIcone(m.requer_dose_unitaria)}</td>
          <td>${flagIcone(m.farmaceutico_define_frascos)}</td>
          <td>${flagIcone(m.uso_coletivo)}</td>
        </tr>`;
      })
      .join("");
  }

  function aplicarFiltrosHospital() {
    const termo = $("#filtro-hospital").value.toLowerCase();
    const categoria = $("#filtro-categoria-hospital").value;
    const filtrados = MEDICAMENTOS.filter((m) => {
      const bateTermo = !termo || m.nome.toLowerCase().includes(termo) || m.classe.toLowerCase().includes(termo);
      const bateCategoria = !categoria || m.categoria === categoria;
      const bateFlags = [...FILTROS_HOSPITAL_ATIVOS].every((campo) => m[campo]);
      return bateTermo && bateCategoria && bateFlags;
    });
    renderTabelaHospital(filtrados);
  }

  function initHospitalFiltros() {
    $("#filtro-hospital").addEventListener("input", aplicarFiltrosHospital);
    $("#filtro-categoria-hospital").addEventListener("change", aplicarFiltrosHospital);

    $$(".toggle-chip", $("#toggle-filtros-hospital")).forEach((chip) => {
      chip.addEventListener("click", () => {
        const campo = chip.dataset.filtro;
        if (FILTROS_HOSPITAL_ATIVOS.has(campo)) {
          FILTROS_HOSPITAL_ATIVOS.delete(campo);
          chip.classList.remove("active");
        } else {
          FILTROS_HOSPITAL_ATIVOS.add(campo);
          chip.classList.add("active");
        }
        aplicarFiltrosHospital();
      });
    });

    $("#btn-limpar-filtros-hospital").addEventListener("click", () => {
      FILTROS_HOSPITAL_ATIVOS.clear();
      $$(".toggle-chip", $("#toggle-filtros-hospital")).forEach((chip) => chip.classList.remove("active"));
      $("#filtro-hospital").value = "";
      $("#filtro-categoria-hospital").value = "";
      aplicarFiltrosHospital();
    });
  }

  // ---------------------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", async () => {
    initTabs();
    initBularioFiltros();
    initHospitalFiltros();

    try {
      await carregarDados();
    } catch (e) {
      $("#lista-bulario").innerHTML = `<p class="error-text">Não foi possível carregar os dados: ${e.message}. Verifique se o site está sendo servido por um servidor HTTP (não abra o arquivo index.html diretamente).</p>`;
      return;
    }

    criarItemPrescricao();
    $("#btn-add-item").addEventListener("click", criarItemPrescricao);
    $("#btn-avaliar").addEventListener("click", avaliarPrescricao);
    $("#btn-calcular-dose").addEventListener("click", calcularDose);
    $("#btn-calcular-frascos").addEventListener("click", calcularFrascos);
    $("#btn-calcular-unitaria").addEventListener("click", calcularDoseUnitaria);
  });
})();
