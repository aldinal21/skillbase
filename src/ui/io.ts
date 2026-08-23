export class CancelledError extends Error {
  constructor() {
    super('cancelled');
  }
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SpinnerLike {
  start(msg?: string): void;
  stop(msg?: string): void;
}

export interface CliIo {
  intro(msg: string): void;
  outro(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  text(opts: { message: string; defaultValue?: string }): Promise<string>;
  select<T extends string>(opts: { message: string; options: SelectOption<T>[] }): Promise<T>;
  multiselect<T extends string>(opts: {
    message: string;
    options: SelectOption<T>[];
    initialValues?: T[];
  }): Promise<T[]>;
  confirm(opts: { message: string; initialValue?: boolean }): Promise<boolean>;
  spinner(): SpinnerLike;
}

/** True when value is a clack-style cancel symbol. */
export function cancelled(v: unknown): boolean {
  return typeof v === 'symbol';
}

export function assertOk<T>(v: T | symbol): T {
  if (cancelled(v)) throw new CancelledError();
  return v as T;
}
