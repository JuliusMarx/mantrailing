import { getDatabase } from '@netlify/database';
import pg from 'pg';
import { pgDb } from '../lib/db.mts';
import { createHandler } from '../lib/handler.mts';

const handle = createHandler(pgDb(getDatabase().pool, pg.types.getTypeParser));

export default (req: Request) => handle(req);

export const config = {
  path: '/api/*',
};
