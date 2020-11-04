import { ParseError } from './peer';
import * as serialize from './serialize';

describe('ParseJSON', () => {
  let parser: serialize.ParseJSON;

  beforeEach(() => {
    parser = new serialize.ParseJSON();
  });

  it('parses valid JSON text to a JS object', (done) => {
    parser.on('data', (chunk: any) => {
      expect(chunk).toEqual({
        foo: 'bar',
        baz: 123,
      });
      done();
    });
    parser.write('{"foo": "bar", "baz": 123}');
  });

  it('pushes a ParseError for invalid JSON text', (done) => {
    parser.on('data', (chunk: any) => {
      expect(chunk).toEqual(expect.any(ParseError));
      done();
    });
    parser.write('}])');
  });

  it('handles unexpected errors gracefullly', (done) => {
    parser.on('error', () => done());
    const buf = Buffer.from('');
    buf.toString = () => {
      throw new Error('Unexpected error!');
    };
    parser.write(buf);
  });
});

describe('StringifyJSON', () => {
  it('stringifies arbitrary objects to JSON text', (done) => {
    const stringifier = new serialize.StringifyJSON();
    stringifier.on('data', (chunk: any) => {
      expect(typeof chunk).toBe('string');
      expect(chunk).toEqual('["one",2,true]');
      done();
    });
    stringifier.write(['one', 2, true]);
  });

  it('pretty-prints JSON text', (done) => {
    const vector = {
      foo: 'bar',
      baz: 567,
      quux: [1, 2, 3, 4, 5],
      xyzzy: true,
    };
    const stringifier = new serialize.StringifyJSON(4);
    stringifier.on('data', (chunk: string) => {
      expect(chunk).toEqual(JSON.stringify(vector, undefined, 4));
      done();
    });
    stringifier.write(vector);
  });
});
