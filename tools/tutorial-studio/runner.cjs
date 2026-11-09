'use strict';
const { EventEmitter } = require('node:events');
const path = require('node:path');

class LessonRunner extends EventEmitter {
  constructor(adapter, options = {}) {
    super();
    this.adapter = adapter;
    this.sleep = options.sleep || (ms => new Promise(r => setTimeout(r, ms)));
    this.now = options.now || Date.now;
    this.random = options.random || Math.random;
    this.state = { phase: 'idle', step: 0, total: 0, title: 'Ready', markers: [] };
  }
  snapshot() { return structuredClone(this.state); }
  update(values) { Object.assign(this.state, values); this.emit('change', this.snapshot()); }
  async gate() {
    if (this.cancelled) throw new Error('Lesson stopped. Saved and unsaved edits are preserved.');
    while (this.state.phase === 'paused' || this.state.phase === 'checkpoint') {
      await this.sleep(40);
      if (this.cancelled) throw new Error('Lesson stopped. Saved and unsaved edits are preserved.');
    }
  }
  async wait(ms) {
    let remaining = ms;
    while (remaining > 0) {
      await this.gate();
      const slice = Math.min(40, remaining);
      await this.sleep(slice);
      remaining -= slice;
    }
    await this.gate();
  }
  pause() {
    if (this.state.phase === 'running') this.update({ phase: 'paused' });
    else if (this.state.phase === 'paused') this.update({ phase: 'running' });
  }
  next() {
    if (this.state.phase === 'checkpoint') this.update({ phase: 'running' });
  }
  stop() {
    this.cancelled = true;
    if (['running', 'paused', 'checkpoint'].includes(this.state.phase)) this.update({ phase: 'stopping' });
  }
  async type(text, insert, pace) {
    for (const ch of text) {
      await this.gate();
      await insert(ch);
      const extra = ch === '\n' ? 220 : /[;{}]/.test(ch) ? 100 : 0;
      await this.wait((pace + this.random() * pace * 0.65 + extra) / this.speed);
    }
  }
  async run(lesson, speed = 1) {
    if (this.busy) throw new Error('A lesson is already running.');
    if (!Array.isArray(lesson.steps) || !lesson.steps.length) throw new Error('Lesson needs steps.');
    if (!(speed >= 0.25 && speed <= 4)) throw new Error('Speed must be between 0.25 and 4.');
    const actions = new Set(['open', 'type', 'replace', 'save', 'wait', 'checkpoint', 'terminal', 'interrupt']);
    for (const step of lesson.steps) {
      if (!actions.has(step.action)) throw new Error(`Unknown lesson action: ${step.action}`);
      if (step.action === 'open' && (path.isAbsolute(step.file) || step.file.split(/[\\/]/).includes('..') || !step.file.startsWith('tutorial-output/'))) {
        throw new Error('Lesson files must be inside tutorial-output/.');
      }
    }
    this.busy = true;
    this.cancelled = false;
    this.speed = speed;
    this.session = `take-${this.now()}-${Math.floor(this.random() * 1e6)}`;
    this.started = this.now();
    this.update({ phase: 'running', title: lesson.title, step: 0, total: lesson.steps.length, session: this.session, markers: [], error: null });
    const expand = text => String(text).replaceAll('{{session}}', this.session);
    try {
      for (let i = 0; i < lesson.steps.length; i++) {
        await this.gate();
        const step = lesson.steps[i];
        const title = step.title || step.action;
        this.state.markers.push({ atMs: this.now() - this.started, title, action: step.action });
        this.update({ step: i + 1, title });
        switch (step.action) {
          case 'open': await this.adapter.open(expand(step.file)); break;
          case 'type': await this.type(step.text, ch => this.adapter.insert(ch), lesson.paceMs || 45); break;
          case 'replace':
            await this.adapter.selectUnique(step.find);
            await this.type(step.text, ch => this.adapter.insert(ch), lesson.paceMs || 45);
            break;
          case 'save': await this.adapter.save(); break;
          case 'wait': await this.wait(step.ms); break;
          case 'terminal':
            await this.adapter.terminal(step.id, expand(step.command), step.waitForExit === true,
              (text, insert) => this.type(text, insert, 60));
            break;
          case 'interrupt': await this.adapter.interrupt(step.id); break;
          case 'checkpoint':
            this.update({ phase: 'checkpoint', note: step.note || 'Inspect the result, then Continue.' });
            await this.gate();
            this.update({ note: null });
            break;
        }
      }
      this.update({ phase: 'finished', title: 'Lesson finished' });
    } catch (error) {
      this.update({ phase: this.cancelled ? 'stopped' : 'error', error: error.message });
    } finally {
      this.busy = false;
    }
    return this.snapshot();
  }
}
module.exports = { LessonRunner };
