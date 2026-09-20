import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

const MAX_FILES = 20;
const MAX_FILE_CHARS = 20_000;
// A filename, not a path: no separators, no traversal, no control characters.
const FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/// Validates a `{ "filename.ext": "contents" }` map of read-only context files.
///
/// `@IsObject()` alone accepted any keys and any value types. The values are
/// shown to participants verbatim and the keys are rendered as filenames, so
/// both are bounded: a sane filename shape, string contents, and caps on count
/// and size that mirror the language-map validator next to this one.
export function ValidateContextFiles(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'validateContextFiles',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null) return true;
          if (typeof value !== 'object' || Array.isArray(value)) return false;

          const entries = Object.entries(value as Record<string, unknown>);
          if (entries.length > MAX_FILES) return false;

          return entries.every(
            ([name, contents]) =>
              FILENAME.test(name) &&
              typeof contents === 'string' &&
              contents.length <= MAX_FILE_CHARS,
          );
        },

        defaultMessage(args: ValidationArguments) {
          return `${args.property} must map at most ${MAX_FILES} plain filenames to text of at most ${MAX_FILE_CHARS} characters`;
        },
      },
    });
  };
}
