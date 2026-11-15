import type { FailureCode } from "../protocol/index.ts";

export class WorkerFailure extends Error {
  readonly code: FailureCode;

  constructor(code: FailureCode) {
    super(code);
    this.name = "WorkerFailure";
    this.code = code;
  }
}
