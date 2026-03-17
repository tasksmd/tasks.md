#!/bin/bash
# Sync all package versions to match a given version string.
# Usage: scripts/sync-versions.sh <version>
# Example: scripts/sync-versions.sh 0.2.0

set -euo pipefail

VERSION="${1:?Usage: sync-versions.sh <version>}"

# Strip leading 'v' if present (e.g. v0.2.0 → 0.2.0)
VERSION="${VERSION#v}"

PACKAGES=(parser lint mcp cli)

echo "Syncing all packages to version $VERSION..."

for pkg in "${PACKAGES[@]}"; do
  file="packages/$pkg/package.json"
  name=$(node -p "require('./$file').name")
  old=$(node -p "require('./$file').version")
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('$file', 'utf-8'));
    pkg.version = '$VERSION';
    fs.writeFileSync('$file', JSON.stringify(pkg, null, 2) + '\n');
  "
  echo "  $name: $old → $VERSION"
done

# Update cross-references (workspace packages depend on each other)
echo ""
echo "Updating cross-references..."

for pkg in "${PACKAGES[@]}"; do
  file="packages/$pkg/package.json"
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('$file', 'utf-8'));
    let changed = false;
    for (const depType of ['dependencies', 'devDependencies', 'peerDependencies']) {
      if (!pkg[depType]) continue;
      for (const [name, ver] of Object.entries(pkg[depType])) {
        if (name.startsWith('@tasks-md/') || name === 'tasks-mcp') {
          pkg[depType][name] = '^$VERSION';
          changed = true;
        }
      }
    }
    if (changed) {
      fs.writeFileSync('$file', JSON.stringify(pkg, null, 2) + '\n');
      console.log('  Updated deps in ' + '$file');
    }
  "
done

echo ""
echo "Done. All packages at $VERSION."
