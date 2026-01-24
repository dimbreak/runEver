import {
  JsonStreamingEventType,
  JsonStreamingParser,
} from '../main/llm/jsonStreamer';

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

describe('LLM markdown code blocks', () => {
  it('skips markdown code block delimiters', () => {
    const input = '```json\n{"key": "value"}\n```';
    const events = collectEvents(input);
    const errorEvents = events.filter(
      (event) => event.type === JsonStreamingEventType.Error,
    );
    const objectEvents = events.filter(
      (event) => event.type === JsonStreamingEventType.Object,
    );

    expect(errorEvents).toHaveLength(0);
    expect(objectEvents).toHaveLength(2); // Start and end object
    expect(objectEvents[0]).toMatchObject({
      key: null,
    });
    expect(objectEvents[1]).toMatchObject({
      key: null,
    });
  });

  it('handles split markdown code block delimiters', () => {
    const chunks = ['`', '`', '`', 'json', '\n', '{"key": "value"}', '\n', '`', '`', '`'];
    const events = collectChunkedEvents(chunks);
     const errorEvents = events.filter(
      (event) => event.type === JsonStreamingEventType.Error,
    );

    expect(errorEvents).toHaveLength(0);
  });

  it('ignores trailing content after JSON root is done', () => {
    const input = '{"key": "value"}\nSome explanation here';
    const events = collectEvents(input);
    const errorEvents = events.filter(
      (event) => event.type === JsonStreamingEventType.Error,
    );

    expect(errorEvents).toHaveLength(0);
  });
});
