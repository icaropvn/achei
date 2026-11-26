# Achei! 1.0 — Achados e perdidos institucionais

Consulte o catálogo sem conta. Com uma conta pessoal, registre perdas, consulte avisos internos e peça a retirada. A recepção confere a descrição, aprova a solicitação e confirma a entrega física. Os dados são guardados no PostgreSQL.

## Rodar no Windows ou no Kubuntu

Você precisa do Docker com o comando `docker compose` (Docker Desktop no Windows ou Docker Engine com o plugin Compose no Linux), e de um navegador. Não é necessário instalar Node.js ou PostgreSQL no computador para usar o Compose.

1. Extraia o ZIP e abra o terminal dentro da pasta `achei-v1`.
2. Rode `Copy-Item .env.example .env` no PowerShell, ou `cp .env.example .env` no Linux. Edite o `.env` e preencha `POSTGRES_PASSWORD` com uma senha longa e exclusiva. Se alterar `APP_PORT`, altere também a porta em `APP_ORIGIN`.
3. Rode:

   ```sh
   docker compose up --build -d
   docker compose ps
   ```

4. Acesse **http://localhost:8080**. Se não abrir, confira `docker compose logs migrate app db`.

O Compose executa as migrações antes de iniciar a aplicação. Só a porta web fica exposta no endereço local. O banco não tem porta publicada no host.

## Configuração inicial

```sh
docker compose exec app node dist/manage.js admin admin@example.test "Administrador local"
docker compose exec app node dist/manage.js demo
```

O comando de administrador pede a senha pela entrada do terminal. Use de 12 a 128 caracteres. O comando de demonstração pode ser executado novamente: ele cria as instituições fictícias Instituto Horizonte e Centro Movimento sem substituir registros existentes. Se quiser as quatro contas fictícias prontas, use `docker compose exec app node dist/manage.js demo --contas`: as senhas aleatórias aparecem só na criação e os funcionários devem trocá-las no primeiro acesso.

1. Se não usou `demo --contas`, entre com sua conta administrativa e abra **Administração**. Crie um funcionário para cada instituição, com e-mails distintos e senhas iniciais diferentes.
2. Abra uma janela anônima ou outro perfil do navegador. Entre como funcionário do Instituto Horizonte e troque a senha inicial quando a tela pedir.
3. Em outra sessão, crie uma conta comum. Registre perda de um guarda-chuva no Horizonte, entre 10 e 12 de novembro de 2026.
4. Na área de recepção, cadastre o guarda-chuva encontrado em 12 de novembro de 2026. Use “Biblioteca” como local geral, “fita amarela no cabo” como evidência reservada e um local de guarda fictício.
5. Na conta comum, abra **Notificações** (ícone do sino) e solicite a retirada, descrevendo a fita. Em uma aba aberta, os avisos são atualizados periodicamente. Pode recarregar a página para ver imediatamente.
6. A recepção abre a solicitação, aprova e só confirma depois da entrega. Confira o histórico do pedido e a busca encerrada. Faça login também no Centro Movimento para verificar que essa solicitação não aparece lá.

Para recuperação local, alguém com acesso ao terminal pode usar `docker compose exec app node dist/manage.js reset-password EMAIL`. O comando invalida as sessões existentes e exige troca da senha temporária no próximo login.

## Parar, reiniciar e fazer backup

`docker compose stop` pausa os serviços. `docker compose up -d` os coloca de volta no ar. `docker compose down` remove os contêineres, mas mantém o volume nomeado. Evite `down -v`: ele exclui o volume com os dados.

O exemplo abaixo salva o backup dentro do contêiner e o copia como arquivo binário, inclusive no Windows:

```sh
docker compose exec db pg_dump --no-owner -U achei -d achei -Fc -f /tmp/achei.dump
docker compose cp db:/tmp/achei.dump ./achei.dump
docker compose exec db rm /tmp/achei.dump
```

Para conferir a restauração sem tocar no banco em uso, crie um **banco separado e vazio** com nome exclusivo:

```sh
docker compose cp ./achei.dump db:/tmp/achei.dump
docker compose exec db createdb -U achei achei_verificacao
docker compose exec db pg_restore --exit-on-error --no-owner -U achei -d achei_verificacao /tmp/achei.dump
docker compose exec db psql -U achei -d achei_verificacao -c "SELECT COUNT(*) FROM items;"
docker compose exec db rm /tmp/achei.dump
```

## Desenvolvimento e verificação

Com Node.js 24: `npm ci`, `npm ci --prefix frontend`, `npm run build` e `npm test`. O servidor compilado sobe com `npm start` após configurar `DATABASE_URL` (ou as variáveis `PG*`) e executar `npm run manage -- migrate`. Por padrão, o servidor fora do contêiner escuta em 127.0.0.1:8080 e aceita alterações feitas a partir de http://localhost:8080.

O comando `npm run test:integration` usa um PostgreSQL temporário (pacote `embedded-postgres`, em Linux sem root) e portas locais 55437 e 58080. Ele cria fixtures privadas de teste, aplica as migrações e cobre login, permissões, correspondência, concorrência, entrega e persistência. Para incluir o ensaio visual/funcional, instale o Playwright para Python e Chromium e use `ACHEI_BROWSER_TEST=1 npm run test:integration` no Linux. `CHROMIUM_PATH` pode apontar para um binário já disponível. O teste encerra os serviços temporários e remove o banco de teste.

A entrega é para uso local com dados fictícios. Publicação e operação com uma instituição real dependem dos itens da seção 8 do planejamento, incluindo HTTPS, política de dados e validação sob carga.

## Hospedagem

Para usar o Neon e o Render sem Docker, siga [RENDER_NEON.md](RENDER_NEON.md).
