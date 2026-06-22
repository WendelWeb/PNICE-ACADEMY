/**
 * Admin data — SINGLE SWITCH POINT.
 *
 * The whole admin UI imports its data from here and nowhere else. Today it
 * resolves to the in-memory mock. To go live, implement `realDataSource`
 * (Drizzle queries against db/schema.ts) satisfying the same AdminDataSource
 * contract and set ADMIN_DATA_SOURCE=real — no UI component changes.
 */
import type { AdminDataSource } from './types';
import { mockDataSource } from './mock';

const source: AdminDataSource =
  process.env.ADMIN_DATA_SOURCE === 'real'
    ? realDataSource()
    : mockDataSource;

function realDataSource(): AdminDataSource {
  // TODO (later lot): back this with Drizzle queries against db/schema.ts.
  // Kept as a hard failure so a misconfigured env can't silently serve blanks.
  return {
    getKpiOverview() {
      throw new Error(
        'ADMIN_DATA_SOURCE=real is not implemented yet. Use ADMIN_DATA_SOURCE=mock until the Drizzle-backed admin queries land.',
      );
    },
  };
}

export const getKpiOverview = () => source.getKpiOverview();

export type {
  KpiOverview,
  AdminUser,
  AdminPayment,
  AdminSubscription,
  AdminCourseStat,
} from './types';
