# Recuperação de senha por e-mail

O envio transacional usa a API do Resend. Configure estas variáveis no `.env` do servidor (não envie a chave em conversas nem faça commit dela):

```env
RESEND_API_KEY=re_sua_chave_de_envio
MAIL_FROM=ManiService <no-reply@seudominio.com>
APP_URL=http://localhost:5000
```

Crie uma chave de envio no painel do Resend e use um remetente permitido pela conta. Para enviar de um domínio próprio, verifique o domínio no Resend e configure os registros DNS solicitados. Em produção, `APP_URL` deve apontar para o endereço público do frontend.

Depois de salvar as variáveis, reinicie o processo `pnpm dev:server`. Os links expiram em 30 minutos e só podem ser usados uma vez. A tela de login permite escolher e confirmar a nova senha.
