import {
  Controller,
  Get,
  Req,
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
  startAuth(@Req() req: Request) {
    winstonLogger.info('Starting Notion OAuth flow');
    const { state, codeVerifier, codeChallenge } =
      this.authService.generatePKCE();

    req.session.notionOAuth = { state, codeVerifier };

    const url = this.authService.buildAuthorizationUrl(state, codeChallenge);

    winstonLogger.info(`Redirecting user to Notion auth URL: ${url}`);
    return { url };
  }

  @Get('callback')
  async callback(
    @Req() req: Request,
    @Query() query: NotionCallbackDto,
    @Res() res: Response,
  ) {
    const sessionData = req.session.notionOAuth;

    if (!sessionData || sessionData.state !== query.state) {
      throw new UnauthorizedException('Invalid state');
    }

    const user = await this.authService.exchangeCodeForTokens(
      query.code,
      sessionData.codeVerifier,
    );

    delete req.session.notionOAuth;

    return res.redirect(`
      ${process.env.FRONTEND_URL}/dashboard?userId=${user.id}`);
  }
}
