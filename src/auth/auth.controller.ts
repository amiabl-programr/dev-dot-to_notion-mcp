import {
  Controller,
  Get,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { NotionCallbackDto } from './dto/notion-callback.dto';
import { winstonLogger } from '../logger/logger.config';
import type { Request, Response } from 'express';

@Controller('auth/notion')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('start')
  async startAuth(@Res() res: Response) {
    const { state, codeVerifier, codeChallenge } =
      this.authService.generatePKCE();

    await this.authService.saveOAuthState(state, codeVerifier);

    const url = this.authService.buildAuthorizationUrl(codeChallenge, state);
    winstonLogger.info('Redirecting user to Notion for authentication', {
      url,
    });
    return res.redirect(url);
  }

  @Get('callback')
  async callback(@Query() query: NotionCallbackDto, @Res() res: Response) {
    const stored = await this.authService.getOAuthState(query.state);
    winstonLogger.info('Received OAuth callback from Notion', {
      state: query.state,
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid or expired state');
    }

    const user = await this.authService.exchangeCodeForTokens(
      query.code,
      stored.codeVerifier,
    );

    await this.authService.deleteOAuthState(query.state);

    return res.redirect(`${process.env.FRONTEND_URL}/dashboard?userId=${user.id}`);
  }
}
