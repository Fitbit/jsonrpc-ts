import * as stream from 'stream';

import { ParseError } from './peer';

/**
 * Parse each chunk as a JSON document. If the chunk is invalid JSON,
 * a peer.ParseError object is pushed instead.
 *
 * This stream is suitable for deserializing JSON-RPC messages for a
 * peer.Peer instance.
 */
export class ParseJSON extends stream.Transform {
  constructor() {
    super({ readableObjectMode: true });
  }

  // tslint:disable-next-line:function-name
  _transform(chunk: Buffer, encoding: string, callback: (err?: Error) => void) {
    try {
      this.push(JSON.parse(chunk.toString()));
    } catch (e) {
      if (e instanceof SyntaxError) {
        this.push(new ParseError(e.message));
      } else {
        callback(e);
        return;
      }
    }
    callback();
  }
}

/**
 * Stringify each chunk to a JSON document.
 */
export class StringifyJSON extends stream.Transform {
  whitespace: string | number | undefined;

  /**
   * @param whitespace Adds indentation, white space, and line break
   *   characters to the stringified JSON text to make it easier to read.
   */
  constructor(whitespace?: string | number) {
    super({ writableObjectMode: true, encoding: 'utf8' });
    this.whitespace = whitespace;
  }

  // tslint:disable-next-line:function-name
  _transform(chunk: object, encoding: string, callback: (err?: Error) => void) {
    this.push(JSON.stringify(chunk, undefined, this.whitespace));
    callback();
  }
}
