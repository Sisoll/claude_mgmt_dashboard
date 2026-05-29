const fs = require('fs');
const { EventEmitter } = require('events');

const DEBOUNCE_MS = 150;

class JsonlTailer extends EventEmitter {
  constructor(filePath) {
    super();
    this.filePath = filePath;
    this.offset = 0;
    this.buffer = '';
    this.watcher = null;
    this._debounceTimer = null;
    this._reading = false;
  }

  start() {
    this._readNew();
    try {
      this.watcher = fs.watch(this.filePath, () => this._scheduleRead());
    } catch (err) {
      this.emit('error', err);
    }
  }

  stop() {
    if (this.watcher) {
      try { this.watcher.close(); } catch {}
      this.watcher = null;
    }
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
  }

  _scheduleRead() {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._readNew(), DEBOUNCE_MS);
  }

  _readNew() {
    if (this._reading) {
      this._scheduleRead();
      return;
    }
    this._reading = true;

    let stat;
    try {
      stat = fs.statSync(this.filePath);
    } catch {
      this._reading = false;
      return;
    }

    if (stat.size < this.offset) {
      this.offset = 0;
      this.buffer = '';
    }

    if (stat.size === this.offset) {
      this._reading = false;
      return;
    }

    const stream = fs.createReadStream(this.filePath, {
      start: this.offset,
      end: stat.size - 1,
      encoding: 'utf8',
    });

    let chunkCount = 0;
    const lines = [];

    stream.on('data', (chunk) => {
      chunkCount += Buffer.byteLength(chunk, 'utf8');
      this.buffer += chunk;
      let idx;
      while ((idx = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 1);
        if (line.trim()) lines.push(line);
      }
    });

    stream.on('end', () => {
      this.offset += chunkCount;
      this._reading = false;
      if (lines.length) this.emit('lines', lines);
    });

    stream.on('error', (err) => {
      this._reading = false;
      this.emit('error', err);
    });
  }

  resetAndReadAll() {
    this.offset = 0;
    this.buffer = '';
    this._readNew();
  }
}

module.exports = { JsonlTailer };
