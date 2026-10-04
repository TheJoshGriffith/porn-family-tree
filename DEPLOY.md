# Deploying to a VPS (behind Cloudflare)

Any Linux VPS with Docker works. A 1 vCPU / 1 GB box is plenty; the build is the heaviest step.

## How it fits together

```
visitor ──HTTPS──▶ Cloudflare ◀──outbound tunnel── cloudflared ──▶ app:3000 ──▶ /data (volume)
```

- **Cloudflare Tunnel:** `cloudflared` dials *out* to Cloudflare, so the VPS opens no web ports and its IP never appears in DNS. Cloudflare terminates HTTPS.
- **App container:** non-root user, read-only root filesystem, every Linux capability dropped, `no-new-privileges`, and memory and process limits. It also listens on `127.0.0.1:3000`, reachable only from the VPS itself.
- **Database:** SQLite in the named volume `data`. It survives `docker compose down`, rebuilds, image upgrades and reboots. Only `docker compose down -v` deletes it.
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
nano .env        # set TUNNEL_TOKEN and STASHDB_API_KEY
```

## 4. Start it

```bash
docker compose --profile tunnel up -d --build
docker compose --profile tunnel ps     # app should become "healthy"; cloudflared "running"
```

The tunnel shows **Healthy** in the dashboard within a few seconds, and the site is live on your hostname.

## 5. Load data

The site starts empty. The scraper never runs by itself:

```bash
docker compose run --rm scrape --from "Lexi Lore" --limit 30    # ~30 people, a few minutes
docker compose run --rm scrape                                   # or: everything (~34k scenes, 10–20 min)
```

Refresh the site afterwards. To keep a full sync current, add a nightly incremental run (`crontab -e`):

```cron
0 3 * * * cd ~/porn-family-tree && docker compose run --rm scrape >> ~/scrape.log 2>&1
```

Other modes work the same way: `--list-tags`, `--reinfer`, or no arguments for a full sync of every family-roleplay scene (slow: one request per second).

## Updating

```bash
git pull
docker compose --profile tunnel up -d --build      # data volume is untouched
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
docker compose --profile tunnel ps          # status + health
docker compose logs -f app cloudflared      # logs (rotated: 3 × 10 MB)
docker volume inspect porn-family-tree_data
```
