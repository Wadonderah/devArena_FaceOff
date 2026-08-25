import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/// Guards are registered globally and fail closed, so every unauthenticated
/// endpoint must opt out explicitly with this decorator.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
