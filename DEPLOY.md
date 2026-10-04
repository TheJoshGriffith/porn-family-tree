# Deploying to a VPS

Any Linux VPS with Docker works. A 1 vCPU / 1 GB box is plenty; the build is the heaviest step.

## What you get

- **App container:** non-root user, read-only root filesystem, every Linux capability dropped, `no-new-privileges`, and memory and process limits. It listens on `127.0.0.1` only.
- **Caddy** (optional, `--profile https`): the only thing on ports 80/443, with automatic Let's Encrypt certificates and HSTS.
- **Database:** SQLite in the named volume `data`. It survives `docker compose down`, rebuilds, image upgrades and reboots. Only `docker compose down -v` deletes it.
- **Scraper and backup:** one-off containers. Only the scraper gets your StashDB key; the web app never sees it.

## 1. Prepare the server

As root on a fresh Debian/Ubuntu box:

```bash
curl -fsSL https://get.docker.com | sh
adduser --disabled-password --gecos "" deploy && usermod -aG docker deploy
ufw allow OpenSSH && ufw allow 80,443/tcp && ufw allow 443/udp && ufw --force enable
```

Docker publishes ports by writing its own iptables rules, which bypass `ufw`. That is why the app binds to `127.0.0.1` and only Caddy publishes 80/443. Don't change the app's port mapping to `0.0.0.0`.

## 2. Get the code and configure

```bash
su - deploy
git clone https://github.com/TheJoshGriffith/porn-family-tree.git
cd porn-family-tree
cp .env.example .env
chmod 600 .env
nano .env        # set STASHDB_API_KEY, and DOMAIN if using HTTPS
```

## 3. Start it

With a domain whose DNS A/AAAA record points at the server:

```bash
docker compose --profile https up -d --build
```

Or without a domain (reach it over an SSH tunnel, or your own reverse proxy):

```bash
docker compose up -d --build
# from your machine: ssh -L 3000:127.0.0.1:3000 deploy@your-vps  →  http://localhost:3000
```

## 4. Load data

```bash
docker compose run --rm scrape --from "Lexi Lore" --limit 30
```

Other modes work the same way: `--list-tags`, `--reinfer`, or no arguments for a full sync of every family-roleplay scene (slow: one request per second).

## Updating

```bash
git pull
docker compose --profile https up -d --build     # data volume is untouched
```

## Backups

`backup` writes a consistent snapshot to `/data/backups/` inside the volume and keeps the newest 14. It's safe to run while the site is live:

```bash
docker compose run --rm backup
```

Nightly at 03:30, via `crontab -e` as `deploy`:

```cron
30 3 * * * cd ~/porn-family-tree && docker compose run --rm backup >> ~/backup.log 2>&1
```

A backup inside the same volume doesn't protect against losing the server. Copy them off-box:

```bash
docker compose cp app:/data/backups ./backups      # then rsync/scp ./backups elsewhere
```

Restoring:

```bash
docker compose stop app
docker compose run --rm --entrypoint sh backup -c 'cp /data/backups/family-<stamp>.db /data/family.db && rm -f /data/family.db-wal /data/family.db-shm'
docker compose start app
```

## Optional: password-protect the site

Uncomment the `basic_auth` block in `deploy/Caddyfile` (instructions are inside), then run `docker compose --profile https up -d`.

## Before making it public

Many jurisdictions (the UK Online Safety Act, the EU and several US states) require age verification for sites showing adult imagery. The NSFW blur and `noindex` meta tag are not age verification. Until you've sorted that out, keep it private: basic auth above, or the SSH-tunnel setup.

## Useful commands

```bash
docker compose ps                          # status + health
docker compose logs -f app                 # logs (rotated: 3 × 10 MB)
docker volume inspect porn-family-tree_data
```
