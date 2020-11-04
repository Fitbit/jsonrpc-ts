/**
 * A transport-agnostic JSON-RPC 2.0 peer.
 *
 * The peer is a Duplex stream which makes it easy to create a program
 * which talks JSON-RPC 2.0 over any reliable transport.
 */

import * as stream from 'stream';

// tslint:disable-next-line:import-name
import ErrorSubclass from 'error-subclass';

import * as jrpc from './protocol';

export enum ErrorCodes {
  /**
   * Invalid JSON was received by the server, or an error occurred on
   * the server while parsing the JSON text.
   */
  PARSE_ERROR = -32700,
  /** The JSON sent is not a valid Request object. */
  INVALID_REQUEST = -32600,
  /** The method does not exist / is not available. */
  METHOD_NOT_FOUND = -32601,
  /** Invalid method parameter(s). */
  INVALID_PARAMS = -32602,
  /** Internal JSON-RPC error. */
  INTERNAL_ERROR = -32603,
}

/**
 * An RPC-related error.
 *
 * Error objects received from the remote peer are wrapped in an
 * RPCError instance for local consumption.
 *
 * If an RPCError instance is thrown by an RPC method handler, the error
 * will be sent to the remote peer as an Error response.
 */
export class RPCError extends ErrorSubclass {
  static displayName = 'RPCError';

  constructor(
    message: string,
    public readonly code: number = ErrorCodes.INTERNAL_ERROR,
    public readonly data?: any,
  ) {
    super(message);
  }

  toErrorObject(): jrpc.ErrorObject {
    return {
      code: this.code,
      message: this.message,
      data: this.data,
    };
  }
}

class InvalidRequest extends RPCError {
  static displayName = 'InvalidRequest';

  constructor(message: string, badObject: any) {
    super(message, ErrorCodes.INVALID_REQUEST, { badObject });
  }
}

export class MethodNotFound extends RPCError {
  static displayName = 'MethodNotFound';

  constructor(message: string, data?: any) {
    super(message, ErrorCodes.METHOD_NOT_FOUND, data);
  }
}

export class InvalidParams extends RPCError {
  static displayName = 'InvalidParams';

  constructor(message: string, data?: any) {
    super(message, ErrorCodes.INVALID_PARAMS, data);
  }
}

/**
 * Error while parsing the JSON text of a message.
 *
 * A ParseError instance can be written to a Peer's writable stream to
 * inform the Peer that the remote peer has sent a message that could
 * not be parsed.
 */
export class ParseError extends RPCError {
  static displayName = 'ParseError';

  constructor(message: string, data?: any) {
    super(message, ErrorCodes.PARSE_ERROR, data);
  }
}

/**
 * The method call could not be completed.
 */
export class MethodCallError extends ErrorSubclass {
  static displayName = 'MethodCallError';

  constructor(
    public readonly method: string,
    message = `RPC call to '${method}' could not be completed`,
  ) {
    super(message);
  }
}

/**
 * No response to a method call was received in time.
 */
export class MethodCallTimeout extends MethodCallError {
  static displayName = 'MethodCallTimeout';

  constructor(method: string) {
    super(method, `No response received for RPC call to '${method}'`);
  }
}

/**
 * The method call could not be completed as the Peer's writable stream
 * has been closed.
 */
export class RPCStreamClosed extends MethodCallError {
  static displayName = 'RPCStreamClosed';

  constructor(method: string) {
    super(
      method,
      `RPC call to '${method}' could not be completed as the RPC stream is closed`,
    );
  }
}

/**
 * An unexpected JSON-RPC Response has been received.
 */
export class UnexpectedResponse extends ErrorSubclass {
  static displayName = 'UnexpectedResponse';

  constructor(
    public readonly id: jrpc.RPCID,
    public readonly kind = 'response',
  ) {
    // tslint:disable-next-line:max-line-length
    super(
      `Received ${kind} with id '${JSON.stringify(
        id,
      )}', which does not correspond to any outstanding RPC call`,
    );
  }
}

/**
 * An infinite iterator which yields numeric Request IDs.
 */
export class NumericIdIterator implements Iterator<jrpc.RPCID> {
  state: number;

  constructor(initialValue = 0) {
    if (
      initialValue % 1 !== 0 ||
      initialValue > Number.MAX_SAFE_INTEGER ||
      initialValue < Number.MIN_SAFE_INTEGER
    ) {
      throw new TypeError('Initial value must be an integer');
    }
    this.state = initialValue;
  }

  next() {
    const value = this.state;
    if (this.state === Number.MAX_SAFE_INTEGER) {
      this.state = Number.MIN_SAFE_INTEGER;
    } else {
      this.state += 1;
    }
    return { value, done: false };
  }
}

/**
 * A function which handles RPC requests from the remote peer.
 *
 * The function should either return a value for a synchronous response,
 * or a Promise which will resolve to the value for an asynchronous
 * response. If the function throws, or if it returns a Promise which
 * rejects, an Error response will be sent to the remote peer.
 */
export type RequestHandler = (
  this: void,
  method: string,
  params: jrpc.RPCParams,
) => Promise<any> | any;
/**
 * A function which handles RPC notifications from the remote peer.
 */
export type NotificationHandler = (
  this: void,
  method: string,
  params: jrpc.RPCParams,
) => void;

export interface PeerOptions {
  /** Custom iterator yielding request IDs. Must be infinite. */
  idIterator?: Iterator<jrpc.RPCID>;
}

interface PendingRequest {
  method: string;
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
}

/**
 * A JSON-RPC Peer which reads and writes JSON-RPC objects as
 * JavaScript objects.
 *
 * For most applications, the read and write sides of this stream will
 * need to be piped through some Transform stream which serializes and
 * deserializes the objects, respectively, to a suitable format. This
 * gives the application developer complete control over how the
 * objects will be sent and received.
 *
 * A 'protocolError' event is emitted whenever a message is received
 * which is not a valid JSON-RPC 2.0 object. The parameter for the
 * event is an InvalidRequest instance containing the object which
 * failed validation.
 */
export class Peer extends stream.Duplex {
  onRequest?: RequestHandler;
  onNotification?: NotificationHandler;
  requestIdIterator: Iterator<jrpc.RPCID>;

  private pendingRequests = new Map<jrpc.RPCID, PendingRequest>();

  ended = false;

  constructor(
    handlers: {
      onRequest?: RequestHandler;
      onNotification?: NotificationHandler;
    },
    options: PeerOptions = {},
  ) {
    super({
      readableObjectMode: true,
      writableObjectMode: true,
      allowHalfOpen: false,
    });
    this.onRequest = handlers.onRequest;
    this.onNotification = handlers.onNotification;
    if (options.idIterator) {
      this.requestIdIterator = options.idIterator;
    } else {
      this.requestIdIterator = new NumericIdIterator();
    }
    this.once('finish', () => this.onend());
  }

  private onend() {
    this.ended = true;
    this.pendingRequests.forEach(({ method, reject }) => {
      reject(new RPCStreamClosed(method));
    });
    this.pendingRequests.clear();
  }

  /**
   * Call an RPC method on the remote peer.
   *
   * A promise is returned which will resolve to the response value
   * returned by the peer. If the remote peer returns an error, the
   * promise will reject with an RPCError instance containing the error
   * response returned by the peer.
   */
  callMethod(
    method: string,
    params?: jrpc.RPCParams,
    { timeout = undefined as number | undefined } = {},
  ): Promise<any> {
    if (this.ended) return Promise.reject(new RPCStreamClosed(method));
    const idResult = this.requestIdIterator.next();
    if (idResult.done) {
      throw new Error(
        'Out of Request IDs! Request ID iterator is not infinite',
      );
    }
    const id = idResult.value;
    if (this.pendingRequests.has(id)) {
      // We could try again with the next value from the iterator, but
      // that could result in an infinite loop if the iterator is badly
      // behaved. It would take 2^54 method calls before
      // NumericIdIterator would start repeating, and it is even less
      // likely for a request to be pending for that long without the
      // process running out of memory. Basically it's so unlikely for
      // this edge-case to happen with a well-behaved id iterator that
      // it's not worth trying to recover gracefully.
      throw new Error(
        'Request ID iterator yielded a value which was already used in a pending request',
      );
    }

    let timer: NodeJS.Timer | undefined;

    const promise = new Promise<any>((resolve, reject) => {
      this.push(jrpc.request(id, method, params));
      this.pendingRequests.set(id, { method, resolve, reject });

      if (timeout !== undefined) {
        timer = setTimeout(
          () => reject(new MethodCallTimeout(method)),
          timeout,
        );
      }
    });

    if (timer !== undefined) {
      const timerRef = timer;
      return promise.then(
        (value: any) => {
          clearTimeout(timerRef);
          return value;
        },
        (reason: any) => {
          clearTimeout(timerRef);
          return Promise.reject(reason);
        },
      );
    }

    return promise;
  }

  /** Send an RPC Notification object to the remote peer. */
  sendNotification(method: string, params?: jrpc.RPCParams) {
    return this.push(jrpc.notification(method, params));
  }

  /** Push an RPC Error object to the remote peer. */
  pushError(error: jrpc.ErrorObject) {
    return this.push(jrpc.error(error));
  }

  // tslint:disable-next-line:function-name
  _read() {
    // No-op; we'll push to the stream whenever we want.
    // Backpressure? We don't need no stinkin' backpressure!
  }

  // tslint:disable-next-line:function-name
  _write(chunk: any, encoding: string, callback: (err?: Error) => void) {
    if (chunk instanceof ParseError) {
      this.emit('protocolError', chunk);
      this.pushError(chunk.toErrorObject());
      callback();
      return;
    }

    let message: jrpc.Message;
    try {
      message = jrpc.parse(chunk);
    } catch (e) {
      // This peer could be used bidirectionally so we have to assume
      // that the malformed message was a request object and respond
      // appropriately.
      const error = new InvalidRequest('Not a valid JSON-RPC object', chunk);
      this.emit('protocolError', error);
      this.pushError(error.toErrorObject());
      callback();
      return;
    }

    try {
      switch (message.kind) {
        case 'request':
          this.handleRequest(message);
          break;
        case 'notification':
          this.handleNotification(message);
          break;
        case 'response':
          this.handleResponse(message);
          break;
        case 'error':
          this.handleError(message);
          break;
      }
    } catch (e) {
      // Invoking the callback with an error argument causes the
      // stream to emit an 'error' event.
      callback(e);
      return;
    }

    // We're ready to receive a new message.
    callback();
  }

  /** Handle a Request object from the remote peer. */
  handleRequest(request: jrpc.Request) {
    if (this.onRequest) {
      let promise: Promise<any>;
      try {
        promise = Promise.resolve(
          this.onRequest.call(undefined, request.method, request.params),
        );
      } catch (e) {
        promise = Promise.reject(e);
      }
      promise
        .then((value) => this.push(jrpc.response(request.id, value)))
        .catch((e) => {
          let rethrow = false;
          let error: jrpc.ErrorObject;
          if (e instanceof RPCError) {
            error = e.toErrorObject();
          } else {
            error = new RPCError(
              'Internal error while processing request',
            ).toErrorObject();
            rethrow = true;
          }
          error.id = request.id;
          this.pushError(error);
          if (rethrow) {
            this.emit('error', e);
          }
        });
    } else {
      this.pushError({
        id: request.id,
        code: ErrorCodes.METHOD_NOT_FOUND,
        message: 'No request handler attached',
      });
    }
  }

  /** Handle a Notification object from the remote peer. */
  handleNotification(notification: jrpc.Notification) {
    if (this.onNotification) {
      this.onNotification.call(
        undefined,
        notification.method,
        notification.params,
      );
    }
  }

  /** Handle a Response object from the remote peer. */
  handleResponse(response: jrpc.Response) {
    const { id, result } = response;
    const rpcCall = this.pendingRequests.get(id);
    if (rpcCall) {
      this.pendingRequests.delete(id);
      rpcCall.resolve(result);
    } else {
      throw new UnexpectedResponse(id);
    }
  }

  /**
   * Handle an Error object from the remote peer.
   *
   * If the error corresponds to a pending request, the request's
   * promise is rejected. Otherwise the error is thrown as a JS
   * Error object.
   */
  handleError(message: jrpc.Error) {
    const { id, error } = message;
    const rpcError = new RPCError(error.message, error.code, error.data);
    if (id !== null) {
      const rpcCall = this.pendingRequests.get(id);
      if (rpcCall) {
        this.pendingRequests.delete(id);
        rpcCall.reject(rpcError);
      } else {
        throw new UnexpectedResponse(id, 'error');
      }
    } else {
      throw rpcError;
    }
  }
}
