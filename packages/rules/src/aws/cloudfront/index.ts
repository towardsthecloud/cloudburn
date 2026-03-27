import { cloudFrontDistributionPricingClassRule } from './distribution-pricing-class.js';
import { cloudFrontUnusedDistributionRule } from './unused-distribution.js';

// Intent: aggregate AWS CloudFront rule definitions.
export const cloudfrontRules = [cloudFrontDistributionPricingClassRule, cloudFrontUnusedDistributionRule];
