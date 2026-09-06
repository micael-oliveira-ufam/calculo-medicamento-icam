import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import calculos


def test_calcular_dose_basico():
    r = calculos.calcular_dose(peso_kg=10, dose_mg_kg=10, doses_por_dia=3)
    assert r.dose_por_administracao_mg == 100
    assert r.dose_diaria_total_mg == 300
    assert r.dose_mg_kg_dia == 30


def test_calcular_dose_peso_invalido():
    with pytest.raises(ValueError):
        calculos.calcular_dose(peso_kg=0, dose_mg_kg=10, doses_por_dia=1)


def test_calcular_dose_doses_dia_invalido():
    with pytest.raises(ValueError):
        calculos.calcular_dose(peso_kg=10, dose_mg_kg=10, doses_por_dia=0)


def test_avaliar_dose_dentro_da_faixa():
    medicamento = {
        "dose_min_mg_kg_dose": 10,
        "dose_max_mg_kg_dose": 15,
        "dose_max_dia_mg_kg": 75,
        "dose_max_absoluta_mg_dia": 4000,
    }
    avaliacao = calculos.avaliar_dose_prescrita(medicamento, peso_kg=10, dose_prescrita_mg=120, doses_por_dia=4)
    assert avaliacao.status == "adequada"
    assert avaliacao.dose_mg_kg_dose == 12
    assert not avaliacao.excede_dose_maxima_dia
    assert not avaliacao.excede_dose_maxima_absoluta


def test_avaliar_dose_abaixo_da_faixa():
    medicamento = {"dose_min_mg_kg_dose": 10, "dose_max_mg_kg_dose": 15}
    avaliacao = calculos.avaliar_dose_prescrita(medicamento, peso_kg=10, dose_prescrita_mg=50, doses_por_dia=1)
    assert avaliacao.status == "abaixo"


def test_avaliar_dose_acima_da_faixa():
    medicamento = {"dose_min_mg_kg_dose": 10, "dose_max_mg_kg_dose": 15}
    avaliacao = calculos.avaliar_dose_prescrita(medicamento, peso_kg=10, dose_prescrita_mg=200, doses_por_dia=1)
    assert avaliacao.status == "acima"


def test_avaliar_dose_excede_maximo_diario():
    medicamento = {
        "dose_min_mg_kg_dose": 10,
        "dose_max_mg_kg_dose": 15,
        "dose_max_dia_mg_kg": 40,
    }
    avaliacao = calculos.avaliar_dose_prescrita(medicamento, peso_kg=10, dose_prescrita_mg=120, doses_por_dia=4)
    assert avaliacao.excede_dose_maxima_dia is True
    assert "excede o máximo" in avaliacao.mensagem


def test_avaliar_dose_excede_maximo_absoluto():
    medicamento = {
        "dose_min_mg_kg_dose": 10,
        "dose_max_mg_kg_dose": 15,
        "dose_max_absoluta_mg_dia": 500,
    }
    avaliacao = calculos.avaliar_dose_prescrita(medicamento, peso_kg=10, dose_prescrita_mg=120, doses_por_dia=5)
    assert avaliacao.excede_dose_maxima_absoluta is True


def test_avaliar_dose_sem_referencia():
    medicamento = {}
    avaliacao = calculos.avaliar_dose_prescrita(medicamento, peso_kg=10, dose_prescrita_mg=100, doses_por_dia=1)
    assert avaliacao.status == "sem_referencia"


def test_calcular_dose_unitaria_ml():
    r = calculos.calcular_dose_unitaria(dose_mg=250, concentracao=50, unidade_concentracao="mg/mL")
    assert r.quantidade == 5
    assert r.unidade == "mL"


def test_calcular_dose_unitaria_comprimido():
    r = calculos.calcular_dose_unitaria(dose_mg=250, concentracao=500, unidade_concentracao="mg/comprimido")
    assert r.quantidade == 0.5
    assert r.unidade == "comprimido"


def test_calcular_dose_unitaria_concentracao_invalida():
    with pytest.raises(ValueError):
        calculos.calcular_dose_unitaria(dose_mg=100, concentracao=0, unidade_concentracao="mg/mL")


def test_calcular_numero_frascos_exato():
    r = calculos.calcular_numero_frascos(dose_total=1000, quantidade_por_frasco=500)
    assert r.numero_frascos == 2
    assert r.sobra == 0


def test_calcular_numero_frascos_com_sobra():
    r = calculos.calcular_numero_frascos(dose_total=750, quantidade_por_frasco=500)
    assert r.numero_frascos == 2
    assert r.quantidade_total_disponivel == 1000
    assert r.sobra == 250


def test_calcular_numero_frascos_fracao_pequena():
    # Garante que arredondamento de ponto flutuante não gere frasco extra desnecessário.
    r = calculos.calcular_numero_frascos(dose_total=1.0, quantidade_por_frasco=0.5)
    assert r.numero_frascos == 2
    assert math.isclose(r.sobra, 0)


def test_calcular_numero_frascos_invalido():
    with pytest.raises(ValueError):
        calculos.calcular_numero_frascos(dose_total=100, quantidade_por_frasco=0)


def test_verificar_interacoes_encontra_par():
    medicamentos_db = calculos.carregar_medicamentos()
    interacoes_db = calculos.carregar_interacoes()
    resultado = calculos.verificar_interacoes(["gentamicina", "vancomicina"], medicamentos_db, interacoes_db)
    assert len(resultado) == 1
    assert resultado[0].gravidade == "grave"


def test_verificar_interacoes_sem_par():
    medicamentos_db = calculos.carregar_medicamentos()
    interacoes_db = calculos.carregar_interacoes()
    resultado = calculos.verificar_interacoes(["paracetamol", "amoxicilina_comp"], medicamentos_db, interacoes_db)
    assert resultado == []


def test_verificar_interacoes_multiplos_pares_ordenados_por_gravidade():
    medicamentos_db = calculos.carregar_medicamentos()
    interacoes_db = calculos.carregar_interacoes()
    resultado = calculos.verificar_interacoes(
        ["midazolam", "morfina", "ibuprofeno_comp", "prednisolona_susp"], medicamentos_db, interacoes_db
    )
    assert len(resultado) == 2
    assert resultado[0].gravidade == "grave"
    assert resultado[1].gravidade == "moderada"


def test_carregar_medicamentos_ids_unicos():
    medicamentos_db = calculos.carregar_medicamentos()
    assert len(medicamentos_db) > 0
    for medicamento_id, medicamento in medicamentos_db.items():
        assert medicamento["id"] == medicamento_id


def test_interacoes_referenciam_medicamentos_existentes():
    medicamentos_db = calculos.carregar_medicamentos()
    interacoes_db = calculos.carregar_interacoes()
    for interacao in interacoes_db:
        for med_id in interacao["medicamentos"]:
            assert med_id in medicamentos_db, f"Interação referencia medicamento inexistente: {med_id}"


CAMPOS_CLASSIFICACAO_HOSPITAL = [
    "disponivel",
    "uso_controlado",
    "portaria_344",
    "portaria_344_lista",
    "requer_dose_unitaria",
    "farmaceutico_define_frascos",
    "uso_coletivo",
]


def test_medicamentos_tem_campos_de_classificacao_hospitalar():
    medicamentos_db = calculos.carregar_medicamentos()
    for medicamento_id, medicamento in medicamentos_db.items():
        for campo in CAMPOS_CLASSIFICACAO_HOSPITAL:
            assert campo in medicamento, f"{medicamento_id} não possui o campo '{campo}'"


def test_farmaceutico_define_frascos_implica_portaria_344_e_dose_unitaria():
    medicamentos_db = calculos.carregar_medicamentos()
    for medicamento_id, medicamento in medicamentos_db.items():
        if medicamento["farmaceutico_define_frascos"]:
            assert medicamento["portaria_344"], f"{medicamento_id}: define_frascos sem portaria_344"
            assert medicamento["requer_dose_unitaria"], f"{medicamento_id}: define_frascos sem requer_dose_unitaria"


def test_portaria_344_tem_lista_preenchida():
    medicamentos_db = calculos.carregar_medicamentos()
    for medicamento_id, medicamento in medicamentos_db.items():
        if medicamento["portaria_344"]:
            assert medicamento["portaria_344_lista"], f"{medicamento_id}: portaria_344 sem lista especificada"
        else:
            assert medicamento["portaria_344_lista"] is None


def test_medicamentos_portaria_344_pertencem_a_categoria_controlada():
    medicamentos_db = calculos.carregar_medicamentos()
    for medicamento_id, medicamento in medicamentos_db.items():
        if medicamento["portaria_344"]:
            assert medicamento["uso_controlado"], (
                f"{medicamento_id}: consta na Portaria 344 mas não está marcado como uso_controlado"
            )
