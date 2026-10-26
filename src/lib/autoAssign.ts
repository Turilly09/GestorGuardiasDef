import { Guardia, Teacher } from '../types';
import { parseISO } from 'date-fns';

export interface AutoAssignmentItem {
  guardia: Guardia;
  substituteTeacher: Teacher;
  periodCount: number;
  totalCount: number;
}

export interface DeficitReport {
  period: number;
  needed: number;
  available: number;
  missing: number;
  unassignedGuardias: Guardia[];
}

export interface AutoAssignResult {
  assignments: AutoAssignmentItem[];
  deficits: DeficitReport[];
  totalPending: number;
  totalCanAssign: number;
  totalMissing: number;
}

/**
 * Calculates optimal and fair assignment of pending guardias for a given date.
 * - Excludes inactive teachers (active === false).
 * - Excludes teachers who are absent during the same period.
 * - Sorts available candidates by:
 *    1. Fewest guardias completed in this specific period (equidad de turno).
 *    2. Fewest total guardias completed in the center (desempate global).
 *    3. Alphabetical tie-breaker.
 * - Detects deficits where there are more absences than available teachers.
 */
export function calculateAutoAssignments(
  dateStr: string,
  guardias: Guardia[],
  teachers: Teacher[]
): AutoAssignResult {
  const pendingGuardias = guardias.filter(
    g => g.dateStr === dateStr && g.status === 'pending'
  );

  if (pendingGuardias.length === 0) {
    return {
      assignments: [],
      deficits: [],
      totalPending: 0,
      totalCanAssign: 0,
      totalMissing: 0,
    };
  }

  // Determine day of the week (1 = Monday, 5 = Friday, 7 = Sunday)
  const dayRaw = parseISO(dateStr).getDay();
  const adjustedDay = dayRaw === 0 ? 7 : dayRaw;

  // Only consider active teachers
  const activeTeachers = teachers.filter(t => t.active !== false);

  // Group pending guardias by period
  const periods = Array.from(new Set(pendingGuardias.map(g => Number(g.period)))).sort(
    (a, b) => a - b
  );

  const assignments: AutoAssignmentItem[] = [];
  const deficits: DeficitReport[] = [];

  for (const period of periods) {
    const periodGuardias = pendingGuardias.filter(
      g => Number(g.period) === Number(period)
    );

    // Identify who is absent in this period so we don't assign them
    const absentIds = new Set(periodGuardias.map(g => g.absentTeacherId));

    // Find all active teachers with availability for this day of week & period
    const availableCandidates = activeTeachers.filter(t => {
      if (!t.id || absentIds.has(t.id)) return false;
      return (t.availability || []).some(
        a => Number(a.dayOfWeek) === Number(adjustedDay) && Number(a.period) === Number(period)
      );
    });

    // Calculate stats for each candidate
    const candidatesWithStats = availableCandidates.map(teacher => {
      const completedGuardias = guardias.filter(
        g => g.status === 'assigned' && g.substituteTeacherId === teacher.id
      );
      const periodCount = completedGuardias.filter(
        g => Number(g.period) === Number(period)
      ).length;
      const totalCount = completedGuardias.filter(
        g => g.substituteTeacherId !== 'aula-libre'
      ).length;

      return {
        teacher,
        periodCount,
        totalCount,
      };
    });

    // Sort: 1) Lowest periodCount, 2) Lowest totalCount, 3) Name
    candidatesWithStats.sort((a, b) => {
      if (a.periodCount !== b.periodCount) {
        return a.periodCount - b.periodCount;
      }
      if (a.totalCount !== b.totalCount) {
        return a.totalCount - b.totalCount;
      }
      return a.teacher.name.localeCompare(b.teacher.name);
    });

    const assignableCount = Math.min(periodGuardias.length, candidatesWithStats.length);

    for (let i = 0; i < assignableCount; i++) {
      assignments.push({
        guardia: periodGuardias[i],
        substituteTeacher: candidatesWithStats[i].teacher,
        periodCount: candidatesWithStats[i].periodCount,
        totalCount: candidatesWithStats[i].totalCount,
      });
    }

    if (periodGuardias.length > candidatesWithStats.length) {
      const missing = periodGuardias.length - candidatesWithStats.length;
      const unassigned = periodGuardias.slice(assignableCount);
      deficits.push({
        period,
        needed: periodGuardias.length,
        available: candidatesWithStats.length,
        missing,
        unassignedGuardias: unassigned,
      });
    }
  }

  const totalMissing = deficits.reduce((sum, d) => sum + d.missing, 0);

  return {
    assignments,
    deficits,
    totalPending: pendingGuardias.length,
    totalCanAssign: assignments.length,
    totalMissing,
  };
}
