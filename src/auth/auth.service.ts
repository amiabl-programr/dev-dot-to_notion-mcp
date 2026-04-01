import { Injectable } from '@nestjs/common';
import { winstonLogger } from '../logger/logger.config';
import { PrismaService } from 'src/prisma/prisma.service';
import { randomBytes, createHash } from 'crypto';
import axios from 'axios';

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  workspace_id: string;
  token_type: string;
  workspace_name: string;
  workspace_icon: string | null;
  bot_id: string;
  owner: object;
};

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async saveOAuthState(state: string, codeVerifier: string) {
    await this.prisma.oAuthState.create({
      data: {
        state,
        codeVerifier,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 mins
      },
    });
  }

  async getOAuthState(state: string) {
    const record = await this.prisma.oAuthState.findUnique({
      where: { state },
    });

    if (!record) return null;
    if (record.expiresAt < new Date()) {
      await this.prisma.oAuthState.delete({ where: { state } });
      return null;
    }

    return record;
  }

  async deleteOAuthState(state: string) {
    await this.prisma.oAuthState.delete({ where: { state } });
  }

  getAuth(): string {
    winstonLogger.info('Fetching authentication information');
    return 'Hello Auth!';
  }

  generatePKCE() {
    const codeVerifier = randomBytes(32).toString('hex');
    const state = randomBytes(16).toString('hex');
    const codeChallenge = this.base64URLEncode(
      createHash('sha256').update(codeVerifier).digest(),
    );
    return { codeVerifier, state, codeChallenge };
  }
  private base64URLEncode(buffer: Buffer) {
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  buildAuthorizationUrl(codeChallenge: string, state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.NOTION_CLIENT_ID!,
      response_type: 'code',
      owner: 'user',
      redirect_uri: process.env.NOTION_REDIRECT_URI!,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });

    return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string, codeVerifier: string) {
    const credentials = Buffer.from(
      `${process.env.NOTION_CLIENT_ID!}:${process.env.NOTION_CLIENT_SECRET!}`,
    ).toString('base64');
    // const tokenApiResponse = await axios.post(
    //   'https://api.notion.com/v1/oauth/token',
    //   {
    //     grant_type: 'authorization_code',
    //     code,
    //     redirect_uri: process.env.NOTION_REDIRECT_URI!,
    //     client_id: process.env.NOTION_CLIENT_ID!,
    //     code_verifier: codeVerifier,
    //   },
    //   { headers: { 'Content-Type': 'application/json' } },
    // );

    const tokenApiResponse = await axios.post(
      'https://api.notion.com/v1/oauth/token',
      {
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.NOTION_REDIRECT_URI!,
        code_verifier: codeVerifier,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${credentials}`,
        },
      },
    );
    const tokenData = tokenApiResponse.data as TokenResponse;
    if (
      !tokenData.access_token ||
      !tokenData.workspace_id ||
      !tokenData.refresh_token
    ) {
      winstonLogger.error('Token response missing required fields', {
        tokenData,
      });
      throw new Error('Failed to obtain token from Notion');
    }
    const { access_token, refresh_token, workspace_id } = tokenData;

    const tokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const user = await this.prisma.user.upsert({
      where: { notionWorkspaceId: workspace_id },
      update: {
        notionAccessToken: access_token,
        notionRefreshToken: refresh_token,
        tokenExpiresAt,
      },
      create: {
        notionWorkspaceId: workspace_id,
        notionAccessToken: access_token,
        notionRefreshToken: refresh_token,
        tokenExpiresAt,
      },
    });

    winstonLogger.info(
      'Successfully exchanged code for tokens and upserted user',
      {
        userId: user.id,
        workspaceId: workspace_id,
      },
    );

    return user;
  }
}
