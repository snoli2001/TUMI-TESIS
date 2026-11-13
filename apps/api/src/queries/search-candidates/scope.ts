import type { CandidateSearchFilters } from "@tumi/contracts";

export function scopeClause(filters: CandidateSearchFilters): object | null {
  const distrito = filters.distrito?.trim();
  const provincia = filters.provincia?.trim();
  const departamento = filters.departamento?.trim();
  if (distrito && provincia && departamento) {
    const alcance: object[] = [
      { list: { districtCode: distrito } },
      { list: { districtCode: null, provinceCode: provincia } },
    ];
    if (eligeGobernador(departamento, provincia)) {
      alcance.push({
        list: { districtCode: null, provinceCode: null, departmentCode: departamento },
      });
    }
    return { OR: alcance };
  }
  if (distrito) return { list: { districtCode: distrito } };
  if (provincia) return { list: { provinceCode: provincia } };
  if (departamento) return { list: { departmentCode: departamento } };
  return null;
}

function eligeGobernador(departamento: string, provincia: string): boolean {
  const dep = departamento.padStart(2, "0").slice(-2);
  const province = provincia.padStart(4, "0").slice(-4);
  return !(dep === "14" && province === "1401");
}
