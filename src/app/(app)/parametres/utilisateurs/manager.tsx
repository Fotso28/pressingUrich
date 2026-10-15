"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, KeyRound, Power, ShieldCheck } from "lucide-react";
import { createUser, resetUserPassword, setUserActive, setUserRole } from "@/server/actions/users";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { SaveButton } from "@/components/save-button";
import { formatDate } from "@/lib/domain/dates";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/cn";

type U = { id: string; name: string; username: string; role: "ADMIN" | "AGENT"; active: boolean; createdAt: string };

export function UsersManager({ users, meId }: { users: U[]; meId: string }) {
  const router = useRouter();
  const [create, setCreate] = useState(false);
  const [reset, setReset] = useState<U | null>(null);
  const { exec } = useAction();
  return (
    <>
      <Card>
        <CardHeader title="Comptes" description="Pas d'inscription publique : le gérant crée les comptes." action={<Button size="sm" onClick={() => setCreate(true)}><UserPlus />Nouveau compte</Button>} />
        <ul className="divide-y divide-line border-t border-line">
          {users.map((u) => (
            <li key={u.id} className={cn("flex flex-wrap items-center gap-4 px-5 py-3.5", !u.active && "bg-canvas/60")}>
              <span className={cn("grid size-10 place-items-center rounded-full text-sm font-semibold", u.active ? "bg-brand-50 text-brand" : "bg-subtle text-ink-3")}>{u.name.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <p className={cn("font-medium", !u.active && "text-ink-3")}>{u.name}{u.id === meId && <span className="ml-2 text-[12.5px] font-normal text-ink-3">(vous)</span>}</p>
                <p className="text-[13px] text-ink-3">@{u.username} · créé le {formatDate(u.createdAt)}</p>
              </div>
              <Badge className={u.role === "ADMIN" ? "bg-brand-50 text-brand ring-brand-100" : "bg-subtle text-ink-2 ring-line"}>{u.role === "ADMIN" ? "Gérant" : "Agent"}</Badge>
              {!u.active && <Badge className="bg-danger-50 text-danger ring-[#fbd5d5]">Désactivé</Badge>}
              {u.id !== meId && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setReset(u)}><KeyRound />Mot de passe</Button>
                  <Button size="sm" variant="ghost" onClick={() => exec(() => setUserRole({ userId: u.id, role: u.role === "ADMIN" ? "AGENT" : "ADMIN" }), { success: "Rôle modifié.", onSuccess: () => router.refresh() })}>
                    <ShieldCheck />{u.role === "ADMIN" ? "Rendre agent" : "Rendre gérant"}
                  </Button>
                  <Button size="sm" variant={u.active ? "danger-ghost" : "ghost"} onClick={() => exec(() => setUserActive({ userId: u.id, active: !u.active }), { success: u.active ? "Compte désactivé." : "Compte réactivé.", onSuccess: () => router.refresh() })}>
                    <Power />{u.active ? "Désactiver" : "Réactiver"}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
      {create && <CreateDialog onClose={() => setCreate(false)} onDone={() => { setCreate(false); router.refresh(); }} />}
      {reset && <ResetDialog user={reset} onClose={() => setReset(null)} onDone={() => setReset(null)} />}
    </>
  );
}

function CreateDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: "", username: "", password: "", role: "AGENT" as "ADMIN" | "AGENT" });
  const { exec, pending } = useAction();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Nouveau compte" description="Communiquez l'identifiant et le mot de passe provisoire à la personne.">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); exec(() => createUser(f), { success: "Compte créé.", onSuccess: onDone }); }}>
          <Field label="Nom"><Input autoFocus required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="ex. Paul Essomba" /></Field>
          <Field label="Identifiant" hint="Lettres minuscules, chiffres, . _ -"><Input required autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, "") })} placeholder="ex. paul" /></Field>
          <Field label="Mot de passe provisoire" hint="6 caractères minimum."><Input required minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <Field label="Rôle"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as "ADMIN" | "AGENT" })}><option value="AGENT">Agent comptoir</option><option value="ADMIN">Gérant</option></Select></Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <SaveButton type="submit" loading={pending}>Créer le compte</SaveButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetDialog({ user, onClose, onDone }: { user: U; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const { exec, pending } = useAction();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Réinitialiser le mot de passe" description={`${user.name} sera déconnecté de tous ses appareils.`}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); exec(() => resetUserPassword({ userId: user.id, password }), { success: "Mot de passe réinitialisé.", onSuccess: onDone }); }}>
          <Field label="Nouveau mot de passe provisoire"><Input autoFocus required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <SaveButton type="submit" loading={pending}>Réinitialiser</SaveButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
