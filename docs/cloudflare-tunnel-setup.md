# Cloudflare Tunnel Setup Guide

This guide sets up a Cloudflare Tunnel to expose your Docker-hosted app at a custom domain with HTTPS — no port forwarding needed.

## Prerequisites

- A registered domain name
- The production Docker container running (`scripts/prod-deploy.sh deploy`)

## Step 1: Add Domain to Cloudflare

1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com) → **Add a site** → enter your domain
2. Select the **Free** plan
3. Cloudflare provides 2 nameservers (e.g., `ada.ns.cloudflare.com`, `bob.ns.cloudflare.com`)
4. Go to your domain registrar → change nameservers to the Cloudflare ones
5. Wait for propagation (minutes to hours) — Cloudflare will email you when active

## Step 2: Install cloudflared

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb
rm cloudflared.deb
```

## Step 3: Authenticate

```bash
cloudflared tunnel login
```

This opens a browser — select your domain to authorize.

## Step 4: Create Tunnel

```bash
cloudflared tunnel create rental-mgmt
```

Note the **tunnel ID** in the output (e.g., `a1b2c3d4-e5f6-...`).

## Step 5: Configure Tunnel

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /home/k/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: yourdomain.com
    service: http://localhost:3000
  - hostname: "*.yourdomain.com"
    service: http://localhost:3000
  - service: http_status:404
```

Replace `<TUNNEL_ID>` and `yourdomain.com` with your actual values.

## Step 6: Create DNS Record

```bash
cloudflared tunnel route dns rental-mgmt yourdomain.com
```

## Step 7: Run as systemd Service

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

## Verification

```bash
# Check tunnel is running
sudo systemctl status cloudflared

# Test via domain
curl https://yourdomain.com/api/health
```

## Useful Commands

```bash
# View tunnel status
cloudflared tunnel info rental-mgmt

# View logs
sudo journalctl -u cloudflared -f

# Restart tunnel
sudo systemctl restart cloudflared

# List tunnels
cloudflared tunnel list
```
