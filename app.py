"""Aplicação web para avaliação de prescrições e cálculo de doses
pediátricas — ICAM (Instituto da Criança e do Adolescente do Amazonas).

Executar com: flask --app app run --debug
"""
from dataclasses import asdict

from flask import Flask, jsonify, render_template, request

import calculos

app = Flask(__name__)

MEDICAMENTOS = calculos.carregar_medicamentos()
INTERACOES = calculos.carregar_interacoes()


def _lista_medicamentos_resumo():
    return [
        {
            "id": m["id"],
            "nome": m["nome"],
            "classe": m["classe"],
            "vias": m["vias"],
            "apresentacoes": m["apresentacoes"],
            "dose_min_mg_kg_dose": m.get("dose_min_mg_kg_dose"),
            "dose_max_mg_kg_dose": m.get("dose_max_mg_kg_dose"),
            "intervalo_horas_min": m.get("intervalo_horas_min"),
            "intervalo_horas_max": m.get("intervalo_horas_max"),
            "dose_max_dia_mg_kg": m.get("dose_max_dia_mg_kg"),
            "dose_max_absoluta_mg_dia": m.get("dose_max_absoluta_mg_dia"),
            "observacoes": m.get("observacoes", ""),
        }
        for m in MEDICAMENTOS.values()
    ]


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/medicamentos")
def api_medicamentos():
    return jsonify(_lista_medicamentos_resumo())


@app.route("/api/calcular-dose", methods=["POST"])
def api_calcular_dose():
    dados = request.get_json(force=True)
    try:
        peso_kg = float(dados["peso_kg"])
        dose_mg_kg = float(dados["dose_mg_kg"])
        doses_por_dia = float(dados["doses_por_dia"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"erro": "Parâmetros inválidos. Informe peso_kg, dose_mg_kg e doses_por_dia."}), 400

    try:
        resultado = calculos.calcular_dose(peso_kg, dose_mg_kg, doses_por_dia)
    except ValueError as e:
        return jsonify({"erro": str(e)}), 400

    return jsonify(asdict(resultado))


@app.route("/api/calcular-dose-unitaria", methods=["POST"])
def api_calcular_dose_unitaria():
    dados = request.get_json(force=True)
    try:
        dose_mg = float(dados["dose_mg"])
        concentracao = float(dados["concentracao"])
        unidade_concentracao = str(dados["unidade_concentracao"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"erro": "Parâmetros inválidos. Informe dose_mg, concentracao e unidade_concentracao."}), 400

    try:
        resultado = calculos.calcular_dose_unitaria(dose_mg, concentracao, unidade_concentracao)
    except ValueError as e:
        return jsonify({"erro": str(e)}), 400

    return jsonify(asdict(resultado))


@app.route("/api/calcular-frascos", methods=["POST"])
def api_calcular_frascos():
    dados = request.get_json(force=True)
    try:
        dose_total = float(dados["dose_total"])
        quantidade_por_frasco = float(dados["quantidade_por_frasco"])
        unidade = str(dados.get("unidade", "mg"))
    except (KeyError, TypeError, ValueError):
        return jsonify({"erro": "Parâmetros inválidos. Informe dose_total e quantidade_por_frasco."}), 400

    try:
        resultado = calculos.calcular_numero_frascos(dose_total, quantidade_por_frasco, unidade)
    except ValueError as e:
        return jsonify({"erro": str(e)}), 400

    return jsonify(asdict(resultado))


@app.route("/api/avaliar-prescricao", methods=["POST"])
def api_avaliar_prescricao():
    """Avalia uma prescrição completa: para cada item, calcula e classifica
    a dose; ao final, verifica interações entre todos os medicamentos.

    Corpo esperado:
    {
      "peso_kg": 12.5,
      "itens": [
        {
          "medicamento_id": "amoxicilina",
          "dose_prescrita_mg": 300,
          "doses_por_dia": 3,
          "apresentacao_index": 0
        },
        ...
      ]
    }
    """
    dados = request.get_json(force=True)
    try:
        peso_kg = float(dados["peso_kg"])
        itens = dados["itens"]
        if not isinstance(itens, list) or not itens:
            raise ValueError
    except (KeyError, TypeError, ValueError):
        return jsonify({"erro": "Parâmetros inválidos. Informe peso_kg e uma lista de itens."}), 400

    if peso_kg <= 0:
        return jsonify({"erro": "Peso deve ser maior que zero."}), 400

    resultados_itens = []
    ids_para_interacao = []

    for item in itens:
        medicamento_id = item.get("medicamento_id")
        medicamento = MEDICAMENTOS.get(medicamento_id)
        if not medicamento:
            resultados_itens.append({
                "medicamento_id": medicamento_id,
                "erro": "Medicamento não encontrado na base de dados.",
            })
            continue

        try:
            dose_prescrita_mg = float(item["dose_prescrita_mg"])
            doses_por_dia = float(item.get("doses_por_dia", 1))
        except (KeyError, TypeError, ValueError):
            resultados_itens.append({
                "medicamento_id": medicamento_id,
                "nome": medicamento["nome"],
                "erro": "dose_prescrita_mg e doses_por_dia são obrigatórios e numéricos.",
            })
            continue

        avaliacao = calculos.avaliar_dose_prescrita(medicamento, peso_kg, dose_prescrita_mg, doses_por_dia)

        item_resultado = {
            "medicamento_id": medicamento_id,
            "nome": medicamento["nome"],
            "avaliacao": asdict(avaliacao),
        }

        apresentacao_index = item.get("apresentacao_index")
        if apresentacao_index is not None and 0 <= apresentacao_index < len(medicamento["apresentacoes"]):
            apresentacao = medicamento["apresentacoes"][apresentacao_index]
            dose_unitaria = calculos.calcular_dose_unitaria(
                dose_prescrita_mg, apresentacao["concentracao"], apresentacao["unidade"]
            )
            item_resultado["apresentacao"] = apresentacao
            item_resultado["dose_unitaria"] = asdict(dose_unitaria)

        resultados_itens.append(item_resultado)
        ids_para_interacao.append(medicamento_id)

    interacoes = calculos.verificar_interacoes(ids_para_interacao, MEDICAMENTOS, INTERACOES)

    return jsonify({
        "peso_kg": peso_kg,
        "itens": resultados_itens,
        "interacoes": [asdict(i) for i in interacoes],
    })


if __name__ == "__main__":
    app.run(debug=True)
