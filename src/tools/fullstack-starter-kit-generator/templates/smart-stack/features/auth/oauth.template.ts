import { z } from 'zod';

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  providers: Array<'github' | 'google' | 'microsoft'>;
}

const configSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  redirectUri: z.string(),
  providers: z.array(z.enum(['github', 'google', 'microsoft'])),
});

export function generateOAuthConfig(config: OAuthConfig): string {
  const validatedConfig = configSchema.parse(config);

  return `
// OAuth Configuration
export const oauthConfig = {
  clientId: '${validatedConfig.clientId}',
  clientSecret: '${validatedConfig.clientSecret}',
  redirectUri: '${validatedConfig.redirectUri}',
  providers: ${JSON.stringify(validatedConfig.providers)}
};

// Provider-specific configurations
export const providerConfigs = {
  github: {
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scope: 'read:user user:email'
  },
  google: {
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scope: 'openid email profile'
  },
  microsoft: {
    authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
    scope: 'openid email profile User.Read'
  }
};`;
}

export function generateOAuthHandlers(config: OAuthConfig): string {
  const validatedConfig = configSchema.parse(config);

  return `
import { oauthConfig, providerConfigs } from './config';

export async function handleOAuthCallback(provider: string, code: string) {
  const providerConfig = providerConfigs[provider];
  if (!providerConfig) {
    throw new Error(\`Unsupported provider: \${provider}\`);
  }

  // Exchange code for token
  const tokenResponse = await fetch(providerConfig.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: oauthConfig.clientId,
      client_secret: oauthConfig.clientSecret,
      code,
      redirect_uri: oauthConfig.redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    throw new Error('Failed to get access token');
  }

  // Get user info
  const userResponse = await fetch(providerConfig.userInfoUrl, {
    headers: {
      Authorization: \`Bearer \${tokenData.access_token}\`,
    },
  });

  const userData = await userResponse.json();
  return {
    provider,
    ...userData,
    accessToken: tokenData.access_token,
  };
}

export function getAuthorizationUrl(provider: string) {
  const providerConfig = providerConfigs[provider];
  if (!providerConfig) {
    throw new Error(\`Unsupported provider: \${provider}\`);
  }

  const params = new URLSearchParams({
    client_id: oauthConfig.clientId,
    redirect_uri: oauthConfig.redirectUri,
    scope: providerConfig.scope,
    response_type: 'code',
  });

  return \`\${providerConfig.authorizationUrl}?\${params.toString()}\`;
}`;
}
