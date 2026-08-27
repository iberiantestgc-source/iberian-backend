import {
    Controller,
    Get,
} from '@nestjs/common';

import {
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';

import { AppService } from './app.service';

@ApiTags('health')
@Controller()
export class AppController {
    constructor(
        private readonly appService: AppService
    ) {}

    @Get()
    @ApiOperation({
        summary: 'Health check',
    })
    health() {
        return {
            status: 'ok',
            service: 'IBERIAN API',
            version: '1.0.0',
            timestamp:
                new Date().toISOString(),
        };
    }
}