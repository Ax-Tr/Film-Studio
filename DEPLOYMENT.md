# 🚀 Film Studio Platform - Production Deployment Guide

A comprehensive, step-by-step guide to deploying the entire **Film Studio Platform** (Web, API, Background Workers, PostgreSQL, Redis, and Object Storage) using **100% free-tier cloud services**:

* **Database & Storage**: [Supabase](https://supabase.com) (Managed PostgreSQL 16+ with RLS & S3-compatible Asset Storage)
* **Cache & Queues**: [Upstash](https://upstash.com) (Serverless Redis with TLS)
* **Hosting & Compute**: [Render](https://render.com) or [Railway](https://railway.app) (Docker containers with health checks)
* **Authentication**: Google Cloud Identity / OAuth 2.0 (OIDC)

---

## 🏗️ Architecture Overview

```mermaid
flowchart TD
    subgraph Clients ["Client Layer"]
        WebBrowser["Web Browser (Next.js 16)"]
        MobileApp["Android & iOS Apps (Expo)"]
    end

    subgraph Hosting ["Free Hosting (Render / Railway)"]
        FrontendService["film-studio-web\nNext.js Standalone SSR\n(Port 3000)"]
        BackendService["film-studio-api\nNestJS REST API\n(Port 4000)"]
        WorkerService["film-studio-worker\nBackground Export & Import Queue"]
    end

    subgraph FreeData ["Free Data & Storage Layer"]
        SupabaseDB[("Supabase PostgreSQL 16+\n(RLS, 19 SQL Migrations, Pooler on Port 6543)")]
        SupabaseStorage[("Supabase S3 Storage\n(Bucket: film-studio-assets)")]
        UpstashRedis[("Upstash Serverless Redis\n(TLS rediss://, Rate Limiting & Queue)")]
    end

    WebBrowser --> FrontendService
    MobileApp --> BackendService
    FrontendService -->|Reverse Proxy /v1/*| BackendService
    BackendService --> SupabaseDB
    BackendService --> UpstashRedis
    BackendService --> SupabaseStorage
    WorkerService --> UpstashRedis
    WorkerService --> SupabaseDB
```

---

## 📋 Prerequisites

Before starting, make sure you have:
1. A GitHub account with the repository: `https://github.com/Ax-Tr/Film-Studio`
2. A free [Supabase](https://supabase.com) account
3. A free [Upstash](https://upstash.com) account
4. A free [Render](https://render.com) or [Railway](https://railway.app) account
5. A [Google Cloud Console](https://console.cloud.google.com) project (for Google Sign-In)

---

## Step 1: Provision Free Database & Storage on Supabase

### 1.1 Create Supabase Project
1. Log in to [Supabase](https://supabase.com) and click **New project**.
2. Set your Project Name (e.g., `film-studio`) and choose a strong Database Password.
3. Select your preferred region (e.g., `ap-south-1` or `us-east-1`).
4. Click **Create new project** and wait ~2 minutes for provisioning.

### 1.2 Copy Connection Strings
Go to **Project Settings** -> **Database**:
* **Transaction Pooler (Port 6543)** - *Recommended for Cloud Containers & Serverless*:
  ```text
  postgresql://postgres.[PROJECT_REF]:[YOUR_PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true
  ```
* **Direct Connection (Port 5432)** - *Used for migrations*:
  ```text
  postgresql://postgres.[PROJECT_REF]:[YOUR_PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?sslmode=require
  ```

### 1.3 Create the S3 Storage Bucket & RLS Policies
1. In the Supabase Dashboard left menu, open the **SQL Editor**.
2. Copy and paste the contents of [`infra/supabase/setup-storage.sql`](file:///e:/film%20studio/infra/supabase/setup-storage.sql):
   ```sql
   INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
   VALUES (
     'film-studio-assets',
     'film-studio-assets',
     false,
     52428800, -- 50 MB max
     ARRAY[
       'application/pdf',
       'application/json',
       'text/plain',
       'text/csv',
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'image/png',
       'image/jpeg',
       'image/webp'
     ]::text[]
   )
   ON CONFLICT (id) DO UPDATE SET
     public = EXCLUDED.public,
     file_size_limit = EXCLUDED.file_size_limit,
     allowed_mime_types = EXCLUDED.allowed_mime_types;

   CREATE POLICY "Allow service role full access on film-studio-assets"
     ON storage.objects
     FOR ALL
     TO service_role
     USING (bucket_id = 'film-studio-assets')
     WITH CHECK (bucket_id = 'film-studio-assets');
   ```
3. Click **Run**.
4. Go to **Project Settings** -> **Storage** -> **S3 Access Keys**:
   * Click **Generate new access key**.
   * Save the generated **Access Key ID** and **Secret Access Key**.

---

## Step 2: Provision Free Serverless Redis on Upstash

1. Log in to [Upstash](https://upstash.com).
2. Click **Create Database**.
3. Choose **Redis**, set Name to `film-studio-redis`, and pick the region closest to your Supabase region.
4. Under the database details, scroll to **Connect your database**.
5. Select the **Node.js** tab and copy the TLS connection string starting with `rediss://`:
   ```text
   rediss://default:[PASSWORD]@[HOST]:6379
   ```

---

## Step 3: Run Database Migrations

Apply all 19 forward SQL schema migrations directly from your local terminal to your remote Supabase PostgreSQL database:

### On Windows (PowerShell):
```powershell
$env:DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true"
pnpm db:migrate
```

### On macOS / Linux (Bash):
```bash
export DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true"
pnpm db:migrate
```

Output should confirm all 19 migrations:
```text
Applied 0001_identity_tenant.sql
Applied 0002_canonical_content.sql
...
Applied 0019_portfolio_interop_extensions.sql
```

---

## Step 4: Configure Google OIDC Authentication

1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Navigate to **APIs & Services** -> **Credentials**.
3. Click **Create Credentials** -> **OAuth client ID**.
4. Select **Web application** and add the following:
   * **Authorized JavaScript origins**:
     * `https://film-studio-web.onrender.com` (or your Railway custom domain)
   * **Authorized redirect URIs**:
     * `https://film-studio-web.onrender.com/auth/complete`
     * `http://127.0.0.1:3000/auth/complete` (for local development)
5. Save the generated **Client ID** and **Client Secret**.

---

## Step 5: Deploy Compute Services

You can deploy using either **Render** (via 1-click Blueprint) or **Railway**.

### Option A: Deploy on Render (Recommended)

1. Log in to [Render](https://render.com).
2. Click **New +** -> **Blueprint**.
3. Connect your GitHub repository: `https://github.com/Ax-Tr/Film-Studio`.
4. Render will automatically detect [`render.yaml`](file:///e:/film%20studio/render.yaml) and declare three services:
   * **`film-studio-api`** (Web Service, Docker: `infra/docker/Dockerfile.backend`)
   * **`film-studio-web`** (Web Service, Docker: `infra/docker/Dockerfile.frontend`)
   * **`film-studio-worker`** (Background Worker, Docker: `infra/docker/Dockerfile.worker`)
5. In the Render configuration screen, enter your environment values:
   * `DATABASE_URL`: Supabase Connection Pooler URL (from Step 1)
   * `REDIS_URL`: Upstash TLS connection string (from Step 2)
   * `OBJECT_STORAGE_ENDPOINT`: `https://[PROJECT_REF].supabase.co/storage/v1/s3`
   * `OBJECT_STORAGE_ACCESS_KEY`: Supabase S3 Access Key ID
   * `OBJECT_STORAGE_SECRET_KEY`: Supabase S3 Secret Access Key
   * `ALLOWED_ORIGINS`: `https://film-studio-web.onrender.com`
   * `WEB_APP_URL`: `https://film-studio-web.onrender.com`
   * `OIDC_ISSUER_URL`: `https://accounts.google.com`
   * `OIDC_CLIENT_ID`: Your Google OAuth Client ID
   * `OIDC_CLIENT_SECRET`: Your Google OAuth Client Secret
   * `OIDC_WEB_REDIRECT_URI`: `https://film-studio-web.onrender.com/auth/complete`
6. Click **Apply**. Render will automatically build the containers, start the API, web frontend, and queue worker, and provision SSL certificates.

---

### Option B: Deploy on Railway

1. Log in to [Railway](https://railway.app).
2. Click **New Project** -> **Deploy from GitHub repo** and select `Ax-Tr/Film-Studio`.
3. Under the Service Settings:
   * Build type: **Dockerfile** -> `infra/docker/Dockerfile.backend`
   * Healthcheck path: `/health`
4. Under **Variables**, add the keys defined in [`.env.production.example`](file:///e:/film%20studio/.env.production.example).
5. Repeat for the Frontend service pointing to `infra/docker/Dockerfile.frontend` and Worker pointing to `infra/docker/Dockerfile.worker`.
6. Railway will assign domains (e.g., `film-studio-api.up.railway.app`) and automatically deploy.

---

## 🔑 Environment Variables Reference

| Variable | Description | Example / Recommended Value |
|---|---|---|
| `APP_ENV` | Application environment mode | `production` |
| `API_HOST` | API listen host | `0.0.0.0` |
| `API_PORT` | API listen port | `4000` |
| `DATABASE_URL` | PostgreSQL connection pooler URI | `postgresql://postgres.[REF]:[PASS]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true` |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | Trust cloud CA certificates | `false` |
| `REDIS_URL` | Upstash Redis TLS connection URI | `rediss://default:[PASS]@[HOST].upstash.io:6379` |
| `OBJECT_STORAGE_ENDPOINT` | Supabase S3-compatible API endpoint | `https://[REF].supabase.co/storage/v1/s3` |
| `OBJECT_STORAGE_REGION` | Supabase S3 region | `us-east-1` |
| `OBJECT_STORAGE_BUCKET` | S3 asset bucket name | `film-studio-assets` |
| `OBJECT_STORAGE_ACCESS_KEY` | Supabase S3 Access Key ID | `[GENERATED_IN_SUPABASE]` |
| `OBJECT_STORAGE_SECRET_KEY` | Supabase S3 Secret Key (≥16 chars) | `[GENERATED_IN_SUPABASE]` |
| `ALLOWED_ORIGINS` | Space-separated list of allowed origins | `https://film-studio-web.onrender.com` |
| `WEB_APP_URL` | Canonical frontend web URL | `https://film-studio-web.onrender.com` |
| `OIDC_ISSUER_URL` | OpenID Connect provider endpoint | `https://accounts.google.com` |
| `OIDC_CLIENT_ID` | OAuth Client ID from Google Cloud | `[YOUR_CLIENT_ID].apps.googleusercontent.com` |
| `OIDC_CLIENT_SECRET` | OAuth Client Secret from Google Cloud | `[YOUR_CLIENT_SECRET]` |
| `OIDC_WEB_REDIRECT_URI` | Web OIDC authentication callback | `https://film-studio-web.onrender.com/auth/complete` |
| `OIDC_ANDROID_REDIRECT_URI` | Android app deep-link callback | `filmstudio://auth/callback` |
| `OIDC_IOS_REDIRECT_URI` | iOS app universal link callback | `filmstudio://auth/callback` |
| `AUTH_TRANSACTION_ENCRYPTION_KEY` | 32-byte base64url state encryption key | `AAzBoFOW17r88qwg9-w-HbAfv9mQrpcdYN_JuN7xSgM` |
| `SESSION_COOKIE_SECURE` | Enforce HTTPS-only secure cookies | `true` |
| `ACCESS_TOKEN_TTL_SECONDS` | Short-lived access token duration | `300` (5 minutes) |
| `REFRESH_TOKEN_TTL_SECONDS` | Long-lived refresh token duration | `2592000` (30 days) |

> 💡 **Generate a new `AUTH_TRANSACTION_ENCRYPTION_KEY`**:
> ```powershell
> node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
> ```

---

## 🩺 Health Checks & Verification

Once deployed, verify that all services are operational:

### 1. API Liveness Check
```bash
curl https://film-studio-api.onrender.com/health
```
**Expected Response:**
```json
{
  "service": "api",
  "status": "ok",
  "version": "0.0.0",
  "timestamp": "2026-11-17T05:50:00.000Z"
}
```

### 2. API & Database Readiness Check
```bash
curl https://film-studio-api.onrender.com/ready
```
**Expected Response:**
```json
{
  "status": "ok",
  "database": true,
  "redis": true,
  "timestamp": "2026-11-17T05:50:00.000Z"
}
```

### 3. Frontend Web Verification
Open `https://film-studio-web.onrender.com` in your browser. You should see:
* The localized Film Studio Workspace header in Telugu (`తెలుగు`) and English (`en`).
* Active films dashboard.
* Working reverse-proxy connection to the NestJS API.
* Real-time diagnostics at `/support`.

---

## 🛠️ Common Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| **Database connection timeout** | Using port `5432` with connection pooling | Switch `DATABASE_URL` to the Supabase pooler on port `6543` with `?sslmode=require&pgbouncer=true`. |
| **`SELF_SIGNED_CERT_IN_CHAIN`** | Cloud provider SSL certificate validation | Set `DATABASE_SSL_REJECT_UNAUTHORIZED=false` in your cloud container environment variables. |
| **`REDIS_URL must start with redis:// or rediss://`** | Redis URI missing TLS protocol | Ensure your Upstash URI starts with `rediss://` (double 's' for SSL/TLS). |
| **CORS origin rejected** | Request origin not in `ALLOWED_ORIGINS` | Add the frontend domain (e.g. `https://film-studio-web.onrender.com`) to `ALLOWED_ORIGINS` in the backend service variables. |
| **OIDC Redirect Mismatch** | Redirect URI doesn't match Google Cloud | Ensure the URI configured in Google Cloud Console exactly matches `https://film-studio-web.onrender.com/auth/complete`. |
