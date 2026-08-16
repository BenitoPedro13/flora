import { Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { ObservationsController } from './observations.controller.js';
import { ObservationsService } from './observations.service.js';
import { createRefreshQueue, REFRESH_QUEUE } from './refresh-queue.provider.js';
import { StressZonesController } from './stress-zones.controller.js';
import { StressZonesService } from './stress-zones.service.js';

@Module({
  controllers: [ObservationsController, StressZonesController],
  providers: [
    ObservationsService,
    StressZonesService,
    { provide: REFRESH_QUEUE, useFactory: createRefreshQueue },
  ],
})
export class ObservationsModule implements OnModuleDestroy {
  constructor(@Inject(REFRESH_QUEUE) private readonly queue: Queue) {}

  async onModuleDestroy() {
    await this.queue.close();
  }
}
