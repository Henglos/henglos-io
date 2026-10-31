import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { IDriverPairTokenRepository } from '@/domain/repositories/IDriverPairTokenRepository.repo';

/** Deletes the expired driver pair tokens, every hour. */
@Injectable()
export class DriverPairTokenCleanupService {

	private readonly logger = new Logger(DriverPairTokenCleanupService.name);

	constructor(
		@Inject('IDriverPairTokenRepository') private readonly driverPairTokenRepository: IDriverPairTokenRepository,
	) {}

	@Cron(CronExpression.EVERY_HOUR)
	async handleExpiredCleanup(): Promise<void> {

		const deleted = await this.driverPairTokenRepository.deleteExpired();
		if (deleted > 0) this.logger.log(`Removed ${deleted} expired pairing token(s).`);

	}

}
