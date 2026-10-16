"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, KeyRound, Power, ShieldCheck, Pencil } from "lucide-react";
import { createUser, renameUser, resetUserPassword, setUserActive, setUserRole } from "@/server/actions/users";
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
  const [rename, setRename] = useState<U | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; text: string; label: string; danger?: boolean; run: () => void } | null>(null);
  const { exec, pending } = useAction();
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
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="ghost" onClick={() => setRename(u)}><Pencil />Renommer</Button>
                {u.id === meId && <Button size="sm" variant="ghost" onClick={() => setReset(u)}><KeyRound />Changer mon mot de passe</Button>}
                {u.id !== meId && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setReset(u)}><KeyRound />Mot de passe</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm({
                      title: u.role === "ADMIN" ? `Rendre ${u.name} agent ?` : `Rendre ${u.name} gérant ?`,
                      text: u.role === "ADMIN" ? "Ce compte perdra l'accès aux dépenses, rapports et paramètres." : "Ce compte aura accès à tout : dépenses, salaires, rapports, paramètres et comptes.",
                      label: u.role === "ADMIN" ? "Rendre agent" : "Rendre gérant",
                      run: () => exec(() => setUserRole({ userId: u.id, role: u.role === "ADMIN" ? "AGENT" : "ADMIN" }), { success: "Rôle modifié.", onSuccess: () => { setConfirm(null); router.refresh(); } }),
                    })}>
                      <ShieldCheck />{u.role === "ADMIN" ? "Rendre agent" : "Rendre gérant"}
                    </Button>
                    <Button size="sm" variant={u.active ? "danger-ghost" : "ghost"} onClick={() => setConfirm({
                      title: u.active ? `Désactiver le compte de ${u.name} ?` : `Réactiver le compte de ${u.name} ?`,
                      text: u.active ? "La personne est déconnectée immédiatement et ne peut plus se connecter. Son historique est conservé." : "La personne pourra de nouveau se connecter.",
                      label: u.active ? "Désactiver" : "Réactiver", danger: u.active,
                      run: () => exec(() => setUserActive({ userId: u.id, active: !u.active }), { success: u.active ? "Compte désactivé." : "Compte réactivé.", onSuccess: () => { setConfirm(null); router.refresh(); } }),
                    })}>
                      <Power />{u.active ? "Désactiver" : "Réactiver"}
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      {create && <CreateDialog onClose={() => setCreate(false)} onDone={() => { setCreate(false); router.refresh(); }} />}
      {reset && <ResetDialog user={reset} onClose={() => setReset(null)} onDone={() => {
        setReset(null);
        // Son propre mot de passe : les sessions sont révoquées, il faut se reconnecter.
        if (reset.id === meId) router.replace("/login");
      }} />}
      {rename && <RenameDialog user={rename} onClose={() => setRename(null)} onDone={() => { setRename(null); router.refresh(); }} />}
      {confirm && (
        <Dialog open onOpenChange={(o) => !o && setConfirm(null)}>
          <DialogContent title={confirm.title} description={confirm.text}>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>Annuler</Button>
              <SaveButton type="button" variant={confirm.danger ? "danger" : "primary"} loading={pending} onClick={confirm.run}>{confirm.label}</SaveButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
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
          <Field label="Mot de passe provisoire" hint="8 caractères minimum."><Input required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
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
      <DialogContent title="Réinitialiser le mot de passe" description={`${user.name} sera déconnecté de tous ses appareils et devra se reconnecter.`}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); exec(() => resetUserPassword({ userId: user.id, password }), { success: "Mot de passe réinitialisé.", onSuccess: onDone }); }}>
          <Field label="Nouveau mot de passe" hint="8 caractères minimum."><Input autoFocus required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <SaveButton type="submit" loading={pending}>Réinitialiser</SaveButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ user, onClose, onDone }: { user: U; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(user.name);
  const { exec, pending } = useAction();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Renommer le compte" description={`@${user.username} — l'identifiant de connexion ne change pas.`}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); exec(() => renameUser({ userId: user.id, name }), { success: "Nom modifié.", onSuccess: onDone }); }}>
          <Field label="Nom affiché"><Input autoFocus required value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <SaveButton type="submit" loading={pending} disabled={name.trim().length < 2}>Enregistrer</SaveButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
