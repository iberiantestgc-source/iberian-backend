import {
    Test,
    TestingModule,
} from '@nestjs/testing';

import {
    INestApplication,
} from '@nestjs/common';

import request from 'supertest';

import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
    let app: INestApplication;

    beforeEach(async () => {
        const moduleFixture: TestingModule =
            await Test.createTestingModule({
                imports: [
                    AppModule,
                ],
            }).compile();

        app =
            moduleFixture.createNestApplication();

        await app.init();
    });

    it('/ (GET)', () => {
        return request(
            app.getHttpServer()
        )
            .get('/')
            .expect(200)
            .expect((response) => {
                expect(
                    response.body.status
                ).toBe('ok');

                expect(
                    response.body.service
                ).toBe('IBERIAN API');

                expect(
                    response.body.version
                ).toBe('1.0.0');

                expect(
                    response.body.timestamp
                ).toBeDefined();
            });
    });

    afterEach(async () => {
        await app.close();
    });
});