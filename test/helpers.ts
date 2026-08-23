import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CancelledError, type CliIo } from '../src/ui/io.js';

export async function mkTmp(prefix = 'skillbase-test-'): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export interface TestIoScript {
  texts?: string[];
  selects?: string[];
  multis?: string[][];
  confirms?: boolean[];
}

export function createTestIo(script: TestIoScript = {}): { io: CliIo; out: string[] } {
  const out: string[] = [];
  const ti = script.texts ?? [];
  const si = script.selects ?? [];
  const mi = script.multis ?? [];
  const ci = script.confirms ?? [];
  const io: CliIo = {
    intro: (m) => out.push(m),
    outro: (m) => out.push(m),
    info: (m) => out.push(m),
    warn: (m) => out.push(`WARN:${m}`),
    error: (m) => out.push(`ERROR:${m}`),
    text: async (o) => ti.shift() ?? o.defaultValue ?? '',
    select: async <T extends string>(o: { options: { value: T }[] }) => {
      const v = si.shift();
      if (v === undefined) throw new CancelledError();
      return v as T;
    },
    multiselect: async <T extends string>(o: { options: { value: T }[] }) => {
      const v = mi.shift();
      if (v === undefined) throw new CancelledError();
      return v as T[];
    },
    confirm: async () => ci.shift() ?? false,
    spinner: () => ({ start: () => {}, stop: () => {} }),
  };
  return { io, out };
}
