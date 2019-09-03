// tslint:disable-next-line:import-name
import ErrorSubclass from 'error-subclass';
import * as t from 'io-ts';
import { failure } from 'io-ts/lib/PathReporter';
import { pipe } from 'fp-ts/lib/pipeable';
import { fold } from 'fp-ts/lib/Either';

export class DecodeError extends ErrorSubclass {
  static displayName = 'DecodeError';
}

/**
 * Creates a decoder function for an io-ts type.
 *
 * The decoder function throws DecodeError if the input value is not of
 * the expected type.
 *
 * Decoder functions can be used to build wrappers around RPC method
 * calls which enforce type-safety of the return values.
 *
 * ```typescript
 * const myMethod = (args: MyMethodArgs) =>
 *   rpc.callMethod('myMethod', args).then(decode(MyMethodResult));
 * // Return type of myMethod is Promise<TypeOf<MyMethodResult>>
 * ```
 *
 * @param type runtime type to decode
 */
export function decode<A, O, I>(type: t.Type<A, O, I>) {
  return (value: I): A => {
    return pipe(
      type.decode(value),
      fold(
        (errors) => {
          throw new DecodeError(failure(errors).join('\n'));
        },
        tag => tag,
      ),
    );
  };
}
