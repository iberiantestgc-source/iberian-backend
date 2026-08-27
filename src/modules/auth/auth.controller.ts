import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  /**
   * Registrar un nuevo usuario.
   *
   * POST /api/v1/auth/register
   */
  @Post('register')
  @ApiOperation({
    summary: 'Registrar nuevo usuario',
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