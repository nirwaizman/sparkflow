/**
 * @sparkflow/enterprise — public API.
 *
 * Groups three enterprise-plan features behind a single import surface:
 *   - SAML / OIDC SSO via WorkOS (./sso/workos)
 *   - SCIM 2.0 provisioning server (./scim/server)
 *   - Per-org IP allowlist enforcement (./ip-allowlist)
 */
export {
  getAuthorizationUrl,
  handleCallback,
  isWorkOSConfigured,
  type AuthorizationUrlInput,
  type AuthorizationUrlResult,
  type CallbackResult,
  type WorkOSProfile,
} from "./sso/workos";

export {
  ScimUserSchema,
  ScimGroupSchema,
  handleScimRequest,
  registerScimToken,
  clearScimToken,
  mintScimToken,
  type ScimRequest,
  type ScimResponse,
  type ScimUser,
  type ScimGroup,
} from "./scim/server";

export {
  isAllowed,
  isValidCidr,
  setAllowlist,
  getAllowlist,
  clearAllowlist,
} from "./ip-allowlist";
