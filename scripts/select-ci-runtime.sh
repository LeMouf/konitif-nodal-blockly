#!/usr/bin/env bash
set -euo pipefail
: "${RUNNER_TOOL_CACHE:?Runner cache required}"
: "${GITHUB_PATH:?GitHub path required}"
package_node_bin="${RUNNER_TOOL_CACHE}/node/24.20.0/x64/bin"
test -x "${package_node_bin}/node"
test -x "${package_node_bin}/npm"
export PATH="${package_node_bin}:${PATH}"
test "$(node --version)" = v24.20.0
printf '%s\n' "${package_node_bin}" >> "${GITHUB_PATH}"
