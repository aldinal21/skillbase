import picocolors from 'picocolors';
import {
  AGENT_PRESETS,
  addCustomTarget,
  addTargetById,
  detectInstalledPresets,
  removeTargetById,
  toggleTargetById,
} from '../core/targets.js';
import { saveConfig } from '../core/config.js';
import { renderTable } from '../ui/table.js';
import type { CliCtx } from '../context.js';
import type { CliIo } from '../ui/io.js';

export async function runTargets(io: CliIo, ctx: CliCtx): Promise<void> {
  const render = () =>
    ctx.cfg.targets.length === 0
      ? io.info(picocolors.dim('No targets configured'))
      : io.info(
          renderTable(
            ['ID', 'NAME', 'PATH', 'ACTIVE'],
            ctx.cfg.targets.map((t) => [t.id, t.name, t.path, t.active ? 'yes' : 'no']),
          ),
        );

  if (!process.stdin.isTTY) {
    render();
    return;
  }

  for (;;) {
    render();
    const action = await io.select({
      message: 'Targets',
      options: [
        { value: 'preset', label: 'Add preset (detected)' },
        { value: 'custom', label: 'Add custom path' },
        { value: 'toggle', label: 'Toggle active' },
        { value: 'remove', label: 'Remove' },
        { value: 'done', label: 'Done' },
      ],
    });
    if (action === 'done') break;
    if (action === 'preset') {
      const installed = await detectInstalledPresets();
      const installedKeys = new Set(installed.map((p) => p.key));
      const picks = await io.multiselect({
        message: 'Choose presets',
        options: AGENT_PRESETS.map((p) => ({
          value: p.key,
          label: installedKeys.has(p.key) ? `${p.name} ✓` : p.name,
        })),
      });
      for (const key of picks) {
        const preset = AGENT_PRESETS.find((p) => p.key === key)!;
        ctx.cfg = addTargetById(ctx.cfg, preset);
      }
    } else if (action === 'custom') {
      const p = await io.text({ message: 'Absolute path (supports ~):' });
      if (!p) continue;
      ctx.cfg = addCustomTarget(ctx.cfg, p, p);
    } else if (action === 'toggle') {
      const id = await io.select({
        message: 'Toggle which?',
        options: ctx.cfg.targets.map((t) => ({ value: t.id, label: t.name })),
      });
      ctx.cfg = toggleTargetById(ctx.cfg, id);
    } else if (action === 'remove') {
      const id = await io.select({
        message: 'Remove which?',
        options: ctx.cfg.targets.map((t) => ({ value: t.id, label: t.name })),
      });
      if (!(await io.confirm({ message: 'Really remove?' }))) continue;
      ctx.cfg = removeTargetById(ctx.cfg, id);
    }
    await saveConfig(ctx.cfg, ctx.cfgPath);
  }
}
