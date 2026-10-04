import { Controller, Get } from '@nestjs/common';
import type { SessionUser } from '@fernleaf/shared';
import { CurrentUser, SignedIn } from '../auth/decorators.js';
import { DashboardService } from './dashboard.service.js';
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}
  @Get()
  @SignedIn()
  get(@CurrentUser() user: SessionUser) {
    return this.dashboard.get(user);
  }
}
