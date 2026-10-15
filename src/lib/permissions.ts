import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, userAc } from "better-auth/plugins/admin/access";

/** Rôles métier : ADMIN (gérant) a tous les droits d'administration des comptes, AGENT aucun. */
export const ac = createAccessControl(defaultStatements);
export const roles = {
  ADMIN: ac.newRole({ ...adminAc.statements }),
  AGENT: ac.newRole({ ...userAc.statements }),
};
