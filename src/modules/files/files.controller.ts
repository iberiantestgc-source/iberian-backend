import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload-meta')
  @ApiOperation({
    summary: 'Preparar metadata de subida (Supabase Storage)',
  })
  uploadMeta(
    @CurrentUser('id') userId: string,
    @Body()
    body: {
      folder: 'avatars' | 'resources';
      filename: string;
      mimeType: string;
      sizeBytes: number;
    },
  ) {
    return this.filesService.uploadMeta(
      userId,
      body.folder,
      body.filename,
      body.mimeType,
      body.sizeBytes,
    );
  }

  @Get('public-url')
  @ApiOperation({ summary: 'Obtener URL pública de un path' })
  getPublicUrl(@Query('path') path: string) {
    return this.filesService.getPublicUrl(path);
  }
}
