#!/usr/bin/env bash
set -euo pipefail
umask 077

# Run on the existing Ubuntu VPS, with the reviewed deployment files beside it.
[[ "$EUID" == 0 && "$(uname -m)" == x86_64 ]]
source_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
[[ -d /opt/vitco/data && -f /opt/vitco/data/vitrin.sqlite ]]
[[ -f /etc/nginx/sites-available/vitco.hmghadam.com ]]
[[ -f /etc/letsencrypt/live/vitco.hmghadam.com/fullchain.pem ]]
[[ -f "$source_dir/deploy-key.pub" ]]
for command in curl xz python3 sudo flock; do command -v "$command" >/dev/null; done

if ! getent group vitco >/dev/null; then
  ! getent group 10701 >/dev/null
  groupadd --gid 10701 vitco
fi
[[ "$(getent group vitco | cut -d: -f3)" == 10701 ]]
if ! id vitco >/dev/null 2>&1; then
  ! getent passwd 10701 >/dev/null
  useradd --system --uid 10701 --gid vitco --home-dir /var/lib/vitco --shell /usr/sbin/nologin vitco
fi
[[ "$(id -u vitco)" == 10701 ]]
if ! id vitco-deploy >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /var/lib/vitco-deploy --gid vitco --shell /bin/bash vitco-deploy
fi
install -d -o vitco-deploy -g vitco -m 2750 /opt/vitco-web
for directory in releases incoming backups; do
  install -d -o vitco-deploy -g vitco -m 2750 "/opt/vitco-web/$directory"
done
install -d -o root -g root -m 0755 /opt/vitco-runtime
runtime=/opt/vitco-runtime/node-v24.21.0-linux-x64
if [[ ! -x "$runtime/bin/node" ]]; then
  download="$(mktemp -d /tmp/vitco-node-XXXXXX)"
  trap 'rm -rf -- "$download"' EXIT
  archive="$download/node-v24.21.0-linux-x64.tar.xz"
  curl --fail --location --proto '=https' --tlsv1.2 --retry 2 --max-time 180 \
    https://nodejs.org/dist/v24.21.0/node-v24.21.0-linux-x64.tar.xz -o "$archive"
  printf '%s  %s\n' fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6 "$archive" | sha256sum -c -
  tar -xJf "$archive" --no-same-owner -C /opt/vitco-runtime
  chmod -R a+rX "$runtime"
fi
[[ "$("$runtime/bin/node" --version)" == v24.21.0 ]]

# Preserve the existing data directory and numerical UID; add read access only
# for the dedicated deployment account's consistent SQLite backups.
chgrp -R vitco /opt/vitco/data
find /opt/vitco/data -type d -exec chmod g+rx {} +
find /opt/vitco/data -type f -exec chmod g+r {} +
if [[ ! -e /var/lib/vitco && ! -L /var/lib/vitco ]]; then
  ln -s /opt/vitco/data /var/lib/vitco
fi
[[ "$(readlink -f /var/lib/vitco)" == /opt/vitco/data ]]
install -d -o root -g root -m 0700 /etc/vitco
if [[ ! -f /etc/vitco/previous-nginx.conf ]]; then
  cp -a /etc/nginx/sites-available/vitco.hmghadam.com /etc/vitco/previous-nginx.conf
fi
if [[ ! -f /etc/vitco/app.env ]]; then
  python3 - <<'PY'
from pathlib import Path
allowed = {'KAVENEGAR_API_KEY','KAVENEGAR_TEMPLATE','RESEND_API_KEY','MAIL_FROM','SUPPORT_USER_ID'}
lines = []
original = Path('/opt/vitco/app.env')
if original.exists():
    for line in original.read_text().splitlines():
        if line.split('=',1)[0] in allowed:
            lines.append(line)
lines.extend([
    'APP_ORIGIN=https://vitco.hmghadam.com',
    'DATABASE_PATH=/var/lib/vitco/vitrin.sqlite',
    # Terminal is registered to another domain; no gateway requests on preview.
    'ZARINPAL_MERCHANT_ID=', 'ZARINPAL_ENV=', 'ZARINPAL_CAFE_IDS=',
])
target = Path('/etc/vitco/app.env')
target.write_text('\n'.join(lines)+'\n')
target.chmod(0o600)
PY
fi

# Keep the account and key policy outside the deployment user's write access.
chown root:root /var/lib/vitco-deploy
chmod 0755 /var/lib/vitco-deploy
install -d -o root -g root -m 0755 /var/lib/vitco-deploy/.ssh
{ printf 'restrict,command="/usr/local/bin/vitco-ssh-command" '; cat "$source_dir/deploy-key.pub"; } > /var/lib/vitco-deploy/.ssh/authorized_keys
chown root:root /var/lib/vitco-deploy/.ssh/authorized_keys
chmod 0644 /var/lib/vitco-deploy/.ssh/authorized_keys
install -o root -g root -m 0755 "$source_dir/activate-release.sh" /usr/local/bin/vitco-activate
install -o root -g root -m 0755 "$source_dir/ssh-command.sh" /usr/local/bin/vitco-ssh-command
printf '%s\n' 'vitco-deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart vitco.service, /usr/bin/systemctl stop vitco.service' > /etc/sudoers.d/vitco-deploy
chmod 0440 /etc/sudoers.d/vitco-deploy
visudo -cf /etc/sudoers.d/vitco-deploy
install -o root -g root -m 0644 "$source_dir/vitco.service" /etc/systemd/system/vitco.service
systemctl daemon-reload
systemctl enable vitco.service
echo 'Vitco service and restricted deployment account provisioned; existing container and routing unchanged.'
