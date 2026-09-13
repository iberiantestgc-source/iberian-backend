import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import {
  createClient,
  SupabaseClient,
} from '@supabase/supabase-js';

type UploadedAvatarFile = {
  buffer: Buffer;
  mimetype: string;
};

@Injectable()
export class SupabaseService {
  private readonly supabase: SupabaseClient;
  private readonly bucket: string;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    const bucket = process.env.SUPABASE_BUCKET;

    if (!url || !key || !bucket) {
      throw new Error(
        'Faltan las variables SUPABASE_URL, SUPABASE_KEY o SUPABASE_BUCKET',
      );
    }

    this.supabase = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    this.bucket = bucket;
  }

  async uploadAvatar(
    userId: string,
    file: UploadedAvatarFile,
  ): Promise<string> {
    const extension = this.getExtension(file.mimetype);

    const filePath =
      `avatars/${userId}-${Date.now()}.${extension}`;

    const { error } = await this.supabase.storage
      .from(this.bucket)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      console.error(
        'Error subiendo avatar a Supabase:',
        error,
      );

      throw new InternalServerErrorException(
        'No se ha podido subir la imagen',
      );
    }

    return filePath;
  }

  async getSignedUrl(
    filePath: string,
  ): Promise<string | null> {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(
        filePath,
        60 * 60 * 24 * 7,
      );

    if (error || !data?.signedUrl) {
      console.error(
        'Error generando URL firmada de Supabase:',
        error,
      );

      return null;
    }

    return data.signedUrl;
  }

  async deleteFile(
    filePath: string,
  ): Promise<void> {
    const { error } = await this.supabase.storage
      .from(this.bucket)
      .remove([filePath]);

    if (error) {
      console.error(
        'Error eliminando avatar anterior de Supabase:',
        error,
      );
    }
  }

  private getExtension(
    mimetype: string,
  ): string {
    switch (mimetype) {
      case 'image/jpeg':
        return 'jpg';

      case 'image/png':
        return 'png';

      case 'image/webp':
        return 'webp';

      default:
        throw new InternalServerErrorException(
          'Formato de imagen no compatible',
        );
    }
  }
}