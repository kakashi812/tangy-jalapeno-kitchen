import { Injectable } from '@nestjs/common';
import {
  DEFAULT_SETTINGS,
  addDays,
  computeCutoff,
  isInRange,
  isKitchenWorkingDay,
  kitchenToday,
  type CutoffPreviewDay,
  type HolidayInput,
  type IsoDate,
  type KitchenCalendar,
  type KitchenHoliday,
  type Settings,
} from '@fernleaf/shared';
import { ApiException } from '../common/api-exception.js';
import { fromDbDate, toDbDate } from '../common/db-dates.js';
import { PrismaService } from '../prisma/prisma.service.js';

const SETTINGS_ID = 1;

/**
 * Platform settings and the kitchen calendar. Other modules (orders, kitchen board) read the
 * calendar and settings through this service rather than querying the tables themselves.
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Falls back to the defaults if the settings row hasn't been created yet. */
  async get(): Promise<Settings> {
    const row = await this.prisma.platformSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (!row) return DEFAULT_SETTINGS;
    return {
      kitchenWorkingDays: [...row.kitchenWorkingDays].sort((a, b) => a - b),
      cutoffDaysBefore: row.cutoffDaysBefore,
      cutoffTimeMinutes: row.cutoffTimeMinutes,
      kitchenReadyBufferMinutes: row.kitchenReadyBufferMinutes,
      atRiskMinutes: row.atRiskMinutes,
      deliveryWindowStartMinutes: row.deliveryWindowStartMinutes,
      deliveryWindowEndMinutes: row.deliveryWindowEndMinutes,
    };
  }

  /**
   * Changes apply to new orders only: each order saves its own cut-off moment when it is created,
   * so nothing already placed moves (decision 56).
   */
  async update(input: Settings): Promise<Settings> {
    const data = {
      ...input,
      kitchenWorkingDays: [...input.kitchenWorkingDays].sort((a, b) => a - b),
    };
    await this.prisma.platformSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
    });
    return this.get();
  }

  // ─── Kitchen holidays ─────────────────────────────────────────────────────────────────────

  async listHolidays(): Promise<KitchenHoliday[]> {
    const rows = await this.prisma.kitchenHoliday.findMany({ orderBy: { startDate: 'asc' } });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      startDate: fromDbDate(row.startDate),
      endDate: fromDbDate(row.endDate),
    }));
  }

  async createHoliday(input: HolidayInput): Promise<KitchenHoliday> {
    await this.assertNoOverlap(input);
    const row = await this.prisma.kitchenHoliday.create({
      data: {
        name: input.name,
        startDate: toDbDate(input.startDate),
        endDate: toDbDate(input.endDate),
      },
    });
    return { id: row.id, ...input };
  }

  async updateHoliday(id: string, input: HolidayInput): Promise<KitchenHoliday> {
    await this.assertNoOverlap(input, id);
    await this.prisma.kitchenHoliday.update({
      where: { id },
      data: {
        name: input.name,
        startDate: toDbDate(input.startDate),
        endDate: toDbDate(input.endDate),
      },
    });
    return { id, ...input };
  }

  async deleteHoliday(id: string): Promise<void> {
    await this.prisma.kitchenHoliday.delete({ where: { id } });
  }

  /** Two holidays may not cover the same day: it would be ambiguous which one closed the kitchen. */
  private async assertNoOverlap(input: HolidayInput, exceptId?: string): Promise<void> {
    const clash = await this.prisma.kitchenHoliday.findFirst({
      where: {
        startDate: { lte: toDbDate(input.endDate) },
        endDate: { gte: toDbDate(input.startDate) },
        ...(exceptId && { id: { not: exceptId } }),
      },
    });
    if (clash) {
      throw ApiException.validation({
        startDate: [
          `Overlaps "${clash.name}" (${fromDbDate(clash.startDate)} to ${fromDbDate(clash.endDate)})`,
        ],
      });
    }
  }

  // ─── Calendar and cut-off ─────────────────────────────────────────────────────────────────

  async getCalendar(): Promise<KitchenCalendar> {
    const [settings, holidays] = await Promise.all([this.get(), this.listHolidays()]);
    return { workingDays: settings.kitchenWorkingDays, holidays };
  }

  /** When orders for each of the next `days` delivery dates would lock under the current rules. */
  async cutoffPreview(from: IsoDate | undefined, days: number): Promise<CutoffPreviewDay[]> {
    const [settings, holidays] = await Promise.all([this.get(), this.listHolidays()]);
    const calendar: KitchenCalendar = { workingDays: settings.kitchenWorkingDays, holidays };
    const rule = { daysBefore: settings.cutoffDaysBefore, timeMinutes: settings.cutoffTimeMinutes };
    const start = from ?? kitchenToday();

    return Array.from({ length: days }, (_, i) => {
      const deliveryDate = addDays(start, i);
      const kitchenOpen = isKitchenWorkingDay(deliveryDate, calendar);
      return {
        deliveryDate,
        kitchenOpen,
        holidayName: holidays.find((h) => isInRange(deliveryDate, h))?.name ?? null,
        cutoffAt: kitchenOpen ? computeCutoff(deliveryDate, rule, calendar).toISOString() : null,
      };
    });
  }
}
