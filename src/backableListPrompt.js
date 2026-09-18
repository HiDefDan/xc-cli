import ListPrompt from 'inquirer/lib/prompts/list.js';
import observe from 'inquirer/lib/utils/events.js';
import { takeUntil } from 'rxjs';

/**
 * Drop-in replacement for Inquirer's built-in "list" prompt that also
 * treats Left as Back (same sentinel as "← Back") and Right as Select
 * (same as Enter) — so registering this in place of "list" makes
 * left/right arrow navigation work everywhere for free, without touching
 * each individual prompt() call. Safe here: plain list prompts never bind
 * left/right to anything themselves (only up/down/numbers/enter).
 */
export default class BackableListPrompt extends ListPrompt {
  _run(cb) {
    const events = observe(this.rl);
    events.keypress.pipe(takeUntil(events.line)).forEach(({ key }) => {
      if (this.status === 'answered') return;
      if (key?.name === 'escape' || key?.name === 'left') {
        // ListPrompt.render() shows whatever this.selected currently
        // points at as the "answered" line, regardless of the value
        // onSubmit is given — without this, escaping out shows the
        // still-highlighted choice's label in scrollback, which reads
        // as if that option had been chosen rather than backed out of.
        const backIndex = this.opt.choices.realChoices?.findIndex((c) => c.value === null);
        if (backIndex >= 0) {
          this.selected = backIndex;
        } else {
          // No explicit "← Back"/Quit choice exists on this menu (e.g.
          // the top-level menu, which relies on Escape/Left alone) —
          // render() always looks up getChoice(this.selected) for the
          // collapsed line, so without a real backIndex to point at,
          // it'd show whatever's currently highlighted instead. Patch
          // just that one lookup rather than reimplementing render().
          const original = this.opt.choices.getChoice.bind(this.opt.choices);
          this.opt.choices.getChoice = (i) =>
            i === this.selected ? { name: '← Back', short: '← Back', value: null } : original(i);
        }
        this.onSubmit(null);
      } else if (key?.name === 'right') {
        // Reuses the library's own submit path (readline's 'line' event)
        // rather than duplicating its filter/validate logic here. Clear
        // the buffer first, same as a real Enter does internally, so no
        // stray text is left behind for whatever prompt runs next.
        const line = this.rl.line;
        this.rl.line = '';
        this.rl.cursor = 0;
        this.rl.emit('line', line);
      }
    });
    return super._run(cb);
  }
}
