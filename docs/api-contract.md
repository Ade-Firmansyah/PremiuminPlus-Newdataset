# API Contract

See `docs/03-architecture-api.md` for the full endpoint list.

## Response Shape

Success:

```json
{
  "status": true,
  "data": {}
}
```

Failure:

```json
{
  "status": false,
  "message": "Readable error"
}
```

## Auth Headers

Frontend session:

```http
Authorization: Bearer <jwt>
```

Reseller API:

```http
x-api-key: <api_key>
```

**Security Note**: API key access is available for all active users (admin, reseller, member). All API key usage is logged with endpoint, method, and IP address for audit purposes.

## Provider Boundary

No frontend endpoint exposes the Premku API key. All provider interaction is proxied and validated by backend services.
