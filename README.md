# Cálculo de Medicamentos — ICAM

Ferramenta web **estática** (HTML + CSS + JavaScript, sem backend) para
apoio à farmácia clínica pediátrica do ICAM (Instituto da Criança e do
Adolescente do Amazonas). Cobre os medicamentos do formulário padronizado
do ICAM (pedido semanal da Farmácia CAF) e permite:

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
- **Bulário do ICAM**: consulta e filtro (por nome, classe ou categoria) de
  todos os ~200 itens do formulário — injetáveis, comprimidos, suspensões,
  gotas, xaropes, tópicos, inalatórios, oftálmicos, eletrólitos, termolábeis,
  antimicrobianos de reserva e controlados.
- **Medicamentos do Hospital**: painel de classificação operacional de todos
  os itens do formulário — disponibilidade, uso controlado, enquadramento na
  Portaria SVS/MS n° 344/98 (com a lista/anexo), necessidade de cálculo de
  dose unitária, itens em que o farmacêutico deve definir a quantidade de
  frascos/ampolas liberada, e itens de uso coletivo (estoque comum) — com
  filtros combináveis e contadores por classificação.

> ⚠️ **Aviso importante**: esta ferramenta é um apoio à decisão clínica. As
> faixas de dose foram preenchidas com base em literatura pediátrica padrão
> (no mesmo espírito das fichas técnicas de guias farmacêuticos hospitalares,
> como o do Hospital Sírio-Libanês) e a base de interações cobre as
> combinações clinicamente mais relevantes entre os itens do formulário do
> ICAM — nenhuma das duas é exaustiva. Os valores **devem sempre ser
> confrontados** com o protocolo institucional vigente, a bula atualizada dos
> medicamentos e o julgamento clínico do prescritor/farmacêutico responsável
> antes de qualquer decisão terapêutica. A base de dados
> (`data/medicamentos.json` e `data/interacoes.json`) deve ser revisada e
> validada pela farmácia clínica da instituição antes do uso em produção.

## Arquitetura

O site é 100% estático: não depende de Python, Flask ou qualquer servidor de
aplicação — apenas arquivos HTML/CSS/JS/JSON, que podem ser hospedados em
qualquer servidor web comum (Apache, Nginx, GitHub Pages, Netlify, etc.).

```
index.html                  Página única da aplicação (todas as abas)
static/css/style.css        Estilos (tema pediátrico)
static/img/logo.svg         Logo (usada como favicon e no cabeçalho/rodapé)
static/js/calculos.js       Motor de cálculo em JavaScript (roda no navegador)
static/js/app.js            Lógica de interface (abas, formulários, filtros)
data/medicamentos.json      Base de medicamentos do ICAM (doses, apresentações)
data/interacoes.json        Base de interações medicamentosas conhecidas

calculos.py                 Motor de cálculo em Python — referência/validação
scripts/gerar_dados.py      Fonte editável de data/medicamentos.json
tests/test_calculos.py      Testes do motor Python + integridade dos dados
tests/test_calculos.js      Testes do motor JavaScript (paridade com o Python)
```

`calculos.py` e seus testes **não são usados pelo site publicado** — servem
como especificação de referência e ferramenta de validação de dados (rodada
no CI). O que roda de fato no navegador é `static/js/calculos.js`, mantido
deliberadamente espelhado à versão Python; `tests/test_calculos.js` verifica
essa paridade nos casos principais.

## Como executar localmente

Como é um site estático, qualquer servidor HTTP simples funciona (o
carregamento dos arquivos `data/*.json` via `fetch()` exige HTTP — não abra
`index.html` diretamente pelo navegador com `file://`):

```bash
python3 -m http.server 8000
# ou: npx serve .
```

Acesse http://localhost:8000 no navegador.

## Como colocar em um servidor

Basta copiar todo o conteúdo do repositório (ou pelo menos `index.html`,
`static/` e `data/`) para a raiz pública de qualquer servidor web:

- **Apache/Nginx**: copiar os arquivos para o `document root` do site.
- **GitHub Pages**: ativar Pages apontando para a branch/pasta do repositório.
- **Netlify/Vercel/Cloudflare Pages**: publish directory = raiz do projeto,
  sem etapa de build.

Não há variáveis de ambiente, banco de dados ou build step — é copiar e
servir.

## Como editar a base de medicamentos

A forma recomendada é editar `scripts/gerar_dados.py` (lista `MEDICAMENTOS`,
com comentários explicando cada campo) e rodar:

```bash
python3 scripts/gerar_dados.py
```

Isso regrava `data/medicamentos.json`. Para registrar uma nova interação,
adicione um objeto em `data/interacoes.json` com o par de `id`s dos
medicamentos, a gravidade (`leve`, `moderada` ou `grave`) e a descrição
clínica da interação.

### Classificação usada no painel "Medicamentos do Hospital"

A maior parte dos campos de classificação (`disponivel`, `uso_controlado`,
`requer_dose_unitaria`, `farmaceutico_define_frascos`) é **derivada
automaticamente** pela função `classificar()` em `scripts/gerar_dados.py`,
a partir da categoria e das apresentações de cada item — não precisa ser
editada manualmente. Os dois campos que dependem de conhecimento
regulatório/institucional específico são mantidos como dicionários no topo
do script e devem ser atualizados diretamente pela farmácia:

- `PORTARIA_344`: mapeia o `id` do medicamento à lista/anexo da Portaria
  SVS/MS n° 344/98 (ex.: `"A1"`, `"B1"`, `"C1"`). Itens marcados
  "(verificar...)" indicam classificação sujeita a confirmação.
- `USO_COLETIVO_IDS`: ids de itens mantidos como estoque comum/de posto
  (não individualizados por paciente), além de tudo que já está na
  categoria "Eletrólitos".

Depois de editar qualquer um dos dois, rode `python3 scripts/gerar_dados.py`
novamente para regravar `data/medicamentos.json`.

## Como rodar os testes

```bash
# testes do motor de referência em Python + integridade dos dados
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest

# testes do motor client-side em JavaScript (Node.js, sem dependências)
node tests/test_calculos.js
```

## Integração contínua

Todo push e pull request executam automaticamente, via GitHub Actions
(`.github/workflows/tests.yml`): a suíte `pytest` (Python 3.11 e 3.12) e os
testes do motor JavaScript (Node.js).

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
