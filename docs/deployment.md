# Deployment: dev.rshi.info

## Server layout

- Public URL: https://dev.rshi.info
- Host: `155.117.197.243`, SSH port `9011`.
- Service: `vitrin-cafe.service`, running as the unprivileged `vitrin-cafe` user.
- Runtime: existing `/opt/node/node-v22.23.2-linux-x64/bin/node`.
- Release: `/opt/vitrin-cafe/releases/20261004-1`.
- Active release link: `/opt/vitrin-cafe/current`.
- Database: `/var/lib/vitrin-cafe/vitrin.sqlite`.
- Uploads: `/var/lib/vitrin-cafe/uploads`.
- Release `data` link points to `/var/lib/vitrin-cafe`.
- Private runtime environment: `/etc/vitrin-cafe/app.env`.
- Internal listener: `127.0.0.1:3020`.
- Nginx virtual host: `/etc/nginx/sites-available/dev.rshi.info`.
- Previous virtual host backup: `/etc/vitrin-cafe/nginx-before-20261004-1.conf`.

The existing domain certificate, HTTP-to-HTTPS redirect, and Cloudflare routing
are reused. The application's service is enabled at boot and restarts on failure.
Only the app data and Next.js cache are writable by the service. The system Node.js
installation and the other applications on the server are not changed.

The environment sets `APP_ORIGIN=https://dev.rshi.info` and
`DATABASE_PATH=/var/lib/vitrin-cafe/vitrin.sqlite`. Optional SMS, mail, and support
settings can be added to that file, followed by a service restart. No SSH password
or provider secret is stored in this repository.

## Operations

Run these commands on the server:

```sh
systemctl status vitrin-cafe --no-pager
journalctl -u vitrin-cafe -n 100 --no-pager
systemctl restart vitrin-cafe
curl --fail http://127.0.0.1:3020/api/bootstrap
nginx -t
```

For a future release, upload source into a new release directory, install from
`package-lock.json`, test, and build using the pinned Node runtime. Keep the
database and uploads in `/var/lib/vitrin-cafe`; do not copy local development data.
Create the `data` symlink and writable `.next/cache` directory, update `current`,
and restart the service. Verify the internal listener and public HTTPS routes.
Retain the previous release until verification succeeds.

Back up SQLite with its online backup API or stop this service briefly before
copying the entire data directory, including any WAL files and uploads. A release
archive alone does not back up user data.

## Rollback to the application previously on this domain

The former service on port `3010` is retained. To restore its domain routing:

```sh
cp -a /etc/vitrin-cafe/nginx-before-20261004-1.conf /etc/nginx/sites-available/dev.rshi.info
nginx -t && systemctl reload nginx
```

Confirm the old application is reachable before optionally stopping
`vitrin-cafe`. This rollback does not delete the Vitrin Cafe database or uploads.
