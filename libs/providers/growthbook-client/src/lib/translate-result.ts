import type { FeatureResult, FeatureResultSource } from '@growthbook/growthbook';
import type { ResolutionDetails, ResolutionReason } from '@openfeature/web-sdk';
import { ErrorCode, StandardResolutionReasons, TypeMismatchError } from '@openfeature/web-sdk';

const FEATURE_RESULT_ERRORS = ['unknownFeature', 'cyclicPrerequisite'];

/**
 * GrowthBook's `source` describes how a value was produced. Map it onto the
 * OpenFeature reasons so consumers -- and reason-aware tooling such as the
 * OpenTelemetry hooks -- see the same vocabulary they get from every other
 * provider. The raw source is preserved in flag metadata for anyone who needs
 * the GrowthBook-specific detail.
 */
function translateReason(source: FeatureResultSource): ResolutionReason {
  switch (source) {
    case 'experiment':
      return StandardResolutionReasons.SPLIT;
    case 'force':
    case 'override':
    case 'prerequisite':
      return StandardResolutionReasons.TARGETING_MATCH;
    case 'defaultValue':
      return StandardResolutionReasons.DEFAULT;
    case 'unknownFeature':
    case 'cyclicPrerequisite':
      return StandardResolutionReasons.ERROR;
    default:
      // Not reachable for the current FeatureResultSource union, but the peer
      // range allows newer GrowthBook minors that may add sources.
      return StandardResolutionReasons.UNKNOWN;
  }
}

function translateError(errorKind?: string): ErrorCode {
  switch (errorKind) {
    case 'unknownFeature':
      return ErrorCode.FLAG_NOT_FOUND;
    case 'cyclicPrerequisite':
      return ErrorCode.PARSE_ERROR;
    default:
      return ErrorCode.GENERAL;
  }
}

export default function translateResult<T>(result: FeatureResult, defaultValue: T): ResolutionDetails<T> {
  if (result.value !== null && typeof result.value !== typeof defaultValue) {
    throw new TypeMismatchError(`Expected flag type ${typeof defaultValue} but got ${typeof result.value}`);
  }

  const resolution: ResolutionDetails<T> = {
    value: result.value === null ? defaultValue : result.value,
    reason: translateReason(result.source),
    variant: result.experimentResult?.key,
    flagMetadata: {
      source: result.source,
    },
  };

  if (FEATURE_RESULT_ERRORS.includes(result.source)) {
    resolution.errorCode = translateError(result.source);
  }

  return resolution;
}
