"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ShieldIcon } from "@/components/ui/icons";

const navigation = [
  { href: "/", label: "Workspace" },
  { href: "/submit", label: "New verification" },
  { href: "/methodology", label: "Methodology" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="app-header">
        <div className="shell header-inner">
          <Link className="brand" href="/" aria-label="ProofCheck workspace">
            <span className="brand-mark">
              <ShieldIcon size={21} />
            </span>
            <span>ProofCheck</span>
            <span className="prototype-chip">Prototype</span>
          </Link>
          <nav aria-label="Primary navigation" className="main-nav">
            {navigation.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={active ? "active" : ""}
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <Link className="button button-primary header-action" href="/submit">
            Verify a label
          </Link>
        </div>
      </header>
      <main id="main-content" className="app-main">
        {children}
      </main>
      <footer className="app-footer">
        <div className="shell footer-inner">
          <p>
            <strong>ProofCheck</strong> is an independent demonstration. It does
            not issue TTB approval or legal advice.
          </p>
          <div>
            <Link href="/methodology">How checks work</Link>
            <a
              href="https://www.ttb.gov/labeling"
              rel="noreferrer"
              target="_blank"
            >
              Official TTB guidance
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
