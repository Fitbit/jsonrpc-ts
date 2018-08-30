import * as t from 'io-ts';

import {
  ParseJSON,
  Peer,
  StringifyJSON,
  TypesafeRequestDispatcher,
} from './index';

let dispatcher: TypesafeRequestDispatcher;
let handler: jest.Mock<{}>;
let output: StringifyJSON;
let input: ParseJSON;
let rpc: Peer;

beforeEach(() => {
  handler = jest.fn((p: [number, string]) => `${p[0]} ${p[1]}`);
  dispatcher = new TypesafeRequestDispatcher();
  dispatcher.method('concat', t.tuple([t.number, t.string]), handler);
  output = new StringifyJSON(2);
  input = new ParseJSON();
  rpc = new Peer(dispatcher);
  input.pipe(rpc).pipe(output);
});

it('handles an incoming request and sends a response', (done) => {
  output.on('data', (chunk: Buffer) => {
    try {
      expect(handler).toBeCalledWith([123, 'hello']);
      expect(JSON.parse(chunk.toString())).toEqual({
        jsonrpc: '2.0',
        id: 5,
        result: '123 hello',
      });
      done();
    } catch (e) {
      done(e);
    }
  });
  input.write(`{
    "jsonrpc": "2.0",
    "method": "concat",
    "id": 5,
    "params": [123, "hello"]
  }`);
});

it('sends an outgoing request and resolves the response', () => {
  output.on('data', (chunk: Buffer) => {
    const request = JSON.parse(chunk.toString());
    input.write(`{
      "jsonrpc": "2.0",
      "id": ${request.id},
      "result": "OK"
    }`);
  });
  return expect(rpc.callMethod('foo', { hello: 'world' })).resolves.toBe('OK');
});

it('sends an error in response to malformed JSON', (done) => {
  output.on('data', (chunk: Buffer) => {
    expect(JSON.parse(chunk.toString())).toMatchObject({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
      },
    });
    done();
  });
  input.write('}])');
});

it('rejects an in-progress method call when the input stream ends', () => {
  const call = rpc.callMethod('foo');
  input.end();
  return expect(call).rejects.toEqual(expect.any(Error));
});
