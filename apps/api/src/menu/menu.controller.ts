import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  CategoryInputSchema,
  CategoryItemsSchema,
  MenuHidingSchema,
  MenuPreviewQuerySchema,
  ReorderSchema,
  type AdminMenuCategory,
  type CategoryItemsInput,
  type EmployeeMenu,
  type MenuHiding,
} from '@fernleaf/shared';
import type { z } from 'zod';
import { RequireAnyPermission, RequirePermission } from '../auth/decorators.js';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { MenuService } from './menu.service.js';

@Controller()
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  /**
   * The menu as an employee sees it, with prices. Used by the preview (menu.read) and by staff
   * creating orders (orders.write). ?code= opens a secret category.
   */
  @RequireAnyPermission('menu.read', 'orders.write')
  @Get('menu/preview')
  preview(
    @Query(new ZodValidationPipe(MenuPreviewQuerySchema))
    query: z.infer<typeof MenuPreviewQuerySchema>,
  ): Promise<EmployeeMenu> {
    return this.menu.forEmployee(query.employeeId, query.code);
  }

  @RequirePermission('menu.read')
  @Get('menu/categories')
  list(): Promise<AdminMenuCategory[]> {
    return this.menu.listCategories();
  }

  @RequirePermission('menu.read')
  @Get('menu/categories/:id')
  get(@Param('id', ParseIdPipe) id: string): Promise<AdminMenuCategory> {
    return this.menu.getCategory(id);
  }

  @RequirePermission('menu.manage')
  @Post('menu/categories')
  create(
    @Body(new ZodValidationPipe(CategoryInputSchema)) body: z.output<typeof CategoryInputSchema>,
  ): Promise<AdminMenuCategory> {
    return this.menu.createCategory(body);
  }

  @RequirePermission('menu.manage')
  @Put('menu/categories/:id')
  update(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(CategoryInputSchema)) body: z.output<typeof CategoryInputSchema>,
  ): Promise<AdminMenuCategory> {
    return this.menu.updateCategory(id, body);
  }

  @RequirePermission('menu.manage')
  @Delete('menu/categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIdPipe) id: string): Promise<void> {
    return this.menu.deleteCategory(id);
  }

  @RequirePermission('menu.manage')
  @Put('menu/category-order')
  reorder(
    @Body(new ZodValidationPipe(ReorderSchema)) body: z.infer<typeof ReorderSchema>,
  ): Promise<AdminMenuCategory[]> {
    return this.menu.reorderCategories(body.ids);
  }

  @RequirePermission('menu.manage')
  @Put('menu/categories/:id/items')
  setItems(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(CategoryItemsSchema)) body: CategoryItemsInput,
  ): Promise<AdminMenuCategory> {
    return this.menu.setItems(id, body);
  }

  /** A company's hidden categories and items: part of the company's setup (brief 4.4). */
  @RequirePermission('companies.read')
  @Get('companies/:id/menu-hiding')
  getHiding(@Param('id', ParseIdPipe) id: string): Promise<MenuHiding> {
    return this.menu.getHiding(id);
  }

  @RequirePermission('companies.manage')
  @Put('companies/:id/menu-hiding')
  setHiding(
    @Param('id', ParseIdPipe) id: string,
    @Body(new ZodValidationPipe(MenuHidingSchema)) body: MenuHiding,
  ): Promise<MenuHiding> {
    return this.menu.setHiding(id, body);
  }
}
