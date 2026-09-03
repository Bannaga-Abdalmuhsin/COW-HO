import { User } from '@supabase/supabase-js';
import { UserRole } from '../types';

export type PortalIdentity = {
  email: string;
  fullName: string;
  role: UserRole;
  roleLabel: string;
  region: string;
};

const ROLE_LABELS: Record<UserRole, string> = {
  field_team: 'Field Team',
  region_team: 'Region Team',
  project_manager: 'Project Manager',
  admin: 'Administrator',
  viewer: 'Viewer'
};

export function getPortalIdentity(user: User): PortalIdentity {
  const metadata = user.user_metadata || {};
  const role = normalizeRole(user.app_metadata?.role ?? metadata.role);
  const email = user.email || 'No email available';
  const fullName = typeof metadata.full_name === 'string' && metadata.full_name.trim()
    ? metadata.full_name.trim()
    : typeof metadata.name === 'string' && metadata.name.trim()
      ? metadata.name.trim()
      : typeof user.app_metadata?.full_name === 'string' && user.app_metadata.full_name.trim()
        ? user.app_metadata.full_name.trim()
        : email;
  const regionValue = user.app_metadata?.region ?? metadata.region;
  const region = typeof regionValue === 'string' && regionValue.trim() ? regionValue.trim() : 'Region not assigned';
  return { email, fullName, role, roleLabel: ROLE_LABELS[role], region };
}

function normalizeRole(value: unknown): UserRole {
  return value === 'field_team' || value === 'region_team' || value === 'project_manager' || value === 'admin' || value === 'viewer'
    ? value
    : 'viewer';
}
