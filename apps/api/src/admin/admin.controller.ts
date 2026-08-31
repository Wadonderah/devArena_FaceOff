import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request, Response } from 'express';
import { CurrentUser, Roles } from '../common/decorators';
import { AdminService } from './admin.service';
import {
  ListUsersQueryDto,
  UpdateUserActiveDto,
  UpdateUserRoleDto,
} from './dto/user-admin.dto';

@Controller('admin')
@Roles(Role.ORGANIZER)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('competitions/:id/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filename, body } = await this.admin.exportResultsCsv(id);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return body;
  }

  @Get('audit')
  @Roles(Role.SUPER_ADMIN)
  audit(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.admin.auditLog(limit);
  }

  @Get('users')
  @Roles(Role.SUPER_ADMIN)
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.admin.listUsers(query.search, query.role);
  }

  @Patch('users/:id/role')
  @Roles(Role.SUPER_ADMIN)
  setUserRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser('id') actorId: string,
    @Req() req: Request,
  ) {
    return this.admin.setUserRole(actorId, id, dto.role, {
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  @Patch('users/:id/active')
  @Roles(Role.SUPER_ADMIN)
  setUserActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserActiveDto,
    @CurrentUser('id') actorId: string,
    @Req() req: Request,
  ) {
    return this.admin.setUserActive(actorId, id, dto.isActive, {
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }
}
