import { Controller, Get, Query } from "@nestjs/common";
import type { GeoItem } from "@tumi/contracts";
import { getPrisma } from "@tumi/database";

@Controller("geo")
export class GeoController {
  @Get("departments")
  departments(): Promise<GeoItem[]> {
    return getPrisma().department.findMany({
      orderBy: { name: "asc" },
      select: { code: true, name: true },
    });
  }

  @Get("provinces")
  provinces(@Query("departmentCode") departmentCode?: string): Promise<GeoItem[]> {
    const code = departmentCode?.trim();
    if (!code) return Promise.resolve([]);
    return getPrisma().province.findMany({
      where: { departmentCode: code },
      orderBy: { name: "asc" },
      select: { code: true, name: true },
    });
  }

  @Get("districts")
  districts(@Query("provinceCode") provinceCode?: string): Promise<GeoItem[]> {
    const code = provinceCode?.trim();
    if (!code) return Promise.resolve([]);
    return getPrisma().district.findMany({
      where: { provinceCode: code },
      orderBy: { name: "asc" },
      select: { code: true, name: true },
    });
  }
}
