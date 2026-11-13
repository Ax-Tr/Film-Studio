# CI required checks

Protect the default branch once a remote repository exists. Require these jobs before merge:

1. `Boundaries, lint, types, tests and builds`
2. `Dependency vulnerability review`
3. `Secret scan`
4. `Generate CycloneDX SBOM`
5. `JavaScript and TypeScript analysis`

Also require pull requests, at least one human approval, dismissal of stale approvals after changes and resolved review threads. The repository host and branch-protection configuration are not available in this local workspace, so enforcement must be evidenced after the remote is created.

Action references currently use reviewed major release tags. Before production release, replace them with verified full commit SHAs and configure automated update review.
