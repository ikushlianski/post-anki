# Native app sync: PowerSync vs Electric

## Decision

The Swift iOS and macOS apps (`apps/ios`) sync with PowerSync. The web app and the Expo app keep Electric with TanStack DB until PowerSync is proven in the Swift app.

## Why

- Electric has no official Swift client. Using it from Swift means writing a client for its HTTP shape API, plus a local store and an offline write queue.
- PowerSync ships an official Swift SDK that keeps a local SQLite database in sync with Postgres and queues offline writes.
- Self-hosting PowerSync (Open Edition) is free. It needs one container, Postgres logical replication, a storage database (Postgres 14+ can share the server) and a JWKS endpoint for token checks. PowerSync Cloud has a free tier for trying it out.

## Costs and risks

- Two sync systems run side by side until the web and Expo apps move over or the Swift app proves it needs its own.
- The API issues tokens that the PowerSync service verifies, so the existing API token flow needs a JWKS endpoint.
- Writes still go through the post-anki API, as with Electric.

## Not decided

- Whether web and Expo move to PowerSync later.
- Cloud versus self-hosted for production. Self-hosting on AWS needs the container, replication on the production Postgres and a storage database.

## Sources

- https://www.powersync.com/pricing
- https://docs.powersync.com/configuration/powersync-service/self-hosted-instances
- https://github.com/powersync-ja/powersync-swift
