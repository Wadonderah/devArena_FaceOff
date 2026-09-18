import { Language } from '@prisma/client';
import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

const MAX_SNIPPET_LENGTH = 20_000;

/// Validates a `{ LANGUAGE: "code" }` map.
///
/// A plain `@IsObject()` would accept `{ "PYTHN": "..." }` or a megabyte of
/// text under an arbitrary key — the value reaches Judge0 as source code, so
/// both the keys and the sizes have to be checked rather than assumed.
export function ValidateLanguageMap(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'validateLanguageMap',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null) return true;
          if (typeof value !== 'object' || Array.isArray(value)) return false;

          const languages = new Set<string>(Object.values(Language));

          return Object.entries(value as Record<string, unknown>).every(
            ([key, snippet]) =>
              languages.has(key) &&
              typeof snippet === 'string' &&
              snippet.length <= MAX_SNIPPET_LENGTH,
          );
        },

        defaultMessage(args: ValidationArguments) {
          return `${args.property} must map supported languages (${Object.values(Language).join(
            ', ',
          )}) to code of at most ${MAX_SNIPPET_LENGTH} characters`;
        },
      },
    });
  };
}
