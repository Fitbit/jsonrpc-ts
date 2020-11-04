/** Request and notificaiton dispatchers for JSON-RPC peers */

import * as t from 'io-ts';
import { PathReporter } from 'io-ts/lib/PathReporter';
import { isRight } from 'fp-ts/lib/Either';

import * as jrpc from './protocol';
import * as peer from './peer';

export interface TypedHandlerFn<T extends t.Any = t.Any> {
  fn: (params: t.TypeOf<T>) => Promise<any> | any;
  paramsType: T;
}

export type DefaultNotificationHandler = (
  this: void,
  method: string,
  params: jrpc.RPCParams,
) => void;

/**
 * A method dispatcher which performs run-time type checking to
 * verify that the type of the RPC request's arguments are compatible
 * with the RPC call handler's function signature. It also supports
 * function overloading like TypeScript.
 *
 * Unfortunately due to limitations of TypeScript's type system, RPC
 * calls with positional arguments will be passed to the method handler
 * functions as a single Array argument in order for the TypeScript
 * compiler to type-check the function signature. This limitation can
 * be lifted once the Variadic Kinds proposal
 * (https://github.com/Microsoft/TypeScript/issues/5453) is implemented
 * in TypeScript.
 *
 * Like TypeScript, the first method overload which passes type-checks
 * is invoked as the handler for a request. So make sure to register
 * method overloads in order of most specific to least specific.
 *
 * The method handler is called with the value output from the io-ts
 * validator, so runtime types can be used which deserialize or
 * otherwise transform the value when validating.
 */
export default class TypesafeRequestDispatcher {
  requestHandlers = new Map<string, TypedHandlerFn[]>();
  notificationHandlers = new Map<string, TypedHandlerFn[]>();

  /**
   * Override this property to receive notifications which could not be
   * handled by any registered notification handler function.
   */
  defaultNotificationHandler: DefaultNotificationHandler = () => {};

  private static register<T extends t.Any>(
    collection: Map<string, TypedHandlerFn[]>,
    name: string,
    paramsType: T,
    impl: (params: t.TypeOf<T>) => Promise<any> | any,
  ) {
    if (name.startsWith('rpc.')) {
      throw new TypeError('Method names beginning with "rpc." are reserved');
    }
    const handlers = collection.get(name);
    if (handlers === undefined) {
      collection.set(name, [{ paramsType, fn: impl }]);
    } else {
      handlers.push({ paramsType, fn: impl });
    }
  }

  /**
   * Register an RPC request handler function.
   *
   * @param name name of RPC method
   * @param paramsType io-ts type definition of the expected params
   * @param impl method implementation function
   */
  method<T extends t.Any>(
    name: string,
    paramsType: T,
    impl: (params: t.TypeOf<T>) => Promise<any> | any,
  ): this {
    TypesafeRequestDispatcher.register(
      this.requestHandlers,
      name,
      paramsType,
      impl,
    );
    return this;
  }

  /**
   * Register an RPC notification handler function.
   *
   * @param name name of RPC method
   * @param paramsType io-ts type definition of the expected params
   * @param impl notification handler function
   */
  notification<T extends t.Any>(
    name: string,
    paramsType: T,
    impl: (params: t.TypeOf<T>) => void,
  ): this {
    TypesafeRequestDispatcher.register(
      this.notificationHandlers,
      name,
      paramsType,
      impl,
    );
    return this;
  }

  onRequest: peer.RequestHandler = (method: string, params: jrpc.RPCParams) => {
    const handlers = this.requestHandlers.get(method);
    if (handlers === undefined) {
      throw new peer.MethodNotFound(`No such method: '${method}'`);
    } else {
      const validationErrors: string[][] = [];
      for (const { fn, paramsType } of handlers) {
        const decoded = paramsType.decode(params);

        if (isRight(decoded)) {
          return fn(decoded.right);
        }
        validationErrors.push(PathReporter.report(decoded));
      }
      // None of the implementations matched.
      throw new peer.InvalidParams(
        `Invalid parameters for method ${method}`,
        validationErrors,
      );
    }
  };

  onNotification: peer.NotificationHandler = (
    method: string,
    params: jrpc.RPCParams,
  ) => {
    const handlers = this.notificationHandlers.get(method);
    if (handlers !== undefined) {
      for (const { fn, paramsType } of handlers) {
        const decoded = paramsType.decode(params);
        if (isRight(decoded)) {
          fn(decoded.right);
          return;
        }
      }
    }
    this.defaultNotificationHandler(method, params);
  };
}
