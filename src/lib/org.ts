// Central org identity. The product name is fixed; the organization (tenant)
// name comes from organization_settings at runtime, with this fallback so
// nothing breaks if settings are ever missing. For multi-tenant, each org
// sets its own name in Settings — only this fallback stays constant.
export const APP_NAME = "Compliance Hub";
export const DEFAULT_ORG_NAME = "Lone Peak Psychiatry";
