import * as p from '@clack/prompts';
import { assertOk, type CliIo, type SpinnerLike } from './io.js';

export function clackIo(): CliIo {
  return {
    intro: (m) => p.intro(m),
    outro: (m) => p.outro(m),
    info: (m) => p.log.info(m),
    warn: (m) => p.log.warn(m),
    error: (m) => p.log.error(m),
    text: async (o) => assertOk<string>(await p.text(o)),
    select: async <T extends string>(o: { message: string; options: { value: T; label: string }[] }) =>
      assertOk(
        (await p.select({
          message: o.message,
          options: o.options.map((x) => ({ value: x.value, label: x.label })) as p.Option<T>[],
        })) as T,
      ),
    multiselect: async <T extends string>(o: {
      message: string;
      options: { value: T; label: string }[];
      initialValues?: T[];
    }) =>
      assertOk(
        (await p.multiselect({
          message: o.message,
          options: o.options.map((x) => ({ value: x.value, label: x.label })) as p.Option<T>[],
          initialValues: o.initialValues,
        })) as T[],
      ),
    confirm: async (o) => assertOk<boolean>(await p.confirm(o)),
    spinner(): SpinnerLike {
      const s = p.spinner();
      return { start: (m) => s.start(m), stop: (m) => s.stop(m) };
    },
  };
}
