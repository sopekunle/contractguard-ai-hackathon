import { useMemo, useState, type FormEvent } from 'react';
import { CalendarDays, Download } from 'lucide-react';
import { calendarInstant, makeCalendarReminder, reminderDays } from './calendar';
import { scanReviewedDeadlines, type Deadline } from './deadlines';
import './referencePages.css';

const VISIBLE_DEADLINES_PER_STEP = 12;

function CalendarForm({ proposedDate }: { proposedDate: string | null }) {
  const [date, setDate] = useState(proposedDate ?? '');
  const [time, setTime] = useState('09:00');
  const [zone, setZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [days, setDays] = useState<number[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [feedback, setFeedback] = useState('');
  const needsConfirmation = () => { setConfirmed(false); setFeedback(''); };

  function download(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed) return;
    try {
      const calendar = makeCalendarReminder(calendarInstant(date, time, zone.trim()), days);
      const url = URL.createObjectURL(new Blob([calendar], { type: 'text/calendar;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'contract-deadline.ics';
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback('Calendar file downloaded. Import it into your calendar and check its reminder settings.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'The calendar file could not be created.');
    }
  }

  return <form onSubmit={download} className="deadline-form">
    <p>Set the event time yourself. Your calendar decides whether imported reminders notify you.</p>
    <div className="deadline-fields">
      <label>Deadline date<input type="date" required value={date} onChange={(e) => { setDate(e.target.value); needsConfirmation(); }}/></label>
      <label>Time<input type="time" required value={time} onChange={(e) => { setTime(e.target.value); needsConfirmation(); }}/></label>
      <label>Time zone<input type="text" required value={zone} autoComplete="off" onChange={(e) => { setZone(e.target.value); needsConfirmation(); }}/></label>
    </div>
    <fieldset>
      <legend>Remind me before the deadline</legend>
      <div className="deadline-alarms">
        {reminderDays.map((day) => <label key={day}>
          <input type="checkbox" checked={days.includes(day)} onChange={(e) => {
            setDays(e.target.checked ? [...days, day] : days.filter((selected) => selected !== day));
            needsConfirmation();
          }}/>{day} {day === 1 ? 'day' : 'days'}
        </label>)}
      </div>
    </fieldset>
    <label className="deadline-confirmation"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}/>
      I checked the deadline against the original and confirmed the date, time zone and reminder settings.
    </label>
    <button className="secondary-button" type="submit" disabled={!confirmed || !date || !time || !zone.trim()}>
      <Download size={15} aria-hidden="true"/> Download calendar reminder
    </button>
    {feedback && <p role="status">{feedback}</p>}
  </form>;
}

function DeadlineCard({ deadline, incomplete }: { deadline: Deadline; incomplete: boolean }) {
  return <article className="deadline-card">
    <h3>{deadline.event}</h3>
    <p className="deadline-date">{deadline.date
      ? <><span>Proposed date</span> <time dateTime={deadline.date}>{deadline.date}</time></>
      : 'Date needs manual confirmation'}</p>
    <blockquote>{deadline.quote}</blockquote>
    <p>{deadline.consequence
      ? <><strong>Potential financial consequence</strong> {deadline.consequence}</>
      : 'No financial consequence detected in this wording.'}</p>
    <p className="deadline-warning">{deadline.warning}{incomplete && ' Some source text may be missing or unrecognized.'}</p>
    <details>
      <summary>Prepare a calendar reminder</summary>
      <CalendarForm proposedDate={deadline.date}/>
    </details>
  </article>;
}

export function DeadlinePanel({ reviewedText, warnings, incomplete }: {
  reviewedText: string; warnings: string[]; incomplete: boolean;
}) {
  const { deadlines, scannedChars, limited } = useMemo(() => scanReviewedDeadlines(reviewedText), [reviewedText]);
  const [visible, setVisible] = useState(VISIBLE_DEADLINES_PER_STEP);
  return <section className="panel deadlines-panel" aria-labelledby="deadline-heading">
    <h2 id="deadline-heading"><CalendarDays size={21} aria-hidden="true"/> Important Contract Deadlines</h2>
    <p>Deadline matching runs locally on reviewed text and can miss obligations. Export creates a private-labelled calendar event with a generic title and no contract text.</p>
    {scannedChars > 0 && <p>Scanned {scannedChars.toLocaleString()} characters locally.</p>}
    {(warnings.length > 0 || limited) && <ul className="deadline-coverage">
      {warnings.map((warning) => <li key={warning}>{warning}</li>)}
      {limited && <li>Local scan limit reached. Only the first {scannedChars.toLocaleString()} of {reviewedText.length.toLocaleString()} characters were checked.</li>}
    </ul>}
    {deadlines.length > 0 && <div className="deadlines-grid">
      {deadlines.slice(0, visible).map((deadline) => <DeadlineCard key={deadline.id} deadline={deadline} incomplete={incomplete || limited}/>)}
    </div>}
    {visible < deadlines.length && <button className="secondary-button deadline-more" type="button"
      onClick={() => setVisible((count) => count + VISIBLE_DEADLINES_PER_STEP)}>
      Show more deadline matches ({visible} of {deadlines.length} shown)
    </button>}
    {scannedChars === 0 && <p>Deadline scanning needs readable, reviewed text from the selected agreement.</p>}
    {scannedChars > 0 && deadlines.length === 0 && <p>No likely deadline wording was found in the text checked. Review the original for obligations and notice periods.</p>}
  </section>;
}
