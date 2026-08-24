const crypto = require('crypto');
const OAuthClient = require('../models/oauth-client.model');
const OAuthCode = require('../models/oauth-code.model');
const User = require('../models/user.model');
const { sign } = require('../utils/jwt');

const apiOrigin = () => process.env.PUBLIC_API_ORIGIN || 'https://api.pungfit.life';
const webOrigin = () => process.env.PUBLIC_WEB_ORIGIN || 'https://pungfit.life';
const resourceId = (version = '') => `${apiOrigin()}/mcp${version}`;
const allowedResources = () => [resourceId(), resourceId('-v2')];
const sha256 = (value) => crypto.createHash('sha256').update(value).digest();
const base64url = (value) => value.toString('base64url');

exports.protectedResource = (req, res) => res.json({
  resource: req.originalUrl.includes('mcp-v2') ? resourceId('-v2') : resourceId(),
  authorization_servers: [apiOrigin()],
  scopes_supported: ['workout:read', 'workout:write', 'meal:read', 'meal:write'],
  resource_documentation: `${apiOrigin()}/docs/mcp`,
});

exports.authorizationServer = (req, res) => res.json({
  issuer: apiOrigin(),
  authorization_endpoint: `${apiOrigin()}/oauth/authorize`,
  token_endpoint: `${apiOrigin()}/oauth/token`,
  registration_endpoint: `${apiOrigin()}/oauth/register`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
  scopes_supported: ['workout:read', 'workout:write', 'meal:read', 'meal:write'],
});

exports.register = async (req, res) => {
  const redirectUris = req.body?.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 ||
      redirectUris.some((uri) => typeof uri !== 'string' || !uri.startsWith('https://'))) {
    return res.status(400).json({ error: 'invalid_redirect_uri' });
  }
  const client = await OAuthClient.create({
    client_id: `pungfit_client_${crypto.randomBytes(24).toString('base64url')}`,
    client_name: req.body.client_name || 'ChatGPT',
    redirect_uris: redirectUris,
  });
  return res.status(201).json({
    client_id: client.client_id,
    client_name: client.client_name,
    redirect_uris: client.redirect_uris,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code'],
    response_types: ['code'],
  });
};

const validateAuthorization = async (query) => {
  const { client_id, redirect_uri, response_type, code_challenge,
    code_challenge_method, resource } = query;
  const client = await OAuthClient.findOne({ client_id });
  if (!client || !client.redirect_uris.includes(redirect_uri)) throw new Error('invalid_client');
  if (response_type !== 'code' || code_challenge_method !== 'S256' || !code_challenge) {
    throw new Error('invalid_request');
  }
  if (!allowedResources().includes(resource)) throw new Error('invalid_target');
  return client;
};

exports.authorize = async (req, res) => {
  try {
    await validateAuthorization(req.query);
    const params = new URLSearchParams(req.query).toString();
    return res.redirect(`${webOrigin()}/mcp-authorize?${params}`);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

exports.approve = async (req, res) => {
  try {
    const values = req.body || {};
    await validateAuthorization(values);
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ error: 'invalid_user' });
    const scope = 'workout:read workout:write meal:read meal:write';
    const code = `pungfit_code_${crypto.randomBytes(32).toString('base64url')}`;
    await OAuthCode.create({
      code_hash: base64url(sha256(code)),
      user_id: user._id,
      client_id: values.client_id,
      redirect_uri: values.redirect_uri,
      code_challenge: values.code_challenge,
      resource: values.resource,
      scope,
      expires_at: new Date(Date.now() + 10 * 60 * 1000),
    });
    const redirect = new URL(values.redirect_uri);
    redirect.searchParams.set('code', code);
    if (values.state) redirect.searchParams.set('state', values.state);
    return res.json({ redirect_url: redirect.toString() });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

exports.token = async (req, res) => {
  const { grant_type, code, client_id, redirect_uri, code_verifier, resource } = req.body;
  if (grant_type !== 'authorization_code' || !code || !code_verifier) {
    return res.status(400).json({ error: 'invalid_request' });
  }
  const grant = await OAuthCode.findOne({ code_hash: base64url(sha256(code)) });
  if (!grant || grant.expires_at < new Date() || grant.client_id !== client_id ||
      grant.redirect_uri !== redirect_uri || grant.resource !== resource) {
    return res.status(400).json({ error: 'invalid_grant' });
  }
  if (base64url(sha256(code_verifier)) !== grant.code_challenge) {
    return res.status(400).json({ error: 'invalid_grant' });
  }
  await OAuthCode.deleteOne({ _id: grant._id });
  const user = await User.findById(grant.user_id);
  if (!user) return res.status(400).json({ error: 'invalid_grant' });
  const accessToken = sign({
    sub: user._id.toString(), email: user.email, role: user.role,
    token_use: 'mcp', scopes: grant.scope.split(' '), resource: grant.resource,
  }, { expiresIn: '30d' });
  return res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: 2592000,
    scope: grant.scope, resource: grant.resource });
};
