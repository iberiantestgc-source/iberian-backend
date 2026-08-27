import {
    Test,
    TestingModule,
} from '@nestjs/testing';

import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
    let appController: AppController;

    beforeEach(async () => {
        const app: TestingModule =
            await Test.createTestingModule({
                controllers: [
                    AppController,
                ],
                providers: [
                    AppService,
                ],
            }).compile();

        appController =
            app.get<AppController>(
                AppController
            );
    });

    describe('root', () => {
        it('should return the health status', () => {
            const result =
                appController.health();

            expect(result.status).toBe(
                'ok'
            );

            expect(result.service).toBe(
                'IBERIAN API'
            );

            expect(result.version).toBe(
                '1.0.0'
            );

            expect(
                result.timestamp
            ).toBeDefined();
        });
    });
});