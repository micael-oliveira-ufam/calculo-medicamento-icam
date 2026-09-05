# Cálculo de Medicamentos — ICAM

Ferramenta web para apoio à farmácia clínica pediátrica do ICAM (Instituto da
Criança e do Adolescente do Amazonas). Permite:

- **Avaliar prescrições**: para cada medicamento prescrito, calcula a dose em
  mg/kg/dose e mg/kg/dia e classifica como abaixo, dentro ou acima da faixa
  terapêutica de referência, além de sinalizar quando a dose máxima diária ou
  a dose máxima absoluta são ultrapassadas.
- **Verificar interações medicamentosas**: compara todos os pares de
  medicamentos de uma prescrição contra uma base de interações conhecidas,
  classificadas por gravidade (leve, moderada, grave).
- **Calcular doses**: a partir do peso do paciente e da dose em mg/kg,
  calcula a dose por administração e a dose diária total.
- **Calcular frascos/ampolas**: determina quantos frascos ou ampolas inteiros
  são necessários para atender a uma dose/volume total, incluindo a sobra.
- **Calcular dose unitária**: converte uma dose prescrita (mg) na quantidade
  correspondente de uma apresentação (mL, comprimidos, etc.), útil para
  fracionamento.
- **Bulário interno**: consulta rápida da base de medicamentos cadastrados,
  com faixas de dose, intervalos, apresentações e observações.

> ⚠️ **Aviso importante**: esta ferramenta é um apoio à decisão clínica. As
> faixas de dose e a base de interações são referências gerais e **devem
> sempre ser confrontadas** com o protocolo institucional vigente, a bula
> atualizada dos medicamentos e o julgamento clínico do prescritor/farmacêutico
> responsável antes de qualquer decisão terapêutica. A base de dados de
> medicamentos e interações (`data/medicamentos.json` e
> `data/interacoes.json`) deve ser revisada e validada pela farmácia clínica
> da instituição antes do uso em ambiente de produção.

## Arquitetura

```
app.py                 Aplicação Flask (rotas web e API JSON)
calculos.py             Motor de cálculo puro em Python (testável isoladamente)
data/medicamentos.json  Base de medicamentos: doses de referência e apresentações
data/interacoes.json    Base de interações medicamentosas conhecidas
templates/index.html    Interface web (SPA simples com abas)
static/css/style.css    Estilos
static/js/app.js        Lógica do front-end (chamadas à API, renderização)
tests/test_calculos.py  Testes unitários do motor de cálculo
```

## Como executar

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

flask --app app run --debug
```

Acesse http://localhost:5000 no navegador.

## Como rodar os testes

```bash
pytest
```

## Extensão da base de dados

Para adicionar um novo medicamento, inclua um objeto em
`data/medicamentos.json` seguindo o mesmo formato dos existentes (id, nome,
classe, vias, apresentações, faixas de dose em mg/kg, intervalo posológico e
doses máximas). Para registrar uma nova interação, adicione um objeto em
`data/interacoes.json` com o par de `id`s dos medicamentos, a gravidade
(`leve`, `moderada` ou `grave`) e a descrição clínica da interação.

## API

| Método | Rota                         | Descrição                                   |
|--------|------------------------------|----------------------------------------------|
| GET    | `/api/medicamentos`          | Lista os medicamentos cadastrados            |
| POST   | `/api/calcular-dose`         | Calcula dose por peso                        |
| POST   | `/api/calcular-dose-unitaria`| Calcula quantidade (mL, comprimidos, etc.)   |
| POST   | `/api/calcular-frascos`      | Calcula número de frascos/ampolas necessários|
| POST   | `/api/avaliar-prescricao`    | Avalia uma prescrição completa (doses + interações) |

## Integração contínua

Todo push e pull request executam automaticamente a suíte de testes
(`pytest`) via GitHub Actions (`.github/workflows/tests.yml`), em Python 3.11
e 3.12.

## Contribuindo

Ao abrir um pull request, use o checklist do template padrão
(`.github/PULL_REQUEST_TEMPLATE.md`). Alterações em `data/medicamentos.json`
ou `data/interacoes.json` devem ser conferidas com a bula vigente ou o
protocolo institucional antes de serem mescladas. Para reportar um dado
clínico incorreto, abra uma issue usando o template "Correção de dado
clínico".

## Licença

Distribuído sob a licença MIT — veja o arquivo [LICENSE](LICENSE). Isso
significa que o código pode ser livremente reutilizado e adaptado, mas é
fornecido "como está", sem garantias; a instituição que o utiliza é
responsável por validar clinicamente os dados antes de qualquer uso em
produção (veja o aviso no início deste documento).
