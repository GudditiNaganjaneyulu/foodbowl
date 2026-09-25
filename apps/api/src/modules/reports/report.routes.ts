import type { FastifyInstance } from 'fastify';
import { PERMISSIONS } from '@foodbowl/shared';
import { requireAuth } from '../../plugins/auth';
import { requirePermission } from '../../lib/rbac';
import * as reportService from './report.service';
import { summaryDocs } from './report.docs';

export default async function reportRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/summary',
    { schema: summaryDocs, preHandler: [requireAuth, requirePermission(PERMISSIONS.REPORTS_VIEW)] },
    async () => reportService.getSummary(),
  );
}
