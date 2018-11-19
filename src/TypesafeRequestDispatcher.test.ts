import * as t from 'io-ts';

import * as peer from './peer';
import TypesafeRequestDispatcher from './TypesafeRequestDispatcher';

let dispatcher: TypesafeRequestDispatcher;

beforeEach(() => {
  dispatcher = new TypesafeRequestDispatcher();
});

// Lifted from the io-ts README
// tslint:disable-next-line:variable-name
const DateFromString = new t.Type<any, Date>(
  'DateFromString',
  (v): v is Date => v instanceof Date,
  (v, c) =>
    t.string.validate(v, c).chain((s) => {
      const d = new Date(s);
      return isNaN(d.getTime()) ? t.failure(s, c) : t.success(d);
    }),
  a => a.toISOString(),
);

describe('swallows the notification', () => {
  test('when no notification handlers are registered', () => {
    const sentinel = jest.fn();
    dispatcher.method('requestOnly', t.any, sentinel);
    dispatcher.onNotification('requestOnly', []);
    expect(sentinel).not.toBeCalled();
  });

  test('when no handler for the method matches the param types', () => {
    const sentinel = jest.fn();
    dispatcher.notification('foo', t.tuple([t.number, t.string]), sentinel);
    dispatcher.notification('foo', t.interface({ bar: t.number }), sentinel);
    dispatcher.onNotification('foo', [3]);
    dispatcher.onNotification('foo', { baz: 'haha' });
    expect(sentinel).not.toBeCalled();
  });
});

describe('calls the default notification handler', () => {
  test('when no notification handlers are registered', () => {
    const handler = jest.fn();
    dispatcher.defaultNotificationHandler = handler;
    dispatcher.onNotification('foo', [3, 1, 4]);
    expect(handler).toBeCalledWith('foo', [3, 1, 4]);
  });

  test('when no handler for the method matches the param types', () => {
    const sentinel = jest.fn();
    const handler = jest.fn();
    dispatcher.defaultNotificationHandler = handler;
    dispatcher.notification('foo', t.tuple([t.number]), sentinel);
    dispatcher.onNotification('foo', ['hey']);
    expect(sentinel).not.toBeCalled();
    expect(handler).toBeCalledWith('foo', ['hey']);
  });
});

describe('dispatches a notification', () => {
  test('when a request arrives', () => {
    const handler = jest.fn();
    dispatcher.notification('asdf', t.any, handler);
    dispatcher.onNotification('asdf', {});
    expect(handler).toBeCalled();
  });

  test('to the first matching handler', () => {
    const quux1 = jest.fn();
    const quux2 = jest.fn();
    const quux3 = jest.fn();
    const abc = jest.fn();
    dispatcher
      .notification('abc', t.any, abc)
      .notification('quux', t.tuple([t.string, t.number]), quux1)
      .notification('quux', t.tuple([t.number, t.number]), quux2)
      .notification('quux', t.tuple([t.number, t.number]), quux3);
    // Both quux2 and quux3 match the params so quux2 should be called
    // since it was registered first.
    dispatcher.onNotification('quux', [3, 4]);
    expect(quux1).not.toBeCalled();
    expect(quux2).toBeCalledWith([3, 4]);
    expect(quux3).not.toBeCalled();
    expect(abc).not.toBeCalled();
  });

  test('with transformed params', () => {
    const handler = jest.fn();
    dispatcher.notification('date', t.tuple([DateFromString]), handler);
    const date = new Date(2017, 6, 1);
    dispatcher.onNotification('date', [date.toISOString()]);
    expect(handler).toBeCalledWith([date]);
  });
});

it('throws MethodNotFound when no request handler is registered', () => {
  const sentinel = jest.fn();
  dispatcher.notification('foo', t.any, sentinel);
  expect(() => dispatcher.onRequest('foo', [])).toThrow(peer.MethodNotFound);
  expect(sentinel).not.toBeCalled();
});

it('throws InvalidParams when params match none of the registered handlers for a method', () => {
  const sentinel = jest.fn();
  dispatcher
    .method('foo', t.tuple([t.string, t.number]), sentinel)
    .method('foo', t.tuple([t.number, t.boolean]), sentinel);
  expect(() => dispatcher.onRequest('foo', [true]))
    .toThrow(peer.InvalidParams);
  expect(sentinel).not.toBeCalled();
});

describe('dispatches a request', () => {
  test('when a request arrives', () => {
    const handler = jest.fn();
    dispatcher.method('foo', t.any, handler);
    dispatcher.onRequest('foo', [1, 2, 3]);
    expect(handler).toBeCalledWith([1, 2, 3]);
  });

  test('to the first matching handler', () => {
    const quux1 = jest.fn();
    const quux2 = jest.fn();
    const quux3 = jest.fn();
    const abc = jest.fn();
    dispatcher
      .method('abc', t.any, abc)
      .method('quux', t.tuple([t.string, t.number]), quux1)
      .method('quux', t.tuple([t.number, t.number]), quux2)
      .method('quux', t.tuple([t.number, t.number]), quux3);
    // Both quux2 and quux3 match the params so quux2 should be called
    // since it was registered first.
    dispatcher.onRequest('quux', [3, 4]);
    expect(quux1).not.toBeCalled();
    expect(quux2).toBeCalledWith([3, 4]);
    expect(quux3).not.toBeCalled();
    expect(abc).not.toBeCalled();
  });

  test('with transformed params', () => {
    const handler = jest.fn();
    dispatcher.method('date', t.tuple([DateFromString]), handler);
    const date = new Date(2017, 6, 1);
    dispatcher.onRequest('date', [date.toISOString()]);
    expect(handler).toBeCalledWith([date]);
  });
});

it('returns the request handler function\'s return value', () => {
  dispatcher.method('yarr', t.any, () => 'avast matey');
  expect(dispatcher.onRequest('yarr', [])).toBe('avast matey');
});

it('disallows registering methods beginning with \'rpc.\'', () => {
  const handler = jest.fn();
  expect(() => dispatcher.method('rpc.foo', t.any, handler))
    .toThrow(TypeError);
  expect(() => dispatcher.notification('rpc.foo', t.any, handler))
    .toThrow(TypeError);
});
