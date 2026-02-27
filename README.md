# Aether API

API moderna para extração de metadados, streaming e download assíncrono de áudio do YouTube. Projetada com foco em arquitetura modular, autenticação JWT, API Keys e controle de rate limit.

---

## Stack

- **Node.js** + **TypeScript**
- **Express** — framework HTTP
- **Prisma ORM** + **SQLite** (desenvolvimento)
- **yt-dlp** — extração de áudio
- **Zod** — validação de schemas
- **bcryptjs** + **jsonwebtoken** — autenticação segura

---

## Instalação

```bash
# 1. Clone o repositório
git clone https://github.com/SEU_USUARIO/aether-api.git
cd aether-api

# 2. Instale dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env

# 4. Execute as migrations
npx prisma migrate dev

# 5. Inicie o servidor
npm run dev
```

> O usuário **admin** é criado automaticamente no primeiro boot com as credenciais definidas no `.env`.

---

## Variáveis de Ambiente

```env
NODE_ENV=production
PORT=3333

JWT_SECRET=sua_string_aleatoria_minimo_32_chars   # openssl rand -hex 32
JWT_EXPIRES_IN=7d

ADMIN_USERNAME=admin
ADMIN_PASSWORD=sua_senha

RATE_LIMIT_WINDOW_MS=900000   # 15 minutos
RATE_LIMIT_MAX=100
DOWNLOAD_RATE_LIMIT_MAX=10

DATABASE_URL=file:./aether.db
DOWNLOADS_DIR=./downloads
MAX_DOWNLOAD_SIZE_MB=150

CORS_ORIGINS=*
```

---

## Autenticação

A API usa JWT. Após o login, inclua o token em todas as requisições protegidas:

```
Authorization: Bearer SEU_TOKEN
```

Alternativamente, é possível autenticar via **API Key** no header `x-api-key`.

---

## Endpoints

### Autenticação

#### Login

```http
POST /auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "sua_senha"
}
```

**Resposta `200`:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "expiresIn": "7d",
    "user": {
      "id": "cuid_do_usuario",
      "username": "admin",
      "role": "admin"
    }
  },
  "meta": {
    "requestId": "uuid-da-requisicao",
    "timestamp": "2025-01-01T00:00:00.000Z",
    "processingTime": 142
  }
}
```

#### Perfil autenticado

```http
GET /auth/me
Authorization: Bearer SEU_TOKEN
```

**Resposta `200`:**
```json
{
  "success": true,
  "data": {
    "id": "cuid_do_usuario",
    "username": "admin",
    "role": "admin",
    "createdAt": "2025-01-01T00:00:00.000Z"
  },
  "meta": { ... }
}
```

---

### Gerenciamento de API Keys

#### Criar chave

```http
POST /keys
Authorization: Bearer SEU_TOKEN
Content-Type: application/json

{
  "label": "Minha Aplicação",
  "expiresInDays": 30
}
```

> `expiresInDays` é opcional. Use `null` para chave sem expiração.

**Resposta `201`:**
```json
{
  "success": true,
  "data": {
    "id": "cuid_da_key",
    "key": "aether_xxxxxxxxxxxxxxxxxxxx",
    "label": "Minha Aplicação",
    "userId": "cuid_do_usuario",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "expiresAt": "2025-01-31T00:00:00.000Z",
    "lastUsedAt": null,
    "totalRequests": 0,
    "isActive": true,
    "rateLimit": 100
  },
  "meta": { ... }
}
```

#### Listar chaves

```http
GET /keys
Authorization: Bearer SEU_TOKEN
```

**Resposta `200`:**
```json
{
  "success": true,
  "data": [
    {
      "id": "cuid_da_key",
      "key": "aether_xxxxxxxxxxxxxxxxxxxx",
      "label": "Minha Aplicação",
      "userId": "cuid_do_usuario",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "expiresAt": "2025-01-31T00:00:00.000Z",
      "lastUsedAt": "2025-01-10T12:00:00.000Z",
      "totalRequests": 57,
      "isActive": true,
      "rateLimit": 100
    }
  ],
  "meta": { ... }
}
```

#### Renovar chave

```http
PATCH /keys/:id/renew
Authorization: Bearer SEU_TOKEN
Content-Type: application/json

{
  "expiresInDays": 30
}
```

**Resposta `200`:** retorna o objeto `ApiKey` atualizado.

#### Revogar chave

```http
PATCH /keys/:id/revoke
Authorization: Bearer SEU_TOKEN
```

**Resposta `200`:**
```json
{
  "success": true,
  "data": {
    "revoked": true,
    "id": "cuid_da_key"
  },
  "meta": { ... }
}
```

---

### Gerenciamento de Usuários *(admin only)*

#### Listar usuários

```http
GET /users
Authorization: Bearer SEU_TOKEN
```

**Resposta `200`:**
```json
{
  "success": true,
  "data": [
    {
      "id": "cuid_do_usuario",
      "username": "admin",
      "role": "admin",
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "meta": { ... }
}
```

#### Criar usuário

```http
POST /users
Authorization: Bearer SEU_TOKEN
Content-Type: application/json

{
  "username": "novo_usuario",
  "password": "senha_segura",
  "role": "user"
}
```

**Resposta `201`:** retorna o objeto `ApiUser` criado.

#### Atualizar usuário

```http
PATCH /users/:id
Authorization: Bearer SEU_TOKEN
Content-Type: application/json

{
  "password": "nova_senha",
  "role": "admin"
}
```

**Resposta `200`:** retorna o objeto `ApiUser` atualizado.

#### Remover usuário

```http
DELETE /users/:id
Authorization: Bearer SEU_TOKEN
```

**Resposta `200`:**
```json
{
  "success": true,
  "data": {
    "deleted": true,
    "id": "cuid_do_usuario"
  },
  "meta": { ... }
}
```

---

### Mídia

#### Metadados do vídeo

```http
GET /info?url=https://youtube.com/watch?v=VIDEO_ID
Authorization: Bearer SEU_TOKEN
```

**Resposta `200`:**
```json
{
  "success": true,
  "data": {
    "title": "Nome do Vídeo",
    "author": "Nome do Canal",
    "channelId": "UCxxxxxxxxxxxxxx",
    "duration": 243,
    "durationFormatted": "4:03",
    "thumbnail": "https://i.ytimg.com/vi/VIDEO_ID/maxresdefault.jpg",
    "url": "https://youtube.com/watch?v=VIDEO_ID",
    "videoId": "VIDEO_ID",
    "views": 1500000,
    "uploadedAt": "2024-06-15",
    "formats": [
      {
        "itag": 140,
        "quality": "medium",
        "bitrate": 128000,
        "mimeType": "audio/mp4"
      }
    ]
  },
  "meta": { ... }
}
```

#### Streaming de MP3

```http
GET /stream?url=https://youtube.com/watch?v=VIDEO_ID
Authorization: Bearer SEU_TOKEN
```

Retorna o áudio diretamente como stream `audio/mpeg`. Os headers de resposta incluem:

| Header | Descrição |
|---|---|
| `Content-Type` | `audio/mpeg` |
| `Content-Disposition` | `attachment; filename="titulo.mp3"` |
| `X-Video-Title` | Título codificado em URL |
| `X-Video-Author` | Autor codificado em URL |
| `X-Video-Duration` | Duração em segundos |
| `X-File-Name` | Nome do arquivo codificado |

> Sujeito ao rate limit de downloads (`DOWNLOAD_RATE_LIMIT_MAX`).

#### Download no servidor

```http
POST /download
Authorization: Bearer SEU_TOKEN
Content-Type: application/json

{
  "url": "https://youtube.com/watch?v=VIDEO_ID"
}
```

**Resposta `202`** (processamento assíncrono):
```json
{
  "success": true,
  "data": {
    "downloadId": "cuid_do_download",
    "status": "processing",
    "title": "Nome do Vídeo"
  },
  "meta": { ... }
}
```

> O arquivo é salvo no servidor em background. Acompanhe o status em `GET /downloads`.

#### Histórico de downloads

```http
GET /downloads?limit=20
Authorization: Bearer SEU_TOKEN
```

**Resposta `200`:**
```json
{
  "success": true,
  "data": [
    {
      "id": "cuid_do_download",
      "videoId": "VIDEO_ID",
      "title": "Nome do Vídeo",
      "author": "Canal",
      "duration": 243,
      "requestedBy": "admin",
      "requestedAt": "2025-01-01T00:00:00.000Z",
      "completedAt": "2025-01-01T00:00:45.000Z",
      "status": "completed",
      "fileSize": 3932160,
      "fileName": "nome-do-video.mp3",
      "error": null
    }
  ],
  "meta": { ... }
}
```

> `status` pode ser: `pending` | `processing` | `completed` | `failed`

#### Estatísticas

```http
GET /stats
Authorization: Bearer SEU_TOKEN
```

**Resposta `200`:**
```json
{
  "success": true,
  "data": {
    "totalRequests": 1024,
    "totalDownloads": 87,
    "activeKeys": 5,
    "totalFailures": 3,
    "avgResponseTime": 312,
    "topVideos": [
      {
        "videoId": "VIDEO_ID",
        "title": "Vídeo mais baixado",
        "count": 12
      }
    ],
    "requestsTimeline": [
      {
        "timestamp": "2025-01-01T00:00:00.000Z",
        "count": 48
      }
    ]
  },
  "meta": { ... }
}
```

---

## Rate Limit

| Limite | Configuração | Padrão |
|---|---|---|
| Global | `RATE_LIMIT_MAX` por janela | 100 req / 15min |
| Downloads | `DOWNLOAD_RATE_LIMIT_MAX` por usuário | 10 req / 15min |

Ao atingir o limite, a API retorna `429` com:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Muitas requisições."
  }
}
```

---

## Formato de Erros

Todas as respostas de erro seguem o padrão:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Usuário ou senha incorretos"
  }
}
```

| Código | Status | Descrição |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Login inválido |
| `UNAUTHORIZED` | 401 | Token ou API Key ausente/inválido |
| `FORBIDDEN` | 403 | Sem permissão para a ação |
| `NOT_FOUND` | 404 | Recurso não encontrado |
| `USERNAME_TAKEN` | 409 | Nome de usuário já existe |
| `INVALID_URL` | 422 | URL do YouTube inválida |
| `FETCH_FAILED` | 502 | Falha ao obter dados do YouTube |
| `STREAM_FAILED` | 500 | Falha no streaming de áudio |
| `RATE_LIMIT_EXCEEDED` | 429 | Limite de requisições atingido |
| `DOWNLOAD_LIMIT_EXCEEDED` | 429 | Limite de downloads atingido |

---

## Estrutura do Projeto

```
src/
├── config/
│   ├── environment.ts    # Variáveis de ambiente com validação
│   └── store.ts          # Prisma store (acesso ao banco de dados)
├── controllers/
│   ├── auth.ts           # Login, JWT, CRUD de API Keys
│   ├── download.ts       # Info, stream, download e histórico
│   └── users.ts          # Gerenciamento de usuários (admin)
├── middleware/
│   ├── auth.ts           # Autenticação JWT e API Key
│   └── context.ts        # requestId, startTime e métricas
├── routes/
│   └── api.ts            # Definição de rotas e rate limiters
├── services/
│   └── youtube.ts        # Integração com yt-dlp
├── types/
│   └── index.ts          # Interfaces TypeScript globais
├── utils/
│   ├── response.ts       # Helpers sendSuccess / sendError
│   └── validation.ts     # Schemas Zod
└── server.ts             # Entry point
```

---

## Licença

MIT © Luanxdd
