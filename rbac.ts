/**
 * Role-based access control for the admin portal.
 * The portal uses this only to show/hide UI. Every permission is enforced by Firestore
 * security rules on the server (firebase/firestore.rules); keep both in sync.
 */
export const ROLES = ['super_admin', 'content_manager', 'moderator', 'support_admin', 'analyst'] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {super_admin: 'Super Admin', content_manager: 'Content Manager', moderator: 'Moderator', support_admin: 'Support Admin', analyst: 'Analyst'};

export type Permission =
  | 'dashboard.read' | 'users.read' | 'users.pii' | 'users.suspend' | 'users.delete' | 'users.notes'
  | 'content.read' | 'content.write' | 'content.publish' | 'content.import' | 'content.export'
  | 'submissions.review' | 'reports.moderate' | 'feedback.read' | 'feedback.triage'
  | 'audit.read' | 'security.read' | 'admins.manage' | 'config.manage';

export const PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: ['dashboard.read', 'users.read', 'users.pii', 'users.suspend', 'users.delete', 'users.notes', 'content.read', 'content.write', 'content.publish', 'content.import', 'content.export', 'submissions.review', 'reports.moderate', 'feedback.read', 'feedback.triage', 'audit.read', 'security.read', 'admins.manage', 'config.manage'],
  content_manager: ['dashboard.read', 'content.read', 'content.write', 'content.publish', 'content.import', 'content.export', 'submissions.review', 'reports.moderate'],
  moderator: ['dashboard.read', 'users.read', 'users.suspend', 'content.read', 'submissions.review', 'reports.moderate'],
  support_admin: ['dashboard.read', 'users.read', 'users.pii', 'users.suspend', 'users.delete', 'users.notes', 'feedback.read', 'feedback.triage'],
  analyst: ['dashboard.read', 'users.read', 'content.read', 'content.export', 'feedback.read'],
};
export const can = (role: Role | null | undefined, p: Permission) => !!role && PERMISSIONS[role].includes(p);
export const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v);
