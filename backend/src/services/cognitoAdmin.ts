/**
 * Cognito admin operations — list, delete, and resend confirmation for users.
 *
 * Because the Cognito user pool lives in the management account while the
 * backend runs in the deploy account, this module optionally assumes a
 * cross-account IAM role (COGNITO_ADMIN_ROLE_ARN) before calling admin APIs.
 */

import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  ResendConfirmationCodeCommand,
  type UserType,
  type AttributeType,
} from '@aws-sdk/client-cognito-identity-provider'
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts'
import { fromSSO } from '@aws-sdk/credential-providers'

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || ''
const REGION = process.env.COGNITO_REGION || 'eu-west-1'
const ADMIN_ROLE_ARN = process.env.COGNITO_ADMIN_ROLE_ARN || ''
const COGNITO_AWS_PROFILE = process.env.COGNITO_AWS_PROFILE || ''

/** Resolved admin client — lazily initialised */
let _adminClient: CognitoIdentityProviderClient | null = null
let _adminClientExpiresAt = 0

/**
 * Build (or reuse) a CognitoIdentityProviderClient with admin-level creds.
 * Resolution order:
 *   1. COGNITO_ADMIN_ROLE_ARN — cross-account role assumption via STS
 *   2. COGNITO_AWS_PROFILE    — named AWS profile (e.g. local dev SSO)
 *   3. Default credential chain (ECS task role, env vars, …)
 */
async function getAdminClient(): Promise<CognitoIdentityProviderClient> {
  if (!ADMIN_ROLE_ARN) {
    if (!_adminClient) {
      _adminClient = new CognitoIdentityProviderClient({
        region: REGION,
        ...(COGNITO_AWS_PROFILE ? { credentials: fromSSO({ profile: COGNITO_AWS_PROFILE }) } : {}),
      })
    }
    return _adminClient
  }

  // Cross-account — assume role, refresh when within 5 min of expiry
  const now = Date.now()
  if (_adminClient && now < _adminClientExpiresAt - 5 * 60_000) {
    return _adminClient
  }

  const sts = new STSClient({ region: REGION })
  const assumed = await sts.send(new AssumeRoleCommand({
    RoleArn: ADMIN_ROLE_ARN,
    RoleSessionName: 'examapp-cognito-admin',
    DurationSeconds: 3600,
  }))

  const creds = assumed.Credentials!
  _adminClient = new CognitoIdentityProviderClient({
    region: REGION,
    credentials: {
      accessKeyId: creds.AccessKeyId!,
      secretAccessKey: creds.SecretAccessKey!,
      sessionToken: creds.SessionToken!,
    },
  })
  _adminClientExpiresAt = creds.Expiration ? creds.Expiration.getTime() : now + 3600_000

  return _adminClient
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function attr(user: UserType, name: string): string | undefined {
  return user.Attributes?.find((a: AttributeType) => a.Name === name)?.Value
}

export interface CognitoUserSummary {
  username: string
  email: string | null
  status: string
  enabled: boolean
  createdAt: string | null
}

function mapUser(u: UserType): CognitoUserSummary {
  return {
    username: u.Username ?? '',
    email: attr(u, 'email') ?? null,
    status: u.UserStatus ?? 'UNKNOWN',
    enabled: u.Enabled ?? true,
    createdAt: u.UserCreateDate ? u.UserCreateDate.toISOString() : null,
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * List Cognito users, optionally filtered by status.
 * Returns up to `limit` users; pass `paginationToken` for the next page.
 */
export async function listCognitoUsers(opts: {
  status?: string
  limit?: number
  paginationToken?: string
}): Promise<{ users: CognitoUserSummary[]; paginationToken: string | null }> {
  const client = await getAdminClient()
  const filter = opts.status ? `cognito:user_status = "${opts.status}"` : undefined
  const res = await client.send(new ListUsersCommand({
    UserPoolId: USER_POOL_ID,
    Filter: filter,
    Limit: Math.min(opts.limit ?? 60, 60),
    PaginationToken: opts.paginationToken,
  }))

  return {
    users: (res.Users ?? []).map(mapUser),
    paginationToken: res.PaginationToken ?? null,
  }
}

/**
 * Get a single Cognito user by username.
 */
export async function getCognitoUser(username: string): Promise<CognitoUserSummary | null> {
  const client = await getAdminClient()
  try {
    const res = await client.send(new AdminGetUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
    }))
    return {
      username: res.Username ?? username,
      email: res.UserAttributes?.find((a) => a.Name === 'email')?.Value ?? null,
      status: res.UserStatus ?? 'UNKNOWN',
      enabled: res.Enabled ?? true,
      createdAt: res.UserCreateDate ? res.UserCreateDate.toISOString() : null,
    }
  } catch (err: any) {
    if (err.name === 'UserNotFoundException') return null
    throw err
  }
}

/**
 * Delete a Cognito user (admin operation).
 */
export async function deleteCognitoUser(username: string): Promise<void> {
  const client = await getAdminClient()
  await client.send(new AdminDeleteUserCommand({
    UserPoolId: USER_POOL_ID,
    Username: username,
  }))
}

/**
 * Resend the confirmation code for an unconfirmed user.
 * This uses the public API (not admin) so it goes through normal Cognito
 * email flow — useful for testing whether SES is wired correctly.
 */
export async function resendUserConfirmation(username: string): Promise<void> {
  // We need the client ID + optional secret hash for this public API
  const clientId = process.env.COGNITO_APP_CLIENT_ID
  if (!clientId) throw new Error('COGNITO_APP_CLIENT_ID not set')

  const { createHmac } = await import('crypto')
  const clientSecret = process.env.COGNITO_APP_CLIENT_SECRET
  let secretHash: string | undefined
  if (clientSecret) {
    secretHash = createHmac('sha256', clientSecret).update(username + clientId).digest('base64')
  }

  const client = await getAdminClient()
  await client.send(new ResendConfirmationCodeCommand({
    ClientId: clientId,
    SecretHash: secretHash,
    Username: username,
  }))
}
