import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly resend: Resend;

  constructor(
    private readonly configService: ConfigService,
  ) {
    this.resend = new Resend(
      this.configService.getOrThrow<string>(
        'RESEND_API_KEY',
      ),
    );
  }

  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
  ) {
    const frontendUrl = 'iberian://reset-password';

    const from =
      this.configService.get<string>(
        'MAIL_FROM',
      ) || 'IBERIAN <onboarding@resend.dev>';

    const resetUrl =
      `${frontendUrl}?token=${encodeURIComponent(
        resetToken,
      )}`;

    const { data, error } =
      await this.resend.emails.send({
        from,
        to: [email],
        subject:
          'Recupera tu contraseña · IBERIAN',
        html: `
          <div
            style="
              margin: 0;
              padding: 40px 20px;
              background-color: #0B1C2C;
              font-family: Arial, Helvetica, sans-serif;
            "
          >
            <div
              style="
                max-width: 600px;
                margin: 0 auto;
                background-color: #13253A;
                border-radius: 16px;
                overflow: hidden;
                box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
              "
            >
              <div
                style="
                  padding: 32px 30px 24px;
                  text-align: center;
                  border-bottom: 1px solid #1E3A56;
                "
              >
                <div
                  style="
                    font-size: 32px;
                    font-weight: 800;
                    letter-spacing: 4px;
                    color: #F5F7FA;
                  "
                >
                  IBERIAN
                </div>

                <div
                  style="
                    margin-top: 8px;
                    font-size: 13px;
                    color: #8B9BB4;
                    letter-spacing: 1px;
                  "
                >
                  PREPARACIÓN · DISCIPLINA · OBJETIVO
                </div>
              </div>

              <div
                style="
                  padding: 36px 30px;
                  color: #F5F7FA;
                "
              >
                <h1
                  style="
                    margin: 0 0 18px;
                    font-size: 25px;
                    line-height: 1.3;
                    text-align: center;
                    color: #F5F7FA;
                  "
                >
                  Recuperación de contraseña
                </h1>

                <p
                  style="
                    margin: 0 0 18px;
                    font-size: 15px;
                    line-height: 1.7;
                    color: #C7D2E0;
                  "
                >
                  Hemos recibido una solicitud para
                  restablecer la contraseña de tu cuenta
                  de <strong style="color: #F5F7FA;">IBERIAN</strong>.
                </p>

                <p
                  style="
                    margin: 0 0 28px;
                    font-size: 15px;
                    line-height: 1.7;
                    color: #C7D2E0;
                  "
                >
                  Si has realizado esta solicitud, pulsa
                  el siguiente botón para crear una nueva
                  contraseña:
                </p>

                <div
                  style="
                    text-align: center;
                    margin: 32px 0;
                  "
                >
                  <a
                    href="${resetUrl}"
                    style="
                      display: inline-block;
                      padding: 15px 28px;
                      background-color: #C9A227;
                      color: #0B1C2C;
                      text-decoration: none;
                      border-radius: 10px;
                      font-size: 15px;
                      font-weight: 800;
                    "
                  >
                    Restablecer contraseña
                  </a>
                </div>

                <div
                  style="
                    margin: 28px 0;
                    padding: 18px;
                    background-color: #0B1C2C;
                    border-radius: 10px;
                    border-left: 3px solid #C9A227;
                  "
                >
                  <p
                    style="
                      margin: 0;
                      font-size: 14px;
                      line-height: 1.6;
                      color: #C7D2E0;
                    "
                  >
                    Este enlace será válido durante
                    <strong style="color: #C9A227;">
                      30 minutos
                    </strong>.
                  </p>
                </div>

                <p
                  style="
                    margin: 0 0 18px;
                    font-size: 14px;
                    line-height: 1.7;
                    color: #8B9BB4;
                  "
                >
                  Si no has solicitado restablecer tu
                  contraseña, puedes ignorar este correo.
                  Tu cuenta seguirá protegida.
                </p>

                <p
                  style="
                    margin: 24px 0 0;
                    font-size: 14px;
                    line-height: 1.7;
                    color: #8B9BB4;
                  "
                >
                  Si el botón no funciona, puedes copiar
                  y pegar el siguiente enlace:
                </p>

                <p
                  style="
                    margin: 10px 0 0;
                    word-break: break-all;
                    font-size: 12px;
                    line-height: 1.6;
                    color: #C9A227;
                  "
                >
                  ${resetUrl}
                </p>
              </div>

              <div
                style="
                  padding: 24px 30px;
                  background-color: #0B1C2C;
                  text-align: center;
                  border-top: 1px solid #1E3A56;
                "
              >
                <p
                  style="
                    margin: 0 0 8px;
                    font-size: 13px;
                    font-weight: 700;
                    color: #F5F7FA;
                  "
                >
                  IBERIAN
                </p>

                <p
                  style="
                    margin: 0;
                    font-size: 11px;
                    line-height: 1.6;
                    color: #687B92;
                  "
                >
                  Este es un correo automático de IBERIAN.
                  No respondas a este mensaje.
                </p>
              </div>
            </div>
          </div>
        `,
      });

    if (error) {
      throw new Error(
        `Error enviando email de recuperación: ${error.message}`,
      );
    }

    return data;
  }
}