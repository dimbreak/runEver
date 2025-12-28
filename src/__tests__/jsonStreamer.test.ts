import { JsonStreamingEventType, JsonStreamingParser } from '../main/llm/jsonStreamer';

const collectEvents = (input: string) => {
  const parser = new JsonStreamingParser();
  const events = parser.push(input);
  events.push(...parser.end());
  return events;
};

const collectChunkedEvents = (chunks: string[]) => {
  const parser = new JsonStreamingParser();
  const events = chunks.flatMap((chunk) => parser.push(chunk));
  events.push(...parser.end());
  return events;
};

describe('JsonStreamingParser string concatenation', () => {
  it('concatenates root string segments with +', () => {
    const events = collectEvents('"foo" + "bar"');
    const errorEvents = events.filter(
      (event) => event.type === JsonStreamingEventType.Error,
    );
    const stringEvents = events.filter(
      (event) => event.type === JsonStreamingEventType.String,
    );

    expect(errorEvents).toHaveLength(0);
    expect(stringEvents).toHaveLength(1);
    expect(stringEvents[0]).toMatchObject({
      key: null,
      endValue: 'foobar',
    });
  });

  it('concatenates object string values', () => {
    const events = collectEvents('{"x":"a"+"b"}');
    const errorEvents = events.filter(
      (event) => event.type === JsonStreamingEventType.Error,
    );
    const stringEvents = events.filter(
      (event) => event.type === JsonStreamingEventType.String,
    );

    expect(errorEvents).toHaveLength(0);
    expect(stringEvents).toHaveLength(1);
    expect(stringEvents[0]).toMatchObject({
      key: 'x',
      endValue: 'ab',
    });
  });

  it('concatenates array string values', () => {
    const events = collectEvents('["a"+"b","c"+"d"]');
    const errorEvents = events.filter(
      (event) => event.type === JsonStreamingEventType.Error,
    );
    const stringEvents = events.filter(
      (event) => event.type === JsonStreamingEventType.String,
    );

    expect(errorEvents).toHaveLength(0);
    expect(stringEvents).toHaveLength(2);
    expect(stringEvents[0]).toMatchObject({
      key: 0,
      endValue: 'ab',
    });
    expect(stringEvents[1]).toMatchObject({
      key: 1,
      endValue: 'cd',
    });
  });

  it('concatenates when "+" arrives in a separate chunk', () => {
    const events = collectChunkedEvents(['"foo"', '+', '"bar"']);
    const errorEvents = events.filter(
      (event) => event.type === JsonStreamingEventType.Error,
    );
    const stringEvents = events.filter(
      (event) => event.type === JsonStreamingEventType.String,
    );

    expect(errorEvents).toHaveLength(0);
    expect(stringEvents).toHaveLength(1);
    expect(stringEvents[0]).toMatchObject({
      key: null,
      endValue: 'foobar',
    });
  });
});
