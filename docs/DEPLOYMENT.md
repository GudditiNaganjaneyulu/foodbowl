# Deploying to EC2

The app runs the same way in production as it does locally — Docker Compose,
same two Dockerfiles, same images — just with the `prod` build target instead
of `dev` and no bind-mounted source. See `infra/docker-compose.prod.yml`.

Deploys are pushed by `.github/workflows/deploy.yml`: every push to `main`
SSHes into the EC2 box, `git pull`s, rebuilds, runs pending Prisma
migrations, and restarts the containers. GitHub Actions never builds images
itself and never sees the production `.env` — the instance does the build,
and the `.env` is created on the box by hand, once, in the one-time setup
below.

## 1. Launch the instance

Any size works to start (a `t3.small` is enough to build and run both
images — a `t2.micro`'s 1GB RAM will swap hard during `next build`). Ubuntu
22.04/24.04 LTS is assumed below; adjust package names if you use Amazon
Linux instead.

Security group inbound rules:

| Port | Purpose | Source |
|---|---|---|
| 22 | SSH | your IP (not `0.0.0.0/0`) |
| 80 | web | `0.0.0.0/0` |
| 4000 | api | `0.0.0.0/0` |

The web container listens on 3000 internally, but `infra/docker-compose.prod.yml`
publishes it as `'80:3000'` — host port 80 maps straight to the container's
3000, no reverse proxy in front. Simple, and fine until you add TLS (at
which point something needs to terminate it — Caddy or nginx + certbot are
reasonable next steps, but out of scope here).

## 2. Install Docker on the instance

```bash
ssh -i /path/to/key.pem ubuntu@<EC2_PUBLIC_IP>

curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker   # or log out/in — picks up the docker group without a reboot
docker compose version   # confirm the Compose plugin is present
```

## 3. Clone the repo and create the production `.env`

```bash
git clone https://github.com/GudditiNaganjaneyulu/foodbowl.git ~/foodbowl
cp ~/foodbowl/.env.example /home/ubuntu/.env
```

The `.env` lives at **`/home/ubuntu/.env`** — deliberately *outside* the repo
checkout at `~/foodbowl`. `infra/docker-compose.prod.yml` and the deploy
workflow both point at that absolute path. Keeping it outside the repo means
`git reset --hard` (which the deploy workflow runs on every deploy) can never
touch it, and a fresh clone never needs it recreated.

Edit `/home/ubuntu/.env` with real production values — `DATABASE_URL` (Neon),
Supabase storage keys, Brevo SMTP creds, Upstash Redis, and generated
`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (don't reuse the dev placeholders).
Two vars matter more in production than locally:

```bash
WEB_ORIGIN=http://<EC2_PUBLIC_IP>
NEXT_PUBLIC_API_URL=http://<EC2_PUBLIC_IP>:4000
NEXT_PUBLIC_SOCKET_URL=http://<EC2_PUBLIC_IP>:4000
```

(`WEB_ORIGIN` has no port — web is published on the default HTTP port 80.)

`NEXT_PUBLIC_*` vars are compiled into the browser bundle at `next build`
time, not read at container startup — get them right *before* the first
build, or the deployed frontend will keep calling `localhost` from every
visitor's browser. If you point a domain at the instance later, update these
three and redeploy.

## 4. First build and run (manual, once)

```bash
cd ~/foodbowl
docker compose -f infra/docker-compose.prod.yml --env-file /home/ubuntu/.env build
docker compose -f infra/docker-compose.prod.yml --env-file /home/ubuntu/.env run --rm api pnpm db:deploy
docker compose -f infra/docker-compose.prod.yml --env-file /home/ubuntu/.env up -d
docker compose -f infra/docker-compose.prod.yml --env-file /home/ubuntu/.env ps
```

Then check:

- `http://<EC2_PUBLIC_IP>:4000/health`
- `http://<EC2_PUBLIC_IP>:4000/docs` (Swagger UI)
- `http://<EC2_PUBLIC_IP>`

If you need seed data on this environment, run it the same way you would
locally, against the running api container:

```bash
docker compose -f infra/docker-compose.prod.yml --env-file /home/ubuntu/.env exec api pnpm db:seed
```

(Only do this once, on a fresh database — see the README's warning about
changing the default seed password before this runs anywhere but your own
machine.)

## 5. Add GitHub Actions secrets

Repo → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `EC2_HOST` | instance public IP or DNS name |
| `EC2_USERNAME` | `ubuntu` (or `ec2-user` on Amazon Linux) |
| `EC2_SSH_KEY` | full contents of the `.pem` private key, including the `BEGIN`/`END` lines |
| `EC2_SSH_PORT` | optional, only needed if you moved SSH off port 22 |

From here, every push to `main` redeploys automatically. You can also trigger
it manually from the Actions tab (`workflow_dispatch`).

## Rolling back

Deploys are just `git reset --hard origin/main` + rebuild, so rolling back is
the same shape: SSH in, `git reset --hard <previous-sha>`, and rerun the four
`docker compose` commands from step 4 (skip `db:deploy` unless the rollback
also needs a migration reverted, which Prisma doesn't do automatically).

## Upgrading an existing deployment

A release can change the database and the permission list, so after pulling new code run these against the production database (in this order):

```bash
pnpm --filter @foodbowl/api db:deploy      # apply new migrations (prisma migrate deploy)
pnpm --filter @foodbowl/api db:sync-rbac   # bring roles/permissions up to date — no demo data
```

`db:sync-rbac` is what gives the owner a newly introduced permission such as `support.manage`; skip it and the owner (and any staff you grant it to) will get 403s on the new screens. Add both to `.github/workflows/deploy.yml` after the build step if you deploy through it.

Things to know:

- **Everyone signs in again once** after the release that changed refresh tokens (old tokens can't be looked up by ID). Nothing is lost.
- **Photos:** with Supabase configured they need no deployment step. Without it, uploads are written to `UPLOAD_DIR` (default `./uploads` inside the API container) — mount a volume there or they disappear whenever the container is recreated.
- **Seed data is for demos.** Run `pnpm db:seed` on a fresh environment if you want the sample menu and accounts; it is safe to re-run (matched by name) but you will want to change the default password immediately.
- **Set `WEB_ORIGIN`** to exactly the web address customers use (scheme, host and port) or the browser blocks API calls; and behind a reverse proxy set `PUBLIC_API_URL` so built-in-storage upload links point at the public address.
