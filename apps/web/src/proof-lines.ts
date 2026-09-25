import { REPO_URL, type DocParagraph } from "./docs";
import { PROOF_FACTS, type ProofFacts } from "./proof-facts.generated";

const BLOB: string = `${REPO_URL}/blob/main/`;

function blob(path: string): string {
  return `${BLOB}${path}`;
}

export function proofParagraphs(): ReadonlyArray<DocParagraph> {
  const facts: ProofFacts = PROOF_FACTS;
  const dependencyNames: string = facts.runtimeDependencies.join(", ");
  return [
    [`${facts.testSuites} test suites, ${facts.tests} tests.`],
    [
      "dist/index.mjs gzip ",
      { code: String(facts.gzipIndexBytes) },
      " bytes. dist/engine.mjs gzip ",
      { code: String(facts.gzipEngineBytes) },
      " bytes.",
    ],
    [
      "Engine entry imports in Node with react unresolvable (",
      {
        link: "engine-entry-react-free.test.ts",
        href: blob(
          "packages/hypr-tiling/__tests__/engine-entry-react-free.test.ts",
        ),
      },
      ").",
    ],
    [
      "api-extractor reviews ",
      {
        link: "etc/hypr-tiling.api.md",
        href: blob("packages/hypr-tiling/etc/hypr-tiling.api.md"),
      },
      " and ",
      {
        link: "etc/hypr-tiling.engine.api.md",
        href: blob("packages/hypr-tiling/etc/hypr-tiling.engine.api.md"),
      },
      " on every release.",
    ],
    [
      'This page prerenders with paneIdentity "slot"; after mount it is "stable".',
    ],
    [
      "Persisted layouts load through ",
      {
        link: "assertLayoutIntegrity",
        href: blob(
          "packages/hypr-tiling/README.md#persisted-layout-optional-glue",
        ),
      },
      " and ",
      {
        link: "repairLayout",
        href: blob(
          "packages/hypr-tiling/README.md#persisted-layout-optional-glue",
        ),
      },
      ".",
    ],
    [
      `${facts.runtimeDependencyCount} runtime dependencies: ${dependencyNames}. Peer react ${facts.reactPeer}, react-dom ${facts.reactDomPeer}.`,
    ],
    [
      "Versions are calendar YY.M.R. Breaking changes are flagged in ",
      {
        link: "CHANGELOG.md",
        href: blob("packages/hypr-tiling/CHANGELOG.md"),
      },
      `. This build is ${facts.version}.`,
    ],
    [
      "license: ",
      {
        link: facts.license,
        href: blob("packages/hypr-tiling/package.json"),
      },
      ".",
    ],
  ];
}
