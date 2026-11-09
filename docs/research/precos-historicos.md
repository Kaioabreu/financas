# Fontes das séries do CDI/IPCA e dos preços históricos

Pesquisa para [De onde vêm as séries do CDI/IPCA e os preços históricos dos investimentos?](https://github.com/Kaioabreu/financas/issues/20).

Os dados servem para duas coisas decididas em [O que compõe o patrimônio e como se monta sua evolução?](https://github.com/Kaioabreu/financas/issues/10):

- estimar os retratos dos 12 meses antes da instalação;
- comparar a rentabilidade da carteira com o CDI.

Todos os endpoints foram chamados com `curl` em 09/11/2026. Os tickers e títulos dos exemplos são conhecidos e servem só de exemplo. Cada afirmação traz a fonte; o que não deu para conferir está marcado como **não verificado**.

## Resumo

| Item | Recomendação | Sem chave | Licença ou termos | Download para 12 meses |
|---|---|---|---|---|
| CDI e IPCA | SGS do Banco Central | Sim | ODbL | Poucos KB |
| Tesouro Direto | CSV do Tesouro Transparente | Sim | ODbL | ~1,2 MB (lendo em fluxo) |
| Ações, FII, ETF e BDR | Nenhuma fonte serve. Entra a custo no v1 | — | — | — |
| Fundos | Informe diário da CVM, casado pelo CNPJ | Sim | ODbL | ~135 MB |

Restrições usadas para julgar cada fonte:

- React Native/Expo, com `fetch` direto do celular;
- nenhuma chave ou segredo do autor no código, porque o repositório é público;
- custo zero;
- nenhum servidor do autor.

## 1. CDI e IPCA

### Fonte: SGS do Banco Central

O SGS (Sistema Gerenciador de Séries Temporais) é a API oficial do Banco Central. Nome, periodicidade e unidade de cada série vêm do próprio SGS, pelo método `getUltimoValorXML` do serviço `https://www3.bcb.gov.br/wssgs/services/FachadaWSSGS`.

| Código | Nome no SGS | Periodicidade | Unidade |
|---|---|---|---|
| 12 | Taxa de juros - CDI | Diária | % a.d. |
| 4389 | Taxa de juros - CDI anualizada base 252 | Diária | % a.a. |
| 4391 | Taxa de juros - CDI acumulada no mês | Mensal | % a.m. |
| 433 | Índice nacional de preços ao consumidor-amplo (IPCA) | Mensal | Var. % mensal |
| 7478 | Índice de Preços ao Consumidor-Amplo (IPCA) - 15 | Mensal | Var. % mensal |
| 13522 | Índice nacional de preços ao consumidor - amplo (IPCA) - em 12 meses | Mensal | % |

### Formato e exemplo

```
GET https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=01/11/2025&dataFinal=09/11/2026
```

Trecho da resposta real:

```json
[{"data":"04/11/2026","valor":"0.050788"},{"data":"05/11/2026","valor":"0.050788"},{"data":"06/11/2026","valor":"0.050788"}]
```

- A resposta é uma lista de `{data, valor}`. `data` vem em `dd/mm/aaaa`; `valor` é texto com ponto decimal.
- `formato=csv` devolve `"data";"valor"`, com `;` e vírgula decimal.
- As séries mensais vêm datadas no dia 1: `{"data":"01/09/2026","valor":"0.82"}` é o IPCA de setembro.
- **O IPCA não tem série diária.** A correção diária de um título atrelado ao IPCA sai do IPCA do mês, distribuído pelos dias.
- O mês corrente fica sem IPCA até o IBGE divulgar. Em 09/11/2026, a série 433 ia até setembro, e a 7478 (IPCA-15) já trazia outubro (0,32).

### Limites (testados)

- Uma série diária exige `dataInicial`. Sem ela, a API responde HTTP 406 com a mensagem "O sistema aceita uma janela de consulta de, no máximo, 10 anos em séries de periodicidade diária". Uma janela de 11 anos dá o mesmo erro.
- `/dados/ultimos/N` aceita até 20 valores. Com 25 ou 30, a API responde HTTP 400: "A quantidade máxima de valores deve ser 20".
- Séries mensais respondem sem datas: a 433 devolveu a série inteira.
- O BCB não publica limite de requisições por tempo (**não verificado**: não achei nada na documentação). Os 12 meses cabem em uma chamada por série.

### Termos

- O portal de dados abertos do BCB publica 4.260 dos 4.261 conjuntos sob a ODbL (faceta `license_id` da API CKAN do portal, consultada em 09/11/2026). O conjunto da série 27803, aberto um a um, e todos os conjuntos de IPCA listados pela busca também usam ODbL.
- A ODbL vale para a base de dados, não para o código. O app não redistribui a base: só consulta e mostra ao próprio usuário. Por isso ela não conflita com a MIT. Uma tela de créditos que cite "Banco Central do Brasil, SGS" cobre a atribuição. Isso é leitura minha da licença, não parecer jurídico.

### Estabilidade

- API oficial, sem chave e sem cadastro.
- **Quebra conhecida**: desde 26/03/2025, séries diárias exigem filtro de data, com janela máxima de 10 anos. O aviso está nas descrições dos conjuntos do portal: "A partir de 26 de março de 2025, para consultas que retornam informações nos formatos JSON e CSV de séries históricas diárias, o volume de dados retornados será limitado, tornando-se obrigatório o uso de filtros". Quem baixava a série inteira passou a receber erro. Os 12 meses do app ficam dentro do limite.
- `api.bcb.gov.br` respondeu ao User-Agent do `curl` e ao de `okhttp`, o cliente HTTP do Android. O portal `dadosabertos.bcb.gov.br` respondeu 403 ao User-Agent padrão do `curl`, mas o app não precisa do portal.

### O que a consulta revela

- O BCB recebe o IP, o User-Agent, o código da série e a janela de datas. A janela entrega, mais ou menos, a data de instalação.
- CDI e IPCA são iguais para todos: nada sobre a carteira.
- O cabeçalho `x-azure-ref` indica que a requisição passa pela Azure Front Door. A resposta grava cookies de balanceador e de WAF (`BIGipServer…`, `TS…`).

### Alternativa para o IPCA: IBGE/SIDRA

```
GET https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/63/p/last%203
```

Testada: responde JSON, com a primeira linha descrevendo as colunas. A variável 63 é "IPCA - Variação mensal". Termos de uso do SIDRA: **não verificado**, não achei a página oficial.

### Recomendação

Usar o SGS.

- **CDI diário**: série 12. Ela dá a rentabilidade do CDI em qualquer período.
- **CDI do mês**: série 4391, para conferir o cálculo.
- **IPCA**: série 433. Para o mês ainda sem IPCA, a 7478 (IPCA-15).

## 2. Tesouro Direto

### Fonte: Tesouro Transparente

O conjunto "Taxas dos Títulos Ofertados pelo Tesouro Direto" fica no CKAN do Tesouro Transparente, sob ODbL.

O app descobre a URL do arquivo pela API do CKAN:

```
GET https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=taxas-dos-titulos-ofertados-pelo-tesouro-direto
```

O recurso "Taxas dos Títulos Ofertados pelo Tesouro Direto" aponta hoje para:

```
https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv
```

### Formato e exemplo

CSV com `;`, codificação Latin-1, vírgula decimal e datas em `dd/mm/aaaa`. Cabeçalho e uma linha real:

```
Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha
Tesouro IPCA+;15/05/2035;06/11/2026;7,87;7,99;2515,93;2491,12;2491,12
```

- Segundo os metadados do conjunto (`taxa.pdf`), o `PU Base Manha` "é o preço do título, considerando a taxa de venda manhã, com liquidação para o mesmo dia (D0). Este PU valoriza os títulos para marcar a mercado os títulos adquiridos no Tesouro Direto". É o preço que o retrato usa.
- **Cobertura**: data base de 31/12/2004 a 06/11/2026, com 178.304 linhas. São 8 tipos de título, incluindo Educa+ e Renda+.
- **Atualização**: "Divulgação no primeiro dia útil após o fechamento do mercado secundário de títulos públicos federais" (metadados). Em 09/11/2026, uma segunda-feira, o arquivo gerado às 10:20 ia até 06/11, a sexta anterior.

### Limites e volume (testados)

- Não pede chave e não publica limite de uso.
- O arquivo inteiro tem 14,7 MB.
- O servidor não comprime: com `Accept-Encoding: gzip`, a resposta veio igual.
- O servidor ignora `Range`: responde 206, mas manda o arquivo inteiro.
- As linhas vêm da data mais nova para a mais velha, e os 12 meses ocupam os primeiros 1,18 MB. O `expo/fetch` lê o corpo em fluxo (`resp.body.getReader()`, na documentação do Expo), então o app pode parar de ler quando passar de 12 meses.
- A ordem do arquivo é observada, não documentada. O código precisa funcionar também se ela mudar.

### Como casar com o investimento do Pluggy

- O título do Tesouro chega com `type: FIXED_INCOME` e `subtype: TREASURY`.
- A chave no CSV é `Tipo Titulo` + `Data Vencimento`. O vencimento vem em `dueDate`.
- **O vencimento sozinho não basta.** No histórico, 24 vencimentos têm mais de um tipo. Exemplo: 15/05/2035 existe como "Tesouro IPCA+" e como "Tesouro IPCA+ com Juros Semestrais".
- O tipo sai do indexador, em `rateType` (`IPCA`, `SELIC` ou vazio para prefixado), e do cupom. O cupom pode vir em `couponPayment.hasCoupon`, campo opcional do SDK do Pluggy, ou no `name`.
- O CSV não tem ISIN, então o `isin` não ajuda aqui.
- **Não verificado**: como cada banco preenche `name`, `quantity` e `couponPayment` num título do Tesouro. Só os dados reais dizem.
- O `PU Base Manha` é valor bruto. O valor de resgate desconta IR, então a estimativa precisa se calibrar com o `amountWithdrawal` de hoje, como #10 já prevê.

### Estabilidade

- Fonte oficial do Tesouro Nacional.
- Os metadados avisam que "Os valores da série podem ser revistos em virtude de alterações da base de dados primária".
- A URL com maiúsculas (`.../download/PrecoTaxaTesouroDireto.csv`) também responde 200. Não achei histórico de quebra (**não verificado**).
- O JSON do site do Tesouro Direto, `https://www.tesourodireto.com.br/json/br/com/b3/tesourodireto/service/api/treasurybondsinfo.json`, responde hoje `410 gone`. Ele nunca foi documentado, e muitos projetos dependiam dele. Isso mostra o risco de usar endpoints não oficiais.

### O que a consulta revela

O app baixa o mesmo arquivo que todo mundo. O Tesouro vê o IP e o User-Agent, mas não sabe quais títulos o usuário tem.

### Recomendação

Usar o CSV do Tesouro Transparente:

- resolver a URL pelo `package_show`;
- ler em fluxo e parar ao passar de 12 meses;
- valor do mês = quantidade × `PU Base Manha` do último dia útil do mês, calibrado com a posição de hoje.

## 3. Ações, FII, ETF e BDR

### Candidatos

| Fonte | Funciona sem chave | 12 meses de graça | Termos permitem o app | Revela a carteira |
|---|---|---|---|---|
| B3, séries históricas (COTAHIST) | Sim | Sim | Não | Não |
| Yahoo Finance | Sim | Sim | Não | Sim |
| brapi.dev | Só 4 tickers | Não (até 3 meses) | Só com chave do usuário | Sim |
| Alpha Vantage | Não | B3 não verificada | Uso pessoal, com chave do usuário | Sim |
| ANBIMA | Não | — | Exige `client_secret` | — |

### B3: séries históricas (COTAHIST)

```
GET https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_D06112026.ZIP
```

- São os arquivos oficiais da B3 com o pregão inteiro, em versões anual, mensal e diária.
- O diário de 06/11/2026 tem 470 KB zipado e 15.759 linhas de largura fixa.
- Ele traz ações (BDI 02), FII (12), ETF (14) e BDR (34), com fechamento (`PREULT`), fator de cotação (`FATCOT`) e ISIN (`CODISI`). Exemplo lido do arquivo: PETR4, fechamento 45,36, ISIN `BRPETRACNPR6`.
- Os 12 diários do último pregão de cada mês somam uns 5 MB. Diários de 2024 ainda respondem. O mensal de outubro/2026 tem 10 MB; o anual de 2025, 89 MB.
- Os preços não têm ajuste: "sem nenhum ajuste para a inflação ou proventos" (página da B3). É o que o retrato precisa: a quantidade da época vezes o preço da época.
- **Termos**: a página das cotações históricas diz: "é expressamente vedada a coleta automatizada, inclusive por meio de ferramentas de inteligência artificial, para quaisquer finalidades, comerciais ou não, próprias ou de terceiros". Um app que baixa os arquivos sozinho faz coleta automatizada.
- Os Termos de Uso da B3 permitem usar os dados do site "para uso exclusivamente pessoal".
- **O que revela**: o app baixa o mercado inteiro, então a B3 não sabe quais tickers o usuário tem.

### Yahoo Finance

```
GET https://query1.finance.yahoo.com/v8/finance/chart/PETR4.SA?range=1y&interval=1mo
```

- O endpoint não é documentado.
- Testado: respondeu 200 com User-Agent de navegador e de `okhttp`, e 429 "Too Many Requests" com o User-Agent padrão do `curl`.
- **Termos**: os termos do Yahoo proíbem "access or collect data, or attempt to access or collect data, from our Services using any automated means" sem permissão prévia (seção 2(d)(9)). Também proíbem acesso "using a method other than the interface and the instructions that we provide" (2(e)).
- **Estabilidade**: o `yfinance`, cliente aberto mais usado, acumula issues de 429 e de quebras em 2025 e 2026: #2518, #2526, #2567, #2614, #2721, #2966.
- **O que revela**: o Yahoo recebe cada ticker da carteira, junto com o IP.

### brapi.dev

- Testado sem chave: `GET https://brapi.dev/api/quote/PETR4?range=1y&interval=1mo` responde; HGLG11 recebe 401 `MISSING_TOKEN`.
- Sem chave, só respondem PETR4, MGLU3, VALE3 e ITUB4, com limite de 20 requisições por minuto por IP (documentação de autenticação).
- O plano gratuito tem 15.000 requisições por mês, um ativo por requisição e histórico de "até 3 meses". Um ano de histórico exige o plano Startup, de R$ 119,99 por mês (página de preços, valores de 21/08/2026).
- **Termos**: "Nunca compartilhe sua chave de API publicamente ou a exponha no código do lado do cliente (frontend)". A documentação repete que a chave não deve ir para repositórios. Logo, a chave do autor não pode ir no app.
- **O que revela**: cada ticker, ligado à conta dona da chave.

### Alpha Vantage

- Exige chave. A chave `demo` só serve para os exemplos da documentação: testada com `PETR4.SAO`, devolve um aviso em vez de dados.
- O nível gratuito tem "25 API requests per day and unlimited API requests for verified open-source or educational projects" (página de suporte).
- **Termos**: a licença é para "personal, non-commercial use". Serviria se cada usuário criasse a própria chave.
- **Não verificado**: a cobertura de ações, FII e BDR brasileiros. A documentação não cita a B3 entre os exemplos de bolsas, e testar exige uma chave.
- **O que revela**: cada ticker, ligado ao e-mail da chave.

### ANBIMA

A API exige cadastro e um par `client_id`/`client_secret` trocado por token OAuth2. Fica de fora pela regra de nenhum segredo no app.

### Recomendação

Nenhuma fonte cumpre as três condições ao mesmo tempo: sem chave, grátis para 12 meses e com termos que permitem o uso. **No v1, a renda variável entra a custo nos retratos estimados**, como #10 já prevê.

Uma melhora sem fonte externa (sugestão, não testada):

- as operações de investimento trazem o preço de cada compra e venda (`value`);
- o investimento traz o preço de hoje (`value` e `date`);
- entre esses pontos, o app pode interpolar em vez de repetir o custo. Continua sendo estimativa.

Saídas para depois do v1, cada uma com seu custo:

- **COTAHIST importado à mão**: o usuário baixa os arquivos no site da B3, e o app só lê o arquivo escolhido. Isso fica mais perto de "uso exclusivamente pessoal" e longe de "coleta automatizada". É leitura minha dos termos, não parecer jurídico. O atrito para o usuário é alto.
- **Chave do próprio usuário na Alpha Vantage**, se a cobertura da B3 se confirmar. Cada usuário precisa se cadastrar, e o serviço passa a conhecer a carteira dele.

O Yahoo funciona hoje, mas viola os termos e quebra com frequência. Num repositório público, a violação fica registrada no código.

## 4. Fundos

### Fonte: informe diário da CVM

O conjunto "Fundos de Investimento: Documentos: Informe Diário" fica no portal de dados abertos da CVM, sob ODbL.

```
GET https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_202610.zip
```

### Formato

- Um zip por mês, com um CSV dentro: `;`, Latin-1, ponto decimal e datas em `AAAA-MM-DD`.
- Colunas atuais:

  ```
  TP_FUNDO_CLASSE;CNPJ_FUNDO_CLASSE;ID_SUBCLASSE;DT_COMPTC;VL_TOTAL;VL_QUOTA;VL_PATRIM_LIQ;CAPTC_DIA;RESG_DIA;NR_COTST
  ```

- `VL_QUOTA` é o "Valor da cota" e `CNPJ_FUNDO_CLASSE` é o "CNPJ do fundo/classe" (dicionário `meta_inf_diario_fi.txt`).
- **O esquema já mudou.** O CSV de 01/2021 começa com `TP_FUNDO;CNPJ_FUNDO;DT_COMPTC`. Os de 2024 em diante, com `TP_FUNDO_CLASSE;CNPJ_FUNDO_CLASSE;ID_SUBCLASSE`. A troca acompanha a adaptação dos fundos à Resolução CVM 175; o cadastro tem a coluna `Data_Adaptacao_RCVM175`. O app deve ler as colunas pelo nome do cabeçalho, não pela posição.

### Limites, volume e atualização

- Não pede chave e não publica limite de uso. Tem Cloudflare na frente, com `Cache-Control: public, max-age=14400`.
- O mês de outubro/2026 tem 11,8 MB zipado e 54,5 MB descompactado: 537.880 linhas e 25.507 CNPJs. **Os 12 meses somam uns 135 MB de download.**
- Atualização, segundo a descrição do conjunto: os meses M e M-1 são atualizados "de segunda a sábado, às 08:00h"; os meses M-2 a M-11, "semanalmente". Os arquivos mensais desde 01/2021 continuam na mesma pasta. Os anos anteriores ficam em `HIST/`.

### Como achar o fundo

O que o Open Finance manda sobre um fundo, segundo o dicionário oficial da API de fundos (`fundsGetInvestmentsInvestmentId_v1.1.0.csv`, repositório `OpenBanking-Brasil/openapi`):

- `name`: obrigatório;
- `cnpjNumber`: "CNPJ do fundo de investimento", obrigatório, no formato `^[0-9A-Z]{12}[0-9]{2}$`;
- `isinCode`: opcional.

O que o Pluggy expõe:

- `code`: "In the case of Mutual Funds it's the CNPJ of the Fund" (documentação do Investment);
- `issuerCNPJ`: "CNPJ of the issuer behind the investment" (tipos do SDK `pluggy-node`) ou "The entity CNPJ that issued the investment" (OpenAPI do Pluggy);
- `isin` e `name`.

**Não verificado**: qual campo do Pluggy recebe o `cnpjNumber` numa Conexão de Open Finance. Isso se confere nos dados reais, sem trazer valores para o repo.

Casamento testado contra os arquivos da CVM:

- **Pelo CNPJ, funciona.** O informe usa CNPJ com pontuação (`00.000.000/0000-00`), e o cadastro (`registro_fundo_classe.zip`), só dígitos. Normalizados, os 25.507 CNPJs do informe de outubro/2026 aparecem no cadastro: 25.339 como CNPJ de classe e 25.477 como CNPJ de fundo. Das 37.075 classes cadastradas, 36.925 têm o mesmo CNPJ do fundo.
- **Pelo ISIN, não funciona.** Nenhum arquivo da CVM tem ISIN: nem o informe, nem `registro_fundo`, `registro_classe`, `registro_subclasse` ou `cad_fi`.
- **Pelo nome, é frágil.** Dá para comparar `name` com a `Denominacao_Social` do cadastro, mas o nome que o banco mostra não precisa ser a denominação social. Não testei.
- **Subclasses**: no informe de outubro/2026, 310 CNPJs têm duas ou mais subclasses, cada uma com a sua cota. O Open Finance não manda a subclasse, então nesses fundos a cota fica ambígua.
- **CNPJ alfanumérico**: o formato do Open Finance já aceita letras. Hoje não há CNPJ alfanumérico no cadastro da CVM. A normalização deve tirar só a pontuação, sem descartar letras.

### Outras fontes de cota

- brapi.dev, `/api/v2/funds/nav/history`: a documentação diz "Plano Pro".
- ANBIMA: exige `client_secret`.

### O que a consulta revela

O app baixa o mês inteiro, igual para todo mundo. A CVM não sabe qual fundo o usuário tem.

### Recomendação

Usar o informe diário da CVM, casando pelo CNPJ:

- tentar `code`, depois `issuerCNPJ`, normalizados para dígitos e letras, contra `CNPJ_FUNDO_CLASSE`;
- ler cada zip em fluxo e guardar só as linhas dos CNPJs da carteira;
- por causa dos ~135 MB, baixar só no Wi-Fi ou depois de avisar o usuário. Segundo #10, isso acontece uma vez por banco;
- o fundo não achado, ou com mais de uma subclasse, entra a custo.

**Não verificado**: descompactar zips de 12 MB em fluxo dentro do celular. A leitura em fluxo do `expo/fetch` está documentada; a descompactação em JavaScript ainda pede uma biblioteca, a escolher.

## 5. O que sobra quando nenhuma fonte serve

- **Ações, FII, ETF e BDR**: no v1, a custo. A interpolação entre os preços das operações e o preço de hoje é uma melhora possível.
- **Fundo** sem CNPJ, com CNPJ que não está na CVM ou com várias subclasses: a custo.
- **Título do Tesouro** que não casa com o CSV: taxa contratada sobre o CDI ou o IPCA (`rate`, `rateType`, `fixedAnnualRate`), como o resto da renda fixa.

## Riscos

- **Chance única**: em #10, a estimativa de cada banco é feita uma vez e nunca refeita. Se uma fonte estiver fora do ar nesse momento, o ativo fica a custo para sempre. Vale tentar de novo antes de dar a estimativa por fechada.
- **Volume dos fundos**: ~135 MB por estimativa, além do custo de descompactar e ler no celular.
- **Fontes sem contrato de formato**: a ordem do CSV do Tesouro, a URL do recurso no CKAN e as colunas da CVM podem mudar sem aviso. A CVM já trocou colunas. O BCB já quebrou clientes em 03/2025 com a janela de 10 anos.
- **Campos do Pluggy não verificados**: o campo que traz o CNPJ do fundo e os campos de cupom e quantidade do Tesouro.
- **Renda variável a custo** distorce a rentabilidade estimada de quem tem muita bolsa.
- **Atribuição da ODbL**: BCB, Tesouro e CVM pedem crédito. Uma tela de créditos resolve.

## Fontes

Banco Central

- API do SGS (testada): `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados`
- Metadados das séries pelo serviço do SGS: `https://www3.bcb.gov.br/wssgs/services/FachadaWSSGS` (WSDL em https://www3.bcb.gov.br/sgspub/JSP/sgsgeral/FachadaWSSGS.wsdl)
- Portal de dados abertos, API CKAN (licença e aviso de 26/03/2025): https://dadosabertos.bcb.gov.br/api/3/action/package_show?id=27803-sgs

IBGE

- SIDRA, tabela 1737: https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/63/p/last%203

Tesouro Nacional

- Conjunto no CKAN: https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=taxas-dos-titulos-ofertados-pelo-tesouro-direto
- Metadados (`taxa.pdf`): https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/1a8eb2e3-4902-4a38-a1eb-6410f23d90de/download/taxa.pdf

CVM

- Conjunto do informe diário: https://dados.cvm.gov.br/api/3/action/package_show?id=fi-doc-inf_diario
- Dicionário: https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/META/meta_inf_diario_fi.txt
- Cadastro: https://dados.cvm.gov.br/dados/FI/CAD/DADOS/

B3

- Cotações históricas e restrição de coleta: https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/historico/mercado-a-vista/cotacoes-historicas/
- Layout do arquivo: https://www.b3.com.br/data/files/33/67/B9/50/D84057102C784E47AC094EA8/SeriesHistoricas_Layout.pdf
- Termos de uso: https://www.b3.com.br/pt_br/termos-de-uso-e-protecao-de-dados/termos-de-uso/

Yahoo

- Termos de serviço: https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html
- Issues do `yfinance`: https://github.com/ranaroussi/yfinance/issues/2518, /2526, /2567, /2614, /2721, /2966

brapi.dev

- Autenticação: https://brapi.dev/docs/authentication.mdx
- Preços e limites: https://brapi.dev/pricing.md
- Termos de uso: https://brapi.dev/terms-of-use
- Histórico de cota de fundos: https://brapi.dev/docs/fundos/nav-historico.mdx

Alpha Vantage

- Documentação: https://www.alphavantage.co/documentation/
- Suporte (limites do nível gratuito): https://www.alphavantage.co/support/
- Termos de serviço: https://www.alphavantage.co/terms_of_service/

ANBIMA

- Autenticação: https://developers.anbima.com.br/pt/autenticacao/

Pluggy e Open Finance

- Investment: https://docs.pluggy.ai/en/docs/products/investments.md
- Operações de investimento: https://docs.pluggy.ai/en/docs/products/investment-transactions.md
- OpenAPI: https://docs.pluggy.ai/openapi/pluggy-api.json
- SDK, tipo `Investment`: https://github.com/pluggyai/pluggy-node/blob/master/src/types/investment.ts
- Dicionário da API de fundos do Open Finance Brasil: https://github.com/OpenBanking-Brasil/openapi/blob/main/dictionary/fundsGetInvestmentsInvestmentId_v1.1.0.csv

Expo

- `expo/fetch`, leitura em fluxo: https://docs.expo.dev/versions/latest/sdk/expo/
