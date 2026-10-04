# Deploying to a VPS (behind Cloudflare)

Any Linux VPS with Docker works. A 1 vCPU / 1 GB box is plenty; the build is the heaviest step.

## How it fits together

```
visitor ──HTTPS──▶ Cloudflare ◀──outbound tunnel── cloudflared ──▶ app:3000 ──▶ /data (volume)
```

- **Cloudflare Tunnel:** `cloudflared` dials *out* to Cloudflare, so the VPS opens no web ports and its IP never appears in DNS. Cloudflare terminates HTTPS.
- **App container:** non-root user, read-only root filesystem, every Linux capability dropped, `no-new-privileges`, and memory and process limits. It also listens on `127.0.0.1:3000`, reachable only from the VPS itself.
- **Database:** SQLite in the named volume `data`. It survives `docker compose down`, rebuilds, image upgrades and reboots. Only `docker compose down -v` deletes it.
- **Sync and backups:** two long-running containers. `sync` pulls new and changed scenes from StashDB every 6 hours, so new performers appear by themselves. `backups` snapshots the database daily. No host cron needed.
- **Secrets:** each container gets only the one it needs. `cloudflared` gets the tunnel token, `scrape` the StashDB key, and the web app none.

## 1. Create the tunnel (Cloudflare dashboard)

1. **Zero Trust → Networks → Tunnels → Create a tunnel**, type **Cloudflared**, and give it a name.
2. On the install screen, pick **Docker** and copy the long token after `--token`. You don't need to run their command; compose does that.
3. **Public Hostname** tab → **Add**: choose your subdomain and domain, set **Service** to `HTTP` and the URL to `app:3000`.

Cloudflare creates the DNS record itself. Don't add an A record pointing at the VPS.

## 2. Prepare the server

As root on a fresh Debian/Ubuntu box:

```bash
curl -fsSL https://get.docker.com | sh
adduser --disabled-password --gecos "" deploy && usermod -aG docker deploy
ufw allow OpenSSH && ufw --force enable        # SSH only; the tunnel needs no inbound ports
```

## 3. Get the code and configure

```bash
su - deploy
git clone https://github.com/TheJoshGriffith/porn-family-tree.git
cd porn-family-tree
cp .env.example .env
chmod 600 .env
nano .env        # set TUNNEL_TOKEN and STASHDB_API_KEY; keep COMPOSE_PROFILES=tunnel,scheduled
```

## 4. Start it

```bash
docker compose up -d --build
docker compose ps        # app "healthy"; cloudflared, sync, backups "running"
```

`COMPOSE_PROFILES=tunnel,scheduled` in `.env` decides what starts. The tunnel shows **Healthy** in the Cloudflare dashboard within a few seconds.

## 5. Data loads itself

`sync` starts straight away. Its first run fetches every family-roleplay scene on StashDB (about 34k scenes, 10–20 minutes). The site fills in as it goes; refresh to see more. After that it checks every 6 hours (`SYNC_EVERY` in `.env`), and those runs take seconds. Watch it with:

```bash
docker compose logs -f sync
```

Each sync also recomputes the home-page family map, which appears once the first sync finishes. `MAP_MIN_SCENES` in `.env` (default 2) sets how many scenes a pair needs together to count as a recurring family. After changing it, redo the map with `docker compose run --rm scrape --layout`.

One-off runs still work alongside it, for example a scoped crawl or re-running inference after a rules change:

```bash
docker compose run --rm scrape --from "Lexi Lore" --limit 30   # narrows the site to 30 people…
docker compose run --rm scrape --reinfer
```

A `--from` crawl and the scheduled sync pull in different directions. The crawl narrows the site to the people it visited; the next sync puts everyone back. If you want the small, scoped site, remove `scheduled` from `COMPOSE_PROFILES`.

## Updating

```bash
git pull
docker compose up -d --build      # data volume is untouched
```

## Backups

The `backups` container writes a consistent snapshot to `/data/backups/` once a day and keeps the newest 14 (`BACKUP_KEEP`). For an extra one on demand, which is safe while the site is live:

```bash
docker compose run --rm backup
```

A backup inside the same volume doesn't protect against losing the server. Copy them off-box:

```bash
docker compose cp app:/data/backups ./backups      # then rsync/scp ./backups elsewhere
```

Restoring:

```bash
docker compose stop app sync
docker compose run --rm --entrypoint sh backup -c 'cp /data/backups/family-<stamp>.db /data/family.db && rm -f /data/family.db-wal /data/family.db-shm'
docker compose start app sync
```

## Regional image blocking

Visitors whose Cloudflare country (`CF-IPCountry`) is in `RESTRICTED_COUNTRIES` (default `GB`) get no images at all. The server leaves image URLs out of the page instead of blurring them, and the NSFW toggle becomes a "No images in your region" notice. Unknown locations, Tor, and requests without the header (i.e. not via Cloudflare) are treated as restricted.

- Requires **Network → IP Geolocation** to be on for the zone in Cloudflare (it's on by default).
- To change the list, set `RESTRICTED_COUNTRIES=GB,FR` in `.env`. Set `RESTRICTED_COUNTRIES=` (empty) to disable it.
- VPN users appear in whatever country their VPN exits from. Ofcom expects reasonable steps beyond plain geolocation, so this reduces risk but doesn't make you compliant.

## Keeping it private

Many jurisdictions (the UK Online Safety Act, the EU and several US states) require age verification for sites showing adult imagery. The NSFW blur and `noindex` meta tag are not age verification. Until you've sorted that out, keep the site private with **Cloudflare Access**, which is free for up to 50 users:

**Zero Trust → Access → Applications → Add → Self-hosted**, add your hostname, then a policy such as *Include → Emails → you@example.com*. Visitors get a one-time code by email before they reach the site. Nothing changes on the server.

## Useful commands

```bash
docker compose ps                           # status + health
docker compose logs -f app sync             # logs (rotated: 3 × 10 MB)
docker volume inspect porn-family-tree_data
```
