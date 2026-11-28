/*!
 * Tikrar for the web: drives an <audio> element (or anything with currentTime, playbackRate, play() and pause()) through a
 * session. The engine itself is ./tikrar.js; this file only adds the clock and the audio.
 *
 *   const player = new TikrarPlayer(audioElement, units, options, { onAction, onTime, onDone });
 *   player.start();  player.pause();  player.play();  player.resume();  player.next();  player.previous();  player.restart();  player.stop();
 *
 * onAction(action, session)  each time there is something new to do (use it to show the step, the repetition, the pause);
 * onTime(ms, action)         many times a second while a passage plays (use it with locate() to colour ayah, phrase and word);
 * onDone(session)            when the session is over.
 */
import { Session } from "./tikrar.js";

export class TikrarPlayer {
  constructor(audio, units, options, handlers = {}) {
    this.audio = audio; this.session = new Session(units, options); this.h = handlers;
    this.paused = false; this._timer = null; this._gapLeft = 0; this._last = 0; this._seq = 0;
  }
  _now() { return typeof performance !== "undefined" ? performance.now() : Date.now(); }
  _clear() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }
  _do(action) {
    this._clear(); const seq = ++this._seq;
    if (this.h.onAction) this.h.onAction(action, this.session);
    if (!action || action.type === "await") return;
    if (action.type === "done") { this.audio.pause(); if (this.h.onDone) this.h.onDone(this.session); return; }
    if (action.type === "play") {
      const a = this.audio; a.pause(); a.playbackRate = action.rate; a.currentTime = action.start / 1000;
      const go = () => { if (seq === this._seq && !this.paused) Promise.resolve(a.play()).catch(() => { this.paused = true; if (this.h.onAction) this.h.onAction(action, this.session); }); };
      go();
      this._timer = setInterval(() => {
        if (seq !== this._seq || this.paused) return;
        const ms = a.currentTime * 1000;
        if (this.h.onTime) this.h.onTime(ms, action);
        if (ms >= action.end - 30 || a.ended) { a.pause(); this._do(this.session.ended()); }   // 30 ms early: the next ayah's first sound is not heard
      }, 40);
      return;
    }
    // a pause for the learner: counted on our own clock so that it can itself be paused
    this._gapLeft = action.ms; this._last = this._now();
    this._timer = setInterval(() => {
      if (seq !== this._seq || this.paused) { this._last = this._now(); return; }
      const t = this._now(); this._gapLeft -= t - this._last; this._last = t;
      if (this._gapLeft <= 0) this._do(this.session.resume());
    }, 40);
  }
  /** Time left of the pause for the learner, in ms (0 outside a pause). */
  get gapLeft() { return this.session.phase === "gap" ? Math.max(0, this._gapLeft) : 0; }
  start() { this.paused = false; this._do(this.session.start()); }
  pause() { this.paused = true; this.audio.pause(); }
  play() { if (!this.paused) return; this.paused = false; this._last = this._now(); if (this.session.phase === "playing") Promise.resolve(this.audio.play()).catch(() => { this.paused = true; }); }
  /** The learner asks to go on (ends a manual pause, or cuts a timed one short). */
  resume() { if (this.session.phase === "gap" || this.session.phase === "waiting") this._do(this.session.resume()); }
  next() { this._do(this.session.next()); }
  previous() { this._do(this.session.previous()); }
  restart() { this._do(this.session.restart()); }
  goTo(i) { this._do(this.session.goTo(i)); }
  stop() { this._seq++; this._clear(); this.audio.pause(); }
}
