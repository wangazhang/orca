#!/bin/bash
# Why: remove the PATH symlink that after-install.sh created, but only if it
# still points into this product's install dir — never delete an unrelated
# /usr/bin/yoha a user or other package may own.
set -e

link="/usr/bin/yoha"

if [ -L "$link" ]; then
  target="$(readlink "$link" || true)"
  case "$target" in
    /opt/Yoha/*|/opt/yoha/*)
      rm -f "$link"
      ;;
  esac
fi

exit 0
