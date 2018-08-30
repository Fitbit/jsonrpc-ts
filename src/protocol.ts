/**
 * JSON-RPC protocol types, along with functions for constructing and
 * parsing/validating JSON-RPC data structures.
 *
 * The constructor and parser functions all operate on native JavaScript
 * data structures. De/serializing from/to JSON must be handled
 * externally.
 */

import * as t from 'io-ts';

// Runtime types are variables which are used like types, which is
// reflected in their PascalCase naming scheme.
/* tslint:disable:variable-name */

/** The JSON primitive types (string, number, boolean, null) */
export const Primitive = t.union([t.string, t.number, t.boolean, t.null]);
export type Primitive = t.TypeOf<typeof Primitive>;

/** The JSON structured types (object, array) */
export const Structured = t.union([t.dictionary(t.string, t.any), t.Array]);
export type Structured = t.TypeOf<typeof Structured>;

/** Any of the JSON types; not undefined */
export const Some = t.union([Primitive, Structured]);
export type Some = t.TypeOf<typeof Some>;

/** JSON-RPC Request or Response id */
export const RPCID = t.union([t.Integer, t.string]);
export type RPCID = t.TypeOf<typeof RPCID>;

/** JSON-RPC Request params */
export const RPCParams = Structured;
export type RPCParams = t.TypeOf<typeof RPCParams>;

/** `error` member of a JSON-RPC Error object */
export const RPCError = t.intersection([
  t.interface({
    code: t.Integer,
    message: t.string,
  }),
  t.partial({
    data: Some,
  }),
]);
export type RPCError = t.TypeOf<typeof RPCError>;

/** JSON-RPC Request object */
export const RequestJSON = t.intersection([
  t.interface({
    jsonrpc: t.literal('2.0'),
    method: t.string,
    id: RPCID,
    params: t.union([RPCParams, t.undefined]),
  }),
  t.partial({
    result: t.undefined,
    error: t.undefined,
  }),
]);
export type RequestJSON = t.TypeOf<typeof RequestJSON>;

/** JSON-RPC Notification object */
export const NotificationJSON = t.intersection([
  t.interface({
    jsonrpc: t.literal('2.0'),
    method: t.string,
    params: t.union([RPCParams, t.undefined]),
  }),
  t.partial({
    id: t.undefined,
    result: t.undefined,
    error: t.undefined,
  }),
]);
export type NotificationJSON = t.TypeOf<typeof NotificationJSON>;

/** JSON-RPC Response object */
export const ResponseJSON = t.intersection([
  t.interface({
    jsonrpc: t.literal('2.0'),
    result: Some,
    id: t.union([t.Integer, t.string]),
  }),
  t.partial({
    method: t.undefined,
    params: t.undefined,
    error: t.undefined,
  }),
]);
export type ResponseJSON = t.TypeOf<typeof ResponseJSON>;

/** JSON-RPC Error object */
export const ErrorJSON = t.intersection([
  t.interface({
    jsonrpc: t.literal('2.0'),
    error: RPCError,
    id: t.union([RPCID, t.null]),
  }),
  t.partial({
    method: t.undefined,
    params: t.undefined,
    result: t.undefined,
  }),
]);
export type ErrorJSON = t.TypeOf<typeof ErrorJSON>;

/** Deserialized JSON-RPC Request */
export interface Request {
  kind: 'request';
  method: string;
  params?: Structured;
  id: RPCID;
}

/** Deserialized JSON-RPC Notification */
export interface Notification {
  kind: 'notification';
  method: string;
  params?: Structured;
}

/** Deserialized JSON-RPC Response */
export interface Response {
  kind: 'response';
  result: Some;
  id: RPCID;
}

/** Deserialized JSON-RPC Error */
export interface Error {
  kind: 'error';
  error: {
    code: number;
    message: string;
    data?: Some;
  };
  id: RPCID | null;
}

/** Parsed and categorized JSON-RPC message */
export type Message = Request | Notification | Response | Error;

/* tslint:enable:variable-name */

/** Parse an object as a JSON-RPC message. */
export function parse(obj: object): Message {
  if (RequestJSON.is(obj)) {
    return {
      kind: 'request',
      id: obj.id,
      method: obj.method,
      params: obj.params,
    };
  }

  if (NotificationJSON.is(obj)) {
    return {
      kind: 'notification',
      method: obj.method,
      params: obj.params,
    };
  }

  if (ResponseJSON.is(obj)) {
    return {
      kind: 'response',
      id: obj.id,
      result: obj.result,
    };
  }

  if (ErrorJSON.is(obj)) {
    return {
      kind: 'error',
      id: obj.id,
      error: obj.error,
    };
  }

  throw new TypeError('Not a valid JSON-RPC object');
}

/** Construct a JSON-RPC Request object. */
export function request(id: RPCID, method: string, params?: RPCParams): RequestJSON {
  if (!RPCID.is(id)) {
    throw new TypeError('Request ID must be a string or integer');
  }
  return { id, method, params, jsonrpc: '2.0' };
}

/** Construct a JSON-RPC Notification object. */
export function notification(method: string, params?: RPCParams): NotificationJSON {
  return { method, params, jsonrpc: '2.0' };
}

/** Construct a JSON-RPC Response. */
export function response(id: RPCID, result?: Some): ResponseJSON {
  if (!RPCID.is(id)) {
    throw new TypeError('Response ID must be a string or integer');
  }
    // tslint:disable-next-line:no-null-keyword
  const nulledResult = result !== undefined ? result : null;
  return { id, jsonrpc: '2.0', result: nulledResult };
}

/** Arguments for constructing a JSON-RPC Error object. */
export interface ErrorObject extends RPCError {
  id?: RPCID | null;
}

/** Construct a JSON-RPC Error object. */
export function error(error: ErrorObject): ErrorJSON {
  const { id, code, message, data } = error;
    // tslint:disable-next-line:no-null-keyword
  const nulledId = id !== undefined ? id : null;
    // tslint:disable-next-line:no-null-keyword
  if (nulledId !== null && !RPCID.is(id)) {
    throw new TypeError('Error ID must be string, integer, null or undefined');
  }
  if (!t.Integer.is(code)) {
    throw new TypeError('Error code must be an integer');
  }
  return { jsonrpc: '2.0', id: nulledId, error: { code, message, data } };
}
