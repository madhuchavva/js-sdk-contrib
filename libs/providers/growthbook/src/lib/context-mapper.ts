import type { EvaluationContext } from '@openfeature/server-sdk';
import type { Attributes } from '@growthbook/growthbook';

/**
 * Convert an OpenFeature evaluation context into GrowthBook attributes.
 *
 * GrowthBook buckets on the `id` attribute by default, while OpenFeature carries
 * the subject in `targetingKey`. Without this mapping GrowthBook receives an
 * attribute literally named `targetingKey` and nothing named `id`, so percentage
 * rollouts return their default and experiments never assign a variation --
 * silently, because a missing hash attribute is not an error.
 *
 * An explicitly supplied `id` wins over `targetingKey`: setting both is the
 * portable pattern, and the caller's named attribute should not be overwritten.
 */
export function toAttributes(context: EvaluationContext): Attributes {
  const { targetingKey, ...rest } = context;
  const attributes: Attributes = { ...rest };

  if (targetingKey !== undefined && attributes['id'] === undefined) {
    attributes['id'] = targetingKey;
  }

  return attributes;
}
