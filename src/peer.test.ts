import * as peer from './peer';
import * as jrpc from './protocol';

jest.useFakeTimers();

describe('RPCError', () => {
  it('defaults to code INTERNAL_ERROR and undefined data', () => {
    expect(new peer.RPCError('foo')).toEqual(expect.objectContaining({
      message: 'foo',
      code: peer.ErrorCodes.INTERNAL_ERROR,
      data: undefined,
    }));
  });

  it('allows the code to be overridden', () => {
    expect(new peer.RPCError('asdf', 12345)).toEqual(expect.objectContaining({
      message: 'asdf',
      code: 12345,
      data: undefined,
    }));
  });

  it('saves the data passed to the constructor', () => {
    const expectedData = { foo: 'bar' };
    expect(new peer.RPCError('uh oh', 54321, expectedData)).toEqual(
      expect.objectContaining({
        message: 'uh oh',
        code: 54321,
        data: expectedData,
      }));
  });

  it('copies the info to an ErrorObject', () => {
    const err = new peer.RPCError('ohai', 42, 'data!');
    expect(err.toErrorObject()).toEqual({
      message: 'ohai',
      code: 42,
      data: 'data!',
      id: undefined,
    });
  });

  it('constructs objects which are instances of Error and RPCError', () => {
    const obj = new peer.RPCError('message', 31415, {});
    expect(obj).toEqual(expect.any(Error));
    expect(obj).toEqual(expect.any(peer.RPCError));
  });
});

describe('MethodNotFound', () => {
  it('sets the error code to METHOD_NOT_FOUND', () => {
    expect(new peer.MethodNotFound('You are wrong', 'yes')).toEqual(
      expect.objectContaining({
        message: 'You are wrong',
        code: peer.ErrorCodes.METHOD_NOT_FOUND,
        data: 'yes',
      }));
  });

  it('constructs objects which are instances of MethodNotFound', () => {
    const obj = new peer.MethodNotFound('foo');
    expect(obj).toEqual(expect.any(Error));
    expect(obj).toEqual(expect.any(peer.RPCError));
    expect(obj).toEqual(expect.any(peer.MethodNotFound));
  });
});

describe('InvalidParams', () => {
  it('sets the error code to INVALID_PARAMS', () => {
    expect(new peer.InvalidParams('No bueno', 'what nonsense was that?'))
      .toEqual(expect.objectContaining({
        message: 'No bueno',
        code: peer.ErrorCodes.INVALID_PARAMS,
        data: 'what nonsense was that?',
      }));
  });

  it('constructs objects which are instances of InvalidParams', () => {
    const obj = new peer.InvalidParams('foo', 'ha');
    expect(obj).toEqual(expect.any(Error));
    expect(obj).toEqual(expect.any(peer.RPCError));
    expect(obj).toEqual(expect.any(peer.InvalidParams));
  });
});

describe('MethodCallTimeout', () => {
  it('constructs objects which are instances of MethodCallTimeout', () => {
    const obj = new peer.MethodCallTimeout('foo');
    expect(obj).toBeInstanceOf(Error);
    expect(obj).toBeInstanceOf(peer.MethodCallError);
    expect(obj).toBeInstanceOf(peer.MethodCallTimeout);
  });

  it('sets the message and method', () => {
    const method = 'some.method.name';
    expect(new peer.MethodCallTimeout(method)).toMatchObject({
      method,
      message: `No response received for RPC call to '${method}'`,
    });
  });
});

describe('RPCStreamClosed', () => {
  it('constructs objects which are instances of RPCStreamClosed', () => {
    const obj = new peer.RPCStreamClosed('foo');
    expect(obj).toBeInstanceOf(Error);
    expect(obj).toBeInstanceOf(peer.MethodCallError);
    expect(obj).toBeInstanceOf(peer.RPCStreamClosed);
  });

  it('sets the error message and method', () => {
    const method = 'some.method.name';
    expect(new peer.RPCStreamClosed(method)).toMatchObject({
      method,
      message: `RPC call to '${method}' could not be completed as the RPC stream is closed`,
    });
  });
});

describe('UnexpectedResponse', () => {
  it('constructs objects which are instances of UnexpectedResponse', () => {
    const obj = new peer.UnexpectedResponse(0);
    expect(obj).toBeInstanceOf(Error);
    expect(obj).toBeInstanceOf(peer.UnexpectedResponse);
  });

  it('sets the error message, kind and id', () => {
    expect(new peer.UnexpectedResponse('eye dee', 'error')).toMatchObject({
      id: 'eye dee',
      kind: 'error',
      // tslint:disable-next-line:max-line-length
      message: 'Received error with id \'"eye dee"\', which does not correspond to any outstanding RPC call',
    });
  });

  it('defaults to kind "response"', () => {
    expect(new peer.UnexpectedResponse(0)).toHaveProperty('kind', 'response');
  });
});

describe('numeric request id iterator', () => {
  it('does not repeat values', () => {
    // Not quite true; values will repeat when it wraps around.
    const uut = new peer.NumericIdIterator();
    const previousValues = new Set<number>();
    for (let i = 0; i < 100; i += 1) {
      const output = uut.next();
      expect(output.done).toBe(false);
      expect(previousValues.has(output.value)).toBe(false);
      previousValues.add(output.value);
    }
  });

  it('wraps around when hitting max safe integer', () => {
    const uut = new peer.NumericIdIterator(Number.MAX_SAFE_INTEGER - 1);
    expect(uut.next().value).toBe(Number.MAX_SAFE_INTEGER - 1);
    expect(uut.next().value).toBe(Number.MAX_SAFE_INTEGER);
    expect(uut.next().value).toBe(Number.MIN_SAFE_INTEGER);
    expect(uut.next().value).toBe(Number.MIN_SAFE_INTEGER + 1);
  });

  it('rejects non-integer starting values', () => {
    expect(() => new peer.NumericIdIterator(3.14)).toThrow(TypeError);
  });

  it('rejects starting values larger than max safe integer', () => {
    expect(() => new peer.NumericIdIterator(2 ** 54)).toThrow(TypeError);
  });

  it('rejects starting values smaller than min safe integer', () => {
    expect(() => new peer.NumericIdIterator(-(2 ** 54))).toThrow(TypeError);
  });
});

describe('Peer', () => {
  let uut: peer.Peer;

  beforeEach(() => {
    uut = new peer.Peer({});
  });

  describe('when no handlers are registered', () => {
    it('responds to an incoming request with an error response', (done) => {
      uut.once('data', (value: any) => {
        const message = jrpc.parse(value);
        expect(message).toEqual({
          kind: 'error',
          id: 3,
          error: expect.objectContaining({
            code: peer.ErrorCodes.METHOD_NOT_FOUND,
          }),
        });
        done();
      });
      uut.write(jrpc.request(3, 'foo'));
    });

    it('accepts an incoming notification', () => {
      uut.write(jrpc.notification('hello'));
    });
  });

  it('handles an unexpected response by emitting an UnexpectedResponse error', (done) => {
    uut.once('error', (err: Error) => {
      expect(err).toMatchObject({
        message: expect.stringContaining("Received response with id \'55\'"),
        kind: 'response',
        id: 55,
      });
      expect(err).toBeInstanceOf(peer.UnexpectedResponse);
      done();
    });
    uut.write(jrpc.response(55));
  });

  it('handles an error with no id by emitting an RPCError', (done) => {
    const errorContents = {
      message: 'I am error',
      code: 8675309,
      data: [1, 2, 3, 4, 5],
    };
    uut.once('error', (err: Error) => {
      expect(err).toEqual(expect.any(peer.RPCError));
      expect(err).toEqual(expect.objectContaining(errorContents));
      done();
    });
    uut.write(jrpc.error(errorContents));
  });

  it(
    // tslint:disable-next-line:max-line-length
    'handles an error with an id not matching any outstanding request by emitting an UnexpectedResponse error',
    (done) => {
      uut.once('error', (err: Error) => {
        expect(err).toMatchObject({
          message: expect.stringContaining('Received error with id \'"yellow"\''),
          kind: 'error',
          id: 'yellow',
        });
        expect(err).toBeInstanceOf(peer.UnexpectedResponse);
        done();
      });
      uut.write(jrpc.error({ id: 'yellow', message: '', code: 1 }));
    });

  function expectInvalidRequest(done: jest.DoneCallback) {
    uut.once('data', (value: any) => {
      const message = jrpc.parse(value);
      expect(message).toEqual({
        kind: 'error',
        id: null,
        error: expect.objectContaining({
          code: peer.ErrorCodes.INVALID_REQUEST,
        }),
      });
      done();
    });
  }

  it('sends an error message when a malformed object is received', (done) => {
    expectInvalidRequest(done);
    uut.write({ totally: 'bogus' });
  });

  it('sends an error message when very malformed JSON is received', (done) => {
    expectInvalidRequest(done);
    uut.write('A string is definitely not valid JSON-RPC');
  });

  it('sends a request to the remote peer and resolves the response', () => {
    uut.once('data', (value: any) => {
      const message = jrpc.parse(value);
      expect(message).toEqual(expect.objectContaining({
        kind: 'request',
        method: 'myRpcCall',
        params: [true, 3, 'yes'],
        id: expect.anything(),
      }));
      if (message.kind === 'request') {
        uut.write(jrpc.response(message.id, 'this is a response'));
      }
    });

    const call = uut.callMethod('myRpcCall', [true, 3, 'yes']);
    jest.runTimersToTime(24 * 60 * 60 * 1000);
    return expect(call).resolves.toBe('this is a response');
  });

  it('uses different request ids for multiple requests', () => {
    expect.assertions(6);
    const requestIds = new Set<jrpc.RPCID>();
    uut.on('data', (value: any) => {
      const message = jrpc.parse(value);
      expect(message.kind).toBe('request');
      if (message.kind === 'request') {
        expect(requestIds.has(message.id)).toBe(false);
        requestIds.add(message.id);
        uut.write(jrpc.response(message.id));
      }
    });
    return Promise.all(['a', 'b', 'c'].map(method => uut.callMethod(method)));
  });

  it('resolves method calls regardless of the order responses are received', () => {
    const requests: jrpc.Request[] = [];
    uut.on('data', (value: any) => {
      const message = jrpc.parse(value);
      expect(message.kind).toBe('request');
      if (message.kind === 'request') {
        requests.push(message);
      }
      if (requests.length === 2) {
        uut.write(jrpc.response(requests[1].id, requests[1].params));
      } else if (requests.length === 3) {
        uut.write(jrpc.response(requests[0].id, requests[0].params));
        uut.write(jrpc.response(requests[2].id, requests[2].params));
      } else if (requests.length === 4) {
        uut.write(jrpc.response(requests[3].id, requests[3].params));
      }
    });

    const paramses = [['first', 1, 7], ['second'], ['third', 8], ['fourth', 0]];
    return expect(Promise.all(
        paramses.map(p => uut.callMethod('foo', p))))
          .resolves.toEqual(paramses);
  });

  it('rejects the method call promise when the remote peer sends an error response', () => {
    uut.once('data', (value: any) => {
      const message = jrpc.parse(value);
      if (message.kind === 'request') {
        uut.write(jrpc.error({ id: message.id, code: 3, message: 'fail!' }));
      }
    });
    return expect(uut.callMethod('foo')).rejects.toEqual(
      expect.objectContaining({
        message: 'fail!',
        code: 3,
      }));
  });

  it('sends notifications', (done) => {
    uut.on('data', (value: any) => {
      const message = jrpc.parse(value);
      expect(message).toEqual({
        kind: 'notification',
        method: 'fooNotification',
        params: { a: 'asdf' },
      });
      done();
    });
    uut.sendNotification('fooNotification', { a: 'asdf' });
  });

  it('calls the onNotification handler when a notification is received', (done) => {
    uut.onNotification = function (method: string, params: jrpc.RPCParams) {
      expect(this).toBe(undefined);
      expect(method).toBe('qwerty');
      expect(params).toEqual({ foo: 'bar' });
      done();
    };
    uut.write(jrpc.notification('qwerty', { foo: 'bar' }));
  });

  it(
    'calls the onRequest handler when a request is received ' +
    'and sends a synchronous response',
    (done) => {
      uut.onRequest = function (method: string, params: jrpc.RPCParams) {
        expect(this).toBe(undefined);
        expect(method).toBe('add');
        expect(params).toEqual(expect.any(Array));
        return (params as number[]).reduce((a, b) => a + b, 0);
      };
      const expectedResponses = [
        {
          kind: 'response',
          id: 'asdf',
          result: 7,
        },
        {
          kind: 'response',
          id: 'yes',
          result: 15,
        },
        {
          kind: 'response',
          id: 123,
          result: 8,
        },
      ];
      uut.on('data', (value: any) => {
        try {
          const message = jrpc.parse(value);
          expect(message).toEqual(expectedResponses.shift());
          if (expectedResponses.length === 0) {
            done();
          }
        } catch (e) {
          done.fail(e);
        }
      });

      uut.write(jrpc.request('asdf', 'add', [1, 4, 2]));
      uut.write(jrpc.request('yes', 'add', [5, 5, 5]));
      uut.write(jrpc.request(123, 'add', [4, -6, 10]));
    });

  it('sends a response when the onRequest handler returns a promise', (done) => {
    uut.onRequest = (method: string, params: jrpc.RPCParams) => {
      return Promise.resolve(params);
    };
    uut.on('data', (value: any) => {
      try {
        const message = jrpc.parse(value);
        expect(message).toEqual({
          kind: 'response',
          id: 'foo',
          result: [5, 4, 3],
        });
        done();
      } catch (e) {
        done.fail(e);
      }
    });
    uut.write(jrpc.request('foo', '', [5, 4, 3]));
  });

  it('sends a response after the Writable side is closed', (done) => {
    uut.onRequest = () => {
      uut.end();
      return new Promise(resolve => setImmediate(resolve));
    };
    uut.on('data', (value) => {
      try {
        const message = jrpc.parse(value);
        expect(message).toMatchObject({
          kind: 'response',
          id: 'bar',
        });
        done();
      } catch (e) {
        done.fail(e);
      }
    });
    uut.write(jrpc.request('bar', ''));
  });

  describe('sends an internal error response', () => {
    function testInternalError(onRequest: peer.RequestHandler) {
      uut.onRequest = onRequest;
      const promises = Promise.all([
        new Promise((resolve: () => void) => {
          uut.on('data', (value: any) => {
            const message = jrpc.parse(value);
            expect(message).toEqual({
              kind: 'error',
              id: 7654,
              error: expect.objectContaining({
                code: peer.ErrorCodes.INTERNAL_ERROR,
              }),
            });
            resolve();
          });
        }),
        new Promise((resolve: () => void) => {
          uut.on('error', (err: Error) => {
            expect(err.message).toBe('I died.');
            resolve();
          });
        }),
      ]);
      uut.write(jrpc.request(7654, 'foo'));
      return promises;
    }

    test('when onRequest throws', () => {
      return testInternalError(() => {
        throw new Error('I died.');
      });
    });

    test('when onRequest returns a promise which rejects', () => {
      return testInternalError(() => {
        return Promise.reject(new Error('I died.'));
      });
    });
  });

  describe('sends an error response', () => {
    function testErrorResponse(done: jest.DoneCallback, onRequest: peer.RequestHandler) {
      uut.onRequest = onRequest;
      uut.on('error', done.fail);
      uut.on('data', (value: any) => {
        const message = jrpc.parse(value);
        expect(message).toEqual({
          kind: 'error',
          id: 'foobar',
          error: {
            code: 5555,
            message: 'You dun goofed',
            data: undefined,
          },
        });
        done();
      });
      uut.write(jrpc.request('foobar', 'asdf'));
    }

    test('when onRequest throws an RPCError', (done) => {
      testErrorResponse(done, () => {
        throw new peer.RPCError('You dun goofed', 5555);
      });
    });

    test('when onRequest returns a promise which rejects', (done) => {
      testErrorResponse(done, () => {
        return Promise.reject(new peer.RPCError('You dun goofed', 5555));
      });
    });

    test('after the Writable side is closed', (done) => {
      testErrorResponse(done, () => {
        uut.end();
        return new Promise((resolve, reject) => {
          setImmediate(() => reject(new peer.RPCError('You dun goofed', 5555)));
        });
      });
    });
  });

  it('forwards a parse error from the deserializer to the remote peer', (done) => {
    const parseError = new peer.ParseError('That is not JSON');
    const onProtocolError = jest.fn();
    uut.on('protocolError', onProtocolError);
    uut.on('data', (value: any) => {
      const message = jrpc.parse(value);
      expect(message).toEqual({
        kind: 'error',
        id: null,
        error: {
          code: peer.ErrorCodes.PARSE_ERROR,
          message: 'That is not JSON',
          data: undefined,
        },
      });
      expect(onProtocolError).toBeCalledWith(parseError);
      done();
    });
    uut.write(parseError);
  });

  it('throws when request id repeats', () => {
    uut.requestIdIterator = [1, 2, 1, 2][Symbol.iterator]();
    uut.callMethod('foo');
    uut.callMethod('bar');
    expect(() => uut.callMethod('baz'))
      .toThrow(/iterator yielded a value which was already used/);
  });

  it('throws when the request id iterator is done', () => {
    uut.requestIdIterator = [1][Symbol.iterator]();
    uut.callMethod('foo');
    expect(() => uut.callMethod('bar')).toThrow(/Out of Request IDs/);
  });

  it('accepts a request id iterator in the constructor', () => {
    const iter = [][Symbol.iterator]();
    uut = new peer.Peer({}, { idIterator: iter });
    expect(uut.requestIdIterator).toBe(iter);
  });

  it('rejects all outstanding method calls when the stream ends', () => {
    const methodCalls = [uut.callMethod('foo'), uut.callMethod('bar')];
    uut.end();
    return Promise.all(methodCalls.map((call) => {
      return expect(call).rejects.toThrow(peer.RPCStreamClosed);
    }));
  });

  describe('after the stream ends', () => {
    beforeEach(() => uut.end());

    it('rejects when attempting to call a method', () => {
      return expect(uut.callMethod('foo')).rejects.toThrow(peer.RPCStreamClosed);
    });

    it('does not throw when attempting to send a notification', () => {
      expect(() => uut.sendNotification('foo')).not.toThrow();
    });

    it('does not throw when attempting to push an error', () => {
      expect(() => uut.pushError({ code: 0, message: 'foo' })).not.toThrow();
    });
  });

  describe('when calling a method with a timeout', () => {
    let id: jrpc.RPCID;
    let methodCall: Promise<{}>;

    beforeEach((done) => {
      uut.once('data', (value: any) => {
        const message = jrpc.parse(value);
        if (message.kind === 'request') {
          id = message.id;
          done();
        } else {
          done.fail(`unexpected message kind ${message.kind}`);
        }
      });

      methodCall = uut.callMethod('foo', undefined, { timeout: 1000 });

      // Suppress unhandled-rejection warnings
      methodCall.catch(() => {});
    });

    describe('and there is a response', () => {
      beforeEach(() => {
        uut.write(jrpc.response(id));
      });

      it('resolves', () => expect(methodCall).resolves.toBeNull());
      it('clears the timeout timer', () => expect(clearTimeout).toBeCalled());
    });

    describe('and there is no response within the timeout', () => {
      beforeEach(() => jest.runTimersToTime(1000));

      it('rejects with a timeout error', () => {
        return expect(methodCall).rejects.toThrow(peer.MethodCallTimeout);
      });

      describe('but a delayed response does arrive', () => {
        it('accepts the response without emitting an error', () => {
          uut.on('data', fail);
          uut.on('error', fail);
          uut.write(jrpc.response(id));
        });
      });
    });

    describe('and the stream ends', () => {
      beforeEach(() => uut.end());

      it('rejects with an error', () => expect(methodCall).rejects.toThrow(
        peer.RPCStreamClosed,
      ));
      it('clears the timeout timer', () => expect(clearTimeout).toBeCalled());
    });
  });
});
