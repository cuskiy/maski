/** The hashed URLs the page generator needs; written once by the build. */
export interface Assets {
  readonly stylesheet: string;
  readonly icon: string;
  readonly guard: string;
  readonly prepaint: string;
  readonly client: string;
  readonly reviewClient: string;
  readonly imageWorker: string;
  readonly matrixWorker: string;
  readonly cryptoWasm: string;
}
