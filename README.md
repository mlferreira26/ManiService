# ManiService

Marketplace para conectar clientes e trabalhadores autônomos. O projeto inclui uma aplicação React/Vite, API Node.js/Express e PostgreSQL (configurável via `DATABASE_URL`).

## Desenvolvimento local

Requisitos: Node.js e pnpm.

```bash
pnpm install
pnpm dev:server
```

Em outro terminal:

```bash
pnpm dev
```

O front-end abre em `http://localhost:5000` e a API em `http://localhost:4000`.

## Implantação no Render

O arquivo `render.yaml` prepara um serviço web Node para construir e servir o front-end e a API pelo mesmo domínio. Ao criar o serviço, configure:

- `DATABASE_URL`: URL do banco PostgreSQL.
- `APP_URL`: URL pública atribuída ao serviço; depois, atualize para `https://maniservice.com.br` quando o domínio estiver conectado.
- `MAIL_FROM` e `RESEND_API_KEY`: remetente permitido e chave de envio do Resend para recuperação de senha. Consulte `EMAIL_SETUP.md`.
- `SESSION_SECRET`: valor secreto longo e aleatório; o Blueprint solicita este valor.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_STORAGE_BUCKET`: necessários para fotos persistentes de perfis, publicações, pedidos e mensagens. Veja `STORAGE_SETUP.md`.

Não use a chave `service_role` no navegador nem faça commit dela. Configure-a somente no ambiente privado do serviço no Render. O servidor cria o bucket público de imagens na primeira utilização, caso ele ainda não exista.

O aceite de propostas com pagamento retido permanece desabilitado até a integração Marketplace do PagBank ser habilitada e configurada.
