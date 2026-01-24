export enum JsonStreamingEventType {
  Object = 'object',
  String = 'string',
  Number = 'number',
  Keyword = 'keyword',
  Array = 'array',
  Error = 'error',
}

export type JsonStreamingEvent =
  | {
      type: JsonStreamingEventType.Array;
      key: number | string | null; // number for array index, null = root
      endValue?: any[];
    }
  | {
      type: JsonStreamingEventType.String;
      key: number | string | null;
      endValue?: string;
    }
  | {
      type: JsonStreamingEventType.Number;
      key: number | string | null;
      endValue?: number;
    }
  | {
      type: JsonStreamingEventType.Keyword;
      key: number | string | null;
      endValue?: boolean | null;
    }
  | {
      type: JsonStreamingEventType.Object;
      key: number | string | null;
      endValue?: Record<string, any>;
    }
  | {
      type: JsonStreamingEventType.Error;
      detail: string;
      offset?: number;
    };

type Frame =
  | {
      kind: JsonStreamingEventType.Object;
      // state machine for object: { } with "key": value pairs
      state: ObjectState;
      pendingKey?: string; // current property key waiting for its value
      // optional building
      value?: Record<string, any>;
    }
  | {
      kind: JsonStreamingEventType.Array;
      state: ArrayState;
      index: number; // next element index
      value?: any[];
    };

export enum ObjectState {
  EXPECT_KEY_OR_END,
  EXPECT_COLON,
  EXPECT_VALUE,
  AFTER_VALUE,
}

export enum ArrayState {
  EXPECT_VALUE_OR_END,
  AFTER_VALUE,
}

export enum Mode {
  DEFAULT,
  STRING,
  NUMBER,
  KEYWORD,
  SKIP_LINE,
}

export class JsonStreamingParser {
  private stack: Frame[] = [];
  private rootStarted = false;
  private rootDone = false;

  private mode = Mode.DEFAULT;

  // token buffers for streaming tokens across chunks
  private strBuf = '';
  private strIsKey = false; // when parsing a string, is it an object key?
  private strEsc = false;
  private strUnicodeNeeded = 0;
  private strUnicodeHex = '';

  private numBuf = '';
  private kwBuf = '';
  private pendingStringValue: string | null = null;
  private pendingStringNeedsConcat = false;

  private chunks: string[] = [];
  private totalOffset = 0;

  constructor(private readonly buildValues: boolean = false) {}

  readAll(): string {
    return this.chunks.join('');
  }

  push(chunk: string): JsonStreamingEvent[] {
    const events: JsonStreamingEvent[] = [];
    if (this.rootDone) return events;
    this.chunks.push(chunk);
    const baseOffset = this.totalOffset;
    let i = 0;
    try {
      for (i = 0; i < chunk.length; i++) {
        const ch = chunk[i];

        // If we're inside a token mode, handle it first
        if (this.mode === Mode.SKIP_LINE) {
          if (ch === '\n') {
            this.mode = Mode.DEFAULT;
          }
          continue;
        }
        if (this.mode === Mode.STRING) {
          this.consumeStringChar(ch, events);
          continue;
        }
        if (this.mode === Mode.NUMBER) {
          // number ends when we hit a non-number char (but we must NOT consume it)
          if (this.isNumberChar(ch)) {
            this.numBuf += ch;
            continue;
          } else {
            this.finishNumber(events);
            i--; // reprocess this char in DEFAULT mode
            continue;
          }
        }
        if (this.mode === Mode.KEYWORD) {
          // keyword is [a-z]
          if (/[a-z]/i.test(ch)) {
            this.kwBuf += ch;
            // we can early-finish if exact match true/false/null and next char boundary arrives
            continue;
          } else {
            this.finishKeyword(events);
            i--; // reprocess boundary char
            continue;
          }
        }

        if (this.pendingStringValue !== null) {
          if (this.isWS(ch)) continue;
          if (ch === '+') {
            this.pendingStringNeedsConcat = true;
            continue;
          }
          if (this.pendingStringNeedsConcat) {
            if (ch === '"') {
              // start concatenated string segment
              this.mode = Mode.STRING;
              this.strBuf = '';
              this.strEsc = false;
              this.strUnicodeNeeded = 0;
              this.strUnicodeHex = '';
              this.strIsKey = false;
              continue;
            }
            throw new Error(`Expected string after '+'`);
          }
          this.flushPendingString(events);
          i--; // reprocess this char in DEFAULT mode
          continue;
        }

        // DEFAULT mode
        if (this.rootDone) continue;
        if (this.isWS(ch)) continue;

        if (ch === '`' && !this.rootStarted) {
          this.mode = Mode.SKIP_LINE;
          continue;
        }

        if (ch === '"') {
          // start string (could be a key or a value depending on context)
          this.mode = Mode.STRING;
          this.strBuf = '';
          this.strEsc = false;
          this.strUnicodeNeeded = 0;
          this.strUnicodeHex = '';
          this.strIsKey = this.isExpectingObjectKey();
          continue;
        }

        if (ch === '{') {
          this.onContainerStart(JsonStreamingEventType.Object, events);
          this.stack.push({
            kind: JsonStreamingEventType.Object,
            state: ObjectState.EXPECT_KEY_OR_END,
            ...(this.buildValues ? { value: {} } : {}),
          });
          continue;
        }

        if (ch === '[') {
          this.onContainerStart(JsonStreamingEventType.Array, events);
          this.stack.push({
            kind: JsonStreamingEventType.Array,
            state: ArrayState.EXPECT_VALUE_OR_END,
            index: 0,
            ...(this.buildValues ? { value: [] } : {}),
          });
          continue;
        }

        if (ch === '}' || ch === ']') {
          this.onContainerEnd(ch, events);
          continue;
        }

        if (ch === ':') {
          const top = this.peek();
          if (
            !top ||
            top.kind !== 'object' ||
            top.state !== ObjectState.EXPECT_COLON
          ) {
            throw new Error(`Unexpected ':'`);
          }
          top.state = ObjectState.EXPECT_VALUE;
          continue;
        }

        if (ch === ',') {
          const top = this.peek();
          if (!top) throw new Error(`Unexpected ',' at root`);
          if (top.kind === 'object') {
            if (top.state !== ObjectState.AFTER_VALUE)
              throw new Error(`Unexpected ',' in object`);
            top.state = ObjectState.EXPECT_KEY_OR_END;
            top.pendingKey = undefined;
          } else {
            if (top.state !== ArrayState.AFTER_VALUE)
              throw new Error(`Unexpected ',' in array`);
            top.state = ArrayState.EXPECT_VALUE_OR_END;
          }
          continue;
        }

        // number start
        if (ch === '-' || (ch >= '0' && ch <= '9')) {
          this.mode = Mode.NUMBER;
          this.numBuf = ch;
          continue;
        }

        // keyword start (true/false/null)
        if (/[tfn]/i.test(ch)) {
          this.mode = Mode.KEYWORD;
          this.kwBuf = ch;
          continue;
        }

        throw new Error(`Unexpected char '${ch}'`);
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.emitError(events, detail, baseOffset + i);
    } finally {
      this.totalOffset = baseOffset + (this.rootDone ? i : chunk.length);
    }

    // chunk ended: if in NUMBER/KEYWORD we keep buffering; STRING too.
    return events;
  }

  end(): JsonStreamingEvent[] {
    // call at stream end to flush number/keyword if they ended exactly at EOF
    const events: JsonStreamingEvent[] = [];
    if (this.rootDone) return events;
    try {
      if (this.mode === Mode.NUMBER) this.finishNumber(events);
      if (this.mode === Mode.KEYWORD) this.finishKeyword(events);
      if (this.mode === Mode.STRING)
        this.emitError(
          events,
          'Unterminated string at end()',
          this.totalOffset,
        );
      if (this.pendingStringValue !== null) {
        if (this.pendingStringNeedsConcat) {
          this.emitError(
            events,
            "Expected string after '+'",
            this.totalOffset,
          );
        } else {
          this.flushPendingString(events);
        }
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.emitError(events, detail, this.totalOffset);
    }
    return events;
  }

  // ----------------- internals -----------------

  private peek(): Frame | undefined {
    return this.stack.length ? this.stack[this.stack.length - 1] : undefined;
  }

  private emitError(
    events: JsonStreamingEvent[],
    detail: string,
    offset?: number,
  ) {
    events.push({
      type: JsonStreamingEventType.Error,
      detail,
      ...(offset !== undefined ? { offset } : {}),
    });
    this.rootDone = true;
    this.mode = Mode.DEFAULT;
    this.strBuf = '';
    this.numBuf = '';
    this.kwBuf = '';
    this.strIsKey = false;
    this.strEsc = false;
    this.strUnicodeNeeded = 0;
    this.strUnicodeHex = '';
    this.pendingStringValue = null;
    this.pendingStringNeedsConcat = false;
  }

  private isWS(ch: string) {
    return ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t';
  }

  private isNumberChar(ch: string) {
    return (
      (ch >= '0' && ch <= '9') ||
      ch === '-' ||
      ch === '+' ||
      ch === '.' ||
      ch === 'e' ||
      ch === 'E'
    );
  }

  private isExpectingObjectKey(): boolean {
    const top = this.peek();
    return (
      !!top &&
      top.kind === 'object' &&
      top.state === ObjectState.EXPECT_KEY_OR_END
    );
  }

  private currentKey(): number | string | null {
    const top = this.peek();
    if (!top) return null;

    if (top.kind === 'object') {
      // when starting/finishing a value in object, key is the pendingKey
      return top.pendingKey ?? null;
    }
    // array: key is current index (next value position)
    // For start/end events of nested containers as elements, we should use the element index being filled.
    // If we're expecting a value, that's top.index; if AFTER_VALUE, last filled is index-1.
    const idx =
      top.state === ArrayState.AFTER_VALUE ? top.index - 1 : top.index;
    return idx;
  }

  private bumpArrayIndexIfNeeded() {
    const top = this.peek();
    if (top && top.kind === 'array') {
      // after a value is consumed in array, we increment index
      top.index += 1;
      top.state = ArrayState.AFTER_VALUE;
    }
  }

  private markObjectValueDone() {
    const top = this.peek();
    if (top && top.kind === 'object') {
      top.state = ObjectState.AFTER_VALUE;
    }
  }

  private assignBuiltValueToParent(built: any) {
    if (!this.buildValues) return;

    const parent = this.peek();
    if (!parent) return;

    if (parent.kind === 'array') {
      parent.value!.push(built);
      this.bumpArrayIndexIfNeeded();
    } else {
      const k = parent.pendingKey!;
      parent.value![k] = built;
      this.markObjectValueDone();
    }
  }

  private onValueFinished(
    type: JsonStreamingEventType,
    value: any,
    events: JsonStreamingEvent[],
  ) {
    const key = this.currentKey();
    events.push({ type, key, endValue: value } as JsonStreamingEvent);

    if (!this.rootStarted) this.rootStarted = true;

    if (this.stack.length === 0) {
      // finished root primitive
      this.rootDone = true;
      return;
    }

    // attach to parent if building values
    if (this.buildValues) {
      const parent = this.peek();
      if (!parent) return;
      if (parent.kind === 'array') {
        parent.value!.push(value);
      } else {
        const k = parent.pendingKey!;
        parent.value![k] = value;
      }
    }

    // advance states
    const parent = this.peek();
    if (!parent) return;

    if (parent.kind === 'array') {
      this.bumpArrayIndexIfNeeded();
    } else {
      this.markObjectValueDone();
    }
  }

  private queueStringValue(value: string) {
    if (this.pendingStringValue === null) {
      this.pendingStringValue = value;
      this.pendingStringNeedsConcat = false;
      return;
    }
    this.pendingStringValue += value;
    this.pendingStringNeedsConcat = false;
  }

  private flushPendingString(events: JsonStreamingEvent[]) {
    if (this.pendingStringValue === null) return;
    const value = this.pendingStringValue;
    this.pendingStringValue = null;
    this.pendingStringNeedsConcat = false;
    this.onValueFinished(JsonStreamingEventType.String, value, events);
  }

  private onContainerStart(
    kind: JsonStreamingEventType.Array | JsonStreamingEventType.Object,
    events: JsonStreamingEvent[],
  ) {
    const key = this.currentKey();
    events.push({ type: kind, key }); // start event (no endValue)
    if (!this.rootStarted) this.rootStarted = true;

    // For parent state: we're consuming a value now, but we only mark AFTER_VALUE when the container ends.
    // So do nothing here; on end we will mark and maybe assign built value.
  }

  private onContainerEnd(brace: '}' | ']', events: JsonStreamingEvent[]) {
    const frame = this.peek();
    if (!frame) throw new Error(`Unexpected '${brace}' at root`);

    if (brace === '}' && frame.kind !== 'object')
      throw new Error(`Mismatched '}'`);
    if (brace === ']' && frame.kind !== 'array')
      throw new Error(`Mismatched ']'`);

    // Validate state when closing
    if (frame.kind === 'object') {
      // allowed to close when expecting key/end OR after value
      if (
        frame.state !== ObjectState.EXPECT_KEY_OR_END &&
        frame.state !== ObjectState.AFTER_VALUE
      ) {
        throw new Error(`Cannot close object in state ${frame.state}`);
      }
    } else if (
      frame.state !== ArrayState.EXPECT_VALUE_OR_END &&
      frame.state !== ArrayState.AFTER_VALUE
    ) {
      throw new Error(`Cannot close array in state ${frame.state}`);
    }

    // Pop and emit end event
    const finished = this.stack.pop()!;
    const finishedValue: any = this.buildValues ? finished.value : undefined;

    // key for the container itself is determined by parent context (now currentKey refers to parent's slot)
    // BUT after pop, currentKey() points to parent's current slot; that's correct.
    const endKey = this.currentKey();

    events.push({
      type: finished.kind,
      key: endKey,
      ...(this.buildValues ? { endValue: finishedValue } : {}),
    });

    if (this.stack.length === 0) {
      // finished root container
      this.rootDone = true;
      return;
    }

    // assign built value to parent and advance state
    if (this.buildValues) this.assignBuiltValueToParent(finishedValue);

    if (!this.buildValues) {
      const parent = this.peek()!;
      if (parent.kind === 'array') {
        this.bumpArrayIndexIfNeeded();
      } else {
        this.markObjectValueDone();
      }
    }
  }

  private consumeStringChar(ch: string, events: JsonStreamingEvent[]) {
    // Handle unicode escape continuation
    if (this.strUnicodeNeeded > 0) {
      if (!/[0-9a-fA-F]/.test(ch)) throw new Error(`Invalid unicode escape`);
      this.strUnicodeHex += ch;
      this.strUnicodeNeeded--;
      if (this.strUnicodeNeeded === 0) {
        const code = parseInt(this.strUnicodeHex, 16);
        this.strBuf += String.fromCharCode(code);
        this.strUnicodeHex = '';
      }
      return;
    }

    if (this.strEsc) {
      this.strEsc = false;
      switch (ch) {
        case '"':
        case '\\':
        case '/':
          this.strBuf += ch;
          return;
        case 'b':
          this.strBuf += '\b';
          return;
        case 'f':
          this.strBuf += '\f';
          return;
        case 'n':
          this.strBuf += '\n';
          return;
        case 'r':
          this.strBuf += '\r';
          return;
        case 't':
          this.strBuf += '\t';
          return;
        case 'u':
          this.strUnicodeNeeded = 4;
          this.strUnicodeHex = '';
          return;
        default:
          throw new Error(`Invalid escape \\${ch}`);
      }
    }

    if (ch === '\\') {
      this.strEsc = true;
      return;
    }

    if (ch === '"') {
      // end string
      const s = this.strBuf;
      this.mode = Mode.DEFAULT;
      this.strBuf = '';

    if (this.strIsKey) {
      // this string is an object key
      const top = this.peek();
      if (
        !top ||
          top.kind !== 'object' ||
          top.state !== ObjectState.EXPECT_KEY_OR_END
        ) {
          throw new Error(`String treated as key but context is wrong`);
        }
        top.pendingKey = s;
        top.state = ObjectState.EXPECT_COLON;
      } else {
        this.queueStringValue(s);
      }
      return;
    }

    this.strBuf += ch;
  }

  private finishNumber(events: JsonStreamingEvent[]) {
    const raw = this.numBuf;
    this.mode = Mode.DEFAULT;
    this.numBuf = '';

    // JSON number parse (strict-ish): rely on Number, but reject NaN/Infinity
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`Invalid number '${raw}'`);
    this.onValueFinished(JsonStreamingEventType.Number, n, events);
  }

  private finishKeyword(events: JsonStreamingEvent[]) {
    const raw = this.kwBuf;
    this.mode = Mode.DEFAULT;
    this.kwBuf = '';

    const lower = raw.toLowerCase();
    if (lower === 'true')
      return this.onValueFinished(JsonStreamingEventType.Keyword, true, events);
    if (lower === 'false')
      return this.onValueFinished(
        JsonStreamingEventType.Keyword,
        false,
        events,
      );
    if (lower === 'null')
      return this.onValueFinished(JsonStreamingEventType.Keyword, null, events);
    throw new Error(`Invalid keyword '${raw}'`);
  }
}
