# Categorias do Pluggy -> categorias do app

O Pluggy classifica cada transação com a sua taxonomia (`GET /categories`, 130 categorias em 22 grupos). A transação traz `category` (nome em inglês) e `categoryId` (8 dígitos; os 2 primeiros são o grupo). O app mapeia isso para as suas 11 categorias em `src/core/config.ts` (`categoryIdMap` por prefixo do id e `categoryMap` por nome, o fallback), lido por `mapPluggyCategory` (`src/core/categoryMap.ts`).

Regras:

- O id vale mais que o nome. Vale o prefixo mais longo conhecido (a folha, o subgrupo, depois o grupo de 2 dígitos); assim um id novo de um grupo conhecido herda o destino do grupo.
- Sem id, ou com id desconhecido, vale o nome (sem acento nem caixa). Sem nenhum dos dois: Outros.
- Só vale para Gasto e Reembolso. A natureza (transferência, investimento, renda, pagamento de fatura) vem da classificação; por isso grupos como Investments, Transfers e Income apontam para Outros.
- Precedência: edição à mão > regra do usuário > regra embutida > categoria do Pluggy mapeada > Outros.
- A tabela é do `EmbeddedConfig`: muda por OTA, e a categoria é recalculada na leitura.

Decisões de julgamento: Houseware (17030000) e Pet supplies and vet ficam em Compras; IPVA e multas de trânsito (19050004, 19050006) em Tarifas e impostos; Gaming (09010000) em Lazer, o resto de Digital services em Assinaturas; Financing e Loans (0203, 0204) em Contas fixas, enquanto juros e multas por atraso (0201, 0202) em Tarifas e impostos; Education, Donations, Alimony e Cashback em Outros; Wellness and fitness em Saúde; Tickets (cinema, estádio, museu) em Lazer; Bus tickets em Viagem.

| id | categoria do Pluggy | categoria do app |
|---|---|---|
| 01000000 | Income | Outros |
| 01010000 | Salary | Outros |
| 01020000 | Retirement | Outros |
| 01030000 | Entrepreneurial activities | Outros |
| 01040000 | Government aid | Outros |
| 01050000 | Non-recurring income | Outros |
| 02000000 | Loans and financing | Tarifas e impostos |
| 02010000 | Late payment and overdraft costs | Tarifas e impostos |
| 02020000 | Interests charged | Tarifas e impostos |
| 02030000 | Financing | Contas fixas |
| 02030001 | Real estate financing | Contas fixas |
| 02030002 | Vehicle financing | Contas fixas |
| 02030003 | Student loan | Contas fixas |
| 02040000 | Loans | Contas fixas |
| 03000000 | Investments | Outros |
| 03010000 | Automatic investment | Outros |
| 03020000 | Fixed income | Outros |
| 03030000 | Mutual funds | Outros |
| 03040000 | Variable income | Outros |
| 03050000 | Margin | Outros |
| 03060000 | Proceeds interests and dividends | Outros |
| 03070000 | Pension | Outros |
| 04000000 | Same person transfer | Outros |
| 04010000 | Same person transfer - CASH | Outros |
| 04020000 | Same person transfer - PIX | Outros |
| 04030000 | Same person transfer - TED | Outros |
| 05000000 | Transfers | Outros |
| 05010000 | Transfer - Bank Slip | Outros |
| 05020000 | Transfer - Cash | Outros |
| 05030000 | Transfer - Check | Outros |
| 05040000 | Transfer - DOC | Outros |
| 05050000 | Transfer - Foreign Exchange | Outros |
| 05060000 | Transfer - Internal | Outros |
| 05070000 | Transfer - PIX | Outros |
| 05080000 | Transfer - TED | Outros |
| 05090000 | Third party transfers | Outros |
| 05090001 | Third party transfer - Bank Slip | Outros |
| 05090002 | Third party transfer - Debit Card | Outros |
| 05090003 | Third party transfer - DOC | Outros |
| 05090004 | Third party transfer - PIX | Outros |
| 05090005 | Third party transfer - TED | Outros |
| 05100000 | Credit card payment | Outros |
| 06000000 | Legal obligations | Tarifas e impostos |
| 06010000 | Blocked balances | Tarifas e impostos |
| 06020000 | Alimony | Outros |
| 07000000 | Services | Outros |
| 07010000 | Telecommunications | Contas fixas |
| 07010001 | Internet | Contas fixas |
| 07010002 | Mobile | Contas fixas |
| 07010003 | TV | Contas fixas |
| 07020000 | Education | Outros |
| 07020001 | Online Courses | Outros |
| 07020002 | University | Outros |
| 07020003 | School | Outros |
| 07020004 | Kindergarten | Outros |
| 07030000 | Wellness and fitness | Saúde |
| 07030001 | Gyms and fitness centers | Saúde |
| 07030002 | Sports practice | Saúde |
| 07030003 | Wellness | Saúde |
| 07040000 | Tickets | Lazer |
| 07040001 | Stadiums and arenas | Lazer |
| 07040002 | Landmarks and museums | Lazer |
| 07040003 | Cinema, theater and concerts | Lazer |
| 08000000 | Shopping | Compras |
| 08010000 | Online shopping | Compras |
| 08020000 | Electronics | Compras |
| 08030000 | Pet supplies and vet | Compras |
| 08040000 | Clothing | Compras |
| 08050000 | Kids and toys | Compras |
| 08060000 | Bookstore | Compras |
| 08070000 | Sports goods | Compras |
| 08080000 | Office supplies | Compras |
| 08090000 | Cashback | Outros |
| 09000000 | Digital services | Assinaturas |
| 09010000 | Gaming | Lazer |
| 09020000 | Video streaming | Assinaturas |
| 09030000 | Music streaming | Assinaturas |
| 10000000 | Groceries | Mercado |
| 11000000 | Food and drinks | Alimentação |
| 11010000 | Eating out | Alimentação |
| 11020000 | Food delivery | Alimentação |
| 12000000 | Travel | Viagem |
| 12010000 | Airport and airlines | Viagem |
| 12020000 | Accomodation | Viagem |
| 12030000 | Mileage programs | Viagem |
| 12040000 | Bus tickets | Viagem |
| 13000000 | Donations | Outros |
| 14000000 | Gambling | Lazer |
| 14010000 | Lottery | Lazer |
| 14020000 | Online bet | Lazer |
| 15000000 | Taxes | Tarifas e impostos |
| 15010000 | Income taxes | Tarifas e impostos |
| 15020000 | Taxes on investments | Tarifas e impostos |
| 15030000 | Tax on financial operations | Tarifas e impostos |
| 16000000 | Bank fees | Tarifas e impostos |
| 16010000 | Account fees | Tarifas e impostos |
| 16020000 | Wire transfer fees and ATM fees | Tarifas e impostos |
| 16030000 | Credit card fees | Tarifas e impostos |
| 17000000 | Housing | Contas fixas |
| 17010000 | Rent | Contas fixas |
| 17020000 | Utilities | Contas fixas |
| 17020001 | Water | Contas fixas |
| 17020002 | Electricity | Contas fixas |
| 17020003 | Gas | Contas fixas |
| 17030000 | Houseware | Compras |
| 17040000 | Urban land and building tax | Contas fixas |
| 18000000 | Healthcare | Saúde |
| 18010000 | Dentist | Saúde |
| 18020000 | Pharmacy | Saúde |
| 18030000 | Optometry | Saúde |
| 18040000 | Hospital clinics and labs | Saúde |
| 19000000 | Transportation | Transporte |
| 19010000 | Taxi and ride-hailing | Transporte |
| 19020000 | Public transportation | Transporte |
| 19030000 | Car rental | Transporte |
| 19040000 | Bicycle | Transporte |
| 19050000 | Automotive | Transporte |
| 19050001 | Gas stations | Transporte |
| 19050002 | Parking | Transporte |
| 19050003 | Tolls and in vehicle payment | Transporte |
| 19050004 | Vehicle ownership taxes and fees | Tarifas e impostos |
| 19050005 | Vehicle maintenance | Transporte |
| 19050006 | Traffic tickets | Tarifas e impostos |
| 20000000 | Insurance | Contas fixas |
| 200100000 | Life insurance | Contas fixas |
| 200200000 | Home insurance | Contas fixas |
| 200300000 | Health insurance | Contas fixas |
| 200400000 | Vehicle insurance | Contas fixas |
| 21000000 | Leisure | Lazer |
| 99999999 | Other | Outros |
