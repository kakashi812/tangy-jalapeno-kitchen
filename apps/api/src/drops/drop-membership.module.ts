import { Module } from '@nestjs/common';
import { DropMembershipService } from './drop-membership.service.js';
@Module({ providers: [DropMembershipService], exports: [DropMembershipService] })
export class DropMembershipModule {}
