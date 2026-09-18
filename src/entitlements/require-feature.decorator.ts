import { SetMetadata } from '@nestjs/common';
import { FeatureKey } from '@prisma/client';
export const REQUIRED_FEATURE_KEY = 'required-feature';
export const RequireFeature = (feature: FeatureKey) => SetMetadata(REQUIRED_FEATURE_KEY, feature);
