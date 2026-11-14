#!/usr/bin/env bash
set -euo pipefail

# Root-owned forced command for the dedicated GitHub Actions SSH key.
command="${SSH_ORIGINAL_COMMAND:-}"
command="${command#"${command%%[![:space:]]*}"}"
command="${command%"${command##*[![:space:]]}"}"
if [[ "$command" =~ ^/usr/local/bin/vitco-activate[[:space:]]([a-f0-9]{40})$ ]]; then
  exec /usr/local/bin/vitco-activate "${BASH_REMATCH[1]}"
fi
case "$command" in
  'test -d /opt/vitco-web/incoming && test -w /opt/vitco-web/incoming')
    test -d /opt/vitco-web/incoming && test -w /opt/vitco-web/incoming
    ;;
  sftp|internal-sftp|/usr/lib/openssh/sftp-server)
    # SCP uses SFTP. Permit uploads; forbid downloading application data and
    # creating links. The account's home/authorized_keys are root-owned.
    exec /usr/lib/openssh/sftp-server -d /opt/vitco-web/incoming -P read,symlink,hardlink,copy-data
    ;;
  *)
    echo 'Only Vitco release uploads and activation are permitted.' >&2
    exit 2
    ;;
esac
