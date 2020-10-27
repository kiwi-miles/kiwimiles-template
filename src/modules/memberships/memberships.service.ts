import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  groupsCreateInput,
  memberships,
  membershipsOrderByInput,
  membershipsUpdateInput,
  membershipsWhereInput,
  membershipsWhereUniqueInput,
} from '@prisma/client';
import { safeEmail } from 'src/helpers/safe-email';
import { Expose } from 'src/modules/prisma/prisma.interface';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateMembershipInput } from './memberships.interface';

@Injectable()
export class MembershipsService {
  constructor(
    private prisma: PrismaService,
    private users: UsersService,
    private auth: AuthService,
  ) {}
  async getMemberships(params: {
    skip?: number;
    take?: number;
    cursor?: membershipsWhereUniqueInput;
    where?: membershipsWhereInput;
    orderBy?: membershipsOrderByInput;
  }): Promise<Expose<memberships>[]> {
    const { skip, take, cursor, where, orderBy } = params;
    const memberships = await this.prisma.memberships.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
      include: { group: true },
    });
    return memberships.map(user => this.prisma.expose<memberships>(user));
  }

  async getUserMembership(
    userId: number,
    id: number,
  ): Promise<Expose<memberships> | null> {
    const membership = await this.prisma.memberships.findOne({
      where: { id },
      include: { group: true },
    });
    if (!membership)
      throw new HttpException('Membership not found', HttpStatus.NOT_FOUND);
    if (membership.userId !== userId) throw new UnauthorizedException();
    return this.prisma.expose<memberships>(membership);
  }

  async getGroupMembership(
    groupId: number,
    id: number,
  ): Promise<Expose<memberships> | null> {
    const membership = await this.prisma.memberships.findOne({
      where: { id },
      include: { group: true },
    });
    if (!membership)
      throw new HttpException('Membership not found', HttpStatus.NOT_FOUND);
    if (membership.groupId !== groupId) throw new UnauthorizedException();
    return this.prisma.expose<memberships>(membership);
  }

  async deleteUserMembership(
    userId: number,
    id: number,
  ): Promise<Expose<memberships>> {
    const testMembership = await this.prisma.memberships.findOne({
      where: { id },
    });
    if (!testMembership)
      throw new HttpException('Membership not found', HttpStatus.NOT_FOUND);
    if (testMembership.userId !== userId) throw new UnauthorizedException();
    await this.verifyDeleteMembership(testMembership.groupId, id);
    const membership = await this.prisma.memberships.delete({
      where: { id },
    });
    return this.prisma.expose<memberships>(membership);
  }

  async updateGroupMembership(
    groupId: number,
    id: number,
    data: membershipsUpdateInput,
  ): Promise<Expose<memberships>> {
    const testMembership = await this.prisma.memberships.findOne({
      where: { id },
    });
    if (!testMembership)
      throw new HttpException('Membership not found', HttpStatus.NOT_FOUND);
    if (testMembership.groupId !== groupId) throw new UnauthorizedException();
    const membership = await this.prisma.memberships.update({
      where: { id },
      data,
    });
    return this.prisma.expose<memberships>(membership);
  }

  async deleteGroupMembership(
    groupId: number,
    id: number,
  ): Promise<Expose<memberships>> {
    const testMembership = await this.prisma.memberships.findOne({
      where: { id },
    });
    if (!testMembership)
      throw new HttpException('Membership not found', HttpStatus.NOT_FOUND);
    if (testMembership.groupId !== groupId) throw new UnauthorizedException();
    await this.verifyDeleteMembership(testMembership.groupId, id);
    const membership = await this.prisma.memberships.delete({
      where: { id },
    });
    return this.prisma.expose<memberships>(membership);
  }

  async createUserMembership(userId: number, data: groupsCreateInput) {
    return this.prisma.memberships.create({
      data: {
        role: 'OWNER',
        user: { connect: { id: userId } },
        group: { create: data },
      },
    });
  }

  async createGroupMembership(groupId: number, data: CreateMembershipInput) {
    const emailSafe = safeEmail(data.email);
    let user = this.prisma.expose(
      await this.prisma.users.findFirst({
        where: { emails: { some: { emailSafe } } },
      }),
    );
    if (!user) user = await this.auth.register(data);
    return this.prisma.memberships.create({
      data: {
        role: data.role,
        group: { connect: { id: groupId } },
        user: { connect: { id: user.id } },
      },
    });
  }

  /** Verify whether a group membership can be deleted */
  private async verifyDeleteMembership(
    groupId: number,
    membershipId: number,
  ): Promise<void> {
    const memberships = await this.prisma.memberships.findMany({
      where: { group: { id: groupId } },
    });
    if (memberships.length === 1)
      throw new HttpException(
        'You cannot remove the sole member of a group',
        HttpStatus.BAD_REQUEST,
      );
    const membership = await this.prisma.memberships.findOne({
      where: { id: membershipId },
    });
    if (
      membership.role === 'OWNER' &&
      memberships.filter(i => i.role === 'OWNER').length === 1
    )
      throw new HttpException(
        'You cannot remove the sole owner of a group',
        HttpStatus.BAD_REQUEST,
      );
  }
}
