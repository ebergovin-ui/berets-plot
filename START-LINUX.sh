#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Install Node.js 22 LTS (22.12 or newer), then run this script again."
  exit 1
fi
node -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<22||(major===22&&minor<12)){console.error("Node.js 22.12 or newer is required.");process.exit(1)}'
if [ ! -f node_modules/express/package.json ]; then
  if [ -f dist/index.html ]; then npm ci --omit=dev; else npm ci; fi
fi
if [ ! -f dist/index.html ]; then npm run build; fi
exec npm start
