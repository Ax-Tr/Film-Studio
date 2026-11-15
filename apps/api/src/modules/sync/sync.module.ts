import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { PostgresSyncRepository } from '../../database/postgres-sync.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { PermissionService } from '../authorization/permission.service.js';
import { SyncController } from './sync.controller.js';
import { SyncService } from './sync.service.js';
import { SYNC_REPOSITORY, SYNC_SERVICE } from './sync.tokens.js';

@Module({
  controllers: [SyncController],
  providers: [
    {
      provide: SYNC_REPOSITORY,
      useFactory: (pool: Pool) => new PostgresSyncRepository(pool),
      inject: [Pool],
    },
    {
      provide: SYNC_SERVICE,
      useFactory: (
        repository: PostgresSyncRepository,
        permissions: PermissionService,
        audit: AuditService,
      ) => new SyncService(repository, permissions, audit),
      inject: [SYNC_REPOSITORY, PermissionService, AuditService],
    },
  ],
  exports: [SYNC_SERVICE],
})
export class SyncModule {}

