import { Module } from '@nestjs/common';

import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { SupabaseService } from './supabase.service';

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    SupabaseService,
  ],
  exports: [
    UsersService,
  ],
})
export class UsersModule {}