#!/usr/bin/env bash
set -euo pipefail
umask 027

# Installed root-owned as /usr/local/bin/vitco-activate; runs as vitco-deploy.
# That account may restart only vitco.service, never other applications.
release_id="${1:-}"
[[ "$#" == 1 && "$release_id" =~ ^[a-f0-9]{40}$ ]] || {
  echo 'Expected one full commit SHA.' >&2
  exit 2
}
[[ "$(id -un)" == vitco-deploy ]] || { echo 'Run as vitco-deploy.' >&2; exit 2; }
[[ "$(uname -m)" == x86_64 ]] || { echo 'Release requires Linux x86_64.' >&2; exit 2; }

base=/opt/vitco-web
archive="$base/incoming/$release_id.tgz"
checksum="$archive.sha256"
release="$base/releases/$release_id"
exec 9>"$base/.deploy.lock"
flock -w 300 9
[[ -f "$archive" && ! -L "$archive" && -f "$checksum" && ! -L "$checksum" ]]
expected="$(cat "$checksum")"
[[ "$expected" =~ ^([a-f0-9]{64})[[:space:]][[:space:]]$release_id\.tgz$ ]] || {
  echo 'Invalid checksum manifest.' >&2
  exit 2
}
[[ "$(sha256sum "$archive" | cut -d' ' -f1)" == "${BASH_REMATCH[1]}" ]] || {
  echo 'Release checksum mismatch.' >&2
  exit 2
}

if [[ ! -d "$release" ]]; then
  staging="$(mktemp -d "$base/releases/.prepare-$release_id-XXXXXX")"
  trap '[[ -z "${staging:-}" ]] || rm -rf -- "$staging"' EXIT
  python3 - "$archive" "$staging" <<'PY'
import sys, tarfile
from pathlib import PurePosixPath
with tarfile.open(sys.argv[1], 'r:gz') as archive:
    for item in archive.getmembers():
        path = PurePosixPath(item.name)
        if path.is_absolute() or '..' in path.parts:
            raise SystemExit('Unsafe release archive path')
        if (any(part.startswith('.env') or part in {'.git', '.ssh', 'test-results'} for part in path.parts)
                or (path.parts and path.parts[0] in {'data', 'uploads'})
                or path.parts[:2] == ('public', 'uploads')):
            raise SystemExit('Private/runtime data is forbidden in release archives')
        if item.isdev() or item.isfifo() or item.islnk():
            raise SystemExit('Unsupported archive entry')
        if item.issym():
            target = PurePosixPath(item.linkname)
            if target.is_absolute() or '..' in target.parts:
                raise SystemExit('Unsafe archive symlink')
    # All extraction is confined to a fresh release directory owned by vitco-deploy.
    archive.extractall(sys.argv[2], filter='data')
PY
  [[ -f "$staging/server.js" && -f "$staging/BUILD_COMMIT" ]]
  [[ "$(cat "$staging/BUILD_COMMIT")" == "$release_id" ]]
  chmod -R u=rwX,g=rX,o= "$staging"
  mkdir -p "$staging/.next/cache"
  chmod 2770 "$staging/.next/cache"
  ln -s /var/lib/vitco "$staging/data"
  mv "$staging" "$release"
  staging=''
fi
[[ "$(cat "$release/BUILD_COMMIT")" == "$release_id" ]]

if [[ -f /var/lib/vitco/vitrin.sqlite ]]; then
  backup="$base/backups/$(date -u +%Y%m%dT%H%M%SZ)-$release_id.sqlite"
  python3 - "$backup" <<'PY'
import sqlite3, sys
with sqlite3.connect('file:/var/lib/vitco/vitrin.sqlite?mode=ro', uri=True) as source:
    with sqlite3.connect(sys.argv[1]) as destination:
        source.backup(destination)
PY
  chmod 600 "$backup"
fi

previous="$(readlink "$base/current" || true)"
ln -sfnT -- "$release" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"
health_matches() {
  curl --fail --silent --show-error --max-time 10 "$1" |
    python3 -c 'import json,sys; data=json.load(sys.stdin); sys.exit(0 if data.get("status")=="ok" and data.get("commit")==sys.argv[1] else 1)' "$release_id"
}
rollback() {
  echo 'Health verification failed; restoring the previous release.' >&2
  if [[ -n "$previous" && -d "$previous" ]]; then
    ln -sfnT -- "$previous" "$base/current.rollback"
    mv -Tf "$base/current.rollback" "$base/current"
    sudo -n /usr/bin/systemctl restart vitco.service
  else
    sudo -n /usr/bin/systemctl stop vitco.service
    rm -f "$base/current"
  fi
  exit 1
}
sudo -n /usr/bin/systemctl restart vitco.service || rollback
healthy=false
for attempt in {1..20}; do
  if health_matches http://127.0.0.1:3030/api/health; then healthy=true; break; fi
  sleep 2
done
[[ "$healthy" == true ]] || rollback
public_healthy=false
for attempt in {1..30}; do
  if health_matches "https://vitco.hmghadam.com/api/health?release=$release_id"; then public_healthy=true; break; fi
  sleep 2
done
[[ "$public_healthy" == true ]] || rollback
echo "Deployed $release_id to https://vitco.hmghadam.com"
