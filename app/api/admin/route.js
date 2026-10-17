import { auth } from '../../../auth';
import { db } from '../../../lib/db';
import { adminHandler } from '../../../lib/admin';
export const POST = adminHandler(db, auth);
