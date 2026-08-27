import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Servicio de archivos.
 * Preparado para Supabase Storage.
 * Sin credenciales devuelve URLs firmadas mock.
 */
@Injectable()
export class FilesService {
  constructor(private configService: ConfigService) {}

  private getConfig() {
    return {
      url: this.configService.get<string>('SUPABASE_URL'),
      key: this.configService.get<string>('SUPABASE_KEY'),
      bucket:
        this.configService.get<string>('SUPABASE_BUCKET') || 'iberian-files',
    };
  }

  /**
   * Genera path de subida para avatares / recursos
   */
  buildPath(userId: string, folder: string, filename: string) {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${folder}/${userId}/${Date.now()}_${safe}`;
  }

  /**
   * En producción: subir a Supabase Storage.
   * Ahora: valida y devuelve metadata mock.
   */
  async uploadMeta(
    userId: string,
    folder: 'avatars' | 'resources',
    filename: string,
    mimeType: string,
    sizeBytes: number,
  ) {
    if (sizeBytes > 5 * 1024 * 1024) {
      throw new BadRequestException('Archivo máximo 5MB');
    }

    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ];
    if (!allowed.includes(mimeType)) {
      throw new BadRequestException('Tipo de archivo no permitido');
    }

    const path = this.buildPath(userId, folder, filename);
    const { url, bucket } = this.getConfig();

    if (!url) {
      return {
        path,
        bucket,
        publicUrl: `https://placeholder.iberian.app/${path}`,
        mode: 'mock',
        message:
          'Configura SUPABASE_URL y SUPABASE_KEY para subidas reales',
      };
    }

    // Placeholder para integración real con Supabase SDK
    return {
      path,
      bucket,
      publicUrl: `${url}/storage/v1/object/public/${bucket}/${path}`,
      mode: 'supabase-ready',
      uploadHint:
        'Usa el cliente Supabase en el frontend o implementa signed upload URL',
    };
  }

  async getPublicUrl(path: string) {
    const { url, bucket } = this.getConfig();
    if (!url) {
      return { publicUrl: `https://placeholder.iberian.app/${path}`, mode: 'mock' };
    }
    return {
      publicUrl: `${url}/storage/v1/object/public/${bucket}/${path}`,
      mode: 'supabase',
    };
  }
}
