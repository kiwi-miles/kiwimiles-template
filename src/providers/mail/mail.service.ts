import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { render } from '@staart/mustache-markdown';
import { SES } from 'aws-sdk';
import { promises as fs } from 'fs';
import mem from 'mem';
import nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import SESTransport from 'nodemailer/lib/ses-transport';
import PQueue from 'p-queue';
import pRetry from 'p-retry';
import { join } from 'path';
import { Configuration } from '../../config/configuration.interface';
import { MailOptions } from './mail.interface';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transport: Mail;
  private config: Configuration['email'];
  private queue = new PQueue({ concurrency: 1 });
  private readTemplate = mem(this.readTemplateUnmemoized);

  constructor(private configService: ConfigService) {
    this.config = this.configService.get<Configuration['email']>('email');
    if (this.config.ses?.accessKeyId)
      this.transport = nodemailer.createTransport({
        SES: new SES({
          apiVersion: '2010-12-01',
          accessKeyId: this.config.ses.accessKeyId,
          secretAccessKey: this.config.ses.secretAccessKey,
          region: this.config.ses.region,
        }),
      } as SESTransport.Options);
    else this.transport = nodemailer.createTransport(this.config.transport);
  }

  send(options: Mail.Options & MailOptions) {
    this.queue
      .add(() =>
        pRetry(
          () =>
            this.sendMail({
              ...options,
              from:
                options.from ?? `"${this.config.name}" <${this.config.from}>`,
            }),
          {
            retries: this.configService.get<number>('email.retries') ?? 3,
            onFailedAttempt: (error) => {
              this.logger.error(
                `Mail to ${options.to} failed, retrying (${error.retriesLeft} attempts left)`,
                error.name,
              );
              console.log(error);
            },
          },
        ),
      )
      .then(() => {})
      .catch(() => {});
  }

  private async sendMail(options: Mail.Options & MailOptions) {
    if (options.template) {
      const layout = await this.readTemplate('layout.html');
      let template = await this.readTemplate(options.template);
      var retrievedData;
      const dataKeys: string[] = 
      ['data', 'emailVerificationData', 'passwordResetData', 'passwordChangedNotificationData',
        'groupInvitationData', 'userBackUpCodeAlertData', 'mFAEmailResponseData', 
        'checkLoginSubnetData', 'deactivatedNotificationData', 'mergeRequestData']

      for (var key in options) {
        if(!(dataKeys.indexOf(key) > -1)) continue;
        if(options[key] !== null) retrievedData = options[key];
      }
      let [markdown, html] = render(template, retrievedData);
      if (markdown.startsWith('#')) {
        const subject = markdown.split('\n', 1)[0].replace('#', '').trim();
        if (subject) {
          options.subject = options.subject ?? subject;
          markdown = markdown.replace(`# ${markdown.split('\n', 1)[0]}`, '');
        }
      }
      options.html = options.noLayout
        ? html
        : render(layout, { content: html })[1];
      options.text = markdown;
      options.alternatives = [
        {
          contentType: 'text/x-web-markdown',
          content: markdown,
        },
      ];
      options.attachments = [{
        filename: 'kiwimiles-logo.png',
        path: __dirname + '/assets/kiwimiles-logo.png',
        cid: 'logo@kiwimiles'
      },
      {
        filename: 'facebook.png',
        path: __dirname + '/assets/facebook.png',
        cid: 'logo@fb-km'
      },
      {
        filename: 'linkedin.png',
        path: __dirname + '/assets/linkedin.png',
        cid: 'logo@in-km'
      },
      {
        filename: 'globe.png',
        path: __dirname + '/assets/globe.png',
        cid: 'logo@globe-km'
      }]
    }
    return this.transport.sendMail(options);
  }

  private async readTemplateUnmemoized(name: string) {
    if (!name.endsWith('.html')) name = `${name}.md`;
    return fs.readFile(join('.', 'src', 'templates', name), 'utf8');
  }
}
