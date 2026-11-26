# Achei! — Plano de implementação da versão 1.0

**Finalidade:** guiar a implementação, a revisão e a entrega do produto a partir do protótipo visual aprovado.  
**Escopo da primeira entrega:** aplicação completa para execução local em modo de produção, com PostgreSQL, contas reais e duas instituições fictícias.  
**Estado:** planejamento aprovado quanto ao escopo e às regras de produto; tarefas de implementação ainda não iniciadas.

## 1. Resultado esperado

Uma pessoa consulta o catálogo de uma instituição sem cadastro. Se não encontrar seu objeto, cria uma conta, registra a perda e pode receber um aviso dentro do app quando a recepção cadastrar um item compatível. Ela solicita a retirada descrevendo uma característica que não foi publicada. A recepção confere a descrição, toma uma decisão e registra a entrega física. O objeto, a solicitação e o histórico permanecem salvos após reiniciar os serviços.

**Referências para a execução:**

- [Interface revisada e aprovada](https://chatgpt.com/library?file_id=libfile_c3e4ded90f40819198699a0e0cd2992b&account_id=personal): fonte visual e base de componentes. Preservar a home “Onde você perdeu algo?”, a busca acima da lista de instituições, o verde escuro, o papel creme, a etiqueta ilustrada e a linguagem visual mais discreta da recepção.
- [Relatório de desenvolvimento](https://chatgpt.com/library?file_id=libfile_fb6ac942436481919d92c313ce91f981&account_id=personal): origem dos requisitos R01–R10, regras de correspondência e cenários de verificação.
- Usar a conversa de aprovação para resolver divergências de escopo. O ZIP guia a interface; o estado em memória e a troca de perfis servem como referência de comportamento, não como arquitetura do produto.

**Fora da versão local:** fotos e anexos, entrega por correio, e-mail/SMS/push externo, login social, reconhecimento por imagem, aplicativo nativo, pagamentos e implantação pública. As notas da seção 8 registram o que falta para um piloto real.

## 2. Arquitetura e decisões técnicas

| Área | Escolha para a 1.0 |
| --- | --- |
| Interface | React + TypeScript, Vite, React Router e Tailwind/CSS do protótipo. Componentes e identidade visual reaproveitados. |
| Servidor | Node.js 24 + TypeScript; uma API REST em Fastify. O mesmo serviço entrega o frontend compilado e as rotas `/api`, sob uma origem única. |
| Dados | PostgreSQL, com acesso por `pg` e consultas parametrizadas. Migrações SQL versionadas; chaves, índices e transações para as regras de integridade. |
| Sessão | Login por e-mail e senha; hash de senha com Argon2id; sessões revogáveis persistidas no banco, com identificador opaco em cookie HttpOnly, SameSite e expiração. Cookie Secure quando houver HTTPS. |
| Correspondência | Processada no servidor quando um achado ou uma perda relevante mudar. Avisos gravados no PostgreSQL. Sem fila externa nesta versão. |
| Execução | Docker Compose: serviço da aplicação, banco com volume nomeado e etapa de migração. Expor a aplicação apenas em `127.0.0.1:8080` por padrão; não publicar a porta do banco. |
| Verificação | Vitest para regras; integração contra PostgreSQL para permissões e transações; Playwright para a jornada no navegador. |

Estrutura proposta para o repositório: `frontend/` (protótipo integrado), `server/` (API e comandos administrativos), `db/migrations/` (esquema), `tests/e2e/`, `compose.yaml`, `.env.example`, `README.md` e este plano na raiz. Fixar versões das dependências e manter o arquivo de lock. O navegador nunca se comunica diretamente com o banco.

## 3. Regras de negócio que orientam as tarefas

### 3.1 Acesso e visibilidade

| Ação | Visitante | Usuário | Funcionário | Administrador |
| --- | --- | --- | --- | --- |
| Buscar instituições e consultar o catálogo | Sim | Sim | Sim | Sim |
| Criar/editar perdas, receber avisos e solicitar retirada | — | Apenas os próprios registros | — | — |
| Cadastrar achados e decidir solicitações | — | — | Somente para sua instituição | — |
| Cadastrar instituições e vincular funcionários | — | — | — | Sim |

- **Catálogo público:** categoria, resumo genérico, data, local aproximado e situação. Identificadores e dados necessários à navegação não devem revelar a evidência reservada.
- **Detalhes autenticados:** informações complementares apropriadas do achado, conforme o protótipo. Um usuário consulta seu próprio relato, avisos, pedidos e respostas da recepção.
- **Área institucional:** evidência de identificação, local exato de guarda, relato da solicitação e histórico operacional só ficam disponíveis a funcionários vinculados à instituição responsável. O administrador da plataforma gerencia contas e instituições, sem acesso a dados operacionais privados por padrão.
- O papel e o vínculo vêm da sessão e do banco. Cadastro público cria apenas usuário comum; a primeira conta administrativa é criada por comando local. Desativar um funcionário revoga suas sessões.
- Não incluir evidências em respostas de catálogo, notificações, HTML inicial ou logs. Usar respostas específicas para cada audiência em vez de enviar o objeto completo e escondê-lo na tela.

### 3.2 Perdas, candidatos e avisos

- A perda pertence à pessoa que a registrou. Exige instituição, categoria, início e fim válidos; guarda local aproximado e descrição conforme formulário. Pode ser editada, encerrada e reativada.
- Um candidato deve estar **disponível**, ser da **mesma instituição e categoria** e ter data de encontro entre `início da perda` e `fim da perda + 7 dias`, inclusive. Exemplo: para 10–12/11, o dia 19 entra e o dia 20 não.
- Usar datas civis (`DATE`) na regra de busca para não deslocar o dia por fuso horário. Local aproximado coincidente tem prioridade, sem excluir os demais candidatos; dentro do grupo, ordenar por data mais recente com desempate estável.
- Buscar correspondências ao salvar/reativar uma perda ativa e ao cadastrar, corrigir ou liberar um achado quando essa mudança afetar a compatibilidade. Persistir **no máximo um aviso por par perda–objeto**. Caso um candidato deixe de estar disponível, preservar o aviso já emitido, mas indicar o estado atual e bloquear uma nova retirada.
- Um candidato é uma possibilidade, não uma confirmação de propriedade. O aviso não expõe o atributo que será usado na conferência.

### 3.3 Solicitações, guarda e entrega

| Ação do funcionário | Pré-condição | Resultado |
| --- | --- | --- |
| Responder | Solicitação em análise ou aprovada | Registra a resposta; não muda a situação do objeto. |
| Aprovar | Solicitação em análise; item disponível | Solicitação **Aguardando retirada**; item **Em devolução**. Um único pedido aprovado por item. |
| Recusar | Solicitação em análise | Solicitação **Não confirmada**, com motivo; situação do item não muda. |
| Cancelar aprovação | Solicitação aprovada; item em devolução | Solicitação **Cancelada**, com motivo; item volta a **Disponível**. |
| Confirmar entrega | Solicitação aprovada; item em devolução; confirmação explícita de entrega física | Solicitação **Concluída**; item **Devolvido**. Encerra a busca vinculada e fecha os demais pedidos pendentes para o item. |

O usuário pode solicitar retirada a partir do detalhe do objeto mesmo sem registrar uma perda. Se a solicitação vier de uma busca, validar titularidade e compatibilidade do vínculo. Exigir descrição própria e impedir dois pedidos ativos do mesmo usuário para o mesmo item. Cada decisão registra autor, data, ação e motivo quando aplicável. A edição do achado não pode alterar arbitrariamente o estado de devolução.

## 4. Backlog em ordem de implementação

Marcar uma tarefa como concluída somente depois do critério correspondente. Registrar junto à tarefa o teste, comando ou evidência que confirma a entrega. Se uma descoberta exigir mudar uma regra, atualizar este arquivo antes de alterar o comportamento.

### Fase A — Base executável e persistência

| ID | Tarefa | Depende de | Aceite |
| --- | --- | --- | --- |
| A01 | Importar a interface aprovada para `frontend/`; registrar a base visual, inventariar as rotas e separar componentes reutilizáveis do estado demonstrativo. | — | Home, catálogo, formulário e painel de referência compilam; os testes de domínio do protótipo servem como referência para a migração. |
| A02 | Criar a API TypeScript, configurações por ambiente, scripts de build e teste, respostas de erro consistentes e verificações de saúde/prontidão. | — | API distingue processo ativo de banco indisponível; requisições inválidas recebem erro legível sem rastros internos. |
| A03 | Criar migrações para instituições, contas, vínculos, sessões, achados, perdas, solicitações, avisos e eventos. Incluir FKs, unicidade, validação de datas/estados e índices de catálogo, correspondência e histórico. | A02 | Banco vazio migra até a versão atual; reaplicar não duplica estruturas. O banco protege, entre outras regras, aviso por par e aprovação única por objeto. |
| A04 | Montar Docker Compose, com banco interno, volume nomeado, migração antes da aplicação e frontend compilado no serviço web. Documentar variáveis sem incluir segredos no repositório. | A01–A03 | Instalação limpa entrega a home e a API na mesma origem; reiniciar preserva registros e só a porta web fica publicada localmente. |

### Fase B — Conta, sessão e administração

| ID | Tarefa | Depende de | Aceite |
| --- | --- | --- | --- |
| B01 | Implementar cadastro público, login, consulta da sessão e logout. Normalizar e-mail, limitar tentativas e validar operações autenticadas de alteração contra requisições indevidas de outra origem. | A03 | E-mail duplicado é tratado; senha nunca é gravada em texto puro; logout e expiração invalidam a sessão. O usuário não escolhe seu papel. |
| B02 | Aplicar permissões na API e nas consultas: titularidade, papel e vínculo institucional. Definir respostas para acesso negado e recurso inexistente sem expor dados de terceiros. | B01 | Conta comum não executa ações de recepção; funcionário de uma instituição não lê nem altera registros privados da outra, mesmo informando outro ID. |
| B03 | Criar comando para a primeira conta administrativa e telas para cadastrar instituições, criar/vincular/desativar funcionários. Definir emissão de credencial inicial com troca de senha no primeiro acesso e procedimento local de recuperação sem e-mail. | B02 | Duas instituições podem operar separadamente. Funcionário desativado perde acesso; cadastro de funcionário e mudança de vínculo são registrados. |
| B04 | Integrar login, cadastro, logout, navegação por papel e tratamento de sessão expirada no frontend. Substituir o seletor de perfis fictícios por autenticação e preservar o destino interno válido após o login. | A01, B01–B03 | Visitante continua consultando o catálogo; consegue entrar e retomar o pedido. Não há troca de perfil ou reinicialização de dados dentro do produto. |

### Fase C — Catálogo, operação e busca ativa

| ID | Tarefa | Depende de | Aceite |
| --- | --- | --- | --- |
| C01 | Integrar busca pública por instituição/cidade, catálogo paginado, filtros de categoria, datas e situação e detalhe autenticado. | A03, B02, B04 | Filtros refletem o banco; período invertido tem mensagem própria; busca válida sem resultados tem estado distinto. Respostas públicas seguem a lista de campos da seção 3.1. |
| C02 | Integrar inventário e painel da recepção, com listagem, resumo de estados, cadastro e edição de achados. Manter no máximo oito campos obrigatórios no formulário principal. | B02, B04 | Cadastrar um item o torna disponível na instituição correta, sem publicar evidência ou local de guarda. Editar não apaga histórico nem força mudança de situação. |
| C03 | Integrar cadastro, edição, ativação, encerramento e listagem de perdas do próprio usuário. | B02, B04, C01 | Outro usuário não consegue consultar ou editar a perda; período inválido não é persistido; busca encerrada deixa de gerar avisos. |
| C04 | Implementar matching e avisos no servidor: gatilhos de reavaliação, deduplicação no banco, listagem, contador e marcação como lido. | C02, C03 | Data no limite entra; um dia após o limite não. Local apenas prioriza. Um novo achado compatível aparece em outra sessão, após consultar os avisos, uma única vez. |
| C05 | Implementar pedido de retirada, painel de análise e comparação, respostas, decisões, entrega, histórico e atualização dos estados. Efetivar as mudanças relacionadas em uma única transação. | C02–C04 | A jornada inteira funciona com contas reais. Duas decisões simultâneas não aprovam dois pedidos para o mesmo objeto; cancelamento libera o item; conclusão preserva histórico e encerra a busca vinculada. |

### Fase D — Qualidade, empacotamento e entrega

| ID | Tarefa | Depende de | Aceite |
| --- | --- | --- | --- |
| D01 | Revisar visual e acessibilidade das telas integradas e novas. Tratar foco, labels, contraste, navegação por teclado, espera, erro, ausência de dados e bloqueio de envio duplicado. | B04, C01–C05 | Conferir a 360 e 1280 px, sem rolagem horizontal; manter a identidade aprovada. Abrir detalhes em até três ações a partir do catálogo, desconsiderando o login. |
| D02 | Automatizar testes de regras e integração. Cobrir sessão, filtros, privacidade, autorização entre instituições, matching, deduplicação, transições, concorrência e histórico. | A03, B01–B03, C01–C05 | Rodar com PostgreSQL de teste separado e reproduzível. A suíte verifica os fluxos positivos e as tentativas que devem ser rejeitadas. |
| D03 | Criar dados fictícios por comando explícito e repetível. Automatizar jornada de ponta a ponta com sessões independentes e verificar o resultado após reiniciar os serviços. | A04, C01–C05 | Cenário com duas instituições, dois usuários e funcionários vinculados; os registros persistem e a segunda instituição não vê operações da primeira. |
| D04 | Escrever guia para Windows e Kubuntu: pré-requisitos, variáveis, subir/parar, criar administrador, carregar demonstração, executar testes e operação de backup/restauração local. Separar claramente parada de limpeza destrutiva do volume. | A04, B03, D03 | Uma pessoa consegue sair de um diretório recém-extraído até a home e fazer o roteiro sem instalar Node.js ou PostgreSQL no host. Uma cópia local de teste pode ser restaurada em banco separado. |
| D05 | Fechar entrega: executar build, migrações e testes em ambiente limpo, conferir o pacote e registrar versão, comandos efetivamente testados, evidências e limitações. | D01–D04 | ZIP ou repositório contém fonte, lockfile, configuração de exemplo, migrações, README, comandos de operação e este plano; nenhuma credencial real está empacotada. |

## 5. Contratos de API a detalhar no início de cada fase

Os nomes abaixo são a convenção planejada. Para cada operação, registrar campos, validação, papel exigido, projeção da resposta e casos de erro antes de conectar a tela.

| Área | Recursos previstos |
| --- | --- |
| Sessão | `/api/auth/{cadastro,login,sessao,logout,senha}` |
| Catálogo | `/api/instituicoes`, `/api/instituicoes/:id/achados`, `/api/achados/:id` |
| Área pessoal | `/api/minhas-perdas`, `/api/meus-avisos`, `/api/minhas-solicitacoes` |
| Recepção | `/api/institucional/{painel,achados,solicitacoes}`; expor ações explícitas de decisão, em vez de aceitar atualização livre do campo de situação. |
| Administração | `/api/admin/{instituicoes,funcionarios}` |

Para listas, definir paginação e ordenação previsível. Comunicar falha de validação, sessão expirada e conflito de estado de forma distinta; em conflito, atualizar a tela com o estado atual. Não repetir automaticamente uma operação que cria pedido ou confirma entrega.

### Mapa de telas para integrar ou criar

| Jornada | Telas e comportamento |
| --- | --- |
| Pública | Home e catálogo por instituição; manter a busca acima da lista. A ação de ver detalhes ou registrar perda conduz ao login e retoma o destino após autenticar. |
| Conta | Entrar, criar conta, trocar senha e sair. Mostrar erro de formulário junto ao campo; preservar o que for apropriado quando houver erro de validação. |
| Usuário | Detalhes do achado, minhas buscas, formulário de perda, avisos, formulário de retirada e acompanhamento da solicitação. Manter a ação seguinte clara em cada estado. |
| Recepção | Painel, inventário, formulário de achado, fila de solicitações e tela de conferência. Diferenciar visualmente o relato enviado da evidência de guarda; separar aprovação de confirmação de entrega. |
| Administração | Lista e cadastro de instituições, lista de funcionários, vínculo e desativação. Reaproveitar navegação, formulários e mensagens do produto. |

## 6. Roteiro obrigatório de aceite da entrega

- [ ] Subir a aplicação com `docker compose up --build -d`, após a configuração inicial documentada. Confirmar que `http://localhost:8080` abre a interface aprovada.
- [ ] Como visitante, buscar o Instituto Horizonte, filtrar o catálogo e confirmar que a característica reservada não aparece.
- [ ] Em sessão de usuário, cadastrar conta e abrir uma perda ativa por guarda-chuva para 10–12/11. Confirmar o estado sem candidato antes de cadastrar o achado.
- [ ] Em sessão de funcionário do Instituto Horizonte, cadastrar um guarda-chuva de 12/11, com “fita amarela no cabo” como evidência reservada.
- [ ] Voltar à sessão do usuário, verificar um único aviso e solicitar a retirada com a própria descrição. Confirmar que outra conta comum não vê o pedido.
- [ ] Como funcionário da segunda instituição, confirmar ausência desse caso e bloqueio de acesso ao registro privado. Voltar à primeira instituição, aprovar e confirmar a entrega física.
- [ ] Conferir item **Devolvido**, pedido **Concluído**, busca vinculada **Encerrada** e histórico com autor e data. Depois de reiniciar, entrar novamente e conferir os mesmos dados.
- [ ] Verificar, em cenários separados, recusa, cancelamento, dois pedidos simultâneos, busca encerrada, prazo de sete dias e filtro com data invertida.

## 7. Rastreabilidade com o relatório

| Requisito | Onde é entregue e verificado |
| --- | --- |
| R01 — Catálogo público e filtros | C01, D02–D03 |
| R02 — Conta e segregação institucional | B01–B04, D02–D03 |
| R03 — Cadastro do achado e dados reservados | C01–C02, D02 |
| R04 — Situação do item e histórico | C05, D02–D03 |
| R05 — Perda e busca ativa | C03, D02–D03 |
| R06 — Correspondência por regras | C04, D02 |
| R07 — Aviso interno sem duplicação | C04, D02–D03 |
| R08 — Solicitação, conferência e retirada | C05, D02–D03 |
| R09 — Responsividade e caminho até o detalhe | D01 |
| R10 — Desempenho e recuperação | D04 verifica recuperação local. A meta de 95% das consultas em até 3 s sob carga institucional fica para o piloto, com ambiente e carga próprios. |

## 8. Antes de operar com uma instituição real

A versão local é o produto funcional para demonstração e verificação com dados fictícios. Antes de usar dados reais ou publicar na internet, abrir um plano de piloto para configurar HTTPS, hospedagem e gestão de segredos; definir recuperação de contas para usuários; acordar quem pode coletar, consultar, manter e excluir dados; automatizar backups e testar a restauração no ambiente de destino. Executar o cenário de carga do relatório (10 mil registros e 50 usuários simultâneos), além de observação de uso com a equipe de recepção e usuários externos.

Para iniciar a implementação, a ordem é **A01–A03 em paralelo quando possível, A04, Fase B, Fase C e Fase D**. Os testes podem começar junto de cada regra e devem fechar antes da entrega. Manter este arquivo como referência versionada do projeto.
