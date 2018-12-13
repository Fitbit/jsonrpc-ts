// null is not interchangeable with undefined in JSON-RPC.
// tslint:disable:no-null-keyword

import * as jrpc from './protocol';

declare class Object {
  static entries(object: object): [string, any][];
}

describe('parse', () => {
  describe('a valid Request', () => {
    it.each([
      ['with a numeric id', { id: -7, method: 'foo.doBar/baz' }],
      ['with a string id', { id: 'three', method: 'hello' }],
      ['with params as empty array', { id: 55, method: 'foo', params: [] }],
      ['with params by-position', {
        id: 42,
        method: 'bar',
        params: [3, 'three', { three: 3 }, ['four', 'five']],
      }],
      ['with params by-name', {
        id: 8,
        method: 'baz',
        params: { foo: 'bar', quux: 'yes', 3: 5 } as object,
      }],
    ])('%s', (_, vector) => {
      const { id, method, params } = vector;
      // We can't reassemble the message from the spread object as any
      // properties that do not exist in the test vector would come into
      // existence on the reassembled message, with a value of
      // undefined. This would invalidate the tests as a property
      // that exists with the value undefined cannot be represented in
      // JSON.
      expect(jrpc.parse({ ...vector, jsonrpc: '2.0' }))
        .toEqual({ id, method, params, kind: 'request' });
    });
  });

  describe('a valid Notification', () => {
    it.each([
      ['with no params', { method: 'notifoo' }],
      ['with params as empty array', { method: 'blah', params: [] }],
      ['with params by-position', {
        method: 'a.method',
        params: [
          ['hello', 'bonjour', -7.2],
          'abc',
          { a: 3, b: 'four' },
        ],
      }],
      ['with params by-name', {
        method: 'yo',
        params: {
          a: 1,
          b: 'two',
          c: [3, 'four', 5],
          d: { e: 'f' },
        },
      }],
    ])('%s', (_, vector) => {
      const { method, params } = vector;
      expect(jrpc.parse({ ...vector, jsonrpc: '2.0' }))
        .toEqual({ method, params, kind: 'notification' });
    });
  });

  describe('a valid Response', () => {
    it.each([
      ['with numeric id', { id: -7, result: null }],
      ['with string id', { id: 'abc', result: null }],
      ['with numeric result', { id: 5, result: 3.7 }],
      ['with string result', { id: 48, result: 'hello' }],
      ['with boolean result', { id: 1, result: true }],
      ['with array result', {
        id: 86,
        result: ['one', 2, { three: 3 }, [4]],
      }],
      ['with object result', { id: 104, result: { yes: 'yup' } }],
    ])('%s', (_, vector) => {
      const { id, result } = vector;
      expect(jrpc.parse({ ...vector, jsonrpc: '2.0' }))
        .toEqual({ id, result, kind: 'response' });
    });
  });

  describe('a valid Error', () => {
    it.each([
      ['with no id or data', {
        id: null,
        error: { code: -37000, message: 'you dun goofed' },
      }],
      ['with numeric id, no data', {
        id: 7,
        error: { code: 42, message: 'everything' },
      }],
      ['with string id, no data', {
        id: 'asdf',
        error: { code: 0, message: 'zero' },
      }],
      ['with boolean data', {
        id: 2,
        error: { code: 33, message: 'm', data: false },
      }],
      ['with numeric data', {
        id: 3,
        error: { code: 34, message: 'm', data: 8 },
      }],
      ['with string data', {
        id: 4,
        error: { code: 35, message: 'q', data: 'nope' },
      }],
      ['with null data', {
        id: 88,
        error: { code: 123, message: 'yes', data: null },
      }],
      ['with array data', {
        id: 5,
        error: { code: 36, message: 'r', data: [1, 2, 'three'] },
      }],
      ['with object data', {
        id: 6,
        error: { code: 37, message: 's', data: { foo: 'bar' } },
      }],
    ])('%s', (_, vector) => {
      const { id, error } = vector;
      expect(jrpc.parse({ ...vector, jsonrpc: '2.0' }))
        .toEqual({ id, error, kind: 'error' });
    });
  });

  describe('rejects a malformed message', () => {
    const vectors: { [key: string]: any } = {
      'numeric value': 3,
      'boolean value': false,
      'string value': 'hello',
      'array of nonsense': [1, 2, 3],

      'request without jsonrpc key': {
        id: 7,
        method: 'hello',
        params: { foo: 'bar', baz: 5 },
      },
      'response without jsonrpc key': {
        id: 7,
        result: true,
      },
      'notification without jsonrpc key': {
        method: 'notify',
        params: [3, 4, 5],
      },
      'error without jsonrpc key': {
        id: 4,
        error: { code: 8, message: 'yo', data: 'yoyo' },
      },

      'request with wrong jsonrpc type': {
        jsonrpc: 2,
        id: 1344,
        method: 'argh',
      },
      'request with wrong jsonrpc version': {
        jsonrpc: '3.0',
        id: -2,
        method: 'the future is now',
      },
      'notification with wrong jsonrpc version': {
        jsonrpc: '1.4',
        method: 'parallel universe',
      },
      'response with wrong jsonrpc version': {
        jsonrpc: '5',
        id: 66,
      },
      'error with wrong jsonrpc version': {
        jsonrpc: 'two point oh',
        id: null,
        error: { code: 1, message: 'words' },
      },

      'request with fractional id': {
        jsonrpc: '2.0',
        id: 3.4,
        method: 'fractions!',
      },
      'request with structured id': {
        jsonrpc: '2.0',
        id: [3],
        method: 'nope',
      },
      'request with result key': {
        jsonrpc: '2.0',
        id: 8,
        method: 'hey',
        result: 'foo',
      },
      'request with params and result': {
        jsonrpc: '2.0',
        id: 115,
        method: 'uhoh',
        params: [1, 'two'],
        result: 'three',
      },
      'request with error key': {
        jsonrpc: '2.0',
        id: 3,
        method: 'woo',
        error: { code: 1, message: 'yeah' },
      },
      'request with numeric method': {
        jsonrpc: '2.0',
        id: 5,
        method: 6,
      },
      'request with boolean method': {
        jsonrpc: '2.0',
        id: 7,
        method: true,
      },
      'request with array method': {
        jsonrpc: '2.0',
        id: 6543,
        method: ['do this', 'then that'],
      },
      'request with object method': {
        jsonrpc: '2.0',
        id: 432,
        method: { do: 'that' },
      },

      'notification with result': {
        jsonrpc: '2.0',
        method: 'foo',
        result: 'wut',
      },
      'notification with params and result': {
        jsonrpc: '2.0',
        method: 'asdf',
        params: [1, 6],
        result: 'seven',
      },
      'notification with error key': {
        jsonrpc: '2.0',
        method: 'asdfasdf',
        error: { code: 33, message: 'yes' },
      },

      'response with error key': {
        jsonrpc: '2.0',
        id: 89,
        result: 'yes',
        error: { code: 1, message: 'waitaminute' },
      },
      'response with fractional id': {
        jsonrpc: '2.0',
        id: 6.4,
        result: 'foo',
      },

      'error with missing id': {
        jsonrpc: '2.0',
        error: { code: 2, message: 'hmm' },
      },
      'error with fractional id': {
        jsonrpc: '2.0',
        id: 8.1,
        error: { code: 6, message: 'yo' },
      },
      'error with missing code': {
        jsonrpc: '2.0',
        id: 7,
        error: { message: 'wut' },
      },
      'error with missing message': {
        jsonrpc: '2.0',
        id: 654,
        error: { code: 34, data: 'yup' },
      },
    };
    for (const [desc, vector] of Object.entries(vectors)) {
      test(desc, () => {
        expect(() => console.log(jrpc.parse(vector))).toThrow();
      });
    }
  });
});

describe('request serializer', () => {
  it('serializes a request with a numeric id', () =>
        expect(jrpc.request(-7, 'foo')).toMatchSnapshot());
  it('serializes a request with a string id', () =>
        expect(jrpc.request('foo', 'method')).toMatchSnapshot());
  it('serializes a request with an array of params', () =>
        expect(jrpc.request(-803, 'mmm', [3, 'seven'])).toMatchSnapshot());
  it('does not allow fractional IDs', () =>
        expect(() => jrpc.request(5.1, 'woop')).toThrow(TypeError));
});

describe('notification serializer', () => {
  it('serializes a notification with no params', () =>
        expect(jrpc.notification('aNotification')).toMatchSnapshot());
  it('serializes a notification with an array of params', () =>
        expect(jrpc.notification('asdffdsa', ['one', 2, 'three'])).toMatchSnapshot());
});

describe('response serializer', () => {
  it('serializes a response with a numeric id', () =>
        expect(jrpc.response(7654)).toMatchSnapshot());
  it('serializes a response with a string id', () =>
        expect(jrpc.response('ayedee', { result: { result: ['result'] } }))
            .toMatchSnapshot());
  it('does not allow fractional IDs', () =>
        expect(() => jrpc.response(1.1)).toThrow(TypeError));
});

describe('error serializer', () => {
  it('does not allow fractional IDs', () =>
        expect(() => jrpc.error({ id: 3.14, code: 1, message: '' }))
            .toThrow(TypeError));
  it('does not allow fractional codes', () =>
        expect(() => jrpc.error({ id: 3, code: 1.2, message: '' }))
            .toThrow(TypeError));
  it('serializes an error with a numeric id', () =>
        expect(jrpc.error({ id: 5, code: 1, message: '' }))
            .toMatchSnapshot());
  it('serializes an error with a null id', () =>
        expect(jrpc.error({ id: null, code: 0, message: '' }))
            .toMatchSnapshot());
  it('converts an undefined id to null', () =>
        expect(jrpc.error({ code: 1, message: '' }).id).toBeNull());
  it('serializes error data', () => {
    const data = { foo: 'bar', baz: ['a', 'b', 'c'] };
    expect(jrpc.error({ data, id: 3, code: 7, message: 'yarr' }))
      .toMatchObject({
        jsonrpc: '2.0',
        id: 3,
        error: { data, code: 7, message: 'yarr' },
      });
  });
});
