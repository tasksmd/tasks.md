#!/usr/bin/env node
// Diagnose npm Trusted Publishing from inside GitHub Actions. It publishes
// nothing. Run it with: gh workflow run publish.yml
//
// `npm publish` hides why its OIDC login failed: it falls back to no login and
// the publish PUT returns 404. This script does the same two calls by hand and
// prints the answer:
//   1. ask GitHub for an OIDC token for the npm audience;
//   2. ask npm to exchange it for each package.
// It prints the claims npm matches on, the HTTP status, and npm's message.
// It never prints the GitHub token or the npm token.

const PACKAGES = ["@tasks-md/parser", "@tasks-md/lint", "tasks-mcp", "@tasks-md/cli"];
const REGISTRY = "https://registry.npmjs.org";
const CLAIMS = [
  "sub",
  "aud",
  "repository",
  "repository_id",
  "repository_owner",
  "repository_visibility",
  "workflow_ref",
  "job_workflow_ref",
  "ref",
  "event_name",
  "environment",
  "runner_environment",
];

const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
if (!requestUrl || !requestToken) {
  console.error("No OIDC request variables. The job needs `permissions: id-token: write`.");
  process.exit(1);
}

const tokenResponse = await fetch(`${requestUrl}&audience=npm:registry.npmjs.org`, {
  headers: { Authorization: `Bearer ${requestToken}` },
});
if (!tokenResponse.ok) {
  console.error(`GitHub OIDC token request failed: HTTP ${tokenResponse.status}`);
  process.exit(1);
}
const idToken = (await tokenResponse.json()).value;
console.log(`::add-mask::${idToken}`);

const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf-8"));
console.log("GitHub OIDC claims:");
for (const claim of CLAIMS) console.log(`  ${claim}: ${payload[claim] ?? "(none)"}`);

let failed = 0;
for (const name of PACKAGES) {
  const url = `${REGISTRY}/-/npm/v1/oidc/token/exchange/package/${name.replace("/", "%2f")}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  let message = "";
  try {
    const body = await response.json();
    if (body.token) console.log(`::add-mask::${body.token}`);
    message = body.message ?? body.error ?? "";
  } catch {
    message = "(no JSON body)";
  }
  const ok = response.status >= 200 && response.status < 300;
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${name}: HTTP ${response.status}${message ? ` - ${message}` : ""}`);
}

console.log(failed === 0 ? "npm accepts this workflow for every package." : `${failed} package(s) refused.`);
process.exit(failed === 0 ? 0 : 1);
