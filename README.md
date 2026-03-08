# TermoTV

TermoTV e um jogo diario de palavras inspirado em Termo/Wordle, feito para rodar em TVs LG com webOS e navegacao por controle remoto.

O projeto e um app web empacotado para webOS TV. Ele roda offline, gera as palavras do dia de forma deterministica e oferece variantes de jogo para 5 e 6 letras.

## Funcionalidades

- Modos `Termo`, `Dueto` e `Quarteto`
- Variantes com palavras de `5` e `6` letras
- Selecao diaria offline e deterministica
- Navegacao otimizada para controle remoto da TV
- Teclado virtual adaptado para os modos com varias grades
- Estatisticas por modo
- Compartilhamento do resultado em texto/emoji
- Persistencia local de progresso e configuracoes
- Testes unitarios para a logica principal

## Estrutura

```text
termo_tv/
  data/
    five-letters.json
    six-letters.json
  scripts/
    dev-server.mjs
    build_dictionary_weights.py
  src/
    core/
    ui/
  tests/
    run-tests.mjs
  appinfo.json
  index.html
  package.json
```

## Requisitos

- Node.js
- webOS TV CLI da LG para empacotar/instalar na TV

## Rodar localmente

```bash
node scripts/dev-server.mjs
```

Depois abra o endereco mostrado no terminal, por exemplo:

```text
http://127.0.0.1:4173/
```

## Testes

```bash
node tests/run-tests.mjs
```

## Empacotar para webOS

```bash
ares-package .
```

Isso gera um arquivo `.ipk`.

## Instalar na TV

Depois de configurar o device no webOS CLI:

```bash
ares-install -d <device> termo_tv_*.ipk
ares-launch -d <device> com.domain.app
```

## Configuracao do app webOS

O arquivo `appinfo.json` define os metadados do app.

No estado atual:

- `id`: `com.domain.app`
- `title`: `TermoTV`
- `version`: `2.0.0`

Antes de publicar/distribuir, vale ajustar:

- `id`
- `vendor`
- icones e branding final

## Listas de palavras

As listas do jogo ficam em:

- `data/five-letters.json`
- `data/six-letters.json`

Regras praticas:

- cada item deve normalizar para o tamanho correto
- acentos podem existir no arquivo
- a validacao compara a forma normalizada

## Como o jogo escolhe as palavras

- a selecao e diaria
- a selecao e deterministica
- funciona offline
- as palavras do dia sao distribuidas entre os modos sem depender de backend

## Persistencia local

O app salva localmente:

- progresso da partida atual
- estatisticas
- configuracoes de uso

## UI e jogabilidade

O projeto foi desenhado para TV e controle remoto, com foco em:

- navegacao por foco
- legibilidade em tela grande
- grades adaptadas para `Termo`, `Dueto` e `Quarteto`
- preview de boards nos modos com mais de uma grade

## Scripts

Em `package.json`:

- `npm run dev`: sobe o servidor local
- `npm test`: executa a suite de testes

## Build artifacts

Arquivos `.ipk` sao artefatos de empacotamento e ficam fora do versionamento pelo `.gitignore`.

## Licencas de terceiros

- `webOSTVjs-1.2.10/`: biblioteca de suporte ao webOS TV
- o repositorio pode incluir outros arquivos de terceiros necessarios ao funcionamento do app

## Objetivo do projeto

Entregar uma experiencia estilo Termo/Wordle em webOS com:

- boa usabilidade em TV
- suporte a multiplos modos
- operacao offline
- base simples de manter e evoluir
