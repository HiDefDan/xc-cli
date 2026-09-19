import AutocompletePrompt from 'inquirer-autocomplete-prompt';
import observe from 'inquirer/lib/utils/events.js';
import { takeUntil } from 'rxjs';

/**
 * Same Escape/Left-to-Back and Right-to-Select behavior as
 * BackableListPrompt, for the autocomplete/live-search prompt.
 *
 * Left only backs out when the box is genuinely EMPTY or still shows
 * exactly the pre-filled default untouched, not merely when the cursor
 * happens to be at position 0 — cursor-at-0 also happens mid-edit
 * (navigating to the start of a typed query to fix a typo), which is a
 * completely normal editing action, not an attempt to back out. Treating
 * it as Back destroyed whatever was typed on one stray Left press. A
 * pre-fill you haven't touched yet counts the same as empty from your
 * perspective (you didn't ask for that text) — the moment you edit it,
 * Left goes back to pure cursor-navigation. Right-to-select doesn't have
 * the same problem: cursor lands at end-of-line naturally after typing
 * (the common resting state), not only via deliberate navigation, so
 * there's no equivalent "innocent" case to protect against there.
 */
export default class BackableAutocompletePrompt extends AutocompletePrompt {
  _run(cb) {
    const events = observe(this.rl);
    events.keypress.pipe(takeUntil(events.line)).forEach(({ key }) => {
      if (this.answer !== undefined) return;
      const atEnd = this.rl.cursor === this.rl.line.length;
      const untouched = !this.rl.line || this.rl.line === (this.initialValue || '');

      if (key?.name === 'escape' || (key?.name === 'left' && untouched)) {
        this.answer = null;
        this.answerName = '← Back'; // render() falls back to raw this.answer ("null") otherwise
        this.status = 'answered';
        this.render();
        this.screen.done();
        this.done(null);
      } else if (key?.name === 'right' && atEnd) {
        // Reuses the library's own submit path (readline's 'line' event)
        // rather than duplicating its onSubmit/validate logic here. Clear
        // the buffer first, same as a real Enter does internally, so no
        // stray text is left behind for whatever prompt runs next.
        const line = this.rl.line;
        this.rl.line = '';
        this.rl.cursor = 0;
        this.rl.emit('line', line);
      }
    });
    const result = super._run(cb);
    // The base constructor stashes the caller's `default` string in
    // initialValue before nulling opt.default out (it only uses it to
    // preselect a matching choice). Reusing it here re-populates the
    // visible input line on reopen, so backing out of a result and
    // reopening search doesn't leave you retyping the same query.
    if (this.initialValue) this.rl.write(this.initialValue);
    return result;
  }
}
