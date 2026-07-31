export class RecordNotFoundError extends Error {
  constructor() {
    super("The requested record was not found.");
    this.name = "RecordNotFoundError";
  }
}

export class InvalidRecordStateError extends Error {
  constructor() {
    super("The record cannot be changed in its current state.");
    this.name = "InvalidRecordStateError";
  }
}

export class ConcurrentModificationError extends Error {
  constructor() {
    super("The record changed before the operation completed.");
    this.name = "ConcurrentModificationError";
  }
}
