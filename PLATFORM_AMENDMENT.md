# Mandatory platform architecture amendment — preserved verbatim in substance

Effective 13 November 2026. Supersedes desktop-only and desktop-first packaging instructions without removing the functional scope of the source master requirements.

## Platforms

1. Full-featured responsive web application: Next.js + React + TypeScript.
2. Dedicated Android application: React Native + Expo + TypeScript.
3. Dedicated iOS application: React Native + Expo + TypeScript.

A mobile-responsive website does not substitute for dedicated Android/iOS apps. Optional future desktop wrapper is not an initial platform dependency.

## Shared platform

- Backend: NestJS/Node.js, REST APIs and WebSockets.
- Canonical database: PostgreSQL.
- Mobile offline replica: SQLite with durable and safe sync.
- Web screenplay editor: Tiptap/ProseMirror or technically superior alternative.
- Monorepo with shared types, validation, business rules, API client and domain logic.
- Secure cross-platform authentication, cloud storage, optional local backups.

## Functional parity and platform optimization

- Same account, projects, scripts, characters, scenes and AI history across all three clients.
- Automatic synchronization, offline screenplay writing, conflict detection and safe user-resolvable conflict handling.
- Laptop/desktop web writing workspace; mobile reading, writing, reviews, scene navigation and idea capture.
- Test Telugu input, shaping, fonts and export independently on web, Android and iOS.
- Provider-independent AI, keys handled on backend, no duplicated platform domain rules.
- APIs designed for future subscriptions, teams and enterprise.

## Ordered delivery and integrity

- FIRST shared backend, authentication, database, project structure, API contracts.
- SECOND full web application on that architecture.
- THIRD dedicated Android/iOS apps, each independently built and tested.
- Every shipped screen must use real storage, error/loading behavior, permission checks and actual working actions.
- Deliver reproducible web, Android, iOS builds, setup and environment configuration, migrations, API docs, tests, deployment docs.
- BEFORE implementation produce architecture diagram, monorepo folder tree, database schema, API specification, development milestones.
- All original creative/production/security/QA requirements remain; only conflicting platform topology is overridden.
