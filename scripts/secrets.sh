#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Secrets Management — age-based encryption for project secrets
#
# Usage: ./scripts/secrets.sh <command> [args]
#
# Commands:
#   init                  Initialize secrets dir with .recipients file
#   encrypt               Encrypt all plaintext secrets → .age files
#   decrypt               Decrypt all .age files → plaintext
#   edit <file>           Decrypt a file, open in $EDITOR, re-encrypt on save
#   add-recipient <key>   Add a public key to .recipients and re-encrypt all
#   status                Show encryption status of all secret files
#
# Requires: age (https://github.com/FiloSottile/age)
# Key location: ~/.age/erace.key
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SECRETS_DIR="${PROJECT_DIR}/secrets"
RECIPIENTS_FILE="${SECRETS_DIR}/.recipients"
AGE_KEY="${HOME}/.age/erace.key"

# ── Helpers ──────────────────────────────────────────────────────────────────

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "[secrets] $*"; }

check_age() {
  command -v age >/dev/null 2>&1 || die "'age' is not installed. Install with: brew install age"
}

check_key() {
  [ -f "$AGE_KEY" ] || die "Age key not found at ${AGE_KEY}. Generate with: age-keygen -o ${AGE_KEY}"
}

check_recipients() {
  [ -f "$RECIPIENTS_FILE" ] || die "No .recipients file. Run: $0 init"
  [ -s "$RECIPIENTS_FILE" ] || die ".recipients file is empty. Add at least one public key."
}

# Get all plaintext secret files (*.md in secrets/, excluding README)
plaintext_files() {
  find "$SECRETS_DIR" -maxdepth 1 -name '*.md' -not -name 'README.md' | sort
}

# Get all encrypted files
encrypted_files() {
  find "$SECRETS_DIR" -maxdepth 1 -name '*.md.age' | sort
}

# ── Commands ─────────────────────────────────────────────────────────────────

cmd_init() {
  check_age
  check_key

  mkdir -p "$SECRETS_DIR"

  if [ -f "$RECIPIENTS_FILE" ]; then
    info ".recipients already exists"
  else
    local pubkey
    pubkey=$(age-keygen -y "$AGE_KEY")
    echo "$pubkey" > "$RECIPIENTS_FILE"
    info "Created .recipients with your public key:"
    info "  $pubkey"
  fi

  info "Init complete. Secrets dir: ${SECRETS_DIR}"
}

cmd_encrypt() {
  check_age
  check_recipients

  local count=0
  local skipped=0

  while IFS= read -r plaintext; do
    [ -n "$plaintext" ] || continue
    local encrypted="${plaintext}.age"
    local basename
    basename=$(basename "$plaintext")

    # Smart skip: only re-encrypt if plaintext is newer than .age file
    if [ -f "$encrypted" ] && [ ! "$plaintext" -nt "$encrypted" ]; then
      skipped=$((skipped + 1))
      continue
    fi

    age -e -R "$RECIPIENTS_FILE" -o "$encrypted" "$plaintext"
    count=$((count + 1))
    info "Encrypted: ${basename}"
  done < <(plaintext_files)

  if [ $count -eq 0 ] && [ $skipped -eq 0 ]; then
    info "No secret files found to encrypt"
  elif [ $count -eq 0 ]; then
    info "All ${skipped} file(s) up to date — nothing to encrypt"
  else
    info "Encrypted ${count} file(s), ${skipped} already up to date"
  fi
}

cmd_decrypt() {
  check_age
  check_key

  local count=0

  while IFS= read -r encrypted; do
    [ -n "$encrypted" ] || continue
    local plaintext="${encrypted%.age}"
    local basename
    basename=$(basename "$plaintext")

    age -d -i "$AGE_KEY" -o "$plaintext" "$encrypted"
    count=$((count + 1))
    info "Decrypted: ${basename}"
  done < <(encrypted_files)

  if [ $count -eq 0 ]; then
    info "No encrypted files found to decrypt"
  else
    info "Decrypted ${count} file(s)"
  fi
}

cmd_edit() {
  local target="$1"
  check_age
  check_key
  check_recipients

  # Resolve the file path
  local plaintext
  if [ -f "$target" ]; then
    plaintext="$target"
  elif [ -f "${SECRETS_DIR}/${target}" ]; then
    plaintext="${SECRETS_DIR}/${target}"
  else
    die "File not found: ${target}"
  fi

  local encrypted="${plaintext}.age"
  local basename
  basename=$(basename "$plaintext")

  # Decrypt if .age exists and plaintext doesn't (or is older)
  if [ -f "$encrypted" ] && { [ ! -f "$plaintext" ] || [ "$encrypted" -nt "$plaintext" ]; }; then
    age -d -i "$AGE_KEY" -o "$plaintext" "$encrypted"
    info "Decrypted ${basename} for editing"
  fi

  if [ ! -f "$plaintext" ]; then
    die "No plaintext or encrypted file found for: ${target}"
  fi

  # Record modification time before editing
  local before_mtime
  before_mtime=$(stat -f %m "$plaintext" 2>/dev/null || stat -c %Y "$plaintext" 2>/dev/null)

  # Open in editor
  "${EDITOR:-vi}" "$plaintext"

  # Check if file was modified
  local after_mtime
  after_mtime=$(stat -f %m "$plaintext" 2>/dev/null || stat -c %Y "$plaintext" 2>/dev/null)

  if [ "$before_mtime" != "$after_mtime" ]; then
    age -e -R "$RECIPIENTS_FILE" -o "$encrypted" "$plaintext"
    info "Re-encrypted ${basename}"
  else
    info "No changes detected, skipping re-encryption"
  fi
}

cmd_add_recipient() {
  local new_key="$1"
  check_age
  check_key
  check_recipients

  # Validate the key format
  if [[ ! "$new_key" =~ ^age1[a-z0-9]{58}$ ]]; then
    die "Invalid age public key format. Expected: age1<58 chars>"
  fi

  # Check if already present
  if grep -qF "$new_key" "$RECIPIENTS_FILE"; then
    info "Key already in .recipients"
    return
  fi

  echo "$new_key" >> "$RECIPIENTS_FILE"
  info "Added recipient: ${new_key}"

  # Re-encrypt all files with the new recipient set
  info "Re-encrypting all secrets with updated recipients..."
  while IFS= read -r plaintext; do
    [ -n "$plaintext" ] || continue
    local encrypted="${plaintext}.age"
    local basename
    basename=$(basename "$plaintext")

    # Need plaintext to re-encrypt — decrypt if missing
    if [ ! -f "$plaintext" ] && [ -f "$encrypted" ]; then
      age -d -i "$AGE_KEY" -o "$plaintext" "$encrypted"
    fi

    if [ -f "$plaintext" ]; then
      age -e -R "$RECIPIENTS_FILE" -o "$encrypted" "$plaintext"
      info "Re-encrypted: ${basename}"
    fi
  done < <(plaintext_files)

  # Also handle .age files without plaintext
  while IFS= read -r encrypted; do
    [ -n "$encrypted" ] || continue
    local plaintext="${encrypted%.age}"
    if [ ! -f "$plaintext" ]; then
      age -d -i "$AGE_KEY" -o "$plaintext" "$encrypted"
      age -e -R "$RECIPIENTS_FILE" -o "$encrypted" "$plaintext"
      info "Re-encrypted: $(basename "$plaintext")"
    fi
  done < <(encrypted_files)

  info "Done. Commit .recipients and .age files."
}

cmd_status() {
  check_age

  local has_files=false

  # Check all plaintext files
  while IFS= read -r plaintext; do
    [ -n "$plaintext" ] || continue
    has_files=true
    local encrypted="${plaintext}.age"
    local basename
    basename=$(basename "$plaintext")

    if [ ! -f "$encrypted" ]; then
      echo "  [unencrypted]  ${basename}"
    elif [ "$plaintext" -nt "$encrypted" ]; then
      echo "  [stale]        ${basename}  (plaintext newer than .age)"
    else
      echo "  [ok]           ${basename}"
    fi
  done < <(plaintext_files)

  # Check for .age files without plaintext
  while IFS= read -r encrypted; do
    [ -n "$encrypted" ] || continue
    local plaintext="${encrypted%.age}"
    if [ ! -f "$plaintext" ]; then
      has_files=true
      echo "  [encrypted]    $(basename "$plaintext")  (no plaintext — run decrypt)"
    fi
  done < <(encrypted_files)

  if [ "$has_files" = false ]; then
    info "No secret files found in ${SECRETS_DIR}"
  fi

  # Show recipients info
  if [ -f "$RECIPIENTS_FILE" ]; then
    local count
    count=$(grep -c '^age1' "$RECIPIENTS_FILE" 2>/dev/null || echo 0)
    echo ""
    info "Recipients: ${count} key(s) in .recipients"
  else
    echo ""
    info "No .recipients file — run: $0 init"
  fi
}

# ── Main ─────────────────────────────────────────────────────────────────────

usage() {
  echo "Usage: $0 <command> [args]"
  echo ""
  echo "Commands:"
  echo "  init                  Initialize secrets dir with .recipients file"
  echo "  encrypt               Encrypt all plaintext secrets → .age files"
  echo "  decrypt               Decrypt all .age files → plaintext"
  echo "  edit <file>           Decrypt, edit in \$EDITOR, re-encrypt"
  echo "  add-recipient <key>   Add a public key and re-encrypt all secrets"
  echo "  status                Show encryption status of all secret files"
  exit 1
}

case "${1:-}" in
  init)           cmd_init ;;
  encrypt)        cmd_encrypt ;;
  decrypt)        cmd_decrypt ;;
  edit)           [ -n "${2:-}" ] || die "Usage: $0 edit <file>"; cmd_edit "$2" ;;
  add-recipient)  [ -n "${2:-}" ] || die "Usage: $0 add-recipient <age-public-key>"; cmd_add_recipient "$2" ;;
  status)         cmd_status ;;
  *)              usage ;;
esac
