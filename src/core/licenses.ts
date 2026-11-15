export interface LicenseEntry {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly url: string;
}

/** Runtime third-party code included in the shipped bundle. */
export const LICENSES: readonly LicenseEntry[] = [
  {
    name: "matrix-js-sdk",
    version: "45.1.0",
    license: "Apache-2.0",
    url: "https://github.com/matrix-org/matrix-js-sdk",
  },
  {
    name: "@matrix-org/matrix-sdk-crypto-wasm",
    version: "18.9.2",
    license: "Apache-2.0",
    url: "https://github.com/matrix-org/matrix-rust-sdk",
  },
  {
    name: "dompurify",
    version: "3.4.17",
    license: "MPL-2.0 OR Apache-2.0",
    url: "https://github.com/cure53/DOMPurify",
  },
  {
    name: "marked",
    version: "18.2.0",
    license: "MIT",
    url: "https://github.com/markedjs/marked",
  },
];
