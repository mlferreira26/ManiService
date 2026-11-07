# Fotos persistentes do ManiService

Em produção, os uploads usam o Supabase Storage para que fotos não desapareçam quando o Render reinicia ou publica uma nova versão.

## Configurar no Render

No painel do serviço ManiService, abra **Settings → Environment Variables** e adicione:

- `SUPABASE_URL`: URL do projeto Supabase, no formato `https://<project-ref>.supabase.co`.
- `SUPABASE_SERVICE_ROLE_KEY`: chave secreta `service_role` do projeto. Ela deve ficar somente no servidor e nunca deve ser prefixada com `VITE_` nem enviada ao navegador.
- `SUPABASE_STORAGE_BUCKET`: `maniservice-media` (opcional; esse é o padrão do código).

Salve as variáveis e faça um novo deploy. O servidor prepara um bucket público chamado `maniservice-media` na primeira tentativa de upload. A chave precisa ter permissão administrativa de Storage para criar esse bucket e gravar objetos. As imagens são limitadas a 5 MB e PNG, JPG/JPEG ou WEBP.

Depois do deploy, escolha uma imagem da galeria no perfil, em uma publicação, em um pedido ou no chat. Se o upload retornar erro, confira os logs do Render e os três valores de ambiente, sem compartilhar a chave secreta.

## Desenvolvimento local

Sem as variáveis de Storage, o desenvolvimento local continua salvando imagens na pasta `client/public/uploads`. Esse armazenamento local não deve ser usado como destino permanente em produção.
