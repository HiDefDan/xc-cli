import AutocompletePrompt from 'inquirer-autocomplete-prompt';
import observe from 'inquirer/lib/utils/events.js';
import { takeUntil } from 'rxjs';

/**
 * Same Escape/Left-to-Back and Right-to-Select behavior as
 * BackableListPrompt, for the autocomplete/live-search prompt. Both arrow
 * keys only fire when the cursor has nothing to move into in that
 * direction (start-of-line for Left, end-of-line for Right) — otherwise
 * they're left alone as the normal in-line cursor-move used to edit a
 * typed query, so fixing a typo mid-string still works.
 */
export default class BackableAutocompletePrompt extends AutocompletePrompt {
  _run(cb) {
    const events = observe(this.rl);
    events.keypress.pipe(takeUntil(events.line)).forEach(({ key }) => {
      if (this.answer !== undefined) return;
      const atStart = this.rl.cursor === 0;
      const atEnd = this.rl.cursor === this.rl.line.length;

      if (key?.name === 'escape' || (key?.name === 'left' && atStart)) {
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
