# Vitco preview deployment

## Verification status

Deployment completed on **2026-11-14** at **https://vitco.hmghadam.com**. The first
standalone release was `bb18ac1acd9d7ae2732d633a1bc8b4d2ab4df13e`; both local and
public health checks reported that exact commit. The first automatic
[GitHub Actions deployment](https://github.com/0xRshia/vitco/actions/runs/43588632231)
also completed successfully. The live `/api/health` response identifies the
currently active commit after subsequent deployments.

The existing database passed `PRAGMA quick_check`, and its café, product, user,
order, and reservation counts were preserved. The old container was stopped and
its restart policy disabled after public verification; its files and image are
retained for rollback. Only the Vitco Nginx upstream changed. No DNS or certificate
changes were needed.

Read-only desktop and mobile browser checks passed for the home, cafés, menu,
payment, and reservation pages: HTTPS `200`, Persian/RTL, no horizontal overflow,
and no browser errors. No test accounts or orders were created on the live site.

The user explicitly requested deploying the changes and configuring automatic
deployment after merging to `main`. Committing and pushing the application and
deployment workflow are therefore within the requested scope.

## Existing server verified before cutover

| Item                   | Observed configuration                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| Preview                | `https://vitco.hmghadam.com`                                                                          |
| VPS                    | `91.220.113.109`, SSH port `22`, Ubuntu 24, Linux x86-64                                              |
| Existing application   | Docker container `vitco-app-1`, files under `/opt/vitco`, backend port `3200`                         |
| Persistent data        | Bind mount `/opt/vitco/data`, numerical UID/GID `10701`                                               |
| Database at inspection | `vitrin.sqlite`: zero users, one imported source café, three source products                          |
| HTTPS                  | Existing Nginx site and Let's Encrypt certificate for the preview domain; public HTTPS returned `200` |
| DNS                    | Already provisioned for this hostname; no DNS change is required for the rollout                      |

The café and products are the repository's attributed source catalog. No sample
customers, orders, reservations, or unrelated business records are inserted. The
existing SQLite database and uploaded files must be preserved. The zero-user
count is an inspection snapshot, not permission to discard the database later.

The older [deployment notes](deployment.md) for `dev.rshi.info` describe a
different host and installation. They must not be used as this preview's server
inventory.

## New isolated standalone layout

The new service uses a separate release tree and pinned runtime while retaining
the existing data directory and numerical service identity.

| Item                | Rollout configuration                                                    |
| ------------------- | ------------------------------------------------------------------------ |
| Release root        | `/opt/vitco-web`                                                         |
| Releases            | `/opt/vitco-web/releases/<40-character-commit-SHA>`                      |
| Active release      | `/opt/vitco-web/current`, switched atomically                            |
| Incoming files      | `/opt/vitco-web/incoming/<SHA>.tgz` and `<SHA>.tgz.sha256`               |
| SQLite backups      | `/opt/vitco-web/backups`                                                 |
| Shared data         | `/var/lib/vitco` symlink to existing `/opt/vitco/data`                   |
| Runtime             | Node.js `24.21.0`, `/opt/vitco-runtime/node-v24.21.0-linux-x64/bin/node` |
| Service             | `vitco.service`, user/group `vitco`, numerical UID/GID `10701`           |
| Backend             | `127.0.0.1:3030`; no public backend listener                             |
| Runtime environment | Private `/etc/vitco/app.env`, outside source and release artifacts       |
| Canonical origin    | `APP_ORIGIN=https://vitco.hmghadam.com`                                  |
| Database            | `DATABASE_PATH=/var/lib/vitco/vitrin.sqlite`                             |

The initial provisioning script is [provision-vps.sh](../deploy/provision-vps.sh).
It verifies the existing data and certificate, installs the checksum-verified Node
runtime and service files, preserves the old Nginx configuration, and prepares a
dedicated deployment account. It does not stop the existing container or change
its routing merely by provisioning the new service.

All three `ZARINPAL_*` variables remain empty on this preview. No gateway request,
real charge, external sandbox transaction, refund, or payout is part of this
deployment. The supplied merchant configuration is stored separately in private,
root-owned `/etc/vitco/zarinpal.pending.env`; the service does not load it. The
gateway's registered domain must be approved before activation. See
[payment configuration and limitations](zarinpal-payments.md).

## Release and cutover procedure

1. Validate the source commit and build the production standalone output with
   the pinned Node version. [package-release.mjs](../scripts/package-release.mjs)
   requires the exact current Git commit and a clean working tree, packages the
   runtime plus public/static assets, and writes its checksum manifest.
2. Keep private environment files, SQLite files, uploads, credentials, and browser
   test artifacts out of the release. Persistent runtime data stays on the VPS.
3. Upload the archive and checksum to the isolated incoming directory. The
   root-owned [SSH command wrapper](../deploy/ssh-command.sh) permits the reviewed
   upload/preflight/activation operations and rejects arbitrary shell commands.
4. [activate-release.sh](../deploy/activate-release.sh), installed as
   `/usr/local/bin/vitco-activate`, accepts one complete lowercase commit SHA.
   It takes a deployment lock, validates the checksum and tar entries, rejects
   private/runtime data and unsafe paths, and checks `BUILD_COMMIT` before use.
5. Before switching the active release, the activation script creates an online
   SQLite backup with the SQLite backup API. It links the release to shared data,
   changes `current` atomically, restarts `vitco.service`, and checks health.
6. During the first cutover, move only the preview's Nginx upstream from the old
   backend to the new loopback service, validate with `nginx -t`, and reload Nginx.
   Both the local and public health responses must report `status: "ok"` and the
   exact intended commit. An existing HTTPS `200` alone is insufficient.
7. Stop the legacy `vitco-app-1` container only after the new public release has
   been verified. Retain its files, image, data mount, and previous Nginx routing
   for rollback. Never run both application versions against shared data longer
   than required for the controlled cutover.

The deployment account is `vitco-deploy`. Its authorized key is root managed,
uses a forced command and SSH restrictions, and has no general shell or Docker
access through that key. Its only sudo permissions are restarting or stopping
`vitco.service`; it cannot administer other applications. Server bootstrap and
changes to these root-owned restrictions remain separate administrative work.

## Automatic deployment after merging

[ci-deploy.yml](../.github/workflows/ci-deploy.yml) checks pull requests targeting
`main`. A push to `main`, including a merge, runs the same checks and then deploys
that verified release to the `preview` environment. A manual workflow dispatch on
`main` is also supported.

The checks install locked dependencies, check formatting and TypeScript, run unit
tests, build production output, run Chromium browser tests, and package the
standalone artifact. Actions are pinned to immutable commit SHAs. Pull-request
checks do not receive deployment secrets. Deployment is serialized without
cancelling a release already being activated, and a stale-main guard skips a
release when `main` has advanced.

These GitHub Actions secrets were configured for this repository:

| Secret                     | Purpose                                                          |
| -------------------------- | ---------------------------------------------------------------- |
| `VITCO_DEPLOY_HOST`        | VPS hostname or IPv4 endpoint                                    |
| `VITCO_DEPLOY_PORT`        | SSH port                                                         |
| `VITCO_DEPLOY_USER`        | Dedicated deployment account                                     |
| `VITCO_DEPLOY_SSH_KEY`     | Private key corresponding to the restricted server key           |
| `VITCO_DEPLOY_KNOWN_HOSTS` | Independently verified host key for that exact endpoint and port |

These values are not printed or stored in this document. The workflow checks the
pinned host key, uploads only the verified release, requests activation, and
checks the public health commit. The preview environment URL is
`https://vitco.hmghadam.com`.

Local validation and the first GitHub Actions run passed **44 unit tests and 16
desktop/mobile browser tests**, TypeScript, formatting, the standalone build,
privacy-filtered packaging, restricted-key transfer, activation, and public health
verification. Uploads were tested and unrelated SSH commands were rejected.

## Health checks and rollback

Read-only operational checks on the VPS include:

```sh
systemctl status vitco.service --no-pager
journalctl -u vitco.service -n 100 --no-pager
curl --fail http://127.0.0.1:3030/api/health
curl --fail 'https://vitco.hmghadam.com/api/health'
readlink /opt/vitco-web/current
nginx -t
```

The health endpoint checks database access and reports the release commit; it
does not contact payment, SMS, or email providers. Never include private runtime
environment files or credentials in an operational report.

If activation fails, the script restores the previous release link and restarts
that service. If there is no previous standalone release, it stops the new
service. The initial cutover can then restore the retained legacy container and
its saved Nginx upstream as necessary.

Automatic rollback restores **code only**. It does not replace or rewind the
production database. A schema change incompatible with the previous code needs
separate operator review. SQLite backups on the same VPS are useful recovery
snapshots but do not replace independent backups of both the database and
uploads. Retain the previous release until the new release is confirmed healthy.
