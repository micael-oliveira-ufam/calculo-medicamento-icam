"""Motor de cálculos para avaliação de prescrições pediátricas.

Contém funções puras (sem dependência do Flask) para:
- cálculo de dose por peso;
- avaliação da dose prescrita frente à faixa terapêutica de referência;
- cálculo de volume/quantidade a administrar;
- cálculo do número de frascos/ampolas necessários;
- cálculo de dose unitária (fracionamento de uma apresentação);
- verificação de interações medicamentosas entre os itens de uma prescrição.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from itertools import combinations
from pathlib import Path
from typing import Optional

DATA_DIR = Path(__file__).parent / "data"


def carregar_medicamentos() -> dict:
    with open(DATA_DIR / "medicamentos.json", encoding="utf-8") as f:
        lista = json.load(f)
    return {m["id"]: m for m in lista}


def carregar_interacoes() -> list:
    with open(DATA_DIR / "interacoes.json", encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Cálculo de dose
# ---------------------------------------------------------------------------

@dataclass
class ResultadoDose:
    dose_por_administracao_mg: float
    dose_diaria_total_mg: float
    dose_mg_kg_dose: float
    dose_mg_kg_dia: float


def calcular_dose(peso_kg: float, dose_mg_kg: float, doses_por_dia: float) -> ResultadoDose:
    """Calcula a dose (em mg) por administração e a dose diária total.

    peso_kg: peso do paciente em kg
    dose_mg_kg: dose prescrita, em mg/kg, por administração
    doses_por_dia: número de administrações por dia (ex.: intervalo de 8h -> 3x/dia)
    """
    if peso_kg <= 0:
        raise ValueError("Peso deve ser maior que zero.")
    if dose_mg_kg < 0:
        raise ValueError("Dose mg/kg não pode ser negativa.")
    if doses_por_dia <= 0:
        raise ValueError("Número de doses por dia deve ser maior que zero.")

    dose_por_administracao = peso_kg * dose_mg_kg
    dose_diaria_total = dose_por_administracao * doses_por_dia
    dose_mg_kg_dia = dose_mg_kg * doses_por_dia

    return ResultadoDose(
        dose_por_administracao_mg=round(dose_por_administracao, 3),
        dose_diaria_total_mg=round(dose_diaria_total, 3),
        dose_mg_kg_dose=round(dose_mg_kg, 3),
        dose_mg_kg_dia=round(dose_mg_kg_dia, 3),
    )


# ---------------------------------------------------------------------------
# Avaliação da dose frente à faixa de referência
# ---------------------------------------------------------------------------

@dataclass
class AvaliacaoDose:
    status: str  # "abaixo" | "adequada" | "acima" | "sem_referencia"
    mensagem: str
    dose_mg_kg_dose: Optional[float] = None
    dose_mg_kg_dia: Optional[float] = None
    faixa_min_mg_kg_dose: Optional[float] = None
    faixa_max_mg_kg_dose: Optional[float] = None
    excede_dose_maxima_absoluta: bool = False
    excede_dose_maxima_dia: bool = False


def avaliar_dose_prescrita(
    medicamento: dict,
    peso_kg: float,
    dose_prescrita_mg: float,
    doses_por_dia: float,
) -> AvaliacaoDose:
    """Compara a dose prescrita (em mg, por administração) com a faixa de
    referência (mg/kg/dose) do medicamento, e verifica limites diários e
    dose máxima absoluta.
    """
    dose_mg_kg_dose = dose_prescrita_mg / peso_kg
    dose_mg_kg_dia = dose_mg_kg_dose * doses_por_dia
    dose_diaria_total_mg = dose_prescrita_mg * doses_por_dia

    faixa_min = medicamento.get("dose_min_mg_kg_dose")
    faixa_max = medicamento.get("dose_max_mg_kg_dose")
    dose_max_dia_mg_kg = medicamento.get("dose_max_dia_mg_kg")
    dose_max_absoluta = medicamento.get("dose_max_absoluta_mg_dia")

    excede_absoluta = bool(dose_max_absoluta) and dose_diaria_total_mg > dose_max_absoluta
    excede_dia_mg_kg = bool(dose_max_dia_mg_kg) and dose_mg_kg_dia > dose_max_dia_mg_kg

    if faixa_min is None or faixa_max is None:
        status = "sem_referencia"
        mensagem = "Não há faixa de referência cadastrada para este medicamento; avalie clinicamente."
    elif dose_mg_kg_dose < faixa_min:
        status = "abaixo"
        percentual = (dose_mg_kg_dose / faixa_min) * 100 if faixa_min else 0
        mensagem = (
            f"Dose abaixo da faixa recomendada ({faixa_min}-{faixa_max} mg/kg/dose). "
            f"Corresponde a {percentual:.0f}% do mínimo recomendado."
        )
    elif dose_mg_kg_dose > faixa_max:
        status = "acima"
        percentual = (dose_mg_kg_dose / faixa_max) * 100 if faixa_max else 0
        mensagem = (
            f"Dose ACIMA da faixa recomendada ({faixa_min}-{faixa_max} mg/kg/dose). "
            f"Corresponde a {percentual:.0f}% do máximo recomendado."
        )
    else:
        status = "adequada"
        mensagem = f"Dose dentro da faixa recomendada ({faixa_min}-{faixa_max} mg/kg/dose)."

    if excede_dia_mg_kg:
        mensagem += (
            f" ATENÇÃO: dose diária total ({dose_mg_kg_dia:.2f} mg/kg/dia) excede o máximo "
            f"diário recomendado ({dose_max_dia_mg_kg} mg/kg/dia)."
        )
    if excede_absoluta:
        mensagem += (
            f" ATENÇÃO: dose diária total ({dose_diaria_total_mg:.1f} mg/dia) excede a dose "
            f"máxima absoluta recomendada ({dose_max_absoluta} mg/dia)."
        )

    return AvaliacaoDose(
        status=status,
        mensagem=mensagem,
        dose_mg_kg_dose=round(dose_mg_kg_dose, 3),
        dose_mg_kg_dia=round(dose_mg_kg_dia, 3),
        faixa_min_mg_kg_dose=faixa_min,
        faixa_max_mg_kg_dose=faixa_max,
        excede_dose_maxima_absoluta=excede_absoluta,
        excede_dose_maxima_dia=excede_dia_mg_kg,
    )


# ---------------------------------------------------------------------------
# Cálculo de volume / quantidade a administrar (dose unitária)
# ---------------------------------------------------------------------------

@dataclass
class ResultadoDoseUnitaria:
    quantidade: float
    unidade: str
    mensagem: str


def calcular_dose_unitaria(dose_mg: float, concentracao: float, unidade_concentracao: str) -> ResultadoDoseUnitaria:
    """Calcula a quantidade (volume, comprimidos, etc.) correspondente à dose
    prescrita, a partir da concentração da apresentação.

    unidade_concentracao segue o padrão "mg/mL", "mg/comprimido", "mg/frasco", "UI/mL".
    """
    if concentracao <= 0:
        raise ValueError("Concentração deve ser maior que zero.")

    quantidade = dose_mg / concentracao
    unidade_destino = unidade_concentracao.split("/")[-1] if "/" in unidade_concentracao else "unidade(s)"

    return ResultadoDoseUnitaria(
        quantidade=round(quantidade, 3),
        unidade=unidade_destino,
        mensagem=f"Administrar {round(quantidade, 3)} {unidade_destino} para atingir {dose_mg} mg.",
    )


# ---------------------------------------------------------------------------
# Cálculo de número de frascos/ampolas
# ---------------------------------------------------------------------------

@dataclass
class ResultadoFrascos:
    numero_frascos: int
    quantidade_total_disponivel: float
    sobra: float
    unidade: str


def calcular_numero_frascos(dose_total: float, quantidade_por_frasco: float, unidade: str = "mg") -> ResultadoFrascos:
    """Calcula quantos frascos/ampolas inteiros são necessários para atender
    a uma dose (ou volume) total necessária, e a sobra resultante.

    dose_total: quantidade total necessária (mg, ou mL, conforme unidade)
    quantidade_por_frasco: quantidade contida em cada frasco/ampola, na mesma unidade
    """
    if quantidade_por_frasco <= 0:
        raise ValueError("Quantidade por frasco deve ser maior que zero.")
    if dose_total < 0:
        raise ValueError("Dose total não pode ser negativa.")

    numero_frascos = math.ceil(round(dose_total / quantidade_por_frasco, 6))
    numero_frascos = max(numero_frascos, 1) if dose_total > 0 else 0
    quantidade_disponivel = numero_frascos * quantidade_por_frasco
    sobra = round(quantidade_disponivel - dose_total, 3)

    return ResultadoFrascos(
        numero_frascos=numero_frascos,
        quantidade_total_disponivel=round(quantidade_disponivel, 3),
        sobra=sobra,
        unidade=unidade,
    )


# ---------------------------------------------------------------------------
# Verificação de interações medicamentosas
# ---------------------------------------------------------------------------

@dataclass
class InteracaoEncontrada:
    medicamento_a: str
    medicamento_b: str
    gravidade: str
    descricao: str


ORDEM_GRAVIDADE = {"grave": 3, "moderada": 2, "leve": 1}


def verificar_interacoes(ids_medicamentos: list, medicamentos_db: dict, interacoes_db: list) -> list:
    """Verifica todos os pares possíveis entre os medicamentos prescritos
    contra a base de interações conhecidas.
    """
    encontradas: list[InteracaoEncontrada] = []
    ids_unicos = list(dict.fromkeys(ids_medicamentos))

    mapa_interacoes = {}
    for interacao in interacoes_db:
        par = frozenset(interacao["medicamentos"])
        mapa_interacoes[par] = interacao

    for id_a, id_b in combinations(ids_unicos, 2):
        par = frozenset([id_a, id_b])
        interacao = mapa_interacoes.get(par)
        if interacao:
            nome_a = medicamentos_db.get(id_a, {}).get("nome", id_a)
            nome_b = medicamentos_db.get(id_b, {}).get("nome", id_b)
            encontradas.append(
                InteracaoEncontrada(
                    medicamento_a=nome_a,
                    medicamento_b=nome_b,
                    gravidade=interacao["gravidade"],
                    descricao=interacao["descricao"],
                )
            )

    encontradas.sort(key=lambda i: ORDEM_GRAVIDADE.get(i.gravidade, 0), reverse=True)
    return encontradas
