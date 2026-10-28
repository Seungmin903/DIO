#!/bin/sh
set -eu
# Fail before installation when a producer artifact was not delivered.
node qa/run-member-contract-ci.cjs --check-artifacts
package_manager="$(node -p 'require("./package.json").packageManager')"
# Use the repository version and lockfile; do not run native dependency lifecycle scripts.
npm exec --yes --package="$package_manager" -- pnpm install --frozen-lockfile --ignore-scripts --store-dir .pnpm-store
node qa/run-member-contract-ci.cjs
