import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Get,
  UseGuards,
  Req,
  Res,
  InternalServerErrorException,
  NotFoundException
} from '@nestjs/common';
import { User } from '@prisma/client';
import { Expose } from '../../providers/prisma/prisma.interface';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResendEmailVerificationDto,
  ResetPasswordDto,
  TotpLoginDto,
  VerifyEmailDto,
} from './auth.dto';
import { TokenResponse, TotpTokenResponse } from './auth.interface';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { RateLimit } from './rate-limit.decorator';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
@Public()
export class AuthController {
  constructor(private authService: AuthService) {}

  /** login with google */
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {}

  /** redirect from google */
  @Get('google/redirect')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(
    @Req() req, 
    @Res() res,
    @Ip() ip: string,
    @Headers('User-Agent') userAgent: string
  ) {
    if(!req.user) {
      throw new NotFoundException(`user not found`);
    }
    try {
      const tokenResponse: 
      {
       accessToken: string,
       refreshToken:string
      } = await this.authService.thirdPartyLogin(ip, userAgent, req.user);
      const accessToken:string = tokenResponse.accessToken;
      const refreshToken:string = tokenResponse.refreshToken;
      if(accessToken) {
        res.redirect(`http://localhost:4200/auth/link/login/success?accessToken=${accessToken}&refreshToken=${refreshToken}`);
      }
      else {
        res.redirect('http://localhost:4200/auth/link/login/');
      }
    }
    catch(error) {
      throw new InternalServerErrorException(error);
    }
  }

  /** login with facebook */
  @Get('facebook')
  @UseGuards(AuthGuard('facebook'))
  async facebookAuth() {}

  /** redirect from facebook */
  @Get('facebook/redirect')
  @UseGuards(AuthGuard('facebook'))
  async facebookAuthRedirect(
    @Req() req, 
    @Res() res,
    @Ip() ip: string,
    @Headers('User-Agent') userAgent: string
  ) {
    if(!req.user.user) {
      throw new NotFoundException(`user not found`);
    }
    try {
      const tokenResponse: 
      {
      accessToken: string,
      refreshToken:string
      } = await this.authService.thirdPartyLogin(ip, userAgent, req.user.user);
      const accessToken:string = tokenResponse.accessToken;
      const refreshToken:string = tokenResponse.refreshToken;
      if(accessToken) {
        res.redirect(`http://localhost:4200/auth/link/login/success?accessToken=${accessToken}&refreshToken=${refreshToken}`);
      }
      else {
        res.redirect('http://localhost:4200/auth/link/login/');
      }
    }
    catch(error) {
      throw new InternalServerErrorException(error);
    }
  }

  /** Login to an account */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit(10)
  async login(
    @Body() data: LoginDto,
    @Ip() ip: string,
    @Headers('User-Agent') userAgent: string,
    @Headers('Origin') origin?: string,
  ): Promise<TokenResponse | TotpTokenResponse> {
    return this.authService.login(
      ip,
      userAgent,
      data.email,
      data.password,
      data.code,
      origin,
    );
  }
  
  /** Create a new account */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit(10)
  async register(
    @Ip() ip: string,
    @Body() data: RegisterDto,
  ): Promise<Expose<User>> {
    return this.authService.register(ip, data);
  }

  /** Get a new access token using a refresh token */
  @Post('refresh')
  @RateLimit(5)
  async refresh(
    @Ip() ip: string,
    @Headers('User-Agent') userAgent: string,
    @Body('token') refreshToken: string,
  ): Promise<TokenResponse> {
    return this.authService.refresh(ip, userAgent, refreshToken);
  }

  /** Logout from a session */
  @Post('logout')
  @RateLimit(5)
  async logout(
    @Body('token') refreshToken: string,
  ): Promise<{ success: true }> {
    await this.authService.logout(refreshToken);
    return { success: true };
  }

  /** Approve a new subnet */
  @Post('approve-subnet')
  @RateLimit(5)
  async approveSubnet(
    @Ip() ip: string,
    @Headers('User-Agent') userAgent: string,
    @Body('token') token: string,
  ): Promise<TokenResponse> {
    return this.authService.approveSubnet(ip, userAgent, token);
  }

  /** Resend email verification link */
  @Post('resend-email-verification')
  @RateLimit(10)
  async resendVerify(
    @Body() data: ResendEmailVerificationDto,
    @Body('origin') origin?: string,
  ) {
    return this.authService.sendEmailVerification(data.email, true, origin);
  }

  /** Verify a new email */
  @Post('verify-email')
  async verifyEmail(
    @Ip() ip: string,
    @Headers('User-Agent') userAgent: string,
    @Body() data: VerifyEmailDto,
    @Body('origin') origin?: string,
  ): Promise<TokenResponse> {
    return this.authService.verifyEmail(ip, userAgent, data.token, origin);
  }

  /** Send a password reset link */
  @Post('forgot-password')
  @RateLimit(10)
  async forgotPassword(
    @Body() data: ForgotPasswordDto,
    @Body('origin') origin?: string,
  ) {
    return this.authService.requestPasswordReset(data.email, origin);
  }

  /** Reset password */
  @Post('reset-password')
  @RateLimit(10)
  async resetPassword(
    @Ip() ip: string,
    @Headers('User-Agent') userAgent: string,
    @Body() data: ResetPasswordDto,
  ): Promise<TokenResponse> {
    return this.authService.resetPassword(
      ip,
      userAgent,
      data.token,
      data.password,
      data.ignorePwnedPassword,
    );
  }

  /** Login using TOTP */
  @Post('login/totp')
  @RateLimit(10)
  async totpLogin(
    @Body() data: TotpLoginDto,
    @Ip() ip: string,
    @Headers('User-Agent') userAgent: string,
    @Body('origin') origin?: string,
  ): Promise<TokenResponse> {
    return this.authService.loginWithTotp(
      ip,
      userAgent,
      data.token,
      data.code,
      origin,
    );
  }

  /** Login using a token */
  @Post('login/token')
  @RateLimit(10)
  async emailTokenLoginPost(
    @Body('token') token: string,
    @Ip() ip: string,
    @Headers('User-Agent') userAgent: string,
  ): Promise<TokenResponse> {
    return this.authService.loginWithEmailToken(ip, userAgent, token);
  }

  /** Merge two user accounts */
  @Post('merge-accounts')
  @RateLimit(10)
  async merge(@Body('token') token: string): Promise<{ success: true }> {
    return this.authService.mergeUsers(token);
  }
}
