"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateCustomerDialog } from "@/components/customers/customer-picker";

export function NewCustomerButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><UserPlus />Nouveau client</Button>
      <CreateCustomerDialog open={open} onOpenChange={setOpen} initial={{ fullName: "", phone: "" }}
        onPicked={(c) => { setOpen(false); router.push(`/clients/${c.id}`); }} />
    </>
  );
}
