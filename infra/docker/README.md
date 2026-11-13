# Local dependencies

This Compose stack is development-only. It binds PostgreSQL, Redis and MinIO to loopback, persists local data in named volumes, and requires credentials supplied from an ignored `.env` file.

It is not a production topology. Production database encryption, private networking, managed identity, KMS/secrets, backup/PITR, scanning and high availability are delivered in later infrastructure sprints.

Image tags are exact, reviewable version pins. CI should add digest verification before these images become release inputs.
