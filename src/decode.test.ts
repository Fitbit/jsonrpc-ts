import * as t from 'io-ts';

import { decode, DecodeError } from './decode';

// Lifted from the io-ts README
// tslint:disable-next-line:variable-name
const DateFromString = new t.Type<Date, string>(
  'DateFromString',
  (m): m is Date => m instanceof Date,
  (m, c) =>
    t.string.validate(m, c).chain((s) => {
      const d = new Date(s);
      return isNaN(d.getTime()) ? t.failure(s, c) : t.success(d);
    }),
  a => a.toISOString(),
);

// it returns a function of the right type
const decodeDate: (value: t.mixed) => Date = decode(DateFromString);

it('returns the decoded value', () => {
  const expectedDate = new Date(2018, 2, 16);
  expect(decodeDate(expectedDate.toISOString())).toEqual(expectedDate);
});

it('throws when decode fails', () => {
  expect(() => decodeDate('foo')).toThrowErrorMatchingSnapshot();
});
