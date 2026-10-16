"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

/** Imprime une page /print/... via une iframe cachée et window.print() (TRD §7). */
export function PrintButton({ href, children, ...props }: ButtonProps & { href: string }) {
  const [loading, setLoading] = useState(false);
  function print() {
    setLoading(true);
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    iframe.src = href;
    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } finally {
          setLoading(false);
          setTimeout(() => iframe.remove(), 60_000);
        }
      }, 500);
    };
    document.body.appendChild(iframe);
  }
  return (
    <Button type="button" variant="secondary" onClick={print} loading={loading} {...props}>
      {!loading && <Printer />}{children}
    </Button>
  );
}
