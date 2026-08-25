import {
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../common/decorators';
import { AdminService } from './admin.service';

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
  @Roles(Role.ADMIN)
  audit(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.admin.auditLog(limit);
  }
}
