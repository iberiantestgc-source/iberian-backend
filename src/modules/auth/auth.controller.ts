import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  /**
   * Bootstrap temporal de SUPER_ADMIN.
   *
   * IMPORTANTE:
   * Esta ruta debe eliminarse después de crear
   * el primer SUPER_ADMIN.
   *
   * POST /api/v1/auth/bootstrap-super-admin
   */
  @Post('bootstrap-super-admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bootstrap temporal de SUPER_ADMIN',
    description:
      'Convierte un usuario existente en SUPER_ADMIN utilizando credenciales de bootstrap configuradas en las variables de entorno.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          format: 'email',
          example: 'juanprueba@gmail.com',
        },
        secret: {
          type: 'string',
          example: 'TU_SECRET',
        },
      },
      required: ['email', 'secret'],
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Usuario convertido correctamente en SUPER_ADMIN',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description:
      'Credenciales de bootstrap inválidas o bootstrap no disponible',
  })
  async bootstrapSuperAdmin(
    @Body('email') email: string,
    @Body('secret') secret: string,
  ) {
    return this.authService.bootstrapSuperAdmin(
      typeof email === 'string' ? email.trim() : '',
      typeof secret === 'string' ? secret : '',
    );
  }

  /**
   * Registrar un nuevo usuario.
   *
   * POST /api/v1/auth/register
   */
  @Post('register')
  @ApiOperation({
    summary: 'Registrar nuevo usuario',
    description:
      'Crea la cuenta, envía email de verificación y devuelve tokens.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Usuario creado correctamente',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'El email ya está registrado',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Datos de registro inválidos',
  })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * Verificar email con el token del enlace del correo.
   *
   * POST /api/v1/auth/verify-email
   */
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verificar email',
    description:
      'Confirma el correo usando el token enviado por email (válido 24 h).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          description: 'Token JWT del enlace de verificación',
        },
      },
      required: ['token'],
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Email verificado correctamente',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Token inválido o expirado',
  })
  async verifyEmail(@Body('token') token: string) {
    return this.authService.verifyEmail(
      typeof token === 'string' ? token.trim() : '',
    );
  }

  /**
   * Reenviar email de verificación (usuario logueado).
   *
   * POST /api/v1/auth/resend-verification
   */
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Reenviar email de verificación',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Correo reenviado',
  })
  async resendVerification(
    @CurrentUser('id') userId: string,
  ) {
    return this.authService.resendVerification(userId);
  }

  /**
   * Iniciar sesión.
   *
   * POST /api/v1/auth/login
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Login realizado correctamente',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Credenciales inválidas',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Datos de login inválidos',
  })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * Renovar access token utilizando un refresh token.
   *
   * POST /api/v1/auth/refresh
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renovar access token',
    description:
      'Revoca el refresh token utilizado y genera un nuevo access token y refresh token.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Tokens renovados correctamente',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description:
      'Refresh token inválido, revocado o expirado',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Refresh token no proporcionado',
  })
  async refresh(
    @Body('refreshToken') refreshToken: string,
  ) {
    if (
      typeof refreshToken !== 'string' ||
      !refreshToken.trim()
    ) {
      return this.authService.refreshToken('');
    }

    return this.authService.refreshToken(
      refreshToken.trim(),
    );
  }

  /**
   * Cerrar sesión.
   *
   * POST /api/v1/auth/logout
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cerrar sesión',
    description:
      'Revoca el refresh token proporcionado.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Sesión cerrada correctamente',
  })
  async logout(
    @Body('refreshToken') refreshToken: string,
  ) {
    return this.authService.logout(
      typeof refreshToken === 'string'
        ? refreshToken.trim()
        : '',
    );
  }

  /**
   * Solicitar recuperación de contraseña.
   *
   * POST /api/v1/auth/forgot-password
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Solicitar recuperación de contraseña',
    description:
      'Genera una solicitud de recuperación de contraseña para el email indicado.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Solicitud procesada correctamente',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Email inválido',
  })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ) {
    return this.authService.forgotPassword(dto);
  }

  /**
   * Restablecer contraseña utilizando un token.
   *
   * POST /api/v1/auth/reset-password
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restablecer contraseña',
    description:
      'Cambia la contraseña utilizando un token de recuperación válido.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Contraseña restablecida correctamente',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'Token inválido, expirado o datos incorrectos',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description:
      'Token de recuperación inválido o expirado',
  })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ) {
    return this.authService.resetPassword(dto);
  }
}