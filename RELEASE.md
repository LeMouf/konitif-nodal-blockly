# Release boundary

`@konitif/nodal-blockly` is published only from the standalone
`LeMouf/konitif-nodal-blockly` repository. A merge does not publish a package.

Before release:

1. install exactly the reviewed lockfile with lifecycle scripts disabled;
2. build ESM and declarations with the locked TypeScript compiler;
3. run package contracts and the isolated archive consumer;
4. review the exact archive file list, integrity and version;
5. require a matching protected `v<version>` tag on `main` and the
   `npm-release` environment;
6. publish the verified archive through GitHub Actions OIDC.

Publication additionally requires the repository variable
`NODAL_BLOCKLY_NPM_PUBLISH_ENABLED=true`. The initial npm version is a reviewed,
authenticated maintainer bootstrap exception. Configure npm Trusted Publishing
for `LeMouf / konitif-nodal-blockly / publish.yml / npm-release` before enabling
later OIDC releases.
