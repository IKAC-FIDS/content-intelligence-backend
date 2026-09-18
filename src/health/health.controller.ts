import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  getHealth() {
    return this.healthService.getHealth();
  }

  @Get('ready')
  getReadiness() {
    return this.healthService.getReadiness();
  }

  @Get('version')
  getVersion() {
    return this.healthService.getVersion();
  }
}